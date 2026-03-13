/**
 * POST /api/discovery
 *
 * Streaming PM conversation endpoint.
 * Handles the full 4-phase PM process:
 *   1. Sector reconnaissance (web_search)
 *   2. Client interview (render_form)
 *   3. Internal inference (update_field)
 *   4. Completeness check + staffing (check_completeness, recruit_agent)
 *
 * Body: { messages: UIMessage[], projectId?: string }
 * Response: data stream (text/event-stream)
 * Header: x-project-id — pass back on subsequent requests
 */

import {
  streamText,
  tool,
  stepCountIs,
  UIMessage,
  convertToModelMessages,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { createContext } from "@/lib/context";
import { pmAgentConfig, renderFormTool } from "@/agents/discovery";
import { braveSearch } from "@/lib/web-search";
import type { RecruitableAgentType } from "@/lib/agent-db";

// ─── TensionInput schema ───────────────────────────────────────────────────────

const TensionInputSchema = z.object({
  id: z.string(),
  wants: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  confidence: z.number(),
  doubts: z.array(
    z.object({
      about: z.string(),
      severity: z.enum(["low", "medium", "blocking"]).optional(),
      blocksPath: z.array(z.string()).optional(),
    }),
  ),
  pendingOn: z.array(z.string()).optional(),
  linkedTo: z.array(z.string()).optional(),
});

// ─── check_completeness: sections and keyword mapping ─────────────────────────

const REQUIRED_SECTIONS = [
  "organization_context",
  "current_problem",
  "impact",
  "target_vision",
  "users_and_journeys",
  "business_rules",
  "existing_connections",
  "constraints",
  "priorities",
  "success_criteria",
] as const;

type RequiredSection = (typeof REQUIRED_SECTIONS)[number];

const SECTION_KEYWORDS: Record<RequiredSection, string[]> = {
  organization_context: [
    "organization_context",
    "org_context",
    "company",
    "sector",
    "industry",
    "team",
  ],
  current_problem: ["current_problem", "problem", "pain", "issue", "challenge"],
  impact: ["impact", "cost", "loss", "benefit", "productivity"],
  target_vision: [
    "target_vision",
    "vision",
    "goal",
    "objective",
    "outcome",
    "success_criteria",
  ],
  users_and_journeys: [
    "users_journeys",
    "users",
    "user",
    "journey",
    "role",
    "actor",
    "persona",
    "stakeholder",
  ],
  business_rules: [
    "business_rules",
    "rule",
    "policy",
    "compliance",
    "regulation",
    "gdpr",
    "approval",
  ],
  existing_connections: [
    "existing_connections",
    "integration",
    "connection",
    "existing_tool",
    "software",
    "system",
  ],
  constraints: ["constraints", "budget", "timeline", "deadline", "scale"],
  priorities: ["priorities", "priority", "mvp", "v1", "scope"],
  success_criteria: ["success_criteria", "success", "kpi", "metric", "criterion"],
};

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { messages, projectId: existingId } = (await req.json()) as {
    messages: UIMessage[];
    projectId?: string;
  };

  const projectId = existingId ?? `proj-${nanoid(8)}`;

  const ctx = createContext({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    mongoUri: process.env.MONGODB_URI,
    storeMode: (process.env.FIELD_STORE as "memory" | "mongo") ?? "memory",
    searchApiKey: process.env.BRAVE_SEARCH_API_KEY,
  });

  // Init store on first message
  if (!existingId) {
    const firstMessage = messages[messages.length - 1];
    const text =
      firstMessage?.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") ?? "";
    await ctx.store.create(projectId, text);
  }

  // ── Field tools ────────────────────────────────────────────────
  const readFieldTool = tool({
    description:
      "Read the current epistemic field. Call this to check what has already been inferred about this client.",
    inputSchema: z.object({}),
    execute: async () => {
      return ctx.store.snapshot(projectId);
    },
  });

  const updateFieldTool = tool({
    description:
      "Write tensions to the epistemic field. Call this after each form submission to record technical inferences. These are internal and never shown to the client.",
    inputSchema: z.object({
      tensions: z
        .array(TensionInputSchema)
        .describe("Array of tensions to write. Use pm_ prefix for all IDs."),
    }),
    execute: async ({ tensions }) =>
      ctx.store.upsertTensions(projectId, tensions, "pm"),
  });

  // ── web_search ──────────────────────────────────────────────────
  const webSearchTool = tool({
    description:
      "Search the web for sector intelligence. Call this before generating any form to research the client's industry, regulations, and common tools.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search query (e.g. 'HR software pain points France 2024', 'GDPR compliance healthcare SaaS')",
        ),
    }),
    execute: async ({ query }) => {
      if (!ctx.searchApiKey) {
        return {
          query,
          results: [],
          note: "Web search not configured (BRAVE_SEARCH_API_KEY missing). Proceed with your existing knowledge.",
        };
      }
      try {
        return await braveSearch(query, ctx.searchApiKey, 5);
      } catch (err: any) {
        return { query, results: [], error: err.message };
      }
    },
  });

  // ── check_completeness ──────────────────────────────────────────
  const checkCompletenessTool = tool({
    description:
      "Check whether the Field has sufficient coverage to proceed with specialist recruitment. Call this before recruit_agent.",
    inputSchema: z.object({}),
    execute: async () => {
      const snapshot = await ctx.store.snapshot(projectId);
      const pmTensions = snapshot.tensions.filter((t) =>
        t.id.startsWith("pm_"),
      );

      const complete: string[] = [];
      const incomplete: string[] = [];
      const missing: string[] = [];

      for (const section of REQUIRED_SECTIONS) {
        const keywords = SECTION_KEYWORDS[section];
        const matching = pmTensions.filter((t) =>
          keywords.some((kw) => t.id.toLowerCase().includes(kw)),
        );

        if (matching.length === 0) {
          missing.push(section);
        } else {
          const bestConfidence = Math.max(...matching.map((t) => t.confidence));
          if (bestConfidence >= 0.6) {
            complete.push(section);
          } else {
            incomplete.push(section);
          }
        }
      }

      const ready_to_proceed =
        complete.length === REQUIRED_SECTIONS.length;

      let suggestion = "";
      if (!ready_to_proceed) {
        const gaps = [...missing, ...incomplete];
        suggestion = `Still missing or incomplete: ${gaps.join(", ")}. Generate a form to collect this information.`;
      }

      return {
        complete,
        incomplete,
        missing,
        ready_to_proceed,
        suggestion,
        field_summary: snapshot.summary,
      };
    },
  });

  // ── recruit_agent ───────────────────────────────────────────────
  const recruitAgentTool = tool({
    description:
      "Recruit a specialist agent for this project. Call this after check_completeness returns ready_to_proceed: true.",
    inputSchema: z.object({
      agentType: z
        .enum([
          "lead_front",
          "lead_back",
          "data_architect",
          "ux_architect",
          "ai_architect",
        ])
        .describe("The specialist to recruit"),
      reason: z
        .string()
        .describe("1–2 sentences explaining why this agent is needed"),
    }),
    execute: async ({ agentType, reason }) => {
      if (ctx.agentDb) {
        await ctx.agentDb.assignAgent(
          projectId,
          agentType as RecruitableAgentType,
          reason,
        );
      }
      return { status: "recruited", agentType, reason };
    },
  });

  // ── Stream ──────────────────────────────────────────────────────
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const result = streamText({
    model: anthropic(pmAgentConfig.model.modelId),
    system: pmAgentConfig.system,
    messages: await convertToModelMessages(messages),
    tools: {
      read_field: readFieldTool,
      update_field: updateFieldTool,
      render_form: renderFormTool,
      web_search: webSearchTool,
      check_completeness: checkCompletenessTool,
      recruit_agent: recruitAgentTool,
    },
    stopWhen: stepCountIs(pmAgentConfig.maxSteps ?? 20),
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "x-project-id": projectId,
    },
  });
}

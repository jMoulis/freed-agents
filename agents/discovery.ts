/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — PM Agent (Project Manager)                   ║
 * ║                                                              ║
 * ║  Sole client contact. Runs 4 phases:                        ║
 * ║    1. Sector reconnaissance via web_search                  ║
 * ║    2. Structured client interview via render_form           ║
 * ║    3. Technical inference via update_field (internal)       ║
 * ║    4. Completeness check + agent staffing                   ║
 * ║                                                              ║
 * ║  Model : claude-sonnet-4-6 (streamText)                     ║
 * ║  Output : streamed text + tool calls                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";
import { tool } from "ai";

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — loaded from prompts/pm.md
// ═══════════════════════════════════════════════════════════════

export const PM_SYSTEM = readFileSync(
  join(process.cwd(), "prompts/pm.md"),
  "utf-8",
);

// ═══════════════════════════════════════════════════════════════
// TOOL: render_form
// UI-only — signals the frontend to render an interactive form.
// Returns args as-is; rendering happens client-side.
// ═══════════════════════════════════════════════════════════════

export const renderFormTool = tool({
  description: `Render a form for the client to fill.
    Call this when you need information you cannot infer.
    Maximum 6-8 fields per form. Plain non-technical language only.
    Never ask about something inferable at confidence >= 0.65.`,
  inputSchema: z.object({
    theme: z.string().describe("Section title shown to client"),
    intro: z.string().describe("1-2 warm sentences introducing this section"),
    fields: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().describe("Question in plain language, no jargon"),
          type: z.enum(["text", "textarea", "choice", "multiple"]),
          options: z.array(z.string()).optional(),
          placeholder: z.string().optional(),
          required: z.boolean(),
        }),
      )
      .max(8),
  }),
  execute: async (args) => {
    return { rendered: true, form: args };
  },
});

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const pmAgentConfig: AgentConfig = {
  role: "pm",
  name: "pm",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
  },
  system: PM_SYSTEM,
  method: "streamText",
  sendReasoning: false,
  maxSteps: 20,
};

// Keep backward-compat export for any imports referencing discoveryAgentConfig
export const discoveryAgentConfig = pmAgentConfig;

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export interface BootstrapData {
  company: string;
  sector: string;
  project: string;
}

export function buildPmMessage(
  projectId: string,
  bootstrap: BootstrapData,
): string {
  return `Project ID: ${projectId}

Client bootstrap data:
- Company: ${bootstrap.company}
- Sector: ${bootstrap.sector}
- Project: ${bootstrap.project}

Start with Phase 1: run web_search queries to understand the client's sector.
Then proceed with Phase 2: generate your first interview form.`;
}

// Legacy export for backward compatibility
export function buildDiscoveryMessage(
  projectId: string,
  initialMessage: string,
): string {
  return `Project ID: ${projectId}

Client's first message: "${initialMessage}"

Start with Phase 1: run web_search queries to understand the client's sector.
Then proceed with Phase 2: generate your first form.`;
}

/**
 * POST /api/discovery
 *
 * Streaming discovery conversation endpoint.
 * Consumes useChat message format, returns a data stream.
 *
 * Body: { messages: CoreMessage[], projectId?: string }
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
import { discoveryAgentConfig, renderFormTool } from "@/agents/discovery";

// ─── TensionInput schema (mirrors core/types.ts TensionInput) ─────────────────

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

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { messages, projectId: existingId } = (await req.json()) as {
    messages: UIMessage[];
    projectId: string;
  };

  const projectId = existingId ?? `proj-${nanoid(8)}`;

  const ctx = createContext({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    mongoUri: process.env.MONGODB_URI,
    storeMode: (process.env.FIELD_STORE as "memory" | "mongo") ?? "memory",
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
      "Write a tension to the epistemic field. Call this after each form submission to record what you learned.",
    inputSchema: TensionInputSchema,
    execute: async (input) =>
      ctx.store.upsertTensions(projectId, [input], "dynamic"),
  });

  // ── Stream ─────────────────────────────────────────────────────
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const result = streamText({
    model: anthropic(discoveryAgentConfig.model.modelId),
    system: discoveryAgentConfig.system,
    messages: await convertToModelMessages(messages),
    tools: {
      read_field: readFieldTool,
      update_field: updateFieldTool,
      render_form: renderFormTool,
    },
    stopWhen: stepCountIs(discoveryAgentConfig.maxSteps ?? 12),
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "x-project-id": projectId,
    },
  });
}

/**
 * FREED AGENTS — Agent Runner
 * Server-only. Reçoit un RunContext injecté — zéro accès à process.env.
 */

import { generateText, tool, Output, stepCountIs, StepResult } from "ai";
import { z } from "zod";
import { RunContext, ModelRef } from "@/lib/context";
import { AgentRole, TensionInput, AgentRunResult } from "@/core/types";
import { anthropic, AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { AnthropicMessagesLanguageModel } from "@ai-sdk/anthropic/internal";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export type AgentMethod = "generateText" | "generateObject";

export interface AgentConfig {
  role: AgentRole;
  name: string;
  model: ModelRef;
  system: string;
  method: AgentMethod;
  outputSchema?: z.ZodTypeAny;
  tools?: Record<string, AgentToolDef>;
  maxSteps?: number;
  sendReasoning?: boolean;
}

export interface AgentToolDef {
  description: string;
  parameters: z.ZodTypeAny;
  inputSchema?: any;
  execute: (args: any, ctx: RunContext) => Promise<any>;
}

// ═══════════════════════════════════════════════════════════════
// FIELD TOOLS — auto-injectés dans chaque agent
// ═══════════════════════════════════════════════════════════════

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

function buildFieldTools(
  store: RunContext["store"],
  projectId: string,
  role: AgentRole,
  tensionsWritten: TensionInput[],
) {
  return {
    read_field: tool({
      description:
        "Read the current epistemic field. Call this first to understand what previous agents have decided and what tensions remain open.",
      inputSchema: z.object({}),
      execute: async () => {
        return store.snapshot(projectId);
      },
    }),

    update_field: tool({
      description:
        "Write your decisions and doubts into the shared epistemic field. Be honest about confidence and doubts — other agents will build on this.",
      inputSchema: z.object({
        tensions: z.array(TensionInputSchema),
      }),
      execute: async ({ tensions }: { tensions: TensionInput[] }) => {
        tensionsWritten.push(...tensions);
        const snapshot = await store.upsertTensions(projectId, tensions, role);
        return snapshot;
      },
    }),
  };
}

function extractReasoning(steps: StepResult<any>[]): string | null {
  const blocks: string[] = [];
  for (const step of steps ?? []) {
    for (const r of step.reasoning ?? []) {
      if (r.text) blocks.push(r.text);
    }
  }
  return blocks.length > 0 ? blocks.join("\n\n---\n\n") : null;
}

// ═══════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════

export async function runAgent<T = unknown>(
  config: AgentConfig,
  projectId: string,
  ctx: RunContext,
  userMessage: string,
): Promise<AgentRunResult<T>> {
  const startedAt = Date.now();
  const tensionsWritten: TensionInput[] = [];

  const model = ctx.models.resolve(config.model);
  const fieldTools = buildFieldTools(
    ctx.store,
    projectId,
    config.role,
    tensionsWritten,
  );
  const extraTools = Object.fromEntries(
    Object.entries(config.tools ?? {}).map(([name, def]) => [
      name,
      tool({
        description: def.description,
        parameters: def.parameters,
        inputSchema: def.inputSchema ?? z.object({}),
        execute: (args: any) => def.execute(args, ctx) as any,
      } as any),
    ]),
  );
  const allTools = { ...fieldTools, ...extraTools };
  const messages = [{ role: "user" as const, content: userMessage }];

  let output: T;
  let reasoning_raw: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0 };

  if (config.method === "generateObject") {
    if (!config.outputSchema) {
      throw new Error(
        `Agent ${config.name}: outputSchema required for generateObject`,
      );
    }
    const result = await generateText({
      model,
      system: [
        {
          role: "system",
          content: config.system,
          providerOptions: {
            anthropic: {
              cacheControl: { type: "ephemeral" },
            } satisfies AnthropicLanguageModelOptions,
          },
        },
      ],
      messages,
      tools: allTools as any,
      output: Output.object({ schema: config.outputSchema }),
      stopWhen: stepCountIs(config.maxSteps ?? 10),
    });
    output = result.output as T;
    reasoning_raw = extractReasoning(result.steps ?? []);
    usage = {
      inputTokens: result.totalUsage?.inputTokens ?? 0,
      outputTokens: result.totalUsage?.outputTokens ?? 0,
    };
  } else {
    const providerOptions = config.sendReasoning
      ? { anthropic: { thinking: { type: "enabled", budgetTokens: 8000 } } }
      : {};

    const result = await generateText({
      model,
      system: config.system,
      messages,
      tools: allTools as any,
      stopWhen: stepCountIs(config.maxSteps ?? 10),
      providerOptions: providerOptions as any,
    });
    output = result.text as T;
    reasoning_raw = extractReasoning(result.steps ?? []);
    usage = {
      inputTokens: result.totalUsage?.inputTokens ?? 0,
      outputTokens: result.totalUsage?.outputTokens ?? 0,
    };
  }

  return {
    role: config.role,
    name: config.name,
    output,
    reasoning_raw,
    tensions_written: tensionsWritten,
    usage,
    duration_ms: Date.now() - startedAt,
  };
}

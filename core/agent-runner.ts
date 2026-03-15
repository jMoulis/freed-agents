/**
 * FREED AGENTS — Agent Runner
 * Server-only. Reçoit un RunContext injecté — zéro accès à process.env.
 */

import { generateText, tool, Output, stepCountIs, StepResult, NoSuchToolError } from "ai";
import { z } from "zod";
import { RunContext, ModelRef } from "@/lib/context";
import { AgentRole, TensionInput, AgentRunResult } from "@/core/types";
import { anthropic, AnthropicLanguageModelOptions, AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { makeLogger } from "@/lib/run-logger";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export type AgentMethod = "generateText" | "generateObject" | "streamText";

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
  thinkingBudget?: number;
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

const KnowledgeEntrySchema = z.object({
  id: z.string().describe(
    "Unique cross-cutting fact id — e.g. 'stack_database', 'auth_method', 'gdpr_applicable', 'primary_language'. Snake_case.",
  ),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  confidence: z.number().describe("0.1–1.0 epistemic weight. Higher confidence overwrites lower."),
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
        console.log("READ_FILE");
        return store.snapshot(projectId);
      },
    }),

    update_field: tool({
      description:
        "Write your decisions and doubts into the shared epistemic field. `tensions` are your reasoning units — be honest about confidence. `knowledge` (optional) is for cross-cutting facts other agents need immediately: chosen stack, auth method, GDPR scope, etc. Higher-confidence knowledge overwrites lower.",
      inputSchema: z.object({
        tensions: z.array(TensionInputSchema),
        knowledge: z.array(KnowledgeEntrySchema).optional(),
      }),
      execute: async ({
        tensions,
        knowledge,
      }: {
        tensions: TensionInput[];
        knowledge?: Array<{ id: string; value: unknown; confidence: number }>;
      }) => {
        console.log("update_field");
        tensionsWritten.push(...tensions);
        if (knowledge?.length) {
          await store.upsertKnowledge(projectId, knowledge, role);
        }
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
  const log = makeLogger(config.name, projectId);

  const model = ctx.models.resolve(config.model);
  log("agent_start", { model: config.model, method: config.method });
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
        inputSchema: def.inputSchema ?? def.parameters,
        execute: (args: any) => def.execute(args, ctx) as any,
      } as any),
    ]),
  );
  const allTools = { ...fieldTools, ...extraTools };
  const messages = [{ role: "user" as const, content: userMessage }];

  let output: T;
  let reasoning_raw: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let finish_reason = "unknown";

  if (config.method === "generateObject") {
    if (!config.outputSchema) {
      throw new Error(`Agent ${config.name}: outputSchema required for generateObject`);
    }
    const result = await generateText({
      onStepFinish({ stepNumber, finishReason, usage, text, reasoning }) {
        log("step_finish", {
          stepNumber, finishReason, usage,
          text_len: text?.length ?? 0,
          text_preview: text ? text.slice(0, 300) : null,
          reasoning_blocks: reasoning?.length ?? 0,
        });
      },
      experimental_repairToolCall: async ({ toolCall, inputSchema, error }) => {
        if (NoSuchToolError.isInstance(error)) {
          log("tool_repair_skip", { toolName: toolCall.toolName, reason: "no_such_tool" });
          return null;
        }
        log("tool_repair_attempt", { toolName: toolCall.toolName, error });
        const schema = await inputSchema(toolCall);
        const repairStart = Date.now();
        const { output: repairedArgs } = await generateText({
          model: anthropic("claude-haiku-4-5-20251001"),
          output: Output.object({ schema: schema as any }),
          prompt: [
            `The model tried to call the tool "${toolCall.toolName}" with the following inputs:`,
            JSON.stringify(toolCall.input),
            `The tool accepts the following schema:`,
            JSON.stringify(schema),
            "Error found:",
            error.message,
            "Please fix the inputs.",
          ].join("\n"),
        });
        log("tool_repair_done", { toolName: toolCall.toolName, duration_ms: Date.now() - repairStart, repairedArgs });
        return { ...toolCall, input: JSON.stringify(repairedArgs) };
      },
      model,
      system: [{
        role: "system",
        content: config.system,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } } satisfies AnthropicLanguageModelOptions,
        },
      }],
      messages,
      tools: allTools as any,
      output: Output.object({ schema: config.outputSchema }), // ← restauré
      stopWhen: stepCountIs(config.maxSteps ?? 10),
      providerOptions: config.sendReasoning
        ? { anthropic: { thinking: { type: "enabled", budgetTokens: config.thinkingBudget ?? 8000 } } satisfies AnthropicProviderOptions }
        : undefined,
    });
    output = result.output as T;  // ← restauré
    reasoning_raw = extractReasoning(result.steps ?? []);
    finish_reason = result.finishReason ?? "unknown";
    usage = {
      inputTokens: result.totalUsage?.inputTokens ?? 0,
      outputTokens: result.totalUsage?.outputTokens ?? 0,
    };
  } else {
    const providerOptions = config.sendReasoning
      ? { anthropic: { thinking: { type: "enabled", budgetTokens: config.thinkingBudget ?? 8000 } } }
      : {};

    const result = await generateText({
      onStepFinish({ stepNumber, finishReason, usage, text, reasoning }) {
        log("step_finish", {
          stepNumber,
          finishReason,
          usage,
          text_len: text?.length ?? 0,
          text_preview: text ? text.slice(0, 300) : null,
          reasoning_blocks: reasoning?.length ?? 0,
        });
      },
      experimental_repairToolCall: async ({ toolCall, inputSchema, error }) => {
        if (NoSuchToolError.isInstance(error)) {
          log("tool_repair_skip", { toolName: toolCall.toolName, reason: "no_such_tool" });
          return null;
        }
        log("tool_repair_attempt", { toolName: toolCall.toolName, error: error.message });
        const schema = await inputSchema(toolCall);
        const repairStart = Date.now();
        const { output: repairedArgs } = await generateText({
          model: anthropic("claude-haiku-4-5-20251001"),
          output: Output.object({ schema: config.outputSchema as any }),
          prompt: [
            `The model tried to call the tool "${toolCall.toolName}" with the following inputs:`,
            JSON.stringify(toolCall.input),
            `The tool accepts the following schema:`,
            JSON.stringify(schema),
            "Error found:",
            error.message,
            "Please fix the inputs.",
          ].join("\n"),
        });
        log("tool_repair_done", { toolName: toolCall.toolName, duration_ms: Date.now() - repairStart, repairedArgs });
        return { ...toolCall, input: JSON.stringify(repairedArgs) };
      },
      model,
      system: config.system,
      messages,
      tools: allTools as any,
      stopWhen: stepCountIs(config.maxSteps ?? 10),
      providerOptions: providerOptions as any,
    });
    output = result.text as T;
    reasoning_raw = extractReasoning(result.steps ?? []);
    finish_reason = result.finishReason ?? "unknown";
    usage = {
      inputTokens: result.totalUsage?.inputTokens ?? 0,
      outputTokens: result.totalUsage?.outputTokens ?? 0,
    };
  }

  const duration_ms = Date.now() - startedAt;
  log("agent_end", { finish_reason, duration_ms, usage, tensions_written: tensionsWritten.length });

  return {
    role: config.role,
    name: config.name,
    output,
    reasoning_raw,
    tensions_written: tensionsWritten,
    usage,
    duration_ms,
    finish_reason,
  };
}

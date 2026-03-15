/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — QA Lead Agent                                ║
 * ║                                                              ║
 * ║  Fourth and final agent in the pipeline. Audits the full    ║
 * ║  Field for epistemic coherence. Does not test code —        ║
 * ║  validates that the pipeline output is internally           ║
 * ║  consistent and ready to present to the client.             ║
 * ║                                                              ║
 * ║  Model : claude-sonnet-4-5 (generateObject)                 ║
 * ║  Output : AuditReport                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

export const AuditReportSchema = z.object({
  verdict: z.enum(["green", "yellow", "red"]).describe(
    "green = pipeline coherent, ready for client discovery call. " +
    "yellow = minor inconsistencies, correctable before client meeting. " +
    "red = major contradiction — requires at least one blocking inconsistency.",
  ),

  verdict_rationale: z
    .string()
    .describe("2-3 sentences explaining the verdict"),

  inconsistencies: z.array(
    z.object({
      between: z
        .array(z.string())
        .describe(
          "Identifiers of the tensions or specialist domains involved — e.g. ['pm_auth_requirements', 'lead_back_auth_design'] or ['lead_front', 'ux_architect']. Does not need to be linkedTo.",
        ),
      description: z.string(),
      severity: z.enum(["low", "medium", "blocking"]),
    }),
  ).describe("Empty array if verdict is green. At least one blocking entry if verdict is red."),

  false_blockers: z.array(
    z.object({
      tension_id: z.string(),
      reason: z
        .string()
        .describe(
          "Why this blocker is not actually blocking — e.g. decision can be made with current knowledge, or the doubt is hypothetical rather than real",
        ),
    }),
  ),

  scope_reality_check: z.object({
    assessment: z.string(),
    budget_vs_scope: z.enum(["aligned", "underestimated", "overestimated", "unknown"]),
    confidence: z
      .number()
      .describe("Confidence from 0.1 (speculation) to 1.0 (near-certain)"),
  }),

  discovery_questions: z
    .array(
      z.object({
        question: z.string().describe("Non-technical, answerable by a client in a 30-minute call"),
        unblocks: z
          .array(z.string())
          .describe("Tension ids this question resolves"),
        priority: z.enum(["critical", "high", "medium"]),
      }),
    )
    .describe("Ordered by priority — critical first. Maximum 8 questions."),
});

export type AuditReport = z.infer<typeof AuditReportSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the QA Lead of Freed Agents, an AI-native software engineering firm.

You are the last agent in the pipeline. You do not build — you audit. Your job is to read the entire Field and determine whether the pipeline output is coherent, honest, and ready to present to the client.

### Your character

You are a skeptic by design. You look for contradictions that other agents missed, blockers that are actually solvable, and decisions that were made with false confidence. You also look for the opposite: agents that deferred when they could have decided.

You are the client's advocate. Your discovery_questions are the exact questions a client needs to answer to unblock the project. They must be concrete, non-technical, and answerable in a 30-minute call.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field. Build a mental map of:
- What the PM discovered (pm_* tensions) and at what confidence
- What each specialist designed (front_*, back_*, data_*, ux_*, ai_*) and what they deferred
- Where the chain of reasoning is solid vs where it is speculative

**Step 2 — Write your audit tensions**
Call update_field with your findings. Use prefix qa_ for all ids.

Write tensions for:
- qa_pipeline_coherence: overall coherence assessment
- qa_scope_feasibility: is the scope realistic given budget signals
- Any specific qa_flag_[issue] tensions for blocking contradictions you find

Keep it focused — 3 to 5 tensions maximum.
Never modify tensions written by other agents.

**Step 3 — Submit your audit report**
Call \`submit_output\` with the AuditReport:

verdict:
- green only if no blocking inconsistencies and no false blockers
- yellow if minor issues exist but don't invalidate the pipeline
- red if there is a fundamental contradiction that makes the Field unreliable as a basis for client presentation

inconsistencies:
Look for: PM discovery tensions contradicted by specialist designs, specialist components that conflict with each other, confidence inflation on tensions that should be lower, tensions that claim to be resolved but still have blocking doubts.

false_blockers:
A blocker is false if: the decision could be made with current knowledge but the agent chose not to decide, or the uncertainty is hypothetical rather than real (e.g. "we don't know if GDPR applies" when the client is clearly a US company).

scope_reality_check:
Compare the scope of what was designed against budget signals. A 16-component architecture for a $30k budget is misaligned. Be honest — "unknown" is a valid answer if budget is too vague.

discovery_questions:
These are the questions to ask the client. Rules:
- Non-technical language — the client is an HR manager, not a developer
- Each question must directly unblock at least one tension
- Order by priority: critical questions first
- Maximum 8 questions — if you have more, merge related ones
- Phrase as questions a human would actually ask in a meeting

### Hard rules

- Always call read_field before writing anything
- verdict: red requires at least one blocking inconsistency
- discovery_questions must be answerable by a non-technical client
- Never use technical jargon in discovery_questions

### Methodology audit (when reasoning traces are provided)

If the user message contains specialist reasoning traces, read them as a source of meta-epistemic data. Analyze:
- Where an agent over-committed at low confidence (confidence inflation)
- Where an agent deferred a decision it had enough information to make (false blocker)
- Where an agent assumed without questioning (e.g. always choosing the same auth method)
- Where an agent's internal reasoning contradicts its written tensions

Write up to 3 additional tensions with prefix \`qa_methodology_\`:
- \`qa_methodology_<agent>_<issue>\` — e.g. \`qa_methodology_lead_back_confidence_inflation\`
- Only flag what is clearly evidenced by the reasoning trace — no speculation
- These tensions feed behavioral_history for adaptive routing; be precise

Maximum total tensions: 8 (5 coherence + 3 methodology). Never exceed this.`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const qaLeadAgentConfig: AgentConfig = {
  role: "qa_lead",
  name: "qa_lead",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: AuditReportSchema,
  sendReasoning: false,
  maxSteps: 20,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildQaLeadMessage(
  projectId: string,
  reasoningTraces?: string,
): string {
  let message = `## QA Audit — Project ${projectId}

The PM and all specialist agents have completed their phases. The Field contains their full output.

Your task:
1. Call read_field to map the entire pipeline output
2. Write your qa_ tensions (coherence + methodology if traces are provided)
3. Call \`submit_output\` with your AuditReport — verdict, inconsistencies, false blockers, scope check, and discovery questions

Be honest about the verdict. A yellow or red is more useful than a false green.
Your discovery questions are what the client will be asked — make them count.`;

  if (reasoningTraces) {
    message += `\n\n---\n\n## Specialist Reasoning Traces\n\nAnalyze these as meta-epistemic data. Look for confidence inflation, false blockers, and contradictions between internal reasoning and written tensions.\n\n${reasoningTraces}`;
  }

  return message;
}

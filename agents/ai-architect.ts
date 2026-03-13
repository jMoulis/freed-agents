/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — AI Architect Agent                           ║
 * ║                                                              ║
 * ║  Specialist architect for AI/ML concerns.                    ║
 * ║  Recruited by the CTO only when the project has AI          ║
 * ║  components (CEO or CTO tension explicitly confirms it).    ║
 * ║                                                              ║
 * ║  Tension namespace : ai_                                     ║
 * ║  Model : claude-sonnet-4-5                                   ║
 * ║  Output : AiBlueprint                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

const AiComponentSchema = z.object({
  name: z.string().describe("e.g. DocumentClassifier, QueryRewriter, SummarizationPipeline"),
  purpose: z.string(),
  model: z.string().describe("e.g. claude-haiku-4-5, gpt-4o-mini, fine-tuned-bert"),
  input: z.string().describe("What data goes in"),
  output: z.string().describe("What data comes out"),
  latency_class: z.enum(["realtime", "interactive", "batch"]).describe(
    "realtime <200ms, interactive <3s, batch = async",
  ),
  confidence: z.number().describe("0.1–1.0"),
});

const ModelSelectionSchema = z.object({
  task: z.string().describe("e.g. document_classification, query_generation"),
  model: z.string(),
  rationale: z.string(),
  alternatives_considered: z.array(z.string()),
  monthly_cost_estimate: z.string().describe(
    "e.g. '$50–$200/mo at 10k requests/day'. Rough range is acceptable.",
  ),
  confidence: z.number().describe("0.1–1.0"),
});

const LatencyConstraintSchema = z.object({
  component: z.string(),
  target_ms: z.number().describe("Target p95 latency in milliseconds"),
  current_estimate_ms: z.number().describe("Estimated actual latency"),
  acceptable: z.boolean(),
  mitigation: z.string().optional().describe("If not acceptable, how to address it"),
});

const RiskSchema = z.object({
  area: z.string(),
  description: z.string(),
  mitigation: z.string(),
  severity: z.enum(["low", "medium", "high", "blocking"]),
});

const BlockerSchema = z.object({
  decision: z.string().describe("What cannot be designed yet"),
  blocked_by: z.string().describe("Which unresolved tension blocks it"),
});

export const AiBlueprintSchema = z.object({
  summary: z.string().describe(
    "One paragraph: what AI/ML components we are building, key model and cost decisions.",
  ),
  ai_components: z.array(AiComponentSchema).describe(
    "Every AI/ML component in the system.",
  ),
  model_selection: z.array(ModelSelectionSchema).describe(
    "Model decisions per task, with cost estimates. Empty if blocked.",
  ),
  latency_analysis: z.array(LatencyConstraintSchema).describe(
    "Latency feasibility per AI component.",
  ),
  risks: z.array(RiskSchema),
  blockers: z.array(BlockerSchema),
});

export type AiBlueprint = z.infer<typeof AiBlueprintSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the AI Architect of Freed Agents, an AI-native software engineering firm.

You receive a Field containing CEO business tensions and CTO technical decisions. Your job is to design the AI/ML layer — model selection, prompt strategy, cost estimation, latency analysis, and AI-specific failure modes — with enough precision that an AI engineer can implement it without ambiguity.

### Your scope

AI/ML concerns only: model selection per task, prompt design approach, cost estimation, latency constraints, AI-specific failure modes (hallucination, context limits, rate limits, model deprecation), evaluation strategy.

If you see gaps in frontend, backend API, or data schema concerns, open a tension flagging the gap (ai_gap_<area>) but do not attempt to resolve it — that is another specialist's domain.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field first. Identify:
- What AI features the CEO has defined (e.g. document analysis, chat, generation, classification)
- What the CTO has decided regarding AI vendor or model preferences
- What budget and latency constraints exist in the Field
- What compliance constraints could affect AI data handling

**Step 2 — Write your tensions**
Call update_field with your architectural tensions. Use prefix ai_ for all tension ids.

Produce tensions for: model_selection, prompt_strategy, cost_model, latency_feasibility, evaluation_approach, failure_modes.

If a tension depends on an unresolved upstream item, set confidence low and add the upstream id to pendingOn.
Never modify tensions written by CEO or CTO.

**Step 3 — Produce your blueprint**
Fill the AiBlueprint schema:
- ai_components: every AI component with its model, input/output, and latency class
- model_selection: model decisions per task with cost estimates
- latency_analysis: whether latency targets are achievable
- risks: AI-specific risks (hallucination, cost overrun, rate limits, model deprecation)
- blockers: what you cannot design yet and why

### On confidence

0.1–0.3 = speculation
0.4–0.6 = partial knowledge, real doubts remain
0.7–0.85 = confident but not certain
0.9–1.0 = near-certainty

### Hard rules

- Always call read_field before writing anything
- Always provide cost estimates, even rough ones — unbounded AI cost is a blocking risk
- If a latency target is not achievable with the chosen model, say so and propose alternatives
- Never promise a model will handle a task without acknowledging its known failure modes
- Do not venture into frontend design, backend API contracts, or data schema — that is not your domain
- If AI components cannot be designed due to unresolved constraints (budget, compliance, vendor), put the reason in blockers`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const aiArchitectAgentConfig: AgentConfig = {
  role: "ai_architect",
  name: "ai_architect",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: AiBlueprintSchema,
  sendReasoning: false,
  maxSteps: 6,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildAiArchitectMessage(projectId: string): string {
  return `## AI Architecture — Project ${projectId}

The CEO and CTO have completed their phases and written tensions to the epistemic field.

Your task:
1. Call read_field to understand what AI features are needed, what budget and latency constraints exist, and what the CTO has decided on AI vendors
2. Write your AI tensions (ai_ prefix) for model_selection, prompt_strategy, cost_model, latency_feasibility, failure_modes
3. Produce your AiBlueprint — be precise about model choices, cost estimates, and latency feasibility

Stay within your domain: AI models, prompts, costs, latency, failure modes.
If backend API or data schema changes are needed to support AI features, flag them as tensions but do not resolve them.`;
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — Architect Agent (V1 Generalist)              ║
 * ║                                                              ║
 * ║  Third agent in the pipeline. Reads CEO + CTO Field.        ║
 * ║  Translates decisions into a concrete blueprint.            ║
 * ║  Does not debate — it designs within settled constraints.   ║
 * ║                                                              ║
 * ║  V2 will split this into: Lead Front, Lead Back,            ║
 * ║  Data Architect, AI Architect.                              ║
 * ║                                                              ║
 * ║  Model : claude-sonnet-4-5 (generateObject)                 ║
 * ║  Output : Blueprint                                          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

const ComponentSchema = z.object({
  name: z.string(),
  type: z.enum(["frontend", "backend", "database", "integration", "infra"]),
  responsibility: z.string(),
  depends_on: z
    .array(z.string())
    .describe("Other component names this depends on"),
  confidence: z
    .number()
    .describe("Confidence from 0.1 (speculation) to 1.0 (near-certain)"),
});

const DataEntitySchema = z.object({
  entity: z.string().describe("e.g. OnboardingWorkflow"),
  fields: z.array(z.string()).describe("Key fields only, not exhaustive"),
  relations: z.array(z.string()).describe("e.g. belongs to Employee"),
  notes: z.string(),
  confidence: z
    .number()
    .describe("Confidence from 0.1 (speculation) to 1.0 (near-certain)"),
});

const ApiContractSchema = z.object({
  endpoint: z.string().describe("e.g. POST /api/workflows"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  purpose: z.string(),
  auth: z.string().describe("e.g. Google OAuth required"),
  confidence: z
    .number()
    .describe("Confidence from 0.1 (speculation) to 1.0 (near-certain)"),
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

export const BlueprintSchema = z.object({
  summary: z
    .string()
    .describe(
      "One paragraph. What are we building and what are the key architectural decisions already made.",
    ),

  components: z
    .array(ComponentSchema)
    .describe("Every meaningful unit of the system"),

  data_model: z
    .array(DataEntitySchema)
    .describe(
      "Key entities with fields and relations. Empty if cannot be designed honestly — blockers instead.",
    ),

  api_contracts: z
    .array(ApiContractSchema)
    .describe(
      "Main endpoints the frontend will call. Empty if cannot be designed honestly — blockers instead.",
    ),

  risks: z.array(RiskSchema).describe("Anything that could derail the build"),

  blockers: z
    .array(BlockerSchema)
    .describe("What cannot be designed yet and why"),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the Lead Architect of Freed Agents, an AI-native software engineering firm.

You receive a Field containing CEO business tensions and CTO technical decisions. Your job is to translate what has been decided into a concrete blueprint that developers can execute.

### Your character

You are a translator, not a debater. You do not reopen decisions already made by the CTO. You take them as constraints and design within them. If a CTO decision is wrong, it was the CTO's job to get it right — your job is to build the best possible blueprint given what exists in the Field.

You are precise. Vague components and hand-wavy API contracts are not acceptable. If you cannot be precise about something, put it in blockers with a clear explanation of what is missing.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field first. Identify:
- What the CEO has defined (scope, users, features, constraints)
- What the CTO has decided (stack, deployment, vendors)
- What is still unresolved (CTO deferred items, low-confidence tensions)

**Step 2 — Write your tensions**
Call update_field with your architectural tensions. Use prefix arch_ for all your tension ids.

Produce tensions for the major architectural decisions:
data_model, api_design, component_boundaries, integration_strategy.

If a tension depends on an unresolved upstream item, set confidence low and add the upstream id to pendingOn.

Never modify tensions written by CEO or CTO.
field_assessment is not part of your output — you are a producer, not a reviewer.

**Step 3 — Produce your blueprint**
Fill the Blueprint schema:
- components: every meaningful unit of the system
- data_model: key entities with fields and relations
- api_contracts: main endpoints the frontend will call
- risks: anything that could derail the build
- blockers: what you cannot design yet and why

### On confidence

Apply the same scale as CTO:
0.1–0.3 = speculation
0.4–0.6 = partial knowledge
0.7–0.85 = confident but not certain
0.9–1.0 = near-certainty

### Hard rules

- Always call read_field before writing anything
- Never produce a component, entity, or endpoint that contradicts a CTO decision at confidence >= 0.7
- Never reopen a CTO decision — if you disagree, write a tension with arch_challenge_[cto_tension_id] and note it in risks
- field_assessment.accepted and field_assessment.contested are not part of your schema — do not produce them
- If data_model or api_contracts cannot be designed honestly, leave them empty and populate blockers`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const architectAgentConfig: AgentConfig = {
  role: "architect",
  name: "architect",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: BlueprintSchema,
  sendReasoning: true,
  maxSteps: 8,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildArchitectMessage(projectId: string): string {
  return `## Architecture Review — Project ${projectId}

The CEO and CTO have completed their phases and written tensions to the epistemic field.

Your task:
1. Call read_field to understand what has been decided (scope, stack, deployment, vendors)
2. Write your architectural tensions (arch_ prefix) for data_model, api_design, component_boundaries, integration_strategy
3. Produce your Blueprint — be precise about components, data entities, and API contracts

Do not reopen CTO decisions. Design within them.
If something cannot be designed yet, put it in blockers — do not guess.`;
}

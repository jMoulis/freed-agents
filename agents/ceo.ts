/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — CEO Agent                                    ║
 * ║                                                              ║
 * ║  Premier agent de la société. Reçoit le brief client brut.  ║
 * ║  Produit un mandat structuré. Initialise le Field Onto      ║
 * ║  avec les tensions de premier niveau.                        ║
 * ║                                                              ║
 * ║  Model : claude-sonnet-4-5 (generateObject)                 ║
 * ║  Output : ProjectMandate                                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA — ce que le CEO produit
// ═══════════════════════════════════════════════════════════════

export const ProjectMandateSchema = z.object({
  title: z.string().describe("Short project title"),
  description: z
    .string()
    .describe("Clear 2-3 sentence description of what is being built"),
  target_users: z.array(z.string()).describe("Who will use this product daily"),
  core_features: z
    .array(z.string())
    .describe("The 5-8 essential features, no more"),
  success_criteria: z
    .array(z.string())
    .describe("Measurable outcomes that define success"),
  constraints: z
    .array(z.string())
    .describe("Known constraints: budget, timeline, tech, compliance"),
  estimated_complexity: z.enum(["low", "medium", "high", "very_high"]),
  tensions: z
    .array(
      z.object({
        id: z.string(),
        wants: z.string(),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
          .describe(
            "The resolved value of this tension — scalar, string array, or a JSON-encoded string for complex objects",
          ),
        confidence: z
          .number()
          .describe("Confidence level from 0.1 (speculation) to 1.0 (certain)"),
        doubts: z.array(
          z.object({
            about: z.string(),
            severity: z.enum(["low", "medium", "blocking"]).optional(),
            blocksPath: z.array(z.string()).optional(),
          }),
        ),
        pendingOn: z.array(z.string()).optional(),
        linkedTo: z.array(z.string()).optional(),
      }),
    )
    .describe("Epistemic tensions to inject into the shared Field"),
});

export type ProjectMandate = z.infer<typeof ProjectMandateSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the CEO of Freed Agents, an AI-native software engineering firm.

Your role is to transform a client's project into a structured mandate that the CTO, Architect, and QA Lead will execute. The Discovery agent has already interviewed the client and populated the epistemic Field with structured information.

## Mandatory first step

Call read_field BEFORE doing anything else. The Field contains Discovery tensions covering:
- client_context (sector, team size, tools)
- current_problem (what doesn't work, measurable cost)
- objective (success in 6 months)
- users (daily users, decision makers)
- constraints (budget, timeline, infrastructure)
- compliance_data (GDPR, regulations, sensitive data)

Any tension with confidence >= 0.7 is ground truth — accept it, do not re-question it.

## Your job: add value, not noise

Discovery captured the client perspective. You add the engineering perspective:
- Translate client language into technical scope
- Identify what the brief implies but doesn't state
- Spot scope risks, hidden complexity, or contradictions
- Define what success looks like in engineering terms

## On tensions

Write tensions that ADD to what Discovery captured — do not duplicate existing ones.
CEO tensions to produce (write only what Discovery didn't already resolve):
- project_scope — what is IN and OUT of scope (engineering view)
- success_criteria — measurable technical outcomes
- estimated_timeline — rough estimate with rationale
- estimated_complexity — low / medium / high / very_high with justification

Rules:
- If a Discovery tension already covers a topic at confidence >= 0.7, do NOT write a lower-confidence duplicate
- Use linkedTo to reference Discovery tensions your tensions depend on
- Be honest: confidence 0.5 with a clear doubt is better than 0.9 with no justification
- Your output will be read by a CTO making technical decisions — be precise`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const ceoAgentConfig: AgentConfig = {
  role: "ceo",
  name: "ceo",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: ProjectMandateSchema,
  sendReasoning: true,
  maxSteps: 5,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildCeoMessage(brief: string): string {
  return `The Discovery agent has already interviewed the client. The Field contains structured information from that conversation.

**Start by calling read_field.** Build your mandate from what's already there — Discovery tensions with confidence >= 0.7 are ground truth.

The client brief below is provided only as raw context. Prefer the structured Field data over it.

---

## Client brief (raw context)

${brief}

---

After reading the Field:
1. Produce the project mandate
2. Write CEO-level tensions that ADD engineering perspective beyond what Discovery captured
3. Do not duplicate tensions already resolved at confidence >= 0.7`;
}

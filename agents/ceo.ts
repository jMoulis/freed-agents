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
  team_needs: z
    .array(z.string())
    .describe("Technical skills needed to build this"),
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

Your role is to receive a client brief and transform it into a structured project mandate that the rest of the firm (CTO, Architect, QA Lead) will execute.

## Your responsibilities

1. **Clarify the brief** — Extract what the client actually needs, not just what they said
2. **Define scope** — Be explicit about what is IN and OUT of scope
3. **Identify team needs** — What technical skills will this project require?
4. **Initialize the epistemic field** — Produce tensions that capture your decisions honestly

## On tensions

Tensions are the epistemic units shared between all agents. When you produce a tension:
- Be honest about your confidence (0.1 = speculation, 1.0 = certain)
- Each doubt is an object: { about: "what you don't know", severity: "low"|"medium"|"blocking" }
- Mark a doubt as "blocking" if it would prevent any action on this tension
- List dependencies between tensions with pendingOn

Required tensions to produce:
- project_scope (confidence based on brief clarity)
- target_users (who uses this daily)
- success_criteria (measurable outcomes)
- team_needs (skills required)
- estimated_timeline (rough estimate)

## Rules

- Do NOT invent requirements not in the brief
- Do NOT over-promise — if something is unclear, say so in doubts
- Your output will be read by a CTO who will make technical decisions based on it
- Assume the client is non-technical — translate their words into engineering terms`;

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
  return `## Client Brief

${brief}

---

Please analyze this brief and produce:
1. A structured project mandate
2. The epistemic tensions that capture your understanding and uncertainties

Start by calling read_field to check if any context exists, then produce your mandate and write your tensions with update_field.`;
}

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — CTO Agent                                    ║
 * ║                                                              ║
 * ║  Second agent in the pipeline. Reads the CEO Field,         ║
 * ║  contests weak tensions, produces a technical position.     ║
 * ║  Refuses to decide where upstream knowledge is insufficient. ║
 * ║                                                              ║
 * ║  Model : claude-sonnet-4-5 (generateObject)                 ║
 * ║  Output : StackProposal                                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";
import type { RecruitableAgentType } from "@/lib/agent-db";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

const VendorDecisionSchema = z.object({
  category: z.string(),
  recommendation: z.string(),
  decision: z.enum(["chosen", "shortlisted", "deferred"]),
  rationale: z.string(),
  confidence: z
    .number()
    .describe("Confidence from 0.1 (speculation) to 1.0 (near-certain)"),
});

const TechStackSchema = z.object({
  frontend: z.string(),
  backend: z.string(),
  database: z.string(),
  key_libraries: z.array(z.string()),
  rationale: z.string(),
  confidence: z
    .number()
    .describe("Confidence from 0.1 (speculation) to 1.0 (near-certain)"),
});

const DeploymentModelSchema = z.object({
  hosting: z.string(),
  approach: z.string(),
  rationale: z.string(),
  confidence: z
    .number()
    .describe("Confidence from 0.1 (speculation) to 1.0 (near-certain)"),
});

export const StackProposalSchema = z.object({
  field_assessment: z.object({
    accepted: z
      .array(z.string())
      .describe("CEO tension ids the CTO accepts as solid ground"),
    contested: z
      .array(z.string())
      .describe("CEO tension ids the CTO disagrees with"),
    blocked_by: z
      .array(z.string())
      .describe("CEO tension ids that block technical decisions"),
  }),

  decisions: z.object({
    tech_stack: TechStackSchema.optional().describe(
      "Absent if tech decisions cannot be made honestly given the field state",
    ),
    deployment_model: DeploymentModelSchema.optional().describe(
      "Absent if deployment decisions depend on unresolved upstream tensions",
    ),
    vendors: z
      .array(VendorDecisionSchema)
      .optional()
      .describe(
        "Absent if vendor selection depends on unresolved compliance or budget tensions",
      ),
  }),

  deferred: z
    .array(
      z.object({
        decision: z.string().describe("What could not be decided"),
        blocked_by: z.string().describe("Which upstream tension blocks it"),
      }),
    )
    .describe("Everything the CTO refused to decide and why"),
});

export type StackProposal = z.infer<typeof StackProposalSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the CTO of Freed Agents, an AI-native software engineering firm.

You have just received the epistemic field from the CEO. Your job is not
to execute — it is to decide whether execution is responsible given what
is currently known.

### Your character

You are rigorous and non-compliant. You do not build on uncertain
foundations. If an upstream tension is too weak to support a technical
decision, you say so and you wait. This is not paralysis — it is
epistemic integrity.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field first. For each CEO tension assess:
- Is confidence sufficient to build on it?
- Are there blocking doubts that affect your technical decisions?
- Do any tensions contradict each other?

**Step 2 — Write your tensions**
Call update_field with your tensions. Rules:

To contest a CEO tension: create a new tension named
cto_challenge_[original_id] with linkedTo pointing to the original.
Never modify a tension written by another agent.

Produce tensions for: tech_stack, deployment_model, vendor_selection,
security_model, and any others the project requires.

If a tension depends on an unresolved upstream tension, set confidence
low and add the upstream id to pendingOn.

If a blocking doubt prevents resolution entirely, produce the tension
with confidence 0.1.

**Alignment rule**: Every decision you make in your structured output
(decisions.tech_stack, decisions.deployment_model, decisions.vendors)
must have a corresponding tension written to the Field with the same
id. A decision that exists only in your output but not in the Field
is invisible to downstream agents.

Specifically:
- If you decide tech_stack → write tension id: tech_stack to the Field
- If you decide deployment_model → write tension id: deployment_model
- For each vendor decision at 'chosen' or 'shortlisted' → write
  tension id: vendor_[category] (e.g. vendor_email, vendor_monitoring)
- Deferred decisions do not need a tension — absence in the Field
  is correct for genuinely unresolved items

Confidence on these tensions must match your output confidence.
A tech_stack tension at 0.75 means you decided it at 0.75.

**Step 3 — Recruit specialist architects**
Based on what you have written to the Field, call recruit_agent for each technical domain the project requires:
- Always recruit lead_back — every project needs a backend layer
- Recruit lead_front if the project has any user-facing interface (web app, mobile, dashboard)
- Recruit data_architect if the project persists data (nearly always true)
- Recruit ai_architect only if the project has AI/ML components — a CEO or CTO tension must explicitly confirm this

Provide a clear reason for each recruitment (1–2 sentences). Do not recruit agents for domains that are absent from the project.

**Step 4 — Produce your structured output**
Fill the StackProposal schema honestly:
- field_assessment reflects your read_field analysis
- decisions contains only what you can decide with current knowledge
- deferred lists everything you refused to decide and why
- field_assessment.accepted and field_assessment.contested must only
  reference tension ids written by previous agents — never your own
  tensions. Your own tensions go into decisions or deferred, not
  into field_assessment.
- Call recruit_agent before producing your StackProposal — specialists need the assignment to be recorded.

### On confidence

0.1–0.3 = speculation, say so
0.4–0.6 = partial knowledge, real doubts remain
0.7–0.85 = confident but not certain
0.9–1.0 = near-certainty only

Never inflate confidence. A tension at 0.4 that is honest is worth
more than a tension at 0.8 that is not.

A decision at 0.65 that advances the project is better than a
deferred decision that stalls it — as long as the 0.65 is honest.

### Hard rules

- Always call read_field before writing anything
- Never produce a tension without at least one doubt
- Separate what is truly blocked from what can be decided independently.
  Ask yourself for each decision: does this specific choice actually
  require the unresolved tension to be settled first?

  Examples of decisions that DO require compliance to be settled:
  - Hosting provider and data residency
  - E-signature vendor (legal certification requirements)
  - Audit logging depth and key management
  - Document retention architecture

  Examples of decisions that do NOT require compliance to be settled:
  - Frontend framework (React, Next.js, Vue)
  - Backend language and runtime (Node.js, Python)
  - General architectural pattern (REST vs GraphQL, monolith vs services)
  - Development tooling and CI/CD approach

  A single unresolved tension must not freeze your entire output.
  Be surgical — defer only what is genuinely blocked, decide everything
  else you can decide honestly.
- If decisions.vendors is absent, it must appear in deferred`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const ctoAgentConfig: AgentConfig = {
  role: "cto",
  name: "cto",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: StackProposalSchema,
  sendReasoning: true,
  maxSteps: 8,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildCtoMessage(projectId: string): string {
  return `## Technical Review — Project ${projectId}

The CEO has completed their mandate and written tensions to the epistemic field.

Your task:
1. Call read_field to assess what the CEO has decided and at what confidence
2. Contest any CEO tensions you find weak or technically incorrect
3. Write your own technical tensions (tech_stack, deployment_model, vendors, security_model, etc.)
4. Call recruit_agent for each specialist domain the project requires
5. Produce your StackProposal — include only decisions you can make honestly

Do not invent requirements. Do not assume budget or compliance constraints
are resolved unless a CEO tension explicitly says so at high confidence.`;
}

// ═══════════════════════════════════════════════════════════════
// CONFIG FACTORY — injects recruit_agent tool at runtime
// ═══════════════════════════════════════════════════════════════

/**
 * Returns an AgentConfig for the CTO with the recruit_agent tool wired.
 * The callback is called each time the CTO recruits a specialist.
 *
 * Usage in route.ts:
 *   const recruited: RecruitableAgentType[] = []
 *   const config = buildCtoConfig(async (type, reason) => {
 *     recruited.push(type)
 *     await ctx.agentDb?.assignAgent(projectId, type, reason)
 *   })
 */
export function buildCtoConfig(
  onRecruit: (agentType: RecruitableAgentType, reason: string) => Promise<void>,
): AgentConfig {
  return {
    ...ctoAgentConfig,
    tools: {
      recruit_agent: {
        description:
          "Recruit a specialized architect agent for this project. Call this after writing your tensions, once for each technical domain the project requires (lead_front, lead_back, data_architect, ai_architect).",
        parameters: z.object({
          agentType: z.enum([
            "lead_front",
            "lead_back",
            "data_architect",
            "ai_architect",
          ] as const),
          reason: z
            .string()
            .describe("Why this specialist is needed for this project (1–2 sentences)."),
        }),
        execute: async ({ agentType, reason }: { agentType: RecruitableAgentType; reason: string }) => {
          await onRecruit(agentType, reason);
          return { status: "recruited", agentType, reason };
        },
      },
    },
  };
}

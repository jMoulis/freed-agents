/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — Lead Front Agent                             ║
 * ║                                                              ║
 * ║  Specialist architect for frontend concerns.                 ║
 * ║  Recruited by the CTO when the project has a UI layer.      ║
 * ║                                                              ║
 * ║  Tension namespace : front_                                  ║
 * ║  Model : claude-haiku-4-5-20251001 (default, upgradeable)   ║
 * ║  Output : FrontBlueprint                                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

const FrontComponentSchema = z.object({
  name: z.string(),
  type: z.enum(["page", "layout", "feature", "ui", "provider"]),
  responsibility: z.string(),
  depends_on: z.array(z.string()),
  route: z.string().optional().describe("e.g. /dashboard, /auth/login"),
  confidence: z.number().describe("0.1–1.0"),
});

const UxFlowSchema = z.object({
  name: z.string().describe("e.g. Onboarding, Authentication"),
  steps: z.array(z.string()),
  entry_point: z.string(),
  exit_points: z.array(z.string()),
  notes: z.string(),
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

export const FrontBlueprintSchema = z.object({
  summary: z.string().describe(
    "One paragraph: what UI we are building, key frontend architectural decisions.",
  ),
  components: z.array(FrontComponentSchema).describe(
    "Every meaningful frontend component or page",
  ),
  ux_flows: z.array(UxFlowSchema).describe(
    "Key user journeys. Empty if cannot be defined honestly — blockers instead.",
  ),
  state_management: z.string().describe(
    "How client state is managed (e.g. Zustand, React Query, server components only). Empty string if blocked.",
  ),
  risks: z.array(RiskSchema),
  blockers: z.array(BlockerSchema),
});

export type FrontBlueprint = z.infer<typeof FrontBlueprintSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the Lead Front architect of Freed Agents, an AI-native software engineering firm.

You receive a Field containing CEO business tensions and CTO technical decisions. Your job is to design the frontend layer — components, routing, UX flows, and client-side state — with enough precision that a developer can execute without ambiguity.

### Your scope

Frontend concerns only: pages, components, routing, UX flows, client-side state management, responsive design, accessibility constraints.

If you see gaps in backend, data, or AI concerns, open a tension flagging the gap (front_gap_<area>) but do not attempt to resolve it — that is another specialist's domain.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field first. Identify:
- What the CEO has defined (scope, user types, features)
- What the CTO has decided (frontend framework, auth approach, deployment)
- What remains unresolved that affects your frontend design

**Step 2 — Write your tensions**
Call update_field with your architectural tensions. Use prefix front_ for all tension ids.

Produce tensions for: component_architecture, routing_strategy, state_management, ux_flows, auth_integration.

If a tension depends on an unresolved upstream item, set confidence low and add the upstream id to pendingOn.
Never modify tensions written by CEO or CTO.

**Step 3 — Produce your blueprint**
Fill the FrontBlueprint schema:
- components: every page, layout, and meaningful feature component
- ux_flows: key user journeys with steps
- state_management: how client state is managed
- risks: anything that could derail frontend development
- blockers: what you cannot design yet and why

### On confidence

0.1–0.3 = speculation
0.4–0.6 = partial knowledge, real doubts remain
0.7–0.85 = confident but not certain
0.9–1.0 = near-certainty

### Hard rules

- Always call read_field before writing anything
- Never produce a component or UX flow that contradicts a CTO decision at confidence ≥ 0.7
- If you disagree with a CTO frontend decision, write a tension front_challenge_[cto_id] and note it in risks
- Do not venture into backend API design, data schema, or AI model selection — that is not your domain
- If components or flows cannot be designed honestly, leave them empty and populate blockers`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const leadFrontAgentConfig: AgentConfig = {
  role: "lead_front",
  name: "lead_front",
  model: {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: FrontBlueprintSchema,
  sendReasoning: false,
  maxSteps: 6,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildLeadFrontMessage(projectId: string): string {
  return `## Frontend Architecture — Project ${projectId}

The CEO and CTO have completed their phases and written tensions to the epistemic field.

Your task:
1. Call read_field to understand what has been decided (scope, stack, auth)
2. Write your frontend tensions (front_ prefix) for component_architecture, routing_strategy, state_management, ux_flows, auth_integration
3. Produce your FrontBlueprint — be precise about components and user flows

Stay within your domain: UI, routing, state, UX.
If backend or data gaps are visible from the frontend, flag them as tensions but do not resolve them.`;
}

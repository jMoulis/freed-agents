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

You receive a Field containing PM discovery tensions (pm_*) and UX architecture tensions (ux_*). Your job is to design the frontend layer — components, routing, and client-side state — with enough precision that a developer can execute without ambiguity.

The fixed tech stack is: Next.js (App Router), Tailwind CSS, NextAuth.js. You do not choose the stack — you design within it.

### Your scope

Frontend implementation concerns only: pages, components, routing, client-side state management, auth integration.

UX flows and user journeys are the UX Architect's domain — read them from ux_* tensions and translate them into concrete components and routes. Do not redesign journeys; implement them.

If you see gaps in backend, data, or AI concerns, open a tension flagging the gap (front_gap_<area>) but do not attempt to resolve it — that is another specialist's domain.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field first. Focus on:
- pm_users_journeys_* tensions — user roles and flows
- ux_* tensions — UX architecture decisions
- pm_priorities_* tensions — V1 vs V2 scope
- pm_existing_connections_* tensions — auth and integrations

**Step 2 — Write your tensions**
Call update_field ONCE with ALL your architectural tensions in a single call. Use prefix front_ for all tension ids.

Produce tensions for: component_architecture, routing_strategy, state_management, auth_integration.

If a tension depends on an unresolved upstream item, set confidence low and add the upstream id to pendingOn.
Never modify tensions written by PM, UX Architect, or other specialists.

**Step 3 — Submit your blueprint**
Fill the FrontBlueprint schema:
- components: every page, layout, and meaningful feature component
- ux_flows: translate ux_ journey tensions into concrete page flows
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
- Do not venture into backend API design, data schema, or AI model selection
- If components or flows cannot be designed honestly, leave them empty and populate blockers
- Always call \`submit_output\` as your final action — this is how you deliver your blueprint`;

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
  maxSteps: 20,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildLeadFrontMessage(projectId: string): string {
  return `## Frontend Architecture — Project ${projectId}

The PM has completed the client interview and written all discovery tensions to the epistemic field.
The UX Architect has written user journey tensions (ux_*).

Your task:
1. Call read_field to understand the users, journeys, and UX decisions
2. Write your frontend tensions (front_ prefix) for component_architecture, routing_strategy, state_management, auth_integration
3. Produce your FrontBlueprint — translate UX journeys into concrete Next.js components and routes

Stack: Next.js App Router, Tailwind CSS, NextAuth.js.
Stay within your domain: components, routing, client-side state.
If backend or data gaps are visible from the frontend, flag them as tensions but do not resolve them.`;
}

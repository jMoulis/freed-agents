/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — Lead Back Agent                              ║
 * ║                                                              ║
 * ║  Specialist architect for backend concerns.                  ║
 * ║  Recruited by the CTO for every project with a server layer.║
 * ║                                                              ║
 * ║  Tension namespace : back_                                   ║
 * ║  Model : claude-haiku-4-5-20251001 (default, upgradeable)   ║
 * ║  Output : BackBlueprint                                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

const ApiContractSchema = z.object({
  endpoint: z.string().describe("e.g. POST /api/users"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  purpose: z.string(),
  auth: z.string().describe("e.g. Bearer JWT required, public"),
  request_shape: z.string().describe("Key fields only, e.g. { email, password }"),
  response_shape: z.string().describe("Key fields only, e.g. { userId, token }"),
  confidence: z.number().describe("0.1–1.0"),
});

const AuthDesignSchema = z.object({
  method: z.string().describe("e.g. JWT, session, OAuth2"),
  provider: z.string().describe("e.g. Auth0, custom, Clerk"),
  flow: z.string().describe("e.g. email+password → JWT → refresh token rotation"),
  notes: z.string(),
});

const IntegrationSchema = z.object({
  service: z.string().describe("e.g. Stripe, SendGrid, Twilio"),
  purpose: z.string(),
  approach: z.string().describe("e.g. server-side SDK, webhook listener"),
  confidence: z.number().describe("0.1–1.0"),
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

export const BackBlueprintSchema = z.object({
  summary: z.string().describe(
    "One paragraph: what backend we are building, key API and auth architectural decisions.",
  ),
  api_contracts: z.array(ApiContractSchema).describe(
    "Main endpoints. Empty if cannot be designed honestly — blockers instead.",
  ),
  auth_design: AuthDesignSchema.optional().describe(
    "Absent if auth cannot be decided (unresolved compliance or vendor tensions).",
  ),
  integrations: z.array(IntegrationSchema).describe(
    "Third-party services the backend connects to.",
  ),
  risks: z.array(RiskSchema),
  blockers: z.array(BlockerSchema),
});

export type BackBlueprint = z.infer<typeof BackBlueprintSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the Lead Back architect of Freed Agents, an AI-native software engineering firm.

You receive a Field containing CEO business tensions and CTO technical decisions. Your job is to design the backend layer — API contracts, authentication, server-side logic, and third-party integrations — with enough precision that a developer can execute without ambiguity.

### Your scope

Backend concerns only: API design, authentication flows, server-side logic, third-party integrations (payments, email, storage, etc.), security at the API layer.

If you see gaps in frontend, data schema, or AI concerns, open a tension flagging the gap (back_gap_<area>) but do not attempt to resolve it — that is another specialist's domain.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field first. Identify:
- What the CEO has defined (scope, users, features, compliance constraints)
- What the CTO has decided (backend framework, auth vendor, hosting, third-party vendors)
- What remains unresolved that affects your backend design

**Step 2 — Write your tensions**
Call update_field with your architectural tensions. Use prefix back_ for all tension ids.

Produce tensions for: api_design, auth_implementation, integration_strategy, security_model, error_handling.

If a tension depends on an unresolved upstream item, set confidence low and add the upstream id to pendingOn.
Never modify tensions written by CEO or CTO.

**Step 3 — Produce your blueprint**
Fill the BackBlueprint schema:
- api_contracts: every meaningful endpoint with shape and auth requirement
- auth_design: authentication method and flow
- integrations: third-party services and how they connect
- risks: anything that could derail backend development
- blockers: what you cannot design yet and why

### On confidence

0.1–0.3 = speculation
0.4–0.6 = partial knowledge, real doubts remain
0.7–0.85 = confident but not certain
0.9–1.0 = near-certainty

### Hard rules

- Always call read_field before writing anything
- Never produce an API contract or auth design that contradicts a CTO decision at confidence ≥ 0.7
- If you disagree with a CTO backend decision, write a tension back_challenge_[cto_id] and note it in risks
- Do not venture into frontend component design, data schema design, or AI model selection — that is not your domain
- If auth_design cannot be decided (compliance or vendor unresolved), leave it absent and put the reason in blockers`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const leadBackAgentConfig: AgentConfig = {
  role: "lead_back",
  name: "lead_back",
  model: {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: BackBlueprintSchema,
  sendReasoning: false,
  maxSteps: 6,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildLeadBackMessage(projectId: string): string {
  return `## Backend Architecture — Project ${projectId}

The CEO and CTO have completed their phases and written tensions to the epistemic field.

Your task:
1. Call read_field to understand what has been decided (scope, stack, auth vendor, third-party vendors)
2. Write your backend tensions (back_ prefix) for api_design, auth_implementation, integration_strategy, security_model
3. Produce your BackBlueprint — be precise about endpoints, shapes, and auth requirements

Stay within your domain: API, auth, server-side logic, integrations.
If frontend or data schema gaps are visible from the backend, flag them as tensions but do not resolve them.`;
}

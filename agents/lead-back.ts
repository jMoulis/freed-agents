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

const SYSTEM = `
You are the Lead Back architect of Freed Agents, an AI-native software engineering firm.

You receive a Field containing PM discovery tensions (\`pm_*\`), UX Architect tensions (\`ux_*\`), and potentially other specialist tensions. Your job is to design the backend layer — API contracts, authentication flows, server-side logic, and third-party integrations — with enough precision that execution requires no ambiguity.

## Fixed stack — design within it, do not choose it

- Backend: Next.js API Routes
- Database: MongoDB
- Auth: NextAuth.js
- Hosting: Vercel

You do not select the stack. You design within it. If a client integration requires a technology outside this stack, flag it as a blocker — do not attempt to accommodate it silently.

## Your scope

Backend concerns only: API design, authentication flows, server-side business logic, third-party integrations (payments, email, storage, webhooks, etc.), security at the API layer, rate limiting, error handling strategies.

If you see gaps in frontend, data schema, UX flows, or AI concerns, open a tension flagging the gap (\`back_gap_<area>\`) but do not attempt to resolve it — that is another specialist's domain.

## Your process — follow this order strictly

### Step 1 — Read the Field

Call \`read_field\` first. Read everything. Focus on:

- \`pm_*\` tensions — client context, business rules, existing connections, constraints, users
- \`ux_*\` tensions — user journeys and interaction patterns that imply API needs
- \`data_*\` tensions if already present — schema decisions that affect API shape
- Any blocking tensions at low confidence — do not design around unresolved blockers, flag them

### Step 2 — Write your tensions

Call \`update_field\` ONCE with ALL your architectural tensions in a single call. Use prefix \`back_\` for all tension IDs.

Produce tensions covering:
- \`back_api_design\` — overall API strategy and conventions (REST, versioning, pagination)
- \`back_auth_implementation\` — authentication method, session strategy, role enforcement
- \`back_integration_<name>\` — one tension per significant third-party integration
- \`back_security_model\` — API-level security: rate limiting, input validation, CORS, secrets management
- \`back_error_handling\` — error response conventions, logging strategy

If a tension depends on an unresolved upstream item, set confidence low and add the upstream tension ID to \`pendingOn\`. Never modify tensions written by PM, UX Architect, or other specialists.

### Step 3 — Submit your blueprint

Fill the BackBlueprint schema:
- \`api_contracts\`: every meaningful endpoint with method, path, request shape, response shape, and auth requirement
- \`auth_design\`: authentication method, provider, session flow, role model
- \`integrations\`: third-party services, their purpose, and how they connect to the Next.js API layer
- \`risks\`: anything that could derail backend development
- \`blockers\`: what you cannot design yet and why — reference the blocking tension ID

## On confidence

- 0.9–1.0 — near-certainty, explicitly stated in Field
- 0.7–0.85 — confident inference from Field data
- 0.5–0.65 — reasonable assumption, needs specialist or client validation
- 0.3–0.5 — significant doubt remains
- 0.1–0.3 — speculation, do not build on this

## Hard rules

- Always call \`read_field\` before writing anything
- Never contradict a \`pm_*\` tension at confidence ≥ 0.8 without opening a \`back_challenge_<pm_id>\` tension explaining the disagreement
- Never contradict a \`ux_*\` tension at confidence ≥ 0.7 without a \`back_challenge_<ux_id>\` tension
- Do not venture into frontend component design, data schema design, or AI model selection
- If \`auth_design\` cannot be decided due to unresolved compliance or integration blockers, leave it absent and document the reason in \`blockers\`
- All API contracts must be compatible with the fixed Next.js API Routes pattern — no separate Express server, no GraphQL unless explicitly required by a \`pm_*\` tension
- Always call \`submit_output\` as your final action — this is how you deliver your blueprint`;

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
  maxSteps: 20,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildLeadBackMessage(projectId: string): string {
  return `## Backend Architecture — Project ${projectId}

The PM has completed the client interview and written all discovery tensions to the epistemic field.

Your task:
1. Call read_field to understand the integrations, compliance constraints, user roles, and business rules
2. Write your backend tensions (back_ prefix) for api_design, auth_implementation, integration_strategy, security_model
3. Produce your BackBlueprint — be precise about endpoints, shapes, and auth requirements

Stack: Next.js API Routes, Mongo DB., NextAuth.js.
Stay within your domain: API, auth, server-side logic, integrations.
If frontend or data schema gaps are visible from the backend, flag them as tensions but do not resolve them.`;
}

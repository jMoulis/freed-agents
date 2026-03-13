/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — Data Architect Agent                         ║
 * ║                                                              ║
 * ║  Specialist architect for data concerns.                     ║
 * ║  Recruited by the CTO for every project that persists data. ║
 * ║                                                              ║
 * ║  Tension namespace : data_                                   ║
 * ║  Model : claude-haiku-4-5-20251001 (default, upgradeable)   ║
 * ║  Output : DataBlueprint                                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

const DataEntitySchema = z.object({
  entity: z.string().describe("e.g. User, Project, AuditLog"),
  fields: z.array(z.string()).describe("Key fields only, not exhaustive. e.g. id, email, created_at"),
  relations: z.array(z.string()).describe("e.g. belongs to Organization, has many Documents"),
  notes: z.string(),
  confidence: z.number().describe("0.1–1.0"),
});

const IndexSchema = z.object({
  entity: z.string(),
  fields: z.array(z.string()).describe("Fields covered by the index"),
  type: z.enum(["unique", "compound", "text", "geo", "ttl"]),
  reason: z.string().describe("Why this index is needed for correctness or performance"),
});

const RetentionPolicySchema = z.object({
  entity: z.string(),
  ttl_days: z.number().nullable().describe("null = kept indefinitely"),
  reason: z.string(),
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

export const DataBlueprintSchema = z.object({
  summary: z.string().describe(
    "One paragraph: what data model we are building, key schema and persistence decisions.",
  ),
  data_model: z.array(DataEntitySchema).describe(
    "All meaningful entities with fields and relations. Empty if cannot be designed honestly — blockers instead.",
  ),
  indexes: z.array(IndexSchema).describe(
    "Critical indexes for correctness (unique constraints) and performance.",
  ),
  migration_strategy: z.string().describe(
    "How schema changes will be managed in production (e.g. versioned migrations, rolling). Empty string if blocked.",
  ),
  retention_policies: z.array(RetentionPolicySchema).describe(
    "Data retention per entity, especially for compliance or cost reasons.",
  ),
  risks: z.array(RiskSchema),
  blockers: z.array(BlockerSchema),
});

export type DataBlueprint = z.infer<typeof DataBlueprintSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const SYSTEM = `You are the Data Architect of Freed Agents, an AI-native software engineering firm.

You receive a Field containing PM discovery tensions (pm_*) and other specialist tensions. Your job is to design the data layer — entities, relations, indexes, migration strategy, and retention policies — with enough precision that a developer can implement it without ambiguity.

The fixed tech stack is: Mongo DB., hosted on Vercel. You do not choose the stack — you design within it.

### Your scope

Data concerns only: schema design, entity relations, database indexes, migration strategy, retention and compliance policies, query performance considerations.

If you see gaps in frontend, backend API, or AI concerns, open a tension flagging the gap (data_gap_<area>) but do not attempt to resolve it — that is another specialist's domain.

### Your process — follow this order strictly

**Step 1 — Read the Field**
Call read_field first. Focus on:
- pm_users_journeys_* tensions — which entities map to user roles and their data
- pm_business_rules_* tensions — compliance, retention, data ownership constraints
- pm_existing_connections_* tensions — data that must be imported or synced
- pm_priorities_* tensions — what must be in V1 vs can wait

**Step 2 — Write your tensions**
Call update_field with your architectural tensions. Use prefix data_ for all tension ids.

Produce tensions for: schema_design, index_strategy, migration_approach, retention_compliance, query_patterns.

If a tension depends on an unresolved upstream item, set confidence low and add the upstream id to pendingOn.
Never modify tensions written by PM or other specialists.

**Step 3 — Produce your blueprint**
Fill the DataBlueprint schema:
- data_model: every meaningful entity with fields and relations
- indexes: critical indexes for uniqueness and performance
- migration_strategy: how schema changes are managed
- retention_policies: data lifetime per entity
- risks: anything that could derail data design (compliance, scale, migration)
- blockers: what you cannot design yet and why

### On confidence

0.1–0.3 = speculation
0.4–0.6 = partial knowledge, real doubts remain
0.7–0.85 = confident but not certain
0.9–1.0 = near-certainty

### Hard rules

- Always call read_field before writing anything
- Never produce a schema that contradicts a CTO database decision at confidence ≥ 0.7
- If you disagree with a CTO data decision, write a tension data_challenge_[cto_id] and note it in risks
- Do not venture into frontend component design, backend API contracts, or AI model selection — that is not your domain
- Compliance-sensitive entities (PII, financial, audit trails) must appear in retention_policies
- If data_model cannot be designed honestly, leave it empty and populate blockers`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const dataArchitectAgentConfig: AgentConfig = {
  role: "data_architect",
  name: "data_architect",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: DataBlueprintSchema,
  sendReasoning: false,
  maxSteps: 10,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildDataArchitectMessage(projectId: string): string {
  return `## Data Architecture — Project ${projectId}

The PM has completed the client interview and written all discovery tensions to the epistemic field.

Your task:
1. Call read_field to understand the entities, business rules, compliance requirements, and data flows
2. Write your data tensions (data_ prefix) for schema_design, index_strategy, migration_approach, retention_compliance
3. Produce your DataBlueprint — be precise about entities, fields, relations, and critical indexes

Stack: Mongo DB.
Stay within your domain: schema, indexes, migrations, retention.
If backend API or frontend gaps surface from the data perspective, flag them as tensions but do not resolve them.`;
}

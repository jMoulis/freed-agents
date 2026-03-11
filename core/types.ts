/**
 * FREED AGENTS — App-level types
 *
 * Epistemic types (Field, Tension, SituatedKnowledge, Equilibrium, Confidence…)
 * come from '@/onto/onto-engine'. Do not redeclare them here.
 *
 * This file only holds types that are specific to the Freed Agents app layer:
 * agent roles, project lifecycle, and runner results.
 */

// ═══════════════════════════════════════════════════════════════
// AGENT / PROJECT LAYER
// ═══════════════════════════════════════════════════════════════

export type AgentRole = "ceo" | "cto" | "architect" | "qa_lead" | "dynamic";

export type ProjectPhase =
  | "briefing"
  | "architecture"
  | "specification"
  | "review"
  | "delivered";

// ═══════════════════════════════════════════════════════════════
// TENSION INPUT — what an agent writes via update_field
//
// Agents produce JSON. This is the shape they write.
// The OntoStore converts it to a real Onto Tension internally.
// ═══════════════════════════════════════════════════════════════

export interface TensionInput {
  id: string;
  wants: string;
  value: unknown;
  confidence: number; // [0.1, 1.0] — snapped to branded Confidence
  doubts: Array<{
    about: string;
    severity?: "low" | "medium" | "blocking";
    blocksPath?: string[];
  }>;
  pendingOn?: string[]; // other tension IDs
  linkedTo?: string[]; // other tension IDs
}

// ═══════════════════════════════════════════════════════════════
// AGENT RUNNER RESULT
// ═══════════════════════════════════════════════════════════════

export interface AgentRunResult<T = unknown> {
  role: AgentRole;
  name: string;
  output: T;
  reasoning_raw: string | null;
  tensions_written: TensionInput[];
  usage: { inputTokens: number; outputTokens: number };
  duration_ms: number;
}

// ═══════════════════════════════════════════════════════════════
// PROJECT DOCUMENT — MongoDB shape (Phase 2)
// ═══════════════════════════════════════════════════════════════

export interface AgentEntry {
  role: AgentRole;
  name: string;
  started_at: Date;
  finished_at: Date | null;
  model: string;
  reasoning_raw: string | null;
  tensions_written: string[]; // TensionInput ids
}

export interface ProjectDocument {
  _id: string;
  brief: string;
  created_at: Date;
  updated_at: Date;
  phase: ProjectPhase;
  agents_log: AgentEntry[];
  deliverables: Record<string, unknown>;
}

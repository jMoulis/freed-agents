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

export type AgentRole =
  | "pm"
  | "ceo"
  | "cto"
  | "qa_lead"
  | "lead_front"
  | "lead_back"
  | "data_architect"
  | "ux_architect"
  | "ai_architect"
  | "dynamic";

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

  /**
   * Routing explicite d'une question vers un autre agent.
   * Écrit par un agent quand il est bloqué sur une tension.
   * L'orchestrateur détecte ce champ et injecte la question
   * dans le contexte de l'agent destinataire au round suivant.
   *
   * escalationType:
   *   'inter_agent'  — bloque cette tension, le run continue
   *   'human_input'  — suspend le run entier (QA → PM → client)
   */
  questionTo?: {
    toAgent: AgentRole;
    escalationType: "inter_agent" | "human_input";
    question: string;
    rationale?: string;
  };

  /**
   * Présent quand cette tension répond à une question reçue.
   * Permet à l'orchestrateur de marquer la question comme répondue.
   */
  answersQuestion?: {
    tensionId: string;   // id de la tension qui portait le questionTo
    fromAgent: AgentRole;
  };
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
  finish_reason: string;
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

// ═══════════════════════════════════════════════════════════════
// RUN STATE — géré par l'orchestrateur, persisté séparément
// ═══════════════════════════════════════════════════════════════

export type RunStatus =
  | "running"         // boucle interne active
  | "awaiting_human"  // QA a escaladé → PM attend input client → run suspendu
  | "completed"       // QA a approuvé
  | "failed";         // maxRounds atteint

/**
 * Question en attente entre deux agents.
 * Extraite par l'orchestrateur depuis les tensions_written,
 * persistée dans RunState pour survivre entre les rounds.
 */
export interface PendingQuestion {
  id: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  escalationType: "inter_agent" | "human_input";
  tensionId: string;    // tension qui porte le questionTo
  question: string;
  rationale?: string;
  round: number;
  answered: boolean;
}

/**
 * État de l'orchestrateur pour un run donné.
 * Vit en dehors du Field Onto — c'est de la meta-coordination,
 * pas de la connaissance épistémique.
 */
export interface RunState {
  projectId: string;
  round: number;
  status: RunStatus;
  pendingQuestions: PendingQuestion[];
  /** Présent quand status === 'awaiting_human' */
  clientClarification?: {
    requestedAt: number;
    questions: string[];
    answers?: Array<{ question: string; answer: string }>;
  };
  resolvedTensionIds: string[];   // pour la traçabilité inter-rounds
  createdAt: Date;
  updatedAt: Date;
}
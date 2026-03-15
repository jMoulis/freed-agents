/**
 * FREED AGENTS — Orchestrator
 *
 * N'essaie PAS de piloter les agents lui-même.
 * Expose des primitives que la route utilise pour :
 *   - Construire le contexte de round par agent (buildContextFor)
 *   - Tracker les question_to entre agents (processAgentOutputs)
 *   - Interpréter le verdict QA (interpretQAVerdict)
 *   - Gérer la clarification client (handleClientClarification)
 *   - Purger les tensions résolues entre rounds (purgeResolved)
 *
 * La route garde le stage ordering et la boucle de rounds.
 * L'orchestrateur gère uniquement l'état inter-rounds (RunState).
 */

import { runAgent, AgentConfig } from "@/core/agent-runner";
import { FieldSnapshot } from "@/core/onto-store";
import { RunContext } from "@/lib/context";
import {
  AgentRole,
  TensionInput,
  RunState,
  PendingQuestion,
} from "@/core/types";

// ═══════════════════════════════════════════════════════════════
// REGISTRY DES RESPONSABILITÉS
// ═══════════════════════════════════════════════════════════════

const AGENT_OWNS: Partial<Record<AgentRole, string[]>> = {
  pm: ["exigences produit", "user stories", "scope", "clarifications client"],
  cto: ["décisions techniques structurantes", "choix d'architecture globale"],
  lead_front: ["composants React", "routing client", "UX flows", "état UI"],
  lead_back: ["design API", "authentification", "intégrations tierces", "logique serveur"],
  data_architect: ["schémas de données", "relations", "index MongoDB", "migrations"],
  ai_architect: ["design des prompts", "sélection de modèle", "optimisation coût/latence"],
  ux_architect: ["design system", "accessibilité", "prototypes UX"],
  qa_lead: ["validation des solutions", "cohérence exigences/implémentation", "gate de round"],
};

// ═══════════════════════════════════════════════════════════════
// TYPES EXPORTÉS
// ═══════════════════════════════════════════════════════════════

export interface PMRequirements {
  userStories: string[];
  acceptanceCriteria: string[];
  scope: string;
}

export interface QAVerdict {
  status: "approved" | "rejected" | "escalate_to_pm";
  unresolvedTensionIds: string[];
  rejectionFeedback?: Record<string, string>;
  clientQuestions?: string[];
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// Construit le prompt de contexte injecté dans le system de chaque agent.
// Appelé par la route avant chaque runAgent().
// ═══════════════════════════════════════════════════════════════

export function buildContextFor(
  role: AgentRole,
  snapshot: FieldSnapshot,
  state: RunState,
  pmRequirements?: PMRequirements
): string {
  const lines: string[] = [];

  lines.push(`## ROLE: ${role.toUpperCase()} (round ${state.round})`);
  const owns = AGENT_OWNS[role];
  if (owns) lines.push(`OWNS: ${owns.join(" | ")}`);
  lines.push("");

  // Exigences PM — injectées uniquement dans QA
  if (role === "qa_lead" && pmRequirements) {
    lines.push("## EXIGENCES PM");
    lines.push(`SCOPE: ${pmRequirements.scope}`);
    lines.push(`USER STORIES: ${pmRequirements.userStories.join(" | ")}`);
    lines.push(`ACCEPTANCE: ${pmRequirements.acceptanceCriteria.join(" | ")}`);
    lines.push("");
  }

  // Routing hints — agents techniques uniquement comme destinations
  if (role !== "qa_lead") {
    lines.push("## ROUTING (pour tes questionTo)");
    for (const [r, domains] of Object.entries(AGENT_OWNS)) {
      if (r === role || r === "pm" || r === "qa_lead") continue;
      lines.push(`  ${r}: ${domains?.join(", ")}`);
    }
    lines.push("");
  }

  // Questions entrantes adressées à cet agent
  const incoming = state.pendingQuestions.filter(
    (q) => q.toAgent === role && !q.answered
  );
  if (incoming.length > 0) {
    lines.push("## QUESTIONS ENTRANTES (répondre en priorité)");
    for (const q of incoming) {
      lines.push(`  [${q.tensionId}] FROM: ${q.fromAgent}`);
      lines.push(`  QUESTION: ${q.question}`);
      if (q.rationale) lines.push(`  RATIONALE: ${q.rationale}`);
      lines.push(
        `  → Répondre via une tension avec answersQuestion: { tensionId: "${q.tensionId}", fromAgent: "${q.fromAgent}" }`
      );
      lines.push("");
    }
  }

  // Tensions actives filtrées pour cet agent uniquement
  const myTensions = snapshot.tensions.filter((t) => {
    if (t.state === "resolved") return false;
    if (t.id.startsWith(`${role}_`) || t.id.startsWith(role)) return true;
    if (incoming.some((q) => q.tensionId === t.id)) return true;
    return false;
  });

  if (myTensions.length > 0) {
    lines.push("## TENSIONS À TRAITER");
    for (const t of myTensions) {
      lines.push(`  [${t.id}] ${t.wants} — ${t.state} (confidence: ${t.confidence})`);
      if (t.doubts.length > 0) {
        lines.push(`  DOUBTS: ${t.doubts.map((d) => `${d.about}(${d.severity})`).join(", ")}`);
      }
      if (t.pendingOn?.length) {
        lines.push(`  PENDING ON: ${t.pendingOn.join(", ")}`);
      }
      lines.push("");
    }
  }

  // Snapshot global réduit
  const resolvedCount = snapshot.tensions.filter((t) => t.state === "resolved").length;
  const activeCount = snapshot.tensions.filter((t) => t.state !== "resolved").length;
  lines.push(`## FIELD (${resolvedCount} résolues, ${activeCount} actives)`);
  lines.push(`Global confidence: ${(snapshot.globalConfidence * 100).toFixed(0)}%`);
  if (snapshot.sharedKnowledge.length > 0) {
    lines.push("SHARED KNOWLEDGE:");
    for (const k of snapshot.sharedKnowledge) {
      lines.push(`  ${k.id}: ${JSON.stringify(k.value)} (conf: ${k.confidence})`);
    }
  }
  lines.push("");

  lines.push("## OUTPUT ATTENDU");
  if (role === "qa_lead") {
    lines.push(
      "Écrire une tension 'qa_verdict' avec value: { status, unresolvedTensionIds, rejectionFeedback?, clientQuestions? }"
    );
    lines.push('"approved" | "rejected" | "escalate_to_pm"');
    lines.push("escalate_to_pm uniquement si une tension NE PEUT PAS être résolue sans input client.");
  } else {
    lines.push("Pour chaque tension : résolution via update_field.");
    lines.push("Si bloqué : écrire questionTo: { toAgent, escalationType: 'inter_agent', question, rationale }");
    lines.push("Si tu réponds à une question : écrire answersQuestion: { tensionId, fromAgent }");
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// PROCESS AGENT OUTPUTS
// Extrait les question_to et answersQuestion des tensions écrites.
// Appelé par la route après chaque runAgent().
// ═══════════════════════════════════════════════════════════════

let idCounter = 0;
function generateId(): string {
  return `pq_${Date.now()}_${++idCounter}`;
}

export function processAgentOutputs(
  role: AgentRole,
  tensionsWritten: TensionInput[],
  state: RunState
): RunState {
  const newQuestions: PendingQuestion[] = [];
  const answeredIds: string[] = [];

  for (const t of tensionsWritten) {
    if (t.questionTo) {
      const alreadyPending = state.pendingQuestions.some(
        (q) => q.tensionId === t.id && q.toAgent === t.questionTo!.toAgent
      );
      if (!alreadyPending) {
        newQuestions.push({
          id: generateId(),
          fromAgent: role,
          toAgent: t.questionTo.toAgent,
          escalationType: t.questionTo.escalationType,
          tensionId: t.id,
          question: t.questionTo.question,
          rationale: t.questionTo.rationale,
          round: state.round,
          answered: false,
        });
        console.log(
          `  [${role}] → question_to ${t.questionTo.toAgent}: "${t.questionTo.question.slice(0, 60)}..."`
        );
      }
    }

    if (t.answersQuestion) {
      answeredIds.push(t.answersQuestion.tensionId);
      console.log(`  [${role}] → answered tension ${t.answersQuestion.tensionId}`);
    }
  }

  return {
    ...state,
    pendingQuestions: [
      ...state.pendingQuestions.map((q) =>
        answeredIds.includes(q.tensionId) ? { ...q, answered: true } : q
      ),
      ...newQuestions,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// INTERPRET QA VERDICT
// Extrait et applique le verdict QA depuis les tensions écrites.
// Appelé par la route après le run du QA Lead.
// ═══════════════════════════════════════════════════════════════

export function extractQAVerdict(tensionsWritten: TensionInput[]): QAVerdict | null {
  const t = tensionsWritten.find((t) => t.id === "qa_verdict");
  if (!t || typeof t.value !== "object") return null;
  return t.value as QAVerdict;
}

/**
 * Applique le verdict QA sur le RunState.
 * Ne touche pas au Field — le QA a déjà écrit son feedback via update_field.
 * TODO: appeler config.onRoundRejected quand ce callback sera ajouté.
 */
export function applyQAVerdict(
  verdict: QAVerdict,
  state: RunState,
  _config?: { onRoundRejected?: (verdict: QAVerdict, state: RunState) => void }
): RunState {
  switch (verdict.status) {
    case "approved":
      console.log("  QA: ✓ approved");
      return { ...state, status: "completed", updatedAt: new Date() };

    case "rejected":
      console.log(`  QA: ✗ rejected (${verdict.unresolvedTensionIds.length} tensions)`);
      // TODO: appeler _config?.onRoundRejected
      return { ...state, updatedAt: new Date() };

    case "escalate_to_pm":
      console.log(`  QA: ↑ escalate_to_pm (${verdict.clientQuestions?.length ?? 0} questions)`);
      return {
        ...state,
        status: "awaiting_human",
        clientClarification: {
          requestedAt: state.round,
          questions: verdict.clientQuestions ?? [],
        },
        updatedAt: new Date(),
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE CLIENT CLARIFICATION
// Appelé par la route quand state.status === "awaiting_human".
// Lance le PM avec les réponses client, retourne le nouveau RunState.
// ═══════════════════════════════════════════════════════════════

export async function handleClientClarification(
  state: RunState,
  answers: Array<{ question: string; answer: string }>,
  projectId: string,
  ctx: RunContext,
  pmConfig: AgentConfig,
): Promise<RunState> {
  const clarif = state.clientClarification!;

  const pmContext = buildPMClarificationContext(state, answers);
  const pmResult = await runAgent(
    { ...pmConfig, system: `${pmConfig.system}\n\n---\n${pmContext}` },
    projectId,
    ctx,
    "Intègre les clarifications client et crée les tensions nécessaires via update_field."
  );

  let newState = processAgentOutputs("pm", pmResult.tensions_written, state);

  return {
    ...newState,
    status: "running",
    clientClarification: { ...clarif, answers },
    round: state.round + 1,
    updatedAt: new Date(),
  };
}

// ═══════════════════════════════════════════════════════════════
// PURGE RESOLVED
// À appeler après le gate QA, avant le round suivant.
// ═══════════════════════════════════════════════════════════════

export function purgeResolved(state: RunState, snapshot: FieldSnapshot): RunState {
  const newResolved = snapshot.tensions
    .filter((t) => t.state === "resolved" && !state.resolvedTensionIds.includes(t.id))
    .map((t) => t.id);
  return {
    ...state,
    resolvedTensionIds: [...state.resolvedTensionIds, ...newResolved],
  };
}

// ═══════════════════════════════════════════════════════════════
// DETECT CYCLES
// ═══════════════════════════════════════════════════════════════

export function detectCycles(
  state: RunState,
  onCycle?: (from: AgentRole, to: AgentRole) => void
): void {
  const pending = state.pendingQuestions.filter((q) => !q.answered);
  for (const q of pending) {
    const reverse = pending.find(
      (other) =>
        other.fromAgent === q.toAgent &&
        other.toAgent === q.fromAgent &&
        other.id !== q.id
    );
    if (reverse) {
      onCycle?.(q.fromAgent, q.toAgent);
      console.warn(`  CYCLE: ${q.fromAgent} ↔ ${q.toAgent}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// INITIAL STATE FACTORY
// ═══════════════════════════════════════════════════════════════

export function createRunState(projectId: string, initial?: Partial<RunState>): RunState {
  return {
    projectId,
    round: 0,
    status: "running",
    pendingQuestions: [],
    resolvedTensionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...initial,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS PRIVÉS
// ═══════════════════════════════════════════════════════════════

function buildPMClarificationContext(
  state: RunState,
  answers: Array<{ question: string; answer: string }>
): string {
  const lines: string[] = [];
  lines.push(`## ROLE: PM (mode clarification client — round ${state.round})`);
  lines.push("");
  lines.push("## CLARIFICATIONS CLIENT REÇUES");
  for (const qa of answers) {
    lines.push(`Q: ${qa.question}`);
    lines.push(`A: ${qa.answer}`);
    lines.push("");
  }
  lines.push("## OUTPUT ATTENDU");
  lines.push("Créer des tensions pour intégrer ces clarifications via update_field.");
  lines.push("Nommer les tensions avec le préfixe 'pm_clarif_'.");
  return lines.join("\n");
}
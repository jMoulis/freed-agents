/**
 * FREED AGENTS — Orchestrator
 *
 * Gère les deux cycles de run :
 *   INTERNE  — agents techniques || → QA gate → round suivant
 *   EXTERNE  — QA escalate → PM → client → PM → reprise
 *
 * Branchement sur l'existant :
 *   - runAgent()    pour exécuter chaque agent LLM
 *   - IOntoStore    pour lire/écrire le Field
 *   - TensionInput  avec questionTo/answersQuestion (ajouts minimaux)
 *
 * Ce fichier ne touche pas à onto-engine.ts, onto-store.ts, agent-runner.ts.
 */

import { runAgent, AgentConfig } from "@/core/agent-runner";
import { IOntoStore, FieldSnapshot } from "@/core/onto-store";
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

const TECHNICAL_ROLES: AgentRole[] = [
  "lead_front",
  "lead_back",
  "data_architect",
  "ai_architect",
  "ux_architect",
];

// ═══════════════════════════════════════════════════════════════
// QA VERDICT
// ═══════════════════════════════════════════════════════════════

interface QAVerdict {
  status: "approved" | "rejected" | "escalate_to_pm";
  unresolvedTensionIds: string[];
  rejectionFeedback?: Record<string, string>;
  clientQuestions?: string[];
}

// ═══════════════════════════════════════════════════════════════
// PM REQUIREMENTS
// ═══════════════════════════════════════════════════════════════

export interface PMRequirements {
  userStories: string[];
  acceptanceCriteria: string[];
  scope: string;
}

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATOR CONFIG
// ═══════════════════════════════════════════════════════════════

export interface OrchestratorConfig {
  maxRounds: number;
  skipIdleAgents: boolean;
  agentConfigs: Partial<Record<AgentRole, AgentConfig>>;
  pmConfig: AgentConfig;
  qaConfig: AgentConfig;
  /**
   * Appelé quand QA escalate vers le client.
   * Le caller implémente la collecte (UI, webhook, email...).
   */
  onAwaitingClient: (
    questions: string[],
    state: RunState
  ) => Promise<Array<{ question: string; answer: string }>>;
  onRoundComplete?: (round: number, state: RunState, snapshot: FieldSnapshot) => void;
  onCycleDetected?: (from: AgentRole, to: AgentRole) => void;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// Construit le prompt de contexte par agent depuis le FieldSnapshot.
// Remplace l'injection naïve du Field complet.
// ═══════════════════════════════════════════════════════════════

function buildContextFor(
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
      if (t.pendingOn && t.pendingOn.length > 0) {
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
    lines.push(
      "Si bloqué : écrire questionTo: { toAgent, escalationType: 'inter_agent', question, rationale }"
    );
    lines.push(
      "Si tu réponds à une question : écrire answersQuestion: { tensionId, fromAgent }"
    );
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATOR RUNNER
// ═══════════════════════════════════════════════════════════════

export class OrchestratorRunner {
  private idCounter = 0;

  private generateId(): string {
    return `pq_${Date.now()}_${++this.idCounter}`;
  }

  async run(
    projectId: string,
    store: IOntoStore,
    ctx: RunContext,
    config: OrchestratorConfig,
    pmRequirements: PMRequirements,
    initialState?: Partial<RunState>
  ): Promise<RunState> {
    let state: RunState = {
      projectId,
      round: 0,
      status: "running",
      pendingQuestions: [],
      resolvedTensionIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...initialState,
    };

    for (let i = 0; i < config.maxRounds; i++) {
      console.log(`\n========== ROUND ${state.round} | ${state.status} ==========`);

      // ── Boucle EXTERNE ──────────────────────────────────────────
      if (state.status === "awaiting_human") {
        state = await this.handleClientClarification(state, projectId, store, ctx, config);
        continue;
      }

      if (state.status === "completed" || state.status === "failed") break;

      // ── Boucle INTERNE ──────────────────────────────────────────
      const snapshot = await store.snapshot(projectId);

      if (!this.hasWork(snapshot, state)) {
        console.log("  Aucune tension active — run completed.");
        state.status = "completed";
        break;
      }

      this.detectAndReportCycles(state, config);

      // Agents techniques en parallèle
      const activeRoles = config.skipIdleAgents
        ? this.filterActive(TECHNICAL_ROLES, snapshot, state)
        : TECHNICAL_ROLES.filter((r) => config.agentConfigs[r]);

      console.log(`  Agents actifs: ${activeRoles.join(", ")}`);

      const technicalResults = await Promise.all(
        activeRoles.map((role) => {
          const agentConfig = config.agentConfigs[role]!;
          const contextPrompt = buildContextFor(role, snapshot, state);
          return runAgent(
            { ...agentConfig, system: `${agentConfig.system}\n\n---\n${contextPrompt}` },
            projectId,
            ctx,
            this.buildUserMessage(role, state)
          );
        })
      );

      for (const result of technicalResults) {
        state = this.processAgentOutput(result.role, result.tensions_written, state);
      }

      // QA gate — séquentiel, après tous les agents techniques
      const qaSnapshot = await store.snapshot(projectId);
      const qaContext = buildContextFor("qa_lead", qaSnapshot, state, pmRequirements);
      const qaResult = await runAgent(
        { ...config.qaConfig, system: `${config.qaConfig.system}\n\n---\n${qaContext}` },
        projectId,
        ctx,
        this.buildUserMessage("qa_lead", state)
      );

      state = this.processAgentOutput("qa_lead", qaResult.tensions_written, state);

      const verdict = this.extractQAVerdict(qaResult.tensions_written);
      if (verdict) {
        state = this.applyQAVerdict(verdict, state, config);
      }

      if (state.status === "completed" || state.status === "awaiting_human") {
        config.onRoundComplete?.(state.round, state, qaSnapshot);
        continue;
      }

      state = this.purgeResolved(state, qaSnapshot);
      state = { ...state, round: state.round + 1, updatedAt: new Date() };

      config.onRoundComplete?.(state.round - 1, state, qaSnapshot);
      console.log(
        `  Purge: ${state.resolvedTensionIds.length} résolues | ${state.pendingQuestions.filter((q) => !q.answered).length} questions en attente`
      );
    }

    if (state.status === "running") {
      state.status = "failed";
      console.warn(`Run ${projectId} — maxRounds atteint sans convergence.`);
    }

    return state;
  }

  // ─── Traitement des tensions écrites par un agent ────────────

  private processAgentOutput(
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
            id: this.generateId(),
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

  // ─── QA Verdict ──────────────────────────────────────────────

  private extractQAVerdict(tensionsWritten: TensionInput[]): QAVerdict | null {
    const t = tensionsWritten.find((t) => t.id === "qa_verdict");
    if (!t || typeof t.value !== "object") return null;
    return t.value as QAVerdict;
  }

  // Le QA a déjà écrit dans le Field via runAgent/update_field.
  // onAwaitingClient est géré dans handleClientClarification.
  // TODO: utiliser config.onRoundRejected(verdict, state) quand ce callback sera ajouté à OrchestratorConfig.
  private applyQAVerdict(
    verdict: QAVerdict,
    state: RunState,
    _config: OrchestratorConfig
  ): RunState {
    switch (verdict.status) {
      case "approved":
        console.log("  QA: ✓ approved");
        return { ...state, status: "completed", updatedAt: new Date() };

      case "rejected":
        console.log(`  QA: ✗ rejected (${verdict.unresolvedTensionIds.length} tensions)`);
        // Feedback déjà écrit dans le Field par le QA via update_field
        // TODO: appeler config.onRoundRejected ici
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

  // ─── Boucle externe — clarification client ───────────────────

  private async handleClientClarification(
    state: RunState,
    projectId: string,
    store: IOntoStore,
    ctx: RunContext,
    config: OrchestratorConfig
  ): Promise<RunState> {
    const clarif = state.clientClarification!;
    console.log(`  Run suspendu — ${clarif.questions.length} questions client.`);

    const answers = await config.onAwaitingClient(clarif.questions, state);

    const pmContext = this.buildPMClarificationContext(state, answers);
    const pmResult = await runAgent(
      { ...config.pmConfig, system: `${config.pmConfig.system}\n\n---\n${pmContext}` },
      projectId,
      ctx,
      "Intègre les clarifications client et crée les tensions nécessaires via update_field."
    );

    state = this.processAgentOutput("pm", pmResult.tensions_written, state);

    return {
      ...state,
      status: "running",
      clientClarification: { ...clarif, answers },
      round: state.round + 1,
      updatedAt: new Date(),
    };
  }

  private buildPMClarificationContext(
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

  // ─── Helpers ─────────────────────────────────────────────────

  // snapshot supprimé — le corps n'en a pas besoin
  private buildUserMessage(role: AgentRole, state: RunState): string {
    const pendingCount = state.pendingQuestions.filter(
      (q) => q.toAgent === role && !q.answered
    ).length;
    if (pendingCount > 0) {
      return `Round ${state.round}. Tu as ${pendingCount} question(s) entrante(s) — réponds-y en priorité via update_field.`;
    }
    return `Round ${state.round}. Lis le Field, traite tes tensions et écris tes décisions via update_field.`;
  }

  private hasWork(snapshot: FieldSnapshot, state: RunState): boolean {
    return (
      snapshot.tensions.some((t) => t.state !== "resolved") ||
      state.pendingQuestions.some((q) => !q.answered)
    );
  }

  private filterActive(
    roles: AgentRole[],
    snapshot: FieldSnapshot,
    state: RunState
  ): AgentRole[] {
    return roles.filter((role) => {
      const hasOwnedTensions = snapshot.tensions.some(
        (t) => t.state !== "resolved" && t.id.startsWith(role)
      );
      const hasIncoming = state.pendingQuestions.some(
        (q) => q.toAgent === role && !q.answered
      );
      return hasOwnedTensions || hasIncoming;
    });
  }

  private purgeResolved(state: RunState, snapshot: FieldSnapshot): RunState {
    const newResolved = snapshot.tensions
      .filter((t) => t.state === "resolved" && !state.resolvedTensionIds.includes(t.id))
      .map((t) => t.id);
    return {
      ...state,
      resolvedTensionIds: [...state.resolvedTensionIds, ...newResolved],
    };
  }

  private detectAndReportCycles(state: RunState, config: OrchestratorConfig): void {
    const pending = state.pendingQuestions.filter((q) => !q.answered);
    for (const q of pending) {
      const reverse = pending.find(
        (other) =>
          other.fromAgent === q.toAgent &&
          other.toAgent === q.fromAgent &&
          other.id !== q.id
      );
      if (reverse) {
        config.onCycleDetected?.(q.fromAgent, q.toAgent);
        console.warn(`  CYCLE: ${q.fromAgent} ↔ ${q.toAgent}`);
      }
    }
  }
}
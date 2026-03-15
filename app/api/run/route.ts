/**
 * POST /api/run
 *
 * Freed Agents specialist pipeline — multi-round.
 * ONLY place authorized to read process.env.
 *
 * Pipeline :
 *   PM (via /api/discovery)
 *   → Round N :
 *       Stage 1 : Data Architect
 *       Stage 2 : Lead Back + UX Architect (parallel)
 *       Stage 3 : Lead Front
 *       Stage 4 : AI Architect (if recruited)
 *       → QA gate
 *           approved        → terminé
 *           rejected        → round suivant avec feedback
 *           escalate_to_pm  → clarification_needed renvoyé au frontend
 *
 * Body: { projectId: string, brief?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createContext } from "@/lib/context";
import { runAgent, AgentConfig } from "@/core/agent-runner";
import { generateReport } from "@/lib/reporter";
import { deriveMetrics } from "@/lib/agent-metrics";
import { computeScore, ScoreBreakdown } from "@/lib/scoring";
import type { FieldSnapshot } from "@/core/onto-store";
import {
  qaLeadAgentConfig,
  buildQaLeadMessage,
  AuditReport,
} from "@/agents/qa-lead";
import { leadFrontAgentConfig, buildLeadFrontMessage } from "@/agents/lead-front";
import { leadBackAgentConfig, buildLeadBackMessage } from "@/agents/lead-back";
import { dataArchitectAgentConfig, buildDataArchitectMessage } from "@/agents/data-architect";
import { aiArchitectAgentConfig, buildAiArchitectMessage } from "@/agents/ai-architect";
import { uxArchitectAgentConfig, buildUxArchitectMessage } from "@/agents/ux-architect";
import type { RecruitableAgentType } from "@/lib/agent-db";
import { NoObjectGeneratedError } from "ai";
import { writeRunLog } from "@/lib/run-logger";

import {
  buildContextFor,
  processAgentOutputs,
  extractQAVerdict,
  applyQAVerdict,
  purgeResolved,
  detectCycles,
  createRunState,
  PMRequirements,
} from "@/agents/orchestrator";
import { AgentRole } from "@/core/types";

// ═══════════════════════════════════════════════════════════════
// SPECIALIST REGISTRY
// ═══════════════════════════════════════════════════════════════

const SPECIALIST_CONFIGS: Record<
  RecruitableAgentType,
  { config: AgentConfig; buildMessage: (projectId: string) => string }
> = {
  lead_front: { config: leadFrontAgentConfig, buildMessage: buildLeadFrontMessage },
  lead_back: { config: leadBackAgentConfig, buildMessage: buildLeadBackMessage },
  data_architect: { config: dataArchitectAgentConfig, buildMessage: buildDataArchitectMessage },
  ux_architect: { config: uxArchitectAgentConfig, buildMessage: buildUxArchitectMessage },
  ai_architect: { config: aiArchitectAgentConfig, buildMessage: buildAiArchitectMessage },
};

const DEFAULT_SPECIALISTS: RecruitableAgentType[] = [
  "lead_front", "lead_back", "data_architect", "ux_architect",
];

const STAGE_ORDER: RecruitableAgentType[][] = [
  ["data_architect"],
  ["lead_back", "ux_architect"],
  ["lead_front"],
  ["ai_architect"],
];

const MAX_ROUNDS = 3;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type SpecialistResult = {
  agentType: RecruitableAgentType;
  result: Awaited<ReturnType<typeof runAgent>>;
  score: ScoreBreakdown;
};

// ═══════════════════════════════════════════════════════════════
// SPECIALIST RUNNER
// Inchangé — même logique qu'avant + roundContext optionnel.
// ═══════════════════════════════════════════════════════════════

async function runSpecialist(
  agentType: RecruitableAgentType,
  snapshotBefore: FieldSnapshot,
  ctx: ReturnType<typeof createContext>,
  projectId: string,
  roundContext?: string,
): Promise<SpecialistResult> {
  const { config: baseConfig, buildMessage } = SPECIALIST_CONFIGS[agentType];

  const resolvedModel = ctx.agentDb
    ? await ctx.agentDb.resolveModel(agentType)
    : baseConfig.model;
  const behaviorContext = ctx.agentDb
    ? await ctx.agentDb.buildBehavioralContext(agentType)
    : null;

  const config: AgentConfig = {
    ...baseConfig,
    model: resolvedModel,
    system: [baseConfig.system, behaviorContext ?? "", roundContext ?? ""]
      .filter(Boolean)
      .join("\n\n---\n"),
  };

  const result = await runAgent(config, projectId, ctx, buildMessage(projectId));
  const snapshotAfter = await ctx.store.snapshot(projectId);
  const score = computeScore(
    deriveMetrics(
      snapshotBefore,
      snapshotAfter,
      result.usage.outputTokens,
      result.finish_reason,
      result.duration_ms,
    ),
  );

  if (ctx.agentDb) {
    await ctx.agentDb.updateAgentStats(agentType, score, config.model.modelId, result.usage.outputTokens, result.finish_reason);
    await ctx.agentDb.checkFiringCriteria(agentType);
    await ctx.agentDb.releaseAgent(projectId, agentType);
  }

  console.info(`End ${agentType} — score: ${score.score.toFixed(3)}`);
  return { agentType, result, score };
}

// ═══════════════════════════════════════════════════════════════
// ROUTE
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, projectId: existingId, sandbox } = body as {
      brief?: string;
      projectId?: string;
      sandbox?: boolean;
    };

    const ctx = createContext({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
      xaiApiKey: process.env.XAI_API_KEY,
      mongoUri: process.env.MONGODB_URI,
      storeMode: (process.env.FIELD_STORE as "memory" | "mongo") ?? "memory",
      searchApiKey: process.env.BRAVE_SEARCH_API_KEY,
    });

    const projectId = existingId ?? `proj-${nanoid(8)}`;
    if (!existingId) {
      if (!brief?.trim()) {
        return NextResponse.json(
          { error: "brief is required when projectId is not provided" },
          { status: 400 },
        );
      }
      await ctx.store.create(projectId, brief.trim());
    }

    // ── Determine specialists ──────────────────────────────────
    let specialistsToRun: RecruitableAgentType[] = [];
    if (ctx.agentDb) {
      const assignments = await ctx.agentDb.getProjectAssignments(projectId);
      specialistsToRun = assignments.map((a) => a.agentType) as RecruitableAgentType[];
    }
    if (specialistsToRun.length === 0 && !sandbox) {
      specialistsToRun = DEFAULT_SPECIALISTS;
      console.warn("[/api/run] No DB assignments — running default:", specialistsToRun);
    }
    specialistsToRun = specialistsToRun.filter((t) => t in SPECIALIST_CONFIGS);

    // ── Build ordered stages ───────────────────────────────────
    const staged = new Set(STAGE_ORDER.flat());
    const unordered = specialistsToRun.filter((t) => !staged.has(t));
    const orderedStages: RecruitableAgentType[][] = [
      ...(unordered.length > 0 ? [unordered] : []),
      ...STAGE_ORDER.map((s) => s.filter((t) => specialistsToRun.includes(t))).filter((s) => s.length > 0),
    ];

    // ── PM Requirements depuis le Field discovery ──────────────
    const initialSnapshot = await ctx.store.snapshot(projectId);
    const pmRequirements = buildPMRequirements(initialSnapshot);

    // ── Boucle multi-round ─────────────────────────────────────
    let runState = createRunState(projectId);
    const allSpecialistResults: SpecialistResult[] = [];
    let finalQaResult: Awaited<ReturnType<typeof runAgent<AuditReport>>> | null = null;
    let finalQaScore: ScoreBreakdown | null = null;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      runState = { ...runState, round };
      console.info(`\n========== ROUND ${round} ==========`);

      if (runState.status === "completed" || runState.status === "failed") break;

      // Cycles avant d'exécuter
      detectCycles(runState, (from: AgentRole, to: AgentRole) =>
        console.warn(`[/api/run] Cycle: ${from} ↔ ${to}`)
      );

      // ── Stages séquentiels ─────────────────────────────────
      for (const stage of orderedStages) {
        const snapshotBefore = await ctx.store.snapshot(projectId);
        console.info(`Stage [${stage.join(" + ")}]`);

        const stageResults = await Promise.all(
          stage.map(async (agentType) => {
            try {
              // Contexte de round injecté — remplace l'injection naïve du Field complet
              const roundContext = buildContextFor(agentType, snapshotBefore, runState);
              return await runSpecialist(agentType, snapshotBefore, ctx, projectId, roundContext);
            } catch (error: any) {
              writeRunLog(agentType, projectId, "agent_error", {
                message: error.message,
                ...(NoObjectGeneratedError.isInstance(error) && {
                  text: error.text,
                  finishReason: error.finishReason,
                  cause: String(error.cause),
                  usage: error.usage,
                  response: error.response,
                }),
              });
              throw new Error(`[${agentType}]: ${error.message}`);
            }
          })
        );

        // Accumuler uniquement les résultats du dernier round pour le rapport
        if (round === 0) {
          allSpecialistResults.push(...stageResults);
        } else {
          // Rounds suivants — remplacer les résultats existants
          for (const r of stageResults) {
            const idx = allSpecialistResults.findIndex((x) => x.agentType === r.agentType);
            if (idx >= 0) allSpecialistResults[idx] = r;
            else allSpecialistResults.push(r);
          }
        }

        // Tracker les question_to produits par ce stage
        for (const { agentType, result } of stageResults) {
          runState = processAgentOutputs(agentType, result.tensions_written, runState);
        }
      }

      // ── QA gate ───────────────────────────────────────────
      const TRACE_MAX_CHARS = 1500;
      const reasoningTraces = allSpecialistResults
        .filter((r) => r.result.reasoning_raw)
        .map((r) => {
          const raw = r.result.reasoning_raw!;
          return `### ${r.agentType}\n${raw.length > TRACE_MAX_CHARS ? raw.slice(0, TRACE_MAX_CHARS) + "\n… [truncated]" : raw}`;
        })
        .join("\n\n---\n\n");

      try {
        const snapshotBeforeQa = await ctx.store.snapshot(projectId);
        const qaRoundContext = buildContextFor("qa_lead", snapshotBeforeQa, runState, pmRequirements);

        console.info(`Start QA Lead (round ${round})`);
        const qaRes = await runAgent<AuditReport>(
          {
            ...qaLeadAgentConfig,
            system: `${qaLeadAgentConfig.system}\n\n---\n${qaRoundContext}`,
          },
          projectId,
          ctx,
          buildQaLeadMessage(projectId),
        );

        const snapshotAfterQa = await ctx.store.snapshot(projectId);
        const qaScore = computeScore(
          deriveMetrics(
            snapshotBeforeQa,
            snapshotAfterQa,
            qaRes.usage.outputTokens,
            qaRes.finish_reason,
            qaRes.duration_ms,
          ),
        );
        console.info(`End QA Lead — score: ${qaScore.score.toFixed(3)}`);

        finalQaResult = qaRes;
        finalQaScore = qaScore;

        // Tracker les tensions QA
        runState = processAgentOutputs("qa_lead", qaRes.tensions_written, runState);

        // Interpréter le verdict
        const verdict = extractQAVerdict(qaRes.tensions_written);
        if (verdict) {
          runState = applyQAVerdict(verdict, runState);
        }

      } catch (err: any) {
        writeRunLog("qa_lead", projectId, "agent_error", {
          message: err.message,
          ...(NoObjectGeneratedError.isInstance(err) && {
            text: err.text,
            finishReason: err.finishReason,
            cause: String(err.cause),
            usage: err.usage,
          }),
        });
        throw new Error(`QA Lead agent failed: ${err.message ?? err}`);
      }

      // Purge + décision de continuation
      runState = purgeResolved(runState, await ctx.store.snapshot(projectId));

      if (runState.status === "completed") {
        console.info(`[/api/run] Run completed at round ${round}`);
        break;
      }

      if (runState.status === "awaiting_human") {
        console.info(`[/api/run] Run suspended — awaiting client clarification`);
        break;
      }

      // rejected → round suivant
      console.info(`[/api/run] Round ${round} rejected — starting round ${round + 1}`);
    }

    if (!finalQaResult || !finalQaScore) {
      throw new Error("QA Lead did not produce a result");
    }

    // ── Clarification check (compat legacy AuditReport) ────────
    const qaOutput = finalQaResult.output as AuditReport | null;
    const criticalQuestions =
      qaOutput?.discovery_questions?.filter((q) => q.priority === "critical") ?? [];
    const clarificationNeeded =
      qaOutput &&
        (qaOutput.verdict === "red" || (qaOutput.verdict === "yellow" && criticalQuestions.length > 0))
        ? { verdict: qaOutput.verdict, questions: criticalQuestions }
        : null;

    // Escalation via nouveau mécanisme question_to
    const clientEscalation =
      runState.status === "awaiting_human" && runState.clientClarification
        ? { questions: runState.clientClarification.questions }
        : null;

    // ── Final snapshot + report ────────────────────────────────
    const snapshot = await ctx.store.snapshot(projectId);
    const specialistScores = Object.fromEntries(
      allSpecialistResults.map(({ agentType, score }) => [agentType, score])
    );
    const specialistOutputs = Object.fromEntries(
      allSpecialistResults.map(({ agentType, result }) => [
        agentType,
        { blueprint: result.output, duration_ms: result.duration_ms, usage: result.usage },
      ])
    );
    const reportPipeline = {
      ...specialistOutputs,
      qa: { audit: finalQaResult.output, duration_ms: finalQaResult.duration_ms, usage: finalQaResult.usage },
    };
    const reportInternal = generateReport({ projectId, snapshot, pipeline: reportPipeline, mode: "internal" });
    const reportClient = generateReport({ projectId, snapshot, pipeline: reportPipeline, mode: "client" });
    const specialistDurationMs = allSpecialistResults.reduce((s, { result }) => s + result.duration_ms, 0);

    // ── Persist ────────────────────────────────────────────────
    if (ctx.agentDb) {
      await ctx.agentDb
        .saveRunResult(projectId, {
          specialists: Object.fromEntries(
            allSpecialistResults.map(({ agentType, result }) => [
              agentType,
              { blueprint: result.output, tensions_written: result.tensions_written.length, usage: result.usage, duration_ms: result.duration_ms },
            ]),
          ),
          qa: { audit: finalQaResult.output, tensions_written: finalQaResult.tensions_written.length, usage: finalQaResult.usage, duration_ms: finalQaResult.duration_ms },
          scores: { ...specialistScores, qa: finalQaScore },
          report: { internal: reportInternal, client: reportClient },
          ...((clarificationNeeded || clientEscalation) && {
            clarification_needed: clarificationNeeded ?? clientEscalation,
          }),
          total_duration_ms: specialistDurationMs + finalQaResult.duration_ms,
          rounds: runState.round + 1,
        })
        .catch((err) => console.warn("[/api/run] saveRunResult failed:", err));
    }

    return NextResponse.json({
      projectId,
      specialists: Object.fromEntries(
        allSpecialistResults.map(({ agentType, result }) => [
          agentType,
          { blueprint: result.output, tensions_written: result.tensions_written.length, usage: result.usage, duration_ms: result.duration_ms },
        ]),
      ),
      qa: {
        audit: finalQaResult.output,
        tensions_written: finalQaResult.tensions_written.length,
        usage: finalQaResult.usage,
        duration_ms: finalQaResult.duration_ms,
        reasoning_raw: finalQaResult.reasoning_raw,
      },
      field: {
        globalConfidence: snapshot.globalConfidence,
        summary: snapshot.summary,
        tensions: snapshot.tensions,
      },
      scores: { ...specialistScores, qa: finalQaScore },
      report: { internal: reportInternal, client: reportClient },
      ...((clarificationNeeded || clientEscalation) && {
        clarification_needed: clarificationNeeded ?? clientEscalation,
      }),
      total_duration_ms: specialistDurationMs + finalQaResult.duration_ms,
      rounds: runState.round + 1,
    });
  } catch (error: any) {
    console.error("[/api/run]", error);
    writeRunLog("pipeline", "unknown", "pipeline_error", { message: error.message });
    return NextResponse.json({ error: error.message ?? "Internal server error" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// PM REQUIREMENTS BUILDER
// ═══════════════════════════════════════════════════════════════

function buildPMRequirements(snapshot: FieldSnapshot): PMRequirements {
  const pmTensions = snapshot.tensions.filter((t) => t.id.startsWith("pm_"));

  const userStories = pmTensions
    .filter((t) => t.id.includes("users") || t.id.includes("journey") || t.id.includes("persona"))
    .map((t) => `${t.wants}: ${String(t.value ?? "")}`)
    .filter(Boolean);

  const acceptanceCriteria = pmTensions
    .filter((t) => t.id.includes("success") || t.id.includes("criteria") || t.id.includes("kpi"))
    .map((t) => String(t.value ?? ""))
    .filter(Boolean);

  const scopeTension = pmTensions.find(
    (t) => t.id.includes("scope") || t.id.includes("priorities") || t.id.includes("mvp")
  );

  return {
    userStories: userStories.length > 0 ? userStories : ["Voir tensions PM dans le Field"],
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : ["Voir tensions PM dans le Field"],
    scope: scopeTension ? String(scopeTension.value ?? scopeTension.wants) : snapshot.summary,
  };
}
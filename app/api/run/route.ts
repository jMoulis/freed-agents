/**
 * POST /api/run
 *
 * Point d'entrée unique de la société Freed Agents.
 * SEUL endroit autorisé à lire process.env.
 * Crée le RunContext et le passe aux agents — zéro secret en dehors d'ici.
 *
 * Pipeline:
 *   Discovery → CEO → CTO → [Lead Front + Lead Back + Data Architect + AI Architect?] → QA → Report
 *   Specialist agents are recruited by the CTO via recruit_agent tool and run in parallel.
 *
 * Body: { brief: string, projectId?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createContext } from "@/lib/context";
import { runAgent } from "@/core/agent-runner";
import { generateReport } from "@/lib/reporter";
import { deriveMetrics } from "@/lib/agent-metrics";
import { computeScore, ScoreBreakdown } from "@/lib/scoring";
import { ceoAgentConfig, buildCeoMessage, ProjectMandate } from "@/agents/ceo";
import { buildCtoConfig, buildCtoMessage, StackProposal } from "@/agents/cto";
import {
  qaLeadAgentConfig,
  buildQaLeadMessage,
  AuditReport,
} from "@/agents/qa-lead";
import {
  leadFrontAgentConfig,
  buildLeadFrontMessage,
} from "@/agents/lead-front";
import { leadBackAgentConfig, buildLeadBackMessage } from "@/agents/lead-back";
import {
  dataArchitectAgentConfig,
  buildDataArchitectMessage,
} from "@/agents/data-architect";
import {
  aiArchitectAgentConfig,
  buildAiArchitectMessage,
} from "@/agents/ai-architect";
import type { RecruitableAgentType } from "@/lib/agent-db";
import type { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// SPECIALIST REGISTRY — config + message builder per recruitable type
// ═══════════════════════════════════════════════════════════════

const SPECIALIST_CONFIGS: Record<
  RecruitableAgentType,
  { config: AgentConfig; buildMessage: (projectId: string) => string }
> = {
  lead_front: {
    config: leadFrontAgentConfig,
    buildMessage: buildLeadFrontMessage,
  },
  lead_back: {
    config: leadBackAgentConfig,
    buildMessage: buildLeadBackMessage,
  },
  data_architect: {
    config: dataArchitectAgentConfig,
    buildMessage: buildDataArchitectMessage,
  },
  ai_architect: {
    config: aiArchitectAgentConfig,
    buildMessage: buildAiArchitectMessage,
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, projectId: existingId } = body as {
      brief: string;
      projectId?: string;
    };

    if (!brief?.trim()) {
      return NextResponse.json({ error: "brief is required" }, { status: 400 });
    }

    // ── Seul endroit où process.env est lu ─────────────────────
    const ctx = createContext({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
      xaiApiKey: process.env.XAI_API_KEY,
      mongoUri: process.env.MONGODB_URI,
      storeMode: (process.env.FIELD_STORE as "memory" | "mongo") ?? "memory",
    });

    // ── Initialise le projet ───────────────────────────────────
    const projectId = existingId ?? `proj-${nanoid(8)}`;
    if (!existingId) {
      await ctx.store.create(projectId, brief.trim());
    }

    // ── Lance le CEO (agent fixe) ──────────────────────────────
    console.info("Start CEO");
    const snapshotBeforeCeo = await ctx.store.snapshot(projectId);
    const ceoResult = await runAgent<ProjectMandate>(
      ceoAgentConfig,
      projectId,
      ctx,
      buildCeoMessage(brief),
    );
    const snapshotAfterCeo = await ctx.store.snapshot(projectId);
    const ceoScore = computeScore(
      deriveMetrics(
        snapshotBeforeCeo,
        snapshotAfterCeo,
        ceoResult.usage.outputTokens,
        ceoResult.finish_reason,
        ceoResult.duration_ms,
      ),
    );
    console.info("End CEO — score:", ceoScore.score.toFixed(3), ceoScore);

    // ── Lance le CTO (agent fixe + recruit_agent tool) ─────────
    let ctoResult: Awaited<ReturnType<typeof runAgent<StackProposal>>>;
    let ctoScoreResult: ScoreBreakdown;
    const recruitedTypes: RecruitableAgentType[] = [];

    try {
      console.info("Start CTO");
      const ctoConfig = buildCtoConfig(async (agentType, reason) => {
        if (!recruitedTypes.includes(agentType)) {
          recruitedTypes.push(agentType);
        }
        await ctx.agentDb?.assignAgent(projectId, agentType, reason);
      });

      const snapshotBeforeCto = await ctx.store.snapshot(projectId);
      ctoResult = await runAgent<StackProposal>(
        ctoConfig,
        projectId,
        ctx,
        buildCtoMessage(projectId),
      );
      const snapshotAfterCto = await ctx.store.snapshot(projectId);
      const ctoScore = computeScore(
        deriveMetrics(
          snapshotBeforeCto,
          snapshotAfterCto,
          ctoResult.usage.outputTokens,
          ctoResult.finish_reason,
          ctoResult.duration_ms,
        ),
      );
      console.info("End CTO — score:", ctoScore.score.toFixed(3), ctoScore);
      ctoScoreResult = ctoScore;
    } catch (err: any) {
      throw new Error(`CTO agent failed: ${err.message ?? err}`);
    }

    // ── Détermine quels spécialistes lancer ────────────────────
    // Si agentDb disponible, les assignments sont en DB — sinon on utilise recruitedTypes
    // ou on tombe back sur tous les non-AI specialists par défaut
    let specialistsToRun: RecruitableAgentType[] = recruitedTypes;
    if (specialistsToRun.length === 0) {
      // CTO n'a pas appelé recruit_agent (pas de DB ou outil ignoré) — fallback
      specialistsToRun = ["lead_front", "lead_back", "data_architect"];
      console.warn(
        "CTO did not recruit any specialists — running default set:",
        specialistsToRun,
      );
    }

    // ── Lance les spécialistes en parallèle ────────────────────
    // Single "global before" snapshot to avoid score race between parallel agents
    const snapshotBeforeSpecialists = await ctx.store.snapshot(projectId);

    type SpecialistResult = {
      agentType: RecruitableAgentType;
      result: Awaited<ReturnType<typeof runAgent>>;
      score: ScoreBreakdown;
    };

    const specialistResults: SpecialistResult[] = await Promise.all(
      specialistsToRun.map(async (agentType) => {
        try {
          console.info(`Start ${agentType}`);
          const { config: baseConfig, buildMessage } =
            SPECIALIST_CONFIGS[agentType];

          // Dynamic model routing + behavioral injection for recruitable agents
          const resolvedModel = ctx.agentDb
            ? await ctx.agentDb.resolveModel(agentType)
            : baseConfig.model;
          const behaviorContext = ctx.agentDb
            ? await ctx.agentDb.buildBehavioralContext(agentType)
            : null;

          const config: AgentConfig = {
            ...baseConfig,
            model: resolvedModel,
            system: behaviorContext
              ? baseConfig.system + "\n\n" + behaviorContext
              : baseConfig.system,
          };

          const result = await runAgent(
            config,
            projectId,
            ctx,
            buildMessage(projectId),
          );
          const snapshotAfter = await ctx.store.snapshot(projectId);
          const score = computeScore(
            deriveMetrics(
              snapshotBeforeSpecialists,
              snapshotAfter,
              result.usage.outputTokens,
              result.finish_reason,
              result.duration_ms,
            ),
          );

          if (ctx.agentDb) {
            await ctx.agentDb.updateAgentStats(
              agentType,
              score,
              config.model.modelId,
              result.usage.outputTokens,
              result.finish_reason,
            );
            await ctx.agentDb.checkFiringCriteria(agentType);
            await ctx.agentDb.releaseAgent(projectId, agentType);
          }

          console.info(
            `End ${agentType} — score:`,
            score.score.toFixed(3),
            score,
          );
          return { agentType, result, score };
        } catch (error: any) {
          throw Error(`[agentType] - ${agentType}: ${error.message}`);
        }
      }),
    );

    const specialistScores = Object.fromEntries(
      specialistResults.map(({ agentType, score }) => [agentType, score]),
    );

    // ── Lance le QA Lead (agent fixe) ─────────────────────────
    let qaResult: Awaited<ReturnType<typeof runAgent<AuditReport>>>;
    let qaScoreResult: ScoreBreakdown;
    try {
      console.info("Start QA Lead");
      const snapshotBeforeQa = await ctx.store.snapshot(projectId);
      qaResult = await runAgent<AuditReport>(
        qaLeadAgentConfig,
        projectId,
        ctx,
        buildQaLeadMessage(projectId),
      );
      const snapshotAfterQa = await ctx.store.snapshot(projectId);
      const qaScore = computeScore(
        deriveMetrics(
          snapshotBeforeQa,
          snapshotAfterQa,
          qaResult.usage.outputTokens,
          qaResult.finish_reason,
          qaResult.duration_ms,
        ),
      );
      console.info("End QA Lead — score:", qaScore.score.toFixed(3), qaScore);
      qaScoreResult = qaScore;
    } catch (err: any) {
      throw new Error(`QA Lead agent failed: ${err.message ?? err}`);
    }

    // ── Snapshot final ─────────────────────────────────────────
    const snapshot = await ctx.store.snapshot(projectId);

    // Build report pipeline — include all specialist outputs
    const specialistOutputs = Object.fromEntries(
      specialistResults.map(({ agentType, result }) => [
        agentType,
        {
          blueprint: result.output,
          duration_ms: result.duration_ms,
          usage: result.usage,
        },
      ]),
    );

    const reportPipeline = {
      ceo: {
        mandate: ceoResult.output,
        duration_ms: ceoResult.duration_ms,
        usage: ceoResult.usage,
      },
      cto: {
        proposal: ctoResult.output,
        duration_ms: ctoResult.duration_ms,
        usage: ctoResult.usage,
      },
      ...specialistOutputs,
      qa: {
        audit: qaResult.output,
        duration_ms: qaResult.duration_ms,
        usage: qaResult.usage,
      },
    };

    const reportInternal = generateReport({
      projectId,
      snapshot,
      pipeline: reportPipeline,
      mode: "internal",
    });
    const reportClient = generateReport({
      projectId,
      snapshot,
      pipeline: reportPipeline,
      mode: "client",
    });

    const specialistDurationMs = specialistResults.reduce(
      (sum, { result }) => sum + result.duration_ms,
      0,
    );

    return NextResponse.json({
      projectId,
      ceo: {
        mandate: ceoResult.output,
        tensions_written: ceoResult.tensions_written.length,
        usage: ceoResult.usage,
        duration_ms: ceoResult.duration_ms,
        reasoning_raw: ceoResult.reasoning_raw,
      },
      cto: {
        proposal: ctoResult.output,
        recruited: recruitedTypes,
        tensions_written: ctoResult.tensions_written.length,
        usage: ctoResult.usage,
        duration_ms: ctoResult.duration_ms,
        reasoning_raw: ctoResult.reasoning_raw,
      },
      specialists: Object.fromEntries(
        specialistResults.map(({ agentType, result }) => [
          agentType,
          {
            blueprint: result.output,
            tensions_written: result.tensions_written.length,
            usage: result.usage,
            duration_ms: result.duration_ms,
          },
        ]),
      ),
      qa: {
        audit: qaResult.output,
        tensions_written: qaResult.tensions_written.length,
        usage: qaResult.usage,
        duration_ms: qaResult.duration_ms,
        reasoning_raw: qaResult.reasoning_raw,
      },
      field: {
        globalConfidence: snapshot.globalConfidence,
        summary: snapshot.summary,
        tensions: snapshot.tensions,
      },
      scores: {
        ceo: ceoScore,
        cto: ctoScoreResult,
        ...specialistScores,
        qa: qaScoreResult,
      },
      report: {
        internal: reportInternal,
        client: reportClient,
      },
      total_duration_ms:
        ceoResult.duration_ms +
        ctoResult.duration_ms +
        specialistDurationMs +
        qaResult.duration_ms,
    });
  } catch (error: any) {
    console.error("[/api/run]", error);
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/run
 *
 * Freed Agents specialist pipeline.
 * ONLY place authorized to read process.env.
 *
 * Pipeline:
 *   PM (via /api/discovery) → [Lead Front + Lead Back + Data Architect + UX Architect + AI Architect?] → QA → Report
 *
 *   Specialist agents were recruited by the PM via recruit_agent tool.
 *   Their assignments are read from DB (or fallback to defaults).
 *
 * Body: { projectId: string, brief?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createContext } from "@/lib/context";
import { runAgent } from "@/core/agent-runner";
import { generateReport } from "@/lib/reporter";
import { deriveMetrics } from "@/lib/agent-metrics";
import { computeScore, ScoreBreakdown } from "@/lib/scoring";
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
import {
  uxArchitectAgentConfig,
  buildUxArchitectMessage,
} from "@/agents/ux-architect";
import type { RecruitableAgentType } from "@/lib/agent-db";
import type { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// SPECIALIST REGISTRY
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
  ux_architect: {
    config: uxArchitectAgentConfig,
    buildMessage: buildUxArchitectMessage,
  },
  ai_architect: {
    config: aiArchitectAgentConfig,
    buildMessage: buildAiArchitectMessage,
  },
};

const DEFAULT_SPECIALISTS: RecruitableAgentType[] = [
  "lead_front",
  "lead_back",
  "data_architect",
  "ux_architect",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, projectId: existingId } = body as {
      brief?: string;
      projectId?: string;
    };

    // ── Read process.env — only here ───────────────────────────
    const ctx = createContext({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
      xaiApiKey: process.env.XAI_API_KEY,
      mongoUri: process.env.MONGODB_URI,
      storeMode: (process.env.FIELD_STORE as "memory" | "mongo") ?? "memory",
      searchApiKey: process.env.BRAVE_SEARCH_API_KEY,
    });

    // ── Init project if needed ─────────────────────────────────
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

    // ── Determine which specialists to run ─────────────────────
    // PM wrote assignments to DB via recruit_agent — read them back
    let specialistsToRun: RecruitableAgentType[] = [];

    if (ctx.agentDb) {
      console.log("LOAD PREVIOUS")
      const assignments = await ctx.agentDb.getProjectAssignments(projectId);
      console.log(assignments)
      specialistsToRun = assignments.map(
        (a) => a.agentType,
      ) as RecruitableAgentType[];
    }

    if (specialistsToRun.length === 0) {
      specialistsToRun = DEFAULT_SPECIALISTS;
      console.warn(
        "[/api/run] No DB assignments found — running default specialist set:",
        specialistsToRun,
      );
    }

    // Filter to known specialists only
    specialistsToRun = specialistsToRun.filter((t) => t in SPECIALIST_CONFIGS);

    // ── Run specialists in parallel ────────────────────────────
    // Single "global before" snapshot to avoid score race
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
          console.error(`[${agentType}] full error:`, error);
          throw new Error(`[${agentType}]: ${error.message}`);
        }
      }),
    );

    const specialistScores = Object.fromEntries(
      specialistResults.map(({ agentType, score }) => [agentType, score]),
    );

    // ── QA Lead ────────────────────────────────────────────────
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

    // ── Final snapshot + report ────────────────────────────────
    const snapshot = await ctx.store.snapshot(projectId);

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
        ...specialistScores,
        qa: qaScoreResult,
      },
      report: {
        internal: reportInternal,
        client: reportClient,
      },
      total_duration_ms: specialistDurationMs + qaResult.duration_ms,
    });
  } catch (error: any) {
    console.error("[/api/run]", error);
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}

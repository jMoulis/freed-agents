/**
 * POST /api/run
 *
 * Freed Agents specialist pipeline.
 * ONLY place authorized to read process.env.
 *
 * Pipeline (staged for epistemic accuracy):
 *   PM (via /api/discovery)
 *   → Stage 1: Data Architect          (schema first — others depend on it)
 *   → Stage 2: Lead Back + UX Architect (parallel — independent domains)
 *   → Stage 3: Lead Front               (needs API contracts + UX journeys)
 *   → Stage 4: AI Architect?            (if recruited)
 *   → QA Lead
 *
 *   Scores use per-stage snapshots so each agent's delta is accurate.
 *
 *   After QA: if verdict is red or has critical questions → clarification_needed
 *   returned in the response. Frontend re-opens PM chat for targeted follow-up.
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
import type { FieldSnapshot } from "@/core/onto-store";
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
import { NoObjectGeneratedError } from "ai";
import { writeRunLog } from "@/lib/run-logger";

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

// Execution order: data first, back+ux in parallel, front last, ai if present
const STAGE_ORDER: RecruitableAgentType[][] = [
  ["data_architect"],
  ["lead_back", "ux_architect"],
  ["lead_front"],
  ["ai_architect"],
];

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
// ═══════════════════════════════════════════════════════════════

async function runSpecialist(
  agentType: RecruitableAgentType,
  snapshotBefore: FieldSnapshot,
  ctx: ReturnType<typeof createContext>,
  projectId: string,
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
      snapshotBefore,
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

  console.info(`End ${agentType} — score:`, score.score.toFixed(3));
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
    let specialistsToRun: RecruitableAgentType[] = [];

    if (ctx.agentDb) {
      const assignments = await ctx.agentDb.getProjectAssignments(projectId);
      specialistsToRun = assignments.map(
        (a) => a.agentType,
      ) as RecruitableAgentType[];
    }

    if (specialistsToRun.length === 0 && !sandbox) {
      specialistsToRun = DEFAULT_SPECIALISTS;
      console.warn(
        "[/api/run] No DB assignments found — running default specialist set:",
        specialistsToRun,
      );
    }

    specialistsToRun = specialistsToRun.filter((t) => t in SPECIALIST_CONFIGS);

    // ── Build ordered stages ───────────────────────────────────
    const staged = new Set(STAGE_ORDER.flat());
    const unordered = specialistsToRun.filter((t) => !staged.has(t));

    const orderedStages: RecruitableAgentType[][] = [
      ...(unordered.length > 0 ? [unordered] : []),
      ...STAGE_ORDER.map((s) =>
        s.filter((t) => specialistsToRun.includes(t)),
      ).filter((s) => s.length > 0),
    ];

    // ── Run stages sequentially, agents within a stage in parallel ─
    const allSpecialistResults: SpecialistResult[] = [];

    for (const stage of orderedStages) {
      const snapshotBefore = await ctx.store.snapshot(projectId);
      console.info(`Stage [${stage.join(" + ")}] — start`);

      const stageResults = await Promise.all(
        stage.map(async (agentType) => {
          try {
            console.info(`Start ${agentType}`);
            return await runSpecialist(agentType, snapshotBefore, ctx, projectId);
          } catch (error: any) {
            writeRunLog(agentType, projectId, "agent_error", {
              message: error.message,
              ...(NoObjectGeneratedError.isInstance(error) && {
                text: error.text,
                finishReason: error.finishReason,
                cause: String(error.cause),
                usage: error.usage,
                response: error.response
              }),
            });
            throw new Error(`[${agentType}]: ${error.message}`);
          }
        }),
      );

      allSpecialistResults.push(...stageResults);
      console.info(`Stage [${stage.join(" + ")}] — done`);
    }

    const specialistScores = Object.fromEntries(
      allSpecialistResults.map(({ agentType, score }) => [agentType, score]),
    );

    // ── QA Lead ────────────────────────────────────────────────
    // Collect specialist reasoning traces for methodology audit.
    // Truncated to 1500 chars per agent — raw thinking can be 10k+ tokens each,
    // bloating QA context and exhausting step budget before JSON generation.
    const TRACE_MAX_CHARS = 1500;
    const reasoningTraces = allSpecialistResults
      .filter((r) => r.result.reasoning_raw)
      .map((r) => {
        const raw = r.result.reasoning_raw!;
        const truncated =
          raw.length > TRACE_MAX_CHARS
            ? raw.slice(0, TRACE_MAX_CHARS) + "\n… [truncated]"
            : raw;
        return `### ${r.agentType}\n${truncated}`;
      })
      .join("\n\n---\n\n");

    let qaResult: Awaited<ReturnType<typeof runAgent<AuditReport>>>;
    let qaScoreResult: ScoreBreakdown;
    try {
      const snapshotBeforeQa = await ctx.store.snapshot(projectId);
      console.log("Start QA");
      qaResult = await runAgent<AuditReport>(
        qaLeadAgentConfig,
        projectId,
        ctx,
        buildQaLeadMessage(projectId, reasoningTraces || undefined),
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
      console.info("End QA Lead — score:", qaScore.score.toFixed(3));
      qaScoreResult = qaScore;
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

    // ── Clarification check ────────────────────────────────────
    // If QA finds blocking issues agents can't resolve internally,
    // signal the frontend to re-open the PM for targeted client follow-up.
    const qaOutput = qaResult.output as AuditReport | null;
    const criticalQuestions =
      qaOutput?.discovery_questions?.filter((q) => q.priority === "critical") ?? [];

    const clarificationNeeded =
      qaOutput &&
        (qaOutput.verdict === "red" ||
          (qaOutput.verdict === "yellow" && criticalQuestions.length > 0))
        ? { verdict: qaOutput.verdict, questions: criticalQuestions }
        : null;

    if (clarificationNeeded) {
      console.info(
        `[/api/run] QA: ${clarificationNeeded.verdict} — ${criticalQuestions.length} critical → clarification_needed`,
      );
    }

    // ── Final snapshot + report ────────────────────────────────
    const snapshot = await ctx.store.snapshot(projectId);

    const specialistOutputs = Object.fromEntries(
      allSpecialistResults.map(({ agentType, result }) => [
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

    const specialistDurationMs = allSpecialistResults.reduce(
      (sum, { result }) => sum + result.duration_ms,
      0,
    );

    // ── Persist run result ─────────────────────────────────────
    if (ctx.agentDb) {
      await ctx.agentDb
        .saveRunResult(projectId, {
          specialists: Object.fromEntries(
            allSpecialistResults.map(({ agentType, result }) => [
              agentType,
              { blueprint: result.output, tensions_written: result.tensions_written.length, usage: result.usage, duration_ms: result.duration_ms },
            ]),
          ),
          qa: { audit: qaResult.output, tensions_written: qaResult.tensions_written.length, usage: qaResult.usage, duration_ms: qaResult.duration_ms },
          scores: { ...specialistScores, qa: qaScoreResult },
          report: { internal: reportInternal, client: reportClient },
          ...(clarificationNeeded && { clarification_needed: clarificationNeeded }),
          total_duration_ms: specialistDurationMs + qaResult.duration_ms,
        })
        .catch((err) => console.warn("[/api/run] saveRunResult failed:", err));
    }

    return NextResponse.json({
      projectId,
      specialists: Object.fromEntries(
        allSpecialistResults.map(({ agentType, result }) => [
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
      ...(clarificationNeeded && { clarification_needed: clarificationNeeded }),
      total_duration_ms: specialistDurationMs + qaResult.duration_ms,
    });
  } catch (error: any) {
    console.error("[/api/run]", error);
    writeRunLog("pipeline", "unknown", "pipeline_error", { message: error.message });
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}

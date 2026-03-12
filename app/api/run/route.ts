/**
 * POST /api/run
 *
 * Point d'entrée unique de la société Freed Agents.
 * SEUL endroit autorisé à lire process.env.
 * Crée le RunContext et le passe aux agents — zéro secret en dehors d'ici.
 *
 * Body: { brief: string, projectId?: string }
 * Response: { projectId, ceo, cto, architect, qa, field, scores, total_duration_ms }
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createContext } from "@/lib/context";
import { runAgent } from "@/core/agent-runner";
import { generateReport } from "@/lib/reporter";
import { deriveMetrics } from "@/lib/agent-metrics";
import { computeScore, ScoreBreakdown } from "@/lib/scoring";
import { ceoAgentConfig, buildCeoMessage, ProjectMandate } from "@/agents/ceo";
import { ctoAgentConfig, buildCtoMessage, StackProposal } from "@/agents/cto";
import {
  architectAgentConfig,
  buildArchitectMessage,
  Blueprint,
} from "@/agents/architect";
import {
  qaLeadAgentConfig,
  buildQaLeadMessage,
  AuditReport,
} from "@/agents/qa-lead";

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

    // ── Lance le CEO ───────────────────────────────────────────
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

    // ── Lance le CTO ───────────────────────────────────────────
    let ctoResult: Awaited<ReturnType<typeof runAgent<StackProposal>>>;
    let ctoScoreResult: ScoreBreakdown;
    try {
      console.info("Start CTO");
      const snapshotBeforeCto = await ctx.store.snapshot(projectId);
      ctoResult = await runAgent<StackProposal>(
        ctoAgentConfig,
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

    // ── Lance l'Architect ──────────────────────────────────────
    let architectResult: Awaited<ReturnType<typeof runAgent<Blueprint>>>;
    let architectScoreResult: ScoreBreakdown;
    try {
      console.info("Start Architect");
      const snapshotBeforeArchitect = await ctx.store.snapshot(projectId);
      architectResult = await runAgent<Blueprint>(
        architectAgentConfig,
        projectId,
        ctx,
        buildArchitectMessage(projectId),
      );
      const snapshotAfterArchitect = await ctx.store.snapshot(projectId);
      const architectScore = computeScore(
        deriveMetrics(
          snapshotBeforeArchitect,
          snapshotAfterArchitect,
          architectResult.usage.outputTokens,
          architectResult.finish_reason,
          architectResult.duration_ms,
        ),
      );
      console.info(
        "End Architect — score:",
        architectScore.score.toFixed(3),
        architectScore,
      );
      architectScoreResult = architectScore;
    } catch (err: any) {
      throw new Error(`Architect agent failed: ${err.message ?? err}`);
    }

    // ── Lance le QA Lead ───────────────────────────────────────
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

    // ── Snapshot final (après tous les agents) ─────────────────
    const snapshot = await ctx.store.snapshot(projectId);

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
      architect: {
        blueprint: architectResult.output,
        duration_ms: architectResult.duration_ms,
        usage: architectResult.usage,
      },
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
        tensions_written: ctoResult.tensions_written.length,
        usage: ctoResult.usage,
        duration_ms: ctoResult.duration_ms,
        reasoning_raw: ctoResult.reasoning_raw,
      },
      architect: {
        blueprint: architectResult.output,
        tensions_written: architectResult.tensions_written.length,
        usage: architectResult.usage,
        duration_ms: architectResult.duration_ms,
        reasoning_raw: architectResult.reasoning_raw,
      },
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
        architect: architectScoreResult,
        qa: qaScoreResult,
      },
      report: {
        internal: reportInternal,
        client: reportClient,
      },
      total_duration_ms:
        ceoResult.duration_ms +
        ctoResult.duration_ms +
        architectResult.duration_ms +
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

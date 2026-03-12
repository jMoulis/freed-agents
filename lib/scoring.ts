/**
 * FREED AGENTS — Agent Scoring
 *
 * Pure function. No side effects, no I/O, no Field access.
 * Computes a composite score for one agent run given its metrics.
 *
 * Formula:
 *   ownedUnresolved = tensionsDelta - tensionsResolvedByAgent
 *   quality  = tensionsResolvedByAgent * 3 - ownedUnresolved * 1 + fieldCoverage * 2
 *   behavior = finishReason === 'length' ? 0.5 : 1.0
 *   score    = (quality * behavior) / log(completionTokens + 1)
 */

import type { RunMetrics } from "@/lib/agent-metrics";

export interface ScoreBreakdown {
  score: number;
  quality: number;
  behavior: number;
  components: {
    tensionsDelta: number;
    tensionsResolvedByAgent: number;
    ownedUnresolved: number;
    fieldCoverage: number;
    completionTokens: number;
    finishReason: string;
  };
}

export function computeScore(metrics: RunMetrics): ScoreBreakdown {
  const ownedUnresolved = metrics.tensionsDelta - metrics.tensionsResolvedByAgent;

  const quality =
    metrics.tensionsResolvedByAgent * 3 -
    ownedUnresolved * 1 +
    metrics.fieldCoverage * 2;

  const behavior = metrics.finishReason === "length" ? 0.5 : 1.0;

  const score = (quality * behavior) / Math.log(metrics.completionTokens + 1);

  return {
    score,
    quality,
    behavior,
    components: {
      tensionsDelta: metrics.tensionsDelta,
      tensionsResolvedByAgent: metrics.tensionsResolvedByAgent,
      ownedUnresolved,
      fieldCoverage: metrics.fieldCoverage,
      completionTokens: metrics.completionTokens,
      finishReason: metrics.finishReason,
    },
  };
}

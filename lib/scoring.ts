/**
 * FREED AGENTS — Agent Scoring
 *
 * Pure function. No side effects, no I/O, no Field access.
 * Computes a composite score for one agent run given its metrics.
 *
 * Formula:
 *   ownedUnresolved = tensionsDelta - ownTensionsResolved
 *   quality  = ownTensionsResolved * 3 - ownedUnresolved * 1 + fieldCoverage * 2
 *   behavior = finishReason === 'length' ? 0.5 : 1.0
 *   score    = (quality * behavior) / log(completionTokens + 1)
 *
 * Rationale:
 *   - ownTensionsResolved: tensions this agent wrote that the engine immediately resolved
 *     (high confidence → success path). Rewards decisive, well-grounded output.
 *   - ownedUnresolved: tensions this agent opened but left unresolved (partial/blocked).
 *     A small penalty — unresolved tensions are still value, but incomplete.
 *   - fieldCoverage: global resolved ratio, rewards agents that leave the field healthier.
 *   - Token normalization prevents rewarding verbosity.
 */

import type { RunMetrics } from "@/lib/agent-metrics";

export interface ScoreBreakdown {
  score: number;
  quality: number;
  behavior: number;
  components: {
    tensionsDelta: number;
    ownTensionsResolved: number;
    ownedUnresolved: number;
    fieldCoverage: number;
    completionTokens: number;
    finishReason: string;
  };
}

export function computeScore(metrics: RunMetrics): ScoreBreakdown {
  const ownedUnresolved = metrics.tensionsDelta - metrics.ownTensionsResolved;

  const quality =
    metrics.ownTensionsResolved * 3 -
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
      ownTensionsResolved: metrics.ownTensionsResolved,
      ownedUnresolved,
      fieldCoverage: metrics.fieldCoverage,
      completionTokens: metrics.completionTokens,
      finishReason: metrics.finishReason,
    },
  };
}

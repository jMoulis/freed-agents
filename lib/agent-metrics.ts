/**
 * FREED AGENTS — Agent Run Metrics
 *
 * Derives RunMetrics by diffing two FieldSnapshots (before / after an agent run).
 * Pure function — no I/O.
 */

import type { FieldSnapshot } from "@/core/onto-store";

export interface RunMetrics {
  tensionsDelta: number;            // new tensions added by this agent
  tensionsResolvedByAgent: number;  // tensions active before this agent, resolved after
  tensionsStillActive: number;      // total unresolved after the run (observability only)
  fieldCoverage: number;            // resolved / total (0–1) after the run
  completionTokens: number;
  finishReason: string;
  durationMs: number;
}

export function deriveMetrics(
  before: FieldSnapshot,
  after: FieldSnapshot,
  completionTokens: number,
  finishReason: string,
  durationMs: number,
): RunMetrics {
  const tensionsDelta = after.tensions.length - before.tensions.length;

  const beforeActiveIds = new Set(
    before.tensions
      .filter((t) => t.state !== "resolved")
      .map((t) => t.id),
  );
  const afterResolvedIds = new Set(
    after.tensions
      .filter((t) => t.state === "resolved")
      .map((t) => t.id),
  );
  const tensionsResolvedByAgent = [...beforeActiveIds].filter((id) =>
    afterResolvedIds.has(id),
  ).length;

  const tensionsStillActive = after.tensions.filter(
    (t) => t.state !== "resolved",
  ).length;

  const fieldCoverage =
    after.tensions.length > 0
      ? after.tensions.filter((t) => t.state === "resolved").length /
        after.tensions.length
      : 0;

  return {
    tensionsDelta,
    tensionsResolvedByAgent,
    tensionsStillActive,
    fieldCoverage,
    completionTokens,
    finishReason,
    durationMs,
  };
}

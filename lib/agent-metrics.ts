/**
 * FREED AGENTS — Agent Run Metrics
 *
 * Derives RunMetrics by diffing two FieldSnapshots (before / after an agent run).
 * Pure function — no I/O.
 */

import type { FieldSnapshot } from "@/core/onto-store";

export interface RunMetrics {
  tensionsDelta: number;        // new tensions added by this agent
  ownTensionsResolved: number;  // of those new tensions, how many are already resolved after the run
  tensionsStillActive: number;  // total unresolved in the field after the run (observability only)
  fieldCoverage: number;        // resolved / total (0–1) after the run
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
  const beforeIds = new Set(before.tensions.map((t) => t.id));

  // Tensions this agent wrote = present after but not before
  const ownTensions = after.tensions.filter((t) => !beforeIds.has(t.id));
  const tensionsDelta = ownTensions.length;
  const ownTensionsResolved = ownTensions.filter(
    (t) => t.state === "resolved",
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
    ownTensionsResolved,
    tensionsStillActive,
    fieldCoverage,
    completionTokens,
    finishReason,
    durationMs,
  };
}

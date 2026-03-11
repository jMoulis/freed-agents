/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ONTO MULTI-RUN ALGEBRA — v0.1                                   ║
 * ║                                                                  ║
 * ║  confirm()   — même conclusion, sources différentes.            ║
 * ║                La confiance monte par convergence.              ║
 * ║                                                                  ║
 * ║  reconcile() — conclusions différentes sur le même problème.   ║
 * ║                La variance est documentée, pas effacée.        ║
 * ║                La confiance descend à min(a, b).               ║
 * ║                                                                  ║
 * ║  La variance entre runs n'est pas du bruit à éliminer.         ║
 * ║  C'est de l'information à accumuler.                           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import {
  Field,
  TensionId,
  KnowledgeId,
  SituatedKnowledge,
  Confidence,
  Equilibrium,
  OntoBuilder,
} from "./onto-engine";
import { ConfidenceAlgebra } from "./onto-types";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface RunResult {
  run_id: string;
  field: Field;
  eq: Equilibrium;
  agent_id?: string;
}

export interface MergedTensionResult {
  tension_id: TensionId;
  kind: "confirmed" | "reconciled" | "unmatched";

  // Confirmed — même outcome, confiance augmentée
  confirmed_outcome?: unknown;
  confirmed_confidence?: Confidence;
  convergence_bonus?: number; // combien la confiance a augmenté

  // Reconciled — outcomes différents, variance documentée
  variants?: Array<{
    run_id: string;
    outcome: unknown;
    confidence: Confidence;
  }>;
  reconciled_confidence?: Confidence;
  conflict_level?: number; // 0 = légère divergence, 1 = contradiction totale
  divergence_reason?: string; // ce qui expliquerait la divergence

  // Unmatched — tension présente dans un seul run
  only_in_run?: string;
}

export interface MultiRunResult {
  merged_field: Field;
  tension_results: MergedTensionResult[];
  runs_count: number;
  confirmed_count: number;
  reconciled_count: number;
  unmatched_count: number;
  overall_confidence: Confidence;
}

// ═══════════════════════════════════════════════════════════════════
// SIMILARITY HEURISTIC
// Détermine si deux outcomes convergent ou divergent.
// Honnête sur ses limites : c'est une heuristique, pas une vérité.
// ═══════════════════════════════════════════════════════════════════

function outcomesSimilar(
  a: unknown,
  b: unknown,
): { similar: boolean; conflict_level: number } {
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();

  if (sa === sb) return { similar: true, conflict_level: 0 };

  // Extraire les mots clés et mesurer le chevauchement
  const wordsA = new Set(sa.split(/\W+/).filter((w) => w.length > 3));
  const wordsB = new Set(sb.split(/\W+/).filter((w) => w.length > 3));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return { similar: false, conflict_level: 0.5 };

  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const overlap = intersection.length / union.size; // Jaccard similarity

  // > 50% de chevauchement → convergent
  const similar = overlap > 0.5;
  const conflict_level = similar
    ? (1 - overlap) * 0.5
    : 0.5 + (1 - overlap) * 0.5;

  return { similar, conflict_level };
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-RUN ALGEBRA
// ═══════════════════════════════════════════════════════════════════

export class OntoMultiRunAlgebra {
  /**
   * Merger N runs en un seul Field.
   *
   * Pour chaque tension :
   *   - Si tous les runs convergent → confirm() → confiance augmente
   *   - Si les runs divergent       → reconcile() → variance documentée
   *   - Si tension absente d'un run → unmatched
   *
   * Le Field résultant est honnête sur ce qui converge et ce qui diverge.
   */
  merge(runs: RunResult[]): MultiRunResult {
    if (runs.length === 0) throw new Error("Cannot merge zero runs");
    if (runs.length === 1) {
      return {
        merged_field: runs[0].field,
        tension_results: [],
        runs_count: 1,
        confirmed_count: 0,
        reconciled_count: 0,
        unmatched_count: 0,
        overall_confidence: runs[0].eq.confidence as Confidence,
      };
    }

    const builder = new OntoBuilder();
    const tensionResults: MergedTensionResult[] = [];

    // Construire le Field mergé manuellement
    const mergedField: Field = {
      tensions: new Map(),
      sharedKnowledge: new Map(),
      perspectives: new Map(),
    };

    // Merger sharedKnowledge — garder toutes les sources, préfixées
    for (const run of runs) {
      for (const [kid, k] of run.field.sharedKnowledge) {
        const mergedId = `${run.run_id}::${kid}` as KnowledgeId;
        mergedField.sharedKnowledge.set(mergedId, {
          ...k,
          origin: { ...k.origin, source: `${run.run_id}::${k.origin.source}` },
        });
      }
    }

    // ── Collecter toutes les tension IDs ──────────────────────────
    const allTensionIds = new Set<TensionId>();
    for (const run of runs) {
      for (const id of run.field.tensions.keys()) {
        allTensionIds.add(id);
      }
    }

    // ── Traiter chaque tension ─────────────────────────────────────
    for (const tensionId of allTensionIds) {
      const presentIn = runs.filter((r) => r.field.tensions.has(tensionId));

      // Tension absente de certains runs
      if (presentIn.length < runs.length) {
        tensionResults.push({
          tension_id: tensionId,
          kind: "unmatched",
          only_in_run: presentIn.map((r) => r.run_id).join(", "),
        });
        // Garder la tension telle quelle depuis le run qui l'a
        if (presentIn.length > 0) {
          mergedField.tensions.set(
            tensionId,
            presentIn[0].field.tensions.get(tensionId)!,
          );
        }
        continue;
      }

      // Extraire les résolutions de chaque run
      const resolutions = presentIn.map((run) => {
        const tension = run.field.tensions.get(tensionId)!;
        const eq = run.eq;
        const resolved = eq.resolved.get(tensionId);
        const partial = eq.partial.get(tensionId);

        return {
          run_id: run.run_id,
          tension,
          outcome: resolved?.path ?? partial?.outcome ?? "unresolved",
          confidence:
            resolved?.confidence ?? ((partial?.confidence ?? 0) as Confidence),
          phase: resolved ? "resolved" : partial ? "partial" : "unresolved",
        };
      });

      // Comparer les outcomes deux à deux
      let totalConflict = 0;
      let comparisons = 0;
      for (let i = 0; i < resolutions.length; i++) {
        for (let j = i + 1; j < resolutions.length; j++) {
          const { conflict_level } = outcomesSimilar(
            resolutions[i].outcome,
            resolutions[j].outcome,
          );
          totalConflict += conflict_level;
          comparisons++;
        }
      }
      const avgConflict = comparisons > 0 ? totalConflict / comparisons : 0;
      const { similar } = outcomesSimilar(
        resolutions[0].outcome,
        resolutions[1].outcome,
      );

      const baseTension = presentIn[0].field.tensions.get(tensionId)!;

      if (similar && avgConflict < 0.3) {
        // ── CONFIRM — les runs convergent ─────────────────────────
        let confirmedConfidence = resolutions[0].confidence;
        for (let i = 1; i < resolutions.length; i++) {
          confirmedConfidence = ConfidenceAlgebra.confirm(
            confirmedConfidence,
            resolutions[i].confidence,
          );
        }

        // Cap confirmed confidence at maxClaimable — convergence bonus
        // cannot create certainty beyond what the sources support.
        // Three agents agreeing on something they all infer at 70% doesn't make it 99%.
        const sourcesMaxConf = Math.min(
          ...presentIn.map((r) => {
            const sources = [...r.field.sharedKnowledge.values()];
            return sources.length > 0
              ? Math.min(...sources.map((s) => s.confidence))
              : 1;
          }),
        ) as Confidence;
        confirmedConfidence = Math.min(
          confirmedConfidence,
          sourcesMaxConf + 0.1,
        ) as Confidence;
        // +0.10 bonus max for convergence — honest but rewards agreement

        const originalConfidence = resolutions[0].confidence;
        const bonus = confirmedConfidence - originalConfidence;

        tensionResults.push({
          tension_id: tensionId,
          kind: "confirmed",
          confirmed_outcome:
            typeof resolutions[0].outcome === "object"
              ? ((resolutions[0].outcome as any)?.outcome ??
                JSON.stringify(resolutions[0].outcome))
              : resolutions[0].outcome,
          confirmed_confidence: confirmedConfidence,
          convergence_bonus: bonus,
        });

        // Tension mergée avec confiance augmentée
        mergedField.tensions.set(tensionId, {
          ...baseTension,
          knows: this.mergeKnowledge(
            presentIn.map((r) => r.field.tensions.get(tensionId)!.knows),
          ),
          resolves: [
            {
              kind: "success",
              outcome: resolutions[0].outcome,
              confidence: confirmedConfidence,
              risk: "low",
              conditions: [`confirmed across ${runs.length} independent runs`],
            },
          ],
          state: {
            phase: "equilibrated",
            result: {
              path: {
                kind: "success",
                outcome: resolutions[0].outcome,
                confidence: confirmedConfidence,
                risk: "low" as const,
              },
              at: Date.now(),
              passNumber: 0,
              confidence: confirmedConfidence,
            },
          },
        });
      } else {
        // ── RECONCILE — les runs divergent ────────────────────────
        const minConf = Math.min(
          ...resolutions.map((r) => r.confidence),
        ) as Confidence;
        const reconciledConf = ConfidenceAlgebra.reconcile(
          resolutions[0].confidence,
          resolutions[1].confidence,
          avgConflict,
        );

        tensionResults.push({
          tension_id: tensionId,
          kind: "reconciled",
          variants: resolutions.map((r) => ({
            run_id: r.run_id,
            outcome: r.outcome,
            confidence: r.confidence,
          })),
          reconciled_confidence: reconciledConf,
          conflict_level: avgConflict,
          divergence_reason: "unknown — different priors or sampling variance",
        });

        // Tension mergée avec variance documentée
        const variantSummary = resolutions
          .map((r) => {
            const str =
              typeof r.outcome === "object"
                ? JSON.stringify(r.outcome).slice(0, 60)
                : String(r.outcome).slice(0, 60);
            return `${r.run_id}: "${str}"`;
          })
          .join(" | ");

        mergedField.tensions.set(tensionId, {
          ...baseTension,
          knows: this.mergeKnowledge(
            presentIn.map((r) => r.field.tensions.get(tensionId)!.knows),
          ),
          resolves: [
            {
              kind: "success",
              outcome: {
                variance: variantSummary,
                conflict_level: avgConflict,
              },
              confidence: reconciledConf,
              risk: avgConflict > 0.7 ? "high" : "medium",
              conditions: [`variance documented across ${runs.length} runs`],
            },
          ],
          state: {
            phase: "equilibrated",
            result: {
              path: {
                kind: "success",
                outcome: variantSummary,
                confidence: reconciledConf,
                risk: (avgConflict > 0.7 ? "high" : "medium") as
                  | "high"
                  | "medium",
              },
              at: Date.now(),
              passNumber: 0,
              confidence: reconciledConf,
            },
          },
          doubts: [
            {
              about: `runs diverged: conflict_level=${avgConflict.toFixed(2)}`,
              severity: avgConflict > 0.7 ? "blocking" : "medium",
            },
          ],
        });
      }
    }

    // Confiance globale du Field mergé
    const confirmedResults = tensionResults.filter(
      (t) => t.kind === "confirmed",
    );
    const reconciledResults = tensionResults.filter(
      (t) => t.kind === "reconciled",
    );

    const allConfs: number[] = [
      ...confirmedResults.map((t) => t.confirmed_confidence ?? 0),
      ...reconciledResults.map((t) => t.reconciled_confidence ?? 0),
    ];
    const overallConf = (
      allConfs.length > 0
        ? allConfs.reduce((a, b) => a + b, 0) / allConfs.length
        : 0
    ) as Confidence;

    return {
      merged_field: mergedField,
      tension_results: tensionResults,
      runs_count: runs.length,
      confirmed_count: confirmedResults.length,
      reconciled_count: reconciledResults.length,
      unmatched_count: tensionResults.filter((t) => t.kind === "unmatched")
        .length,
      overall_confidence: overallConf,
    };
  }

  private mergeKnowledge(
    knowledgeMaps: Map<KnowledgeId, SituatedKnowledge>[],
  ): Map<KnowledgeId, SituatedKnowledge> {
    const merged = new Map<KnowledgeId, SituatedKnowledge>();
    for (let i = 0; i < knowledgeMaps.length; i++) {
      for (const [kid, k] of knowledgeMaps[i]) {
        merged.set(`run${i}::${kid}` as KnowledgeId, k);
      }
    }
    return merged;
  }
}

// ═══════════════════════════════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════════════════════════════

export function renderMultiRunResult(result: MultiRunResult): string {
  const lines: string[] = [];

  lines.push("╔════════════════════════════════════════╗");
  lines.push("║  ONTO MULTI-RUN RESULT                 ║");
  lines.push("╚════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Runs merged      : ${result.runs_count}`);
  lines.push(
    `  Confirmed        : ${result.confirmed_count} tension(s) converged`,
  );
  lines.push(
    `  Reconciled       : ${result.reconciled_count} tension(s) diverged`,
  );
  lines.push(
    `  Unmatched        : ${result.unmatched_count} tension(s) in some runs only`,
  );
  lines.push(
    `  Overall conf     : ${(result.overall_confidence * 100).toFixed(1)}%`,
  );
  lines.push("");

  for (const t of result.tension_results) {
    if (t.kind === "confirmed") {
      lines.push(`  ✓✓ CONFIRMED [${t.tension_id}]`);
      lines.push(
        `     confidence : ${((t.confirmed_confidence ?? 0) * 100).toFixed(1)}% (+${((t.convergence_bonus ?? 0) * 100).toFixed(1)}% convergence bonus)`,
      );
      const confirmedStr =
        typeof t.confirmed_outcome === "object"
          ? JSON.stringify(t.confirmed_outcome).slice(0, 80)
          : String(t.confirmed_outcome).slice(0, 80);
      lines.push(`     outcome    : "${confirmedStr}"`);
    } else if (t.kind === "reconciled") {
      const icon = (t.conflict_level ?? 0) > 0.7 ? "⊗" : "~";
      lines.push(
        `  ${icon}  RECONCILED [${t.tension_id}] — conflict: ${((t.conflict_level ?? 0) * 100).toFixed(0)}%`,
      );
      lines.push(
        `     confidence : ${((t.reconciled_confidence ?? 0) * 100).toFixed(1)}% (reduced by conflict)`,
      );
      for (const v of t.variants ?? []) {
        const variantStr =
          typeof v.outcome === "object"
            ? JSON.stringify(v.outcome).slice(0, 60)
            : String(v.outcome).slice(0, 60);
        lines.push(
          `     ${v.run_id} (${(v.confidence * 100).toFixed(0)}%) : "${variantStr}"`,
        );
      }
      lines.push(`     divergence : ${t.divergence_reason}`);
    } else {
      lines.push(
        `  ∅  UNMATCHED [${t.tension_id}] — only in: ${t.only_in_run}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

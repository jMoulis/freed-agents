/**
 * FREED AGENTS — Report Generator
 *
 * Pure synchronous function. No API calls. No async.
 * Takes pipeline data → returns a markdown string.
 *
 * CEO and CTO are optional — pipeline now starts with PM + specialists.
 */

import { FieldSnapshot } from "@/core/onto-store";
import { AuditReport } from "@/agents/qa-lead";

type TokenUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
};

export interface ReportInput {
  projectId: string;
  snapshot: FieldSnapshot;
  pipeline: {
    qa: { audit: AuditReport; duration_ms: number; usage: TokenUsage };
    [key: string]: {
      duration_ms: number;
      usage: TokenUsage;
      [k: string]: unknown;
    } | undefined;
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function verdictLabel(verdict: "green" | "yellow" | "red"): string {
  return { green: "✓ GREEN", yellow: "◑ YELLOW", red: "✕ RED" }[verdict];
}

const BUDGET_VS_SCOPE_LABEL: Record<string, string> = {
  aligned: "The scope fits the estimated budget",
  underestimated: "The estimated budget may not cover the full scope",
  overestimated: "The scope is conservative relative to the budget",
  unknown: "We need budget confirmation before assessing scope fit",
};

// ─── client report ───────────────────────────────────────────────────────────

function generateClientReport(
  projectId: string,
  { pipeline, snapshot }: Pick<ReportInput, "pipeline" | "snapshot">,
): string {
  const { audit } = pipeline.qa;
  const lines: string[] = [];
  const date = new Date().toISOString().split("T")[0];

  // Derive title from PM tensions or fallback
  const titleTension = snapshot.tensions.find(
    (t) => t.id === "pm_project_title" || t.id.includes("organization_context"),
  );
  const title = titleTension
    ? String(titleTension.value ?? projectId)
    : `Project ${projectId}`;

  lines.push(`# ${title}`);
  lines.push(``);

  // Verdict
  const verdictEmoji = { green: "✅", yellow: "🟡", red: "🔴" }[audit.verdict];
  const verdictText = {
    green: "Looking Good",
    yellow: "A Few Things to Clarify",
    red: "Needs Clarification",
  }[audit.verdict];
  lines.push(`## ${verdictEmoji} ${verdictText}`);
  lines.push(``);
  lines.push(audit.verdict_rationale);
  lines.push(``);

  // What We Understood — from PM tensions
  const pmTensions = snapshot.tensions.filter((t) => t.id.startsWith("pm_"));
  if (pmTensions.length > 0) {
    lines.push(`## What We Understood`);
    lines.push(``);
    const keyTensions = pmTensions
      .filter((t) => t.confidence >= 0.7)
      .slice(0, 8);
    keyTensions.forEach((t) => {
      const val =
        typeof t.value === "string"
          ? t.value
          : JSON.stringify(t.value);
      lines.push(`- **${t.wants}**: ${val}`);
    });
    lines.push(``);
  }

  // Discovery questions
  if (audit.discovery_questions.length > 0) {
    lines.push(`## Questions for Our Follow-up`);
    lines.push(``);
    audit.discovery_questions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.question}`);
    });
    lines.push(``);
  }

  // Assessment
  lines.push(`## Our Assessment`);
  lines.push(``);
  lines.push(audit.scope_reality_check.assessment);
  lines.push(``);
  lines.push(BUDGET_VS_SCOPE_LABEL[audit.scope_reality_check.budget_vs_scope]);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Freed Agents · ${date}*`);

  return lines.join("\n");
}

// ─── main ────────────────────────────────────────────────────────────────────

export function generateReport({
  projectId,
  snapshot,
  pipeline,
  mode = "internal",
}: ReportInput & { mode?: "client" | "internal" }): string {
  if (mode === "client") {
    return generateClientReport(projectId, { pipeline, snapshot });
  }

  const { audit } = pipeline.qa;

  const specialistKeys = Object.keys(pipeline).filter(
    (k) => k !== "qa",
  );

  const totalTokens = specialistKeys.reduce(
    (sum, k) =>
      sum +
      (pipeline[k]?.usage.inputTokens ?? 0) +
      (pipeline[k]?.usage.outputTokens ?? 0),
    0,
  ) +
    (pipeline.qa.usage.inputTokens ?? 0) +
    (pipeline.qa.usage.outputTokens ?? 0);

  const totalMs =
    specialistKeys.reduce((sum, k) => sum + (pipeline[k]?.duration_ms ?? 0), 0) +
    pipeline.qa.duration_ms;

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────
  const titleTension = snapshot.tensions.find(
    (t) => t.id === "pm_project_title" || t.id.includes("organization_context"),
  );
  const title = titleTension
    ? String(titleTension.value ?? projectId)
    : `Project ${projectId}`;

  lines.push(`# ${title}`);
  lines.push(``);
  lines.push(
    `**Project ID:** \`${projectId}\` · **Pipeline:** ${formatMs(totalMs)} · **Tokens:** ${totalTokens.toLocaleString()} · **Field confidence:** ${(snapshot.globalConfidence * 100).toFixed(0)}%`,
  );
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── QA Verdict ────────────────────────────────────────────────
  lines.push(`## ${verdictLabel(audit.verdict)}`);
  lines.push(``);
  lines.push(audit.verdict_rationale);
  lines.push(``);

  // ── PM Field Overview ─────────────────────────────────────────
  const pmTensions = snapshot.tensions.filter((t) => t.id.startsWith("pm_"));
  if (pmTensions.length > 0) {
    lines.push(`## Discovery Summary`);
    lines.push(``);
    lines.push(`*${pmTensions.length} tensions written by PM*`);
    lines.push(``);
    const highConf = pmTensions.filter((t) => t.confidence >= 0.7);
    highConf.slice(0, 10).forEach((t) => {
      lines.push(
        `- **\`${t.id}\`** — ${t.wants} *(${(t.confidence * 100).toFixed(0)}%)*`,
      );
    });
    lines.push(``);
  }

  // ── Discovery questions ───────────────────────────────────────
  if (audit.discovery_questions.length > 0) {
    lines.push(`## Discovery Questions`);
    lines.push(``);
    lines.push(`*Questions to ask the client before proceeding.*`);
    lines.push(``);
    audit.discovery_questions.forEach((q, i) => {
      lines.push(`${i + 1}. **[${q.priority.toUpperCase()}]** ${q.question}`);
      if (q.unblocks.length > 0) {
        lines.push(`   *Unblocks: ${q.unblocks.join(", ")}*`);
      }
    });
    lines.push(``);
  }

  // ── Audit findings ────────────────────────────────────────────
  if (audit.inconsistencies.length > 0) {
    lines.push(`## Inconsistencies`);
    lines.push(``);
    audit.inconsistencies.forEach((inc) => {
      lines.push(`- **[${inc.severity.toUpperCase()}]** ${inc.description}`);
      if (inc.between.length > 0) {
        lines.push(`  *Between: ${inc.between.join(" ↔ ")}*`);
      }
    });
    lines.push(``);
  }

  if (audit.false_blockers.length > 0) {
    lines.push(`## False Blockers`);
    lines.push(``);
    audit.false_blockers.forEach((fb) => {
      lines.push(`- **\`${fb.tension_id}\`** — ${fb.reason}`);
    });
    lines.push(``);
  }

  // ── Scope reality check ───────────────────────────────────────
  lines.push(`## Scope Reality Check`);
  lines.push(``);
  lines.push(
    `**Budget vs scope:** ${audit.scope_reality_check.budget_vs_scope.toUpperCase()} (${(audit.scope_reality_check.confidence * 100).toFixed(0)}% confidence)`,
  );
  lines.push(``);
  lines.push(audit.scope_reality_check.assessment);
  lines.push(``);

  // ── Epistemic field ───────────────────────────────────────────
  lines.push(`## Epistemic Field`);
  lines.push(``);
  lines.push(
    `**${snapshot.tensions.length} tensions** · ${snapshot.summary} · Global confidence: ${(snapshot.globalConfidence * 100).toFixed(0)}%`,
  );
  lines.push(``);

  const resolvedTensions = snapshot.tensions.filter(
    (t) => t.state === "resolved",
  );
  const blockedTensions = snapshot.tensions.filter(
    (t) => t.state === "blocked",
  );

  if (resolvedTensions.length > 0) {
    lines.push(
      `<details><summary>Resolved tensions (${resolvedTensions.length})</summary>`,
    );
    lines.push(``);
    resolvedTensions.forEach((t) => {
      lines.push(
        `- **\`${t.id}\`** — ${t.wants} *(${(t.confidence * 100).toFixed(0)}%)*`,
      );
    });
    lines.push(``);
    lines.push(`</details>`);
    lines.push(``);
  }

  if (blockedTensions.length > 0) {
    lines.push(
      `<details><summary>Blocked tensions (${blockedTensions.length})</summary>`,
    );
    lines.push(``);
    blockedTensions.forEach((t) => {
      lines.push(`- **\`${t.id}\`** — ${t.wants}`);
      t.doubts.forEach((d) => {
        if (d.severity === "blocking") {
          lines.push(`  - ⚠ ${d.about}`);
        }
      });
    });
    lines.push(``);
    lines.push(`</details>`);
    lines.push(``);
  }

  // ── Pipeline stats ────────────────────────────────────────────
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Pipeline Stats`);
  lines.push(``);
  lines.push(`| Agent | Duration | Input tokens | Output tokens |`);
  lines.push(`|-------|----------|-------------|---------------|`);

  const pipelineEntries = [
    ...specialistKeys.map((k) => ({
      name: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      key: k,
    })),
    { name: "QA Lead", key: "qa" },
  ];

  for (const { name, key } of pipelineEntries) {
    const p = pipeline[key];
    if (!p) continue;
    lines.push(
      `| ${name} | ${formatMs(p.duration_ms)} | ${(p.usage.inputTokens ?? 0).toLocaleString()} | ${(p.usage.outputTokens ?? 0).toLocaleString()} |`,
    );
  }

  lines.push(``);
  lines.push(
    `*Generated by Freed Agents · ${new Date().toISOString().split("T")[0]}*`,
  );

  return lines.join("\n");
}

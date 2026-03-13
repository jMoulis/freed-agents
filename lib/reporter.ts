/**
 * FREED AGENTS — Report Generator
 *
 * Pure synchronous function. No API calls. No async.
 * Takes pipeline data → returns a markdown string.
 */

import { FieldSnapshot } from "@/core/onto-store";
import { ProjectMandate } from "@/agents/ceo";
import { StackProposal } from "@/agents/cto";
import { AuditReport } from "@/agents/qa-lead";

type TokenUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
};

export interface ReportInput {
  projectId: string;
  snapshot: FieldSnapshot;
  pipeline: {
    ceo: { mandate: ProjectMandate; duration_ms: number; usage: TokenUsage };
    cto: { proposal: StackProposal; duration_ms: number; usage: TokenUsage };
    qa: { audit: AuditReport; duration_ms: number; usage: TokenUsage };
    [key: string]: {
      duration_ms: number;
      usage: TokenUsage;
      [k: string]: unknown;
    };
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

function generateClientReport({ pipeline }: Pick<ReportInput, "pipeline">): string {
  const { mandate } = pipeline.ceo;
  const { proposal } = pipeline.cto;
  const { audit } = pipeline.qa;

  const lines: string[] = [];
  const date = new Date().toISOString().split("T")[0];

  lines.push(`# ${mandate.title}`);
  lines.push(``);
  lines.push(`> ${mandate.description}`);
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

  // What We Understood
  lines.push(`## What We Understood`);
  lines.push(``);
  lines.push(`**Who will use this**`);
  mandate.target_users.forEach((u) => lines.push(`- ${u}`));
  lines.push(``);
  lines.push(`**What we're building**`);
  mandate.core_features.forEach((f) => lines.push(`- ${f}`));
  lines.push(``);
  if (mandate.constraints.length > 0) {
    lines.push(`**Constraints we're working within**`);
    mandate.constraints.forEach((c) => lines.push(`- ${c}`));
    lines.push(``);
  }

  // What We've Decided
  lines.push(`## What We've Decided`);
  lines.push(``);

  if (proposal.decisions.tech_stack) {
    const ts = proposal.decisions.tech_stack;
    lines.push(
      `- Built with ${ts.frontend} and ${ts.backend}, using ${ts.database} as database`,
    );
  }

  if (proposal.decisions.deployment_model) {
    const dm = proposal.decisions.deployment_model;
    lines.push(`- Hosted on ${dm.hosting} — ${dm.approach}`);
  }

  const activeVendors =
    proposal.decisions.vendors?.filter(
      (v) => v.decision === "chosen" || v.decision === "shortlisted",
    ) ?? [];
  activeVendors.forEach((v) => {
    const label = v.decision === "chosen" ? "Using" : "Considering";
    lines.push(`- ${label} ${v.recommendation} for ${v.category}`);
  });

  lines.push(``);

  // Discovery questions
  if (audit.discovery_questions.length > 0) {
    lines.push(`## Questions for Our Discovery Call`);
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
    return generateClientReport({ pipeline });
  }

  const { mandate } = pipeline.ceo;
  const { proposal } = pipeline.cto;
  const { audit } = pipeline.qa;

  const specialistKeys = Object.keys(pipeline).filter(
    (k) => !["ceo", "cto", "qa"].includes(k),
  );

  const totalTokens =
    (pipeline.ceo.usage.inputTokens ?? 0) +
    (pipeline.ceo.usage.outputTokens ?? 0) +
    (pipeline.cto.usage.inputTokens ?? 0) +
    (pipeline.cto.usage.outputTokens ?? 0) +
    specialistKeys.reduce(
      (sum, k) =>
        sum +
        (pipeline[k].usage.inputTokens ?? 0) +
        (pipeline[k].usage.outputTokens ?? 0),
      0,
    ) +
    (pipeline.qa.usage.inputTokens ?? 0) +
    (pipeline.qa.usage.outputTokens ?? 0);

  const totalMs =
    pipeline.ceo.duration_ms +
    pipeline.cto.duration_ms +
    specialistKeys.reduce((sum, k) => sum + pipeline[k].duration_ms, 0) +
    pipeline.qa.duration_ms;

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────
  lines.push(`# ${mandate.title}`);
  lines.push(``);
  lines.push(`> ${mandate.description}`);
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

  // ── Mandate ───────────────────────────────────────────────────
  lines.push(`## Mandate`);
  lines.push(``);
  lines.push(`**Complexity:** ${mandate.estimated_complexity}`);
  lines.push(``);
  lines.push(`**Target users**`);
  mandate.target_users.forEach((u) => lines.push(`- ${u}`));
  lines.push(``);
  lines.push(`**Core features**`);
  mandate.core_features.forEach((f) => lines.push(`- ${f}`));
  lines.push(``);
  lines.push(`**Success criteria**`);
  mandate.success_criteria.forEach((s) => lines.push(`- ${s}`));
  lines.push(``);
  if (mandate.constraints.length > 0) {
    lines.push(`**Constraints**`);
    mandate.constraints.forEach((c) => lines.push(`- ${c}`));
    lines.push(``);
  }
  lines.push(``);

  // ── Technical Stack ───────────────────────────────────────────
  lines.push(`## Technical Decisions`);
  lines.push(``);

  if (proposal.decisions.tech_stack) {
    const ts = proposal.decisions.tech_stack;
    lines.push(`### Stack`);
    lines.push(``);
    lines.push(`| Layer | Choice |`);
    lines.push(`|-------|--------|`);
    lines.push(`| Frontend | ${ts.frontend} |`);
    lines.push(`| Backend | ${ts.backend} |`);
    lines.push(`| Database | ${ts.database} |`);
    if (ts.key_libraries.length > 0) {
      lines.push(`| Key libs | ${ts.key_libraries.join(", ")} |`);
    }
    lines.push(``);
    lines.push(
      `*Confidence: ${(ts.confidence * 100).toFixed(0)}% — ${ts.rationale}*`,
    );
    lines.push(``);
  }

  if (proposal.decisions.deployment_model) {
    const dm = proposal.decisions.deployment_model;
    lines.push(`### Deployment`);
    lines.push(``);
    lines.push(`**Hosting:** ${dm.hosting} · **Approach:** ${dm.approach}`);
    lines.push(``);
    lines.push(
      `*Confidence: ${(dm.confidence * 100).toFixed(0)}% — ${dm.rationale}*`,
    );
    lines.push(``);
  }

  if (proposal.decisions.vendors && proposal.decisions.vendors.length > 0) {
    lines.push(`### Vendors`);
    lines.push(``);
    lines.push(`| Category | Recommendation | Decision | Confidence |`);
    lines.push(`|----------|---------------|----------|------------|`);
    for (const v of proposal.decisions.vendors) {
      lines.push(
        `| ${v.category} | ${v.recommendation} | ${v.decision} | ${(v.confidence * 100).toFixed(0)}% |`,
      );
    }
    lines.push(``);
  }

  if (proposal.deferred.length > 0) {
    lines.push(`### Deferred decisions`);
    lines.push(``);
    proposal.deferred.forEach((d) =>
      lines.push(`- **${d.decision}** — blocked by \`${d.blocked_by}\``),
    );
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
    { name: "CEO", key: "ceo" },
    { name: "CTO", key: "cto" },
    ...specialistKeys.map((k) => ({
      name: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      key: k,
    })),
    { name: "QA Lead", key: "qa" },
  ];

  for (const { name, key } of pipelineEntries) {
    const p = pipeline[key];
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

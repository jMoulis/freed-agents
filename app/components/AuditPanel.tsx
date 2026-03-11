"use client";

import { RunResult } from "./types";
import { ConfidenceBar } from "./ConfidenceBar";
import { auditPanel as S } from "./styles";

type Audit = RunResult["qa"]["audit"];

const VERDICT_ICON: Record<string, string> = {
  green: "✓",
  yellow: "◑",
  red: "✕",
};

export function AuditPanel({ audit }: { audit: Audit }) {
  return (
    <div>
      <div style={S.sectionLabel}>QA AUDIT</div>

      {/* Verdict */}
      <div style={S.verdictBanner(audit.verdict)}>
        <div style={S.verdictRow}>
          <span style={S.verdictLabel(audit.verdict)}>
            {VERDICT_ICON[audit.verdict]} {audit.verdict.toUpperCase()}
          </span>
        </div>
        <div style={S.verdictRationale}>{audit.verdict_rationale}</div>
      </div>

      {/* Discovery questions */}
      {audit.discovery_questions.length > 0 && (
        <>
          <div style={S.subLabel}>DISCOVERY QUESTIONS</div>
          <div style={S.questionList}>
            {audit.discovery_questions.map((q, i) => (
              <div key={i} style={S.questionCard(q.priority)}>
                <div style={S.questionPriority(q.priority)}>{q.priority.toUpperCase()}</div>
                <div style={S.questionText}>{q.question}</div>
                {q.unblocks.length > 0 && (
                  <div style={S.questionUnblocks}>
                    unblocks: {q.unblocks.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Scope reality check */}
      <div style={S.subLabel}>SCOPE REALITY CHECK</div>
      <div style={S.scopeCard}>
        <div style={S.scopeRow}>
          <span style={{ fontFamily: "Space Mono", fontSize: "10px", color: "#7c7c9a" }}>
            BUDGET VS SCOPE
          </span>
          <span style={S.scopeBadge(audit.scope_reality_check.budget_vs_scope)}>
            {audit.scope_reality_check.budget_vs_scope.toUpperCase()}
          </span>
        </div>
        <div style={S.scopeAssessment}>{audit.scope_reality_check.assessment}</div>
        <div style={{ marginTop: "8px" }}>
          <ConfidenceBar value={audit.scope_reality_check.confidence} />
        </div>
      </div>

      {/* Inconsistencies */}
      {audit.inconsistencies.length > 0 && (
        <>
          <div style={S.subLabel}>INCONSISTENCIES</div>
          <div style={S.inconsistencyList}>
            {audit.inconsistencies.map((inc, i) => (
              <div key={i} style={S.inconsistencyCard(inc.severity)}>
                <div style={S.inconsistencyDesc}>{inc.description}</div>
                {inc.between.length > 0 && (
                  <div style={S.inconsistencyIds}>{inc.between.join(" ↔ ")}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* False blockers */}
      {audit.false_blockers.length > 0 && (
        <>
          <div style={S.subLabel}>FALSE BLOCKERS</div>
          <div style={S.falseBlockerList}>
            {audit.false_blockers.map((fb, i) => (
              <div key={i} style={S.falseBlockerCard}>
                <div style={S.falseBlockerTension}>{fb.tension_id}</div>
                <div style={S.falseBlockerReason}>{fb.reason}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

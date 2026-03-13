"use client";

import { RunResult } from "./types";
import { ConfidenceBar } from "./ConfidenceBar";
import { TensionCard } from "./TensionCard";
import { fieldPanel as S } from "./styles";

type Field = RunResult["field"];

export function FieldPanel({ field }: { field: Field }) {
  const resolved = field?.tensions.filter((t) => t.state === "resolved").length;
  const partial = field?.tensions.filter((t) => t.state === "partial").length;
  const other = field?.tensions.filter(
    (t) => t.state !== "resolved" && t.state !== "partial",
  ).length;

  return (
    <div>
      <div style={S.sectionLabel}>
        EPISTEMIC FIELD
        <span style={S.badge}>{field?.tensions.length} tensions</span>
      </div>

      <div style={S.confidenceCard}>
        <div style={S.confidenceRow}>
          <span style={S.confidenceLabel}>GLOBAL CONFIDENCE</span>
          <span style={S.confidenceLabel}>
            {resolved}✓ {partial}◑ {other}○
          </span>
        </div>
        <ConfidenceBar value={field?.globalConfidence || 0} />
        <div style={S.summary}>{field?.summary}</div>
      </div>

      <div style={S.tensionList}>
        {field?.tensions.map((t) => (
          <TensionCard key={t.id} t={t} />
        ))}
      </div>
    </div>
  );
}

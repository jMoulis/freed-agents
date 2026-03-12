"use client";

import { RunResult, COMPLEXITY_COLOR } from "./types";
import { Tags } from "./Tags";
import { mandatePanel as S } from "./styles";

type Mandate = NonNullable<RunResult["ceo"]>["mandate"];

export function MandatePanel({ mandate }: { mandate: Mandate }) {
  const complexityColor = mandate?.estimated_complexity
    ? COMPLEXITY_COLOR[mandate?.estimated_complexity]
    : "#7c7c9a";

  return (
    <div>
      <div style={S.sectionLabel}>PROJECT MANDATE</div>

      <div style={S.header}>
        <div style={S.titleRow}>
          <h2 style={S.title}>{mandate?.title}</h2>
          <span style={S.complexityBadge(complexityColor)}>
            {mandate?.estimated_complexity.toUpperCase()}
          </span>
        </div>
        <p style={S.description}>{mandate?.description}</p>
      </div>

      <div style={S.tagsCard}>
        <Tags
          label="TARGET USERS"
          items={mandate?.target_users ?? []}
          color="#a0e0ff"
        />
        <Tags
          label="CORE FEATURES"
          items={mandate?.core_features ?? []}
          color="#c0c0d8"
        />
        <Tags
          label="SUCCESS CRITERIA"
          items={mandate?.success_criteria ?? []}
          color="#4ade80"
        />
        <Tags
          label="TEAM NEEDS"
          items={mandate?.team_needs ?? []}
          color="#fb923c"
        />
        <Tags
          label="CONSTRAINTS"
          items={mandate?.constraints ?? []}
          color="#f87171"
        />
      </div>
    </div>
  );
}

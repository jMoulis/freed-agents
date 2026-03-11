"use client";

import { confidenceBar as S } from "./styles";

export function ConfidenceBar({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const pct   = Math.round(value * 100);
  const color = value >= 0.75 ? "#4ade80" : value >= 0.5 ? "#fb923c" : "#f87171";
  return (
    <div style={S.wrapper}>
      <div style={S.track(size)}>
        <div style={S.fill(pct, color)} />
      </div>
      <span style={S.label(color)}>{pct}%</span>
    </div>
  );
}

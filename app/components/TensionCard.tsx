"use client";

import { useState } from "react";
import { TensionSeed } from "./types";
import { ConfidenceBar } from "./ConfidenceBar";
import { tensionCard as S } from "./styles";

export function TensionCard({ t }: { t: TensionSeed }) {
  const [open, setOpen] = useState(false);
  const color = t.confidence >= 0.75 ? "#4ade80" : t.confidence >= 0.5 ? "#fb923c" : "#f87171";
  const icon  = t.confidence >= 0.75 ? "✓" : t.confidence >= 0.5 ? "◑" : "○";

  return (
    <div onClick={() => setOpen(o => !o)} style={S.card(color)}>
      <div style={S.header}>
        <span style={S.icon(color)}>{icon}</span>
        <span style={S.id}>[{t.id}]</span>
        <span style={S.wants}>{t.wants}</span>
        <span style={S.toggle}>{open ? "▲" : "▼"}</span>
      </div>

      <ConfidenceBar value={t.confidence} size="sm" />

      {open && (
        <div style={S.details}>
          {t.value !== undefined && (
            <div style={S.valueRow}>
              <span style={S.valueLabel}>VALUE </span>
              <span style={S.valueText}>
                {typeof t.value === "string" ? t.value : JSON.stringify(t.value)}
              </span>
            </div>
          )}
          {t.doubts?.length > 0 && (
            <div>
              <div style={S.doubtsLabel}>DOUBTS</div>
              {t.doubts.map((d, i) => (
                <div key={i} style={S.doubt}>
                  <span>{d.about}</span>
                  <span> · {d.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

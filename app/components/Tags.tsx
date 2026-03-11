"use client";

import { tags as S } from "./styles";

export function Tags({ label, items, color }: { label: string; items: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <div style={S.wrapper}>
      <div style={S.label}>{label}</div>
      <div style={S.list}>
        {items.map((item, i) => (
          <span key={i} style={S.item(color)}>{item}</span>
        ))}
      </div>
    </div>
  );
}

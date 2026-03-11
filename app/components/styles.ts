import type { CSSProperties } from "react";

// ─── Shared tokens ────────────────────────────────────────────
const CARD: CSSProperties = {
  background: "#0d0d1a",
  border: "1px solid #1e1e2e",
  borderRadius: "10px",
  padding: "16px",
};

const MONO_LABEL: CSSProperties = {
  fontFamily: "Space Mono",
  fontSize: "10px",
  color: "#7c7c9a",
  letterSpacing: "0.15em",
};

// ─── ConfidenceBar ────────────────────────────────────────────
export const confidenceBar = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as CSSProperties,

  track: (size: "sm" | "md"): CSSProperties => ({
    flex: 1,
    height: size === "sm" ? "3px" : "5px",
    background: "#1e1e2e",
    borderRadius: "99px",
    overflow: "hidden",
  }),

  fill: (pct: number, color: string): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    background: color,
    borderRadius: "99px",
    transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
    boxShadow: `0 0 8px ${color}66`,
  }),

  label: (color: string): CSSProperties => ({
    fontFamily: "monospace",
    fontSize: "11px",
    color,
    minWidth: "32px",
  }),
};

// ─── Tags ─────────────────────────────────────────────────────
export const tags = {
  wrapper: { marginBottom: "14px" } as CSSProperties,

  label: {
    fontSize: "10px",
    fontFamily: "monospace",
    color: "#7c7c9a",
    letterSpacing: "0.1em",
    marginBottom: "6px",
  } as CSSProperties,

  list: {
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
  } as CSSProperties,

  item: (color: string): CSSProperties => ({
    fontSize: "12px",
    color,
    background: "#0d0d1a",
    border: "1px solid #2a2a3a",
    borderRadius: "4px",
    padding: "2px 8px",
  }),
};

// ─── TensionCard ──────────────────────────────────────────────
export const tensionCard = {
  card: (color: string): CSSProperties => ({
    background: "#0d0d1a",
    border: `1px solid ${color}33`,
    borderRadius: "8px",
    padding: "12px 14px",
    cursor: "pointer",
  }),

  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "6px",
  } as CSSProperties,

  icon: (color: string): CSSProperties => ({
    color,
    fontFamily: "monospace",
    fontSize: "13px",
  }),

  id: {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#7c7c9a",
  } as CSSProperties,

  wants: {
    fontSize: "13px",
    color: "#e0e0f0",
    flex: 1,
  } as CSSProperties,

  toggle: {
    fontSize: "10px",
    color: "#7c7c9a",
  } as CSSProperties,

  details: {
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px solid #1e1e2e",
  } as CSSProperties,

  valueRow: { marginBottom: "8px" } as CSSProperties,

  valueLabel: {
    fontSize: "11px",
    color: "#7c7c9a",
    fontFamily: "monospace",
  } as CSSProperties,

  valueText: {
    fontSize: "12px",
    color: "#c0c0d8",
  } as CSSProperties,

  doubtsLabel: {
    fontSize: "11px",
    color: "#7c7c9a",
    fontFamily: "monospace",
    marginBottom: "4px",
  } as CSSProperties,

  doubt: {
    fontSize: "12px",
    color: "#fb923c",
    paddingLeft: "12px",
    borderLeft: "2px solid #fb923c44",
    marginBottom: "3px",
  } as CSSProperties,
};

// ─── MandatePanel ─────────────────────────────────────────────
export const mandatePanel = {
  sectionLabel: {
    ...MONO_LABEL,
    marginBottom: "12px",
  } as CSSProperties,

  header: {
    ...CARD,
    marginBottom: "10px",
  } as CSSProperties,

  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "8px",
    gap: "10px",
  } as CSSProperties,

  title: {
    fontSize: "17px",
    fontWeight: 500,
    color: "#e0e0f0",
    letterSpacing: "-0.01em",
  } as CSSProperties,

  complexityBadge: (color: string): CSSProperties => ({
    fontFamily: "Space Mono",
    fontSize: "9px",
    color,
    border: `1px solid ${color}44`,
    borderRadius: "4px",
    padding: "2px 7px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }),

  description: {
    fontSize: "13px",
    color: "#a0a0bc",
    lineHeight: 1.6,
    fontWeight: 300,
  } as CSSProperties,

  tagsCard: CARD,
};

// ─── FieldPanel ───────────────────────────────────────────────
export const fieldPanel = {
  sectionLabel: {
    ...MONO_LABEL,
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  } as CSSProperties,

  badge: {
    background: "#1e1e2e",
    borderRadius: "4px",
    padding: "1px 7px",
    color: "#e0e0f0",
  } as CSSProperties,

  confidenceCard: {
    ...CARD,
    padding: "14px 16px",
    marginBottom: "8px",
  } as CSSProperties,

  confidenceRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
  } as CSSProperties,

  confidenceLabel: {
    fontFamily: "Space Mono",
    fontSize: "10px",
    color: "#7c7c9a",
  } as CSSProperties,

  summary: {
    marginTop: "5px",
    fontSize: "10px",
    color: "#7c7c9a",
    fontFamily: "Space Mono",
  } as CSSProperties,

  tensionList: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  } as CSSProperties,
};

// ─── Token Breakdown ──────────────────────────────────────────
export const tokenBreakdown = {
  row: {
    display: "flex",
    gap: "6px",
    marginBottom: "16px",
    marginTop: "-12px",
  } as CSSProperties,

  cell: {
    flex: 1,
    background: "#0d0d1a",
    border: "1px solid #1e1e2e",
    borderRadius: "6px",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  } as CSSProperties,

  agentLabel: {
    fontFamily: "Space Mono",
    fontSize: "9px",
    color: "#6c63ff",
    letterSpacing: "0.15em",
  } as CSSProperties,

  tokenRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  } as CSSProperties,

  tokenLabel: {
    fontFamily: "Space Mono",
    fontSize: "9px",
    color: "#3a3a5a",
    letterSpacing: "0.1em",
  } as CSSProperties,

  tokenValue: {
    fontFamily: "Space Mono",
    fontSize: "11px",
    color: "#7c7c9a",
  } as CSSProperties,

  tokenValueHighlight: {
    fontFamily: "Space Mono",
    fontSize: "11px",
    color: "#c0c0d8",
  } as CSSProperties,

  toggleBtn: {
    fontFamily: "Space Mono",
    fontSize: "10px",
    color: "#6c63ff",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    letterSpacing: "0",
    textDecoration: "underline",
    textDecorationStyle: "dotted" as const,
    textUnderlineOffset: "3px",
  } as CSSProperties,
};

// ─── BlueprintPanel ───────────────────────────────────────────
export const blueprintPanel = {
  sectionLabel: {
    ...MONO_LABEL,
    marginBottom: "12px",
  } as CSSProperties,

  summary: {
    ...CARD,
    fontSize: "13px",
    color: "#a0a0bc",
    lineHeight: 1.7,
    fontWeight: 300,
    marginBottom: "14px",
  } as CSSProperties,

  subLabel: {
    ...MONO_LABEL,
    marginBottom: "8px",
    marginTop: "16px",
  } as CSSProperties,

  componentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "8px",
    marginBottom: "4px",
  } as CSSProperties,

  componentCard: (type: string): CSSProperties => {
    const colors: Record<string, string> = {
      frontend: "#a0e0ff",
      backend: "#c0c0d8",
      database: "#4ade80",
      integration: "#fb923c",
      infra: "#f87171",
    };
    const c = colors[type] ?? "#7c7c9a";
    return {
      background: "#0d0d1a",
      border: `1px solid ${c}33`,
      borderRadius: "8px",
      padding: "10px 12px",
    };
  },

  componentType: (type: string): CSSProperties => {
    const colors: Record<string, string> = {
      frontend: "#a0e0ff",
      backend: "#c0c0d8",
      database: "#4ade80",
      integration: "#fb923c",
      infra: "#f87171",
    };
    return {
      fontFamily: "Space Mono",
      fontSize: "9px",
      color: colors[type] ?? "#7c7c9a",
      letterSpacing: "0.1em",
      marginBottom: "4px",
    };
  },

  componentName: {
    fontSize: "13px",
    color: "#e0e0f0",
    fontWeight: 500,
    marginBottom: "4px",
  } as CSSProperties,

  componentResp: {
    fontSize: "11px",
    color: "#7c7c9a",
    lineHeight: 1.5,
  } as CSSProperties,

  entityList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  } as CSSProperties,

  entityCard: {
    ...CARD,
    padding: "10px 14px",
  } as CSSProperties,

  entityName: {
    fontSize: "13px",
    color: "#e0e0f0",
    fontWeight: 500,
    marginBottom: "4px",
  } as CSSProperties,

  entityMeta: {
    fontSize: "11px",
    color: "#7c7c9a",
    fontFamily: "monospace",
  } as CSSProperties,

  contractList: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  } as CSSProperties,

  contractRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
    background: "#0d0d1a",
    border: "1px solid #1e1e2e",
    borderRadius: "6px",
    padding: "8px 12px",
  } as CSSProperties,

  contractMethod: (method: string): CSSProperties => {
    const colors: Record<string, string> = {
      GET: "#4ade80",
      POST: "#a0e0ff",
      PUT: "#fb923c",
      PATCH: "#fb923c",
      DELETE: "#f87171",
    };
    return {
      fontFamily: "Space Mono",
      fontSize: "10px",
      color: colors[method] ?? "#7c7c9a",
      minWidth: "46px",
    };
  },

  contractEndpoint: {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#c0c0d8",
    flex: 1,
  } as CSSProperties,

  contractPurpose: {
    fontSize: "11px",
    color: "#7c7c9a",
  } as CSSProperties,

  riskList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  } as CSSProperties,

  riskCard: (severity: string): CSSProperties => {
    const colors: Record<string, string> = {
      low: "#4ade80",
      medium: "#fb923c",
      high: "#f87171",
      blocking: "#ff4444",
    };
    const c = colors[severity] ?? "#7c7c9a";
    return {
      background: "#0d0d1a",
      border: `1px solid ${c}44`,
      borderLeft: `3px solid ${c}`,
      borderRadius: "6px",
      padding: "8px 12px",
    };
  },

  riskArea: {
    fontSize: "12px",
    color: "#e0e0f0",
    fontWeight: 500,
    marginBottom: "2px",
  } as CSSProperties,

  riskDesc: {
    fontSize: "11px",
    color: "#a0a0bc",
    marginBottom: "4px",
    lineHeight: 1.5,
  } as CSSProperties,

  riskMitigation: {
    fontSize: "11px",
    color: "#7c7c9a",
    fontStyle: "italic",
  } as CSSProperties,

  blockerList: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  } as CSSProperties,

  blockerCard: {
    background: "#1a0a0a",
    border: "1px solid #f8717133",
    borderRadius: "6px",
    padding: "8px 12px",
  } as CSSProperties,

  blockerDecision: {
    fontSize: "12px",
    color: "#f87171",
    marginBottom: "2px",
  } as CSSProperties,

  blockerReason: {
    fontSize: "11px",
    color: "#7c7c9a",
    fontFamily: "monospace",
  } as CSSProperties,
};

// ─── AuditPanel ───────────────────────────────────────────────
export const auditPanel = {
  sectionLabel: {
    ...MONO_LABEL,
    marginBottom: "12px",
    marginTop: "18px",
  } as CSSProperties,

  verdictBanner: (verdict: string): CSSProperties => {
    const map: Record<string, { bg: string; border: string; color: string }> = {
      green:  { bg: "#0a1a0a", border: "#4ade8044", color: "#4ade80" },
      yellow: { bg: "#1a1500", border: "#fb923c44", color: "#fb923c" },
      red:    { bg: "#1a0a0a", border: "#f8717144", color: "#f87171" },
    };
    const t = map[verdict] ?? map.yellow;
    return {
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderLeft: `4px solid ${t.color}`,
      borderRadius: "8px",
      padding: "14px 18px",
      marginBottom: "14px",
    };
  },

  verdictRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "6px",
  } as CSSProperties,

  verdictLabel: (verdict: string): CSSProperties => {
    const colors: Record<string, string> = {
      green: "#4ade80", yellow: "#fb923c", red: "#f87171",
    };
    return {
      fontFamily: "Space Mono",
      fontSize: "11px",
      color: colors[verdict] ?? "#7c7c9a",
      letterSpacing: "0.15em",
      fontWeight: 600,
    };
  },

  verdictRationale: {
    fontSize: "13px",
    color: "#a0a0bc",
    lineHeight: 1.6,
    fontWeight: 300,
  } as CSSProperties,

  subLabel: {
    ...MONO_LABEL,
    marginBottom: "8px",
    marginTop: "16px",
  } as CSSProperties,

  questionList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  } as CSSProperties,

  questionCard: (priority: string): CSSProperties => {
    const colors: Record<string, string> = {
      critical: "#f87171", high: "#fb923c", medium: "#7c7c9a",
    };
    const c = colors[priority] ?? "#7c7c9a";
    return {
      background: "#0d0d1a",
      border: `1px solid ${c}33`,
      borderLeft: `3px solid ${c}`,
      borderRadius: "6px",
      padding: "10px 14px",
    };
  },

  questionPriority: (priority: string): CSSProperties => {
    const colors: Record<string, string> = {
      critical: "#f87171", high: "#fb923c", medium: "#7c7c9a",
    };
    return {
      fontFamily: "Space Mono",
      fontSize: "9px",
      color: colors[priority] ?? "#7c7c9a",
      letterSpacing: "0.1em",
      marginBottom: "4px",
    };
  },

  questionText: {
    fontSize: "13px",
    color: "#e0e0f0",
    lineHeight: 1.5,
  } as CSSProperties,

  questionUnblocks: {
    marginTop: "4px",
    fontFamily: "monospace",
    fontSize: "10px",
    color: "#6c63ff",
  } as CSSProperties,

  scopeCard: {
    ...CARD,
    padding: "12px 16px",
    marginBottom: "4px",
  } as CSSProperties,

  scopeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: "6px",
  } as CSSProperties,

  scopeBadge: (status: string): CSSProperties => {
    const colors: Record<string, string> = {
      aligned: "#4ade80",
      underestimated: "#f87171",
      overestimated: "#fb923c",
      unknown: "#7c7c9a",
    };
    const c = colors[status] ?? "#7c7c9a";
    return {
      fontFamily: "Space Mono",
      fontSize: "9px",
      color: c,
      border: `1px solid ${c}44`,
      borderRadius: "4px",
      padding: "2px 7px",
    };
  },

  scopeAssessment: {
    fontSize: "12px",
    color: "#a0a0bc",
    lineHeight: 1.5,
  } as CSSProperties,

  inconsistencyList: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  } as CSSProperties,

  inconsistencyCard: (severity: string): CSSProperties => {
    const colors: Record<string, string> = {
      low: "#4ade80", medium: "#fb923c", blocking: "#f87171",
    };
    const c = colors[severity] ?? "#7c7c9a";
    return {
      background: "#0d0d1a",
      border: `1px solid ${c}33`,
      borderLeft: `3px solid ${c}`,
      borderRadius: "6px",
      padding: "8px 12px",
    };
  },

  inconsistencyDesc: {
    fontSize: "12px",
    color: "#a0a0bc",
    marginBottom: "4px",
    lineHeight: 1.5,
  } as CSSProperties,

  inconsistencyIds: {
    fontFamily: "monospace",
    fontSize: "10px",
    color: "#6c63ff",
  } as CSSProperties,

  falseBlockerList: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  } as CSSProperties,

  falseBlockerCard: {
    background: "#0d1a0d",
    border: "1px solid #4ade8033",
    borderRadius: "6px",
    padding: "8px 12px",
  } as CSSProperties,

  falseBlockerTension: {
    fontFamily: "monospace",
    fontSize: "10px",
    color: "#4ade80",
    marginBottom: "2px",
  } as CSSProperties,

  falseBlockerReason: {
    fontSize: "12px",
    color: "#a0a0bc",
    lineHeight: 1.5,
  } as CSSProperties,
};

// ─── Page ─────────────────────────────────────────────────────
export const page = {
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 20% 0%, #1a0a2e18 0%, transparent 55%), #0a0a0f",
    padding: "40px 24px",
  } as CSSProperties,

  inner: {
    maxWidth: "1000px",
    margin: "0 auto",
  } as CSSProperties,

  headerSection: { marginBottom: "40px" } as CSSProperties,

  eyebrow: {
    fontFamily: "Space Mono",
    fontSize: "10px",
    color: "#6c63ff",
    letterSpacing: "0.3em",
    marginBottom: "8px",
  } as CSSProperties,

  h1: {
    fontFamily: "DM Sans",
    fontSize: "34px",
    fontWeight: 300,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
  } as CSSProperties,

  accent: { color: "#6c63ff" } as CSSProperties,

  subtitle: {
    marginTop: "6px",
    color: "#7c7c9a",
    fontSize: "13px",
    fontWeight: 300,
  } as CSSProperties,

  pipeline: {
    display: "flex",
    gap: "6px",
    marginBottom: "28px",
    alignItems: "center",
  } as CSSProperties,

  pipelineStep: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  } as CSSProperties,

  pipelineRole: (active: boolean): CSSProperties => ({
    padding: "5px 12px",
    borderRadius: "4px",
    border: `1px solid ${active ? "#6c63ff" : "#2a2a3a"}`,
    background: active ? "#6c63ff1a" : "transparent",
    fontFamily: "Space Mono",
    fontSize: "11px",
    color: active ? "#6c63ff" : "#3a3a5a",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  }),

  pipelineDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: "#6c63ff",
    boxShadow: "0 0 6px #6c63ff",
    animation: "pulse 1.2s infinite",
    display: "inline-block",
  } as CSSProperties,

  pipelineArrow: {
    color: "#2a2a3a",
    fontFamily: "monospace",
  } as CSSProperties,

  briefBox: (loading: boolean): CSSProperties => ({
    background: "#0d0d1a",
    border: `1px solid ${loading ? "#6c63ff44" : "#1e1e2e"}`,
    borderRadius: "10px",
    padding: "18px",
    marginBottom: "12px",
    transition: "border-color 0.3s",
  }),

  briefLabel: {
    ...MONO_LABEL,
    marginBottom: "10px",
  } as CSSProperties,

  textarea: {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "#e0e0f0",
    fontFamily: "DM Sans",
    fontSize: "14px",
    lineHeight: 1.6,
    resize: "vertical",
    fontWeight: 300,
  } as CSSProperties,

  actions: {
    display: "flex",
    gap: "8px",
    marginBottom: "36px",
  } as CSSProperties,

  runButton: (loading: boolean, disabled: boolean): CSSProperties => ({
    padding: "9px 22px",
    background: loading ? "#2a2a3a" : "#6c63ff",
    border: "none",
    borderRadius: "6px",
    color: loading ? "#7c7c9a" : "#fff",
    fontFamily: "DM Sans",
    fontSize: "13px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  }),

  spinner: {
    width: "11px",
    height: "11px",
    borderRadius: "50%",
    border: "2px solid #7c7c9a33",
    borderTopColor: "#6c63ff",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  } as CSSProperties,

  exampleButton: {
    padding: "9px 14px",
    background: "transparent",
    border: "1px solid #2a2a3a",
    borderRadius: "6px",
    color: "#7c7c9a",
    fontFamily: "DM Sans",
    fontSize: "12px",
    cursor: "pointer",
  } as CSSProperties,

  errorBox: {
    background: "#1a0a0a",
    border: "1px solid #f8717144",
    borderRadius: "8px",
    padding: "12px 16px",
    color: "#f87171",
    fontFamily: "monospace",
    fontSize: "12px",
    marginBottom: "20px",
    animation: "fadeIn 0.3s ease",
  } as CSSProperties,

  results: { animation: "fadeIn 0.4s ease" } as CSSProperties,

  metaBar: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    background: "#0d0d1a",
    border: "1px solid #1e1e2e",
    borderRadius: "8px",
    padding: "9px 14px",
    marginBottom: "20px",
    fontFamily: "Space Mono",
    fontSize: "10px",
    color: "#7c7c9a",
    flexWrap: "wrap",
  } as CSSProperties,

  metaAccent: { color: "#6c63ff" } as CSSProperties,
  metaSpacer: { flex: 1 } as CSSProperties,
  metaSuccess: { color: "#4ade80" } as CSSProperties,

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "18px",
    marginBottom: "18px",
  } as CSSProperties,

  awaiting: {
    textAlign: "center",
    padding: "60px 0",
    color: "#3a3a5a",
    fontFamily: "Space Mono",
    fontSize: "11px",
    letterSpacing: "0.15em",
  } as CSSProperties,
};

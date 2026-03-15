"use client";

import { useState } from "react";
import { RunResult, ClarificationNeeded } from "./components/types";
import { FieldPanel } from "./components/FieldPanel";
import { BlueprintPanel } from "./components/BlueprintPanel";
import { AuditPanel } from "./components/AuditPanel";
import { ReportPanel } from "./components/ReportPanel";
import { DiscoveryChat } from "./components/DiscoveryChat";
import { page as S, tokenBreakdown as T } from "./components/styles";

type Phase = "discovery" | "running" | "results" | "clarification";

const PIPELINE_ROLES = [
  "PM",
  "LEAD FRONT",
  "LEAD BACK",
  "DATA ARCHITECT",
  "UX ARCHITECT",
  "QA LEAD",
] as const;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("discovery");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const [clarification, setClarification] = useState<ClarificationNeeded | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  async function handleDiscoveryComplete(projectId: string, brief: string, sandbox?:boolean) {
    setPhase("running");
    setError(null);
    setActiveProjectId(projectId);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, projectId, sandbox }),
      });
      const data: RunResult = await res.json();
      if (!res.ok) throw new Error((data as any).error ?? "Request failed");
      setResult(data);
      setPhase("results");
      // If QA found critical blockers, prepare clarification context
      if (data.clarification_needed) {
        setClarification(data.clarification_needed);
      }
    } catch (e: any) {
      setError(e.message);
      setPhase("discovery");
    }
  }

  const specialistKeys = result?.specialists
    ? Object.keys(result.specialists)
    : [];

  const totalTokens = result
    ? specialistKeys.reduce(
        (sum, k) =>
          sum +
          (result.specialists?.[k]?.usage?.inputTokens ?? 0) +
          (result.specialists?.[k]?.usage?.outputTokens ?? 0),
        0,
      ) +
      (result.qa?.usage?.inputTokens ?? 0) +
      (result.qa?.usage?.outputTokens ?? 0)
    : 0;

  return (
    <div style={S.root}>
      <div style={S.inner}>
        {/* Header */}
        <div style={S.headerSection}>
          <div style={S.eyebrow}>FREED AGENTS // v0.2</div>
          <h1 style={S.h1}>
            AI Software Engineering <span style={S.accent}>Firm</span>
          </h1>
          <p style={S.subtitle}>
            Brief client → Spec technique complète. Sans humain dans la boucle.
          </p>
        </div>

        {/* Pipeline */}
        <div style={S.pipeline}>
          {PIPELINE_ROLES.map((role, i) => {
            const active = phase === "running";
            return (
              <div key={role} style={S.pipelineStep}>
                <div style={S.pipelineRole(active)}>
                  {active && <span style={S.pipelineDot} />}
                  {role}
                </div>
                {i < PIPELINE_ROLES.length - 1 && (
                  <span style={S.pipelineArrow}>→</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && <div style={S.errorBox}>✕ {error}</div>}

        {/* Discovery / clarification phase */}
        {(phase === "discovery" || phase === "clarification") && (
          <DiscoveryChat
            onComplete={handleDiscoveryComplete}
            initialProjectId={phase === "clarification" ? (activeProjectId ?? undefined) : undefined}
            clarificationContext={phase === "clarification" ? (clarification ?? undefined) : undefined}
          />
        )}

        {/* Running phase */}
        {phase === "running" && (
          <div style={S.awaiting}>Analyse en cours...</div>
        )}

        {/* Clarification banner — shown in results phase when QA found critical blockers */}
        {phase === "results" && result?.clarification_needed && (
          <div style={{
            margin: "0 0 16px",
            padding: "16px 20px",
            background: "#1a0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column" as const,
            gap: "12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ color: "#f87171", fontWeight: 700, fontSize: "13px", letterSpacing: "0.05em" }}>
                ✕ QA — {result.clarification_needed.verdict.toUpperCase()}
              </span>
              <span style={{ color: "#5a2020", fontSize: "11px" }}>
                {result.clarification_needed.questions.length} blocking question{result.clarification_needed.questions.length > 1 ? "s" : ""} require client input
              </span>
            </div>
            <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column" as const, gap: "6px" }}>
              {result.clarification_needed.questions.map((q, i) => (
                <li key={i} style={{ color: "#c0c0d8", fontSize: "13px", lineHeight: 1.5 }}>
                  {q.question}
                </li>
              ))}
            </ol>
            <button
              onClick={() => setPhase("clarification")}
              style={{
                alignSelf: "flex-start",
                padding: "8px 16px",
                background: "#7f1d1d",
                color: "#fca5a5",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              RE-ENGAGE CLIENT →
            </button>
          </div>
        )}

        {/* Results */}
        {phase === "results" && result && (
          <div style={S.results}>
            <div style={S.metaBar}>
              <span>
                ID <span style={S.metaAccent}>{result.projectId}</span>
              </span>
              <span>·</span>
              <span>{(result.total_duration_ms / 1000).toFixed(1)}s</span>
              <span>·</span>
              <button
                style={T.toggleBtn}
                onClick={() => setShowTokens((v) => !v)}
              >
                {totalTokens.toLocaleString()} tokens {showTokens ? "▲" : "▼"}
              </button>
              <span>·</span>
              <span>{result.field?.tensions.length} tensions written</span>
              <span style={S.metaSpacer} />
              <span style={S.metaSuccess}>
                ✓ {specialistKeys.join(" + ")} + QA complete
              </span>
            </div>

            {showTokens && (
              <div style={T.row}>
                {[...specialistKeys, "qa"].map((k) => {
                  const u =
                    k === "qa"
                      ? result.qa?.usage
                      : result.specialists?.[k]?.usage;
                  return (
                    <div key={k} style={T.cell}>
                      <div style={T.agentLabel}>{k.toUpperCase().replace(/_/g, " ")}</div>
                      <div style={T.tokenRow}>
                        <span style={T.tokenLabel}>IN</span>
                        <span style={T.tokenValueHighlight}>
                          {(u?.inputTokens ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div style={T.tokenRow}>
                        <span style={T.tokenLabel}>OUT</span>
                        <span style={T.tokenValue}>
                          {(u?.outputTokens ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={S.grid}>
              <FieldPanel field={result.field} />
            </div>

            {result.specialists &&
              Object.entries(result.specialists).map(([agentType, spec]) => (
                <BlueprintPanel
                  key={agentType}
                  blueprint={spec?.blueprint as any}
                  label={agentType.replace(/_/g, " ").toUpperCase()}
                />
              ))}
            <AuditPanel audit={result.qa?.audit} />
          </div>
        )}

        {phase === "results" && result?.report && (
          <ReportPanel report={result.report} />
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { RunResult } from "./components/types";
import { MandatePanel } from "./components/MandatePanel";
import { FieldPanel } from "./components/FieldPanel";
import { BlueprintPanel } from "./components/BlueprintPanel";
import { AuditPanel } from "./components/AuditPanel";
import { ReportPanel } from "./components/ReportPanel";
import { DiscoveryChat } from "./components/DiscoveryChat";
import { page as S, tokenBreakdown as T } from "./components/styles";

type Phase = "discovery" | "running" | "results";

const PIPELINE_ROLES = ["CEO", "CTO", "ARCHITECT", "QA LEAD"] as const;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("discovery");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);

  async function handleDiscoveryComplete(projectId: string, brief: string) {
    setPhase("running");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
      setPhase("results");
    } catch (e: any) {
      setError(e.message);
      setPhase("discovery");
    }
  }

  const completedAgents = result
    ? (["ceo", "cto", "architect", "qa"] as const)
        .filter((k) => result[k] != null)
        .map((k) => k.toUpperCase())
    : [];

  const totalTokens = result
    ? (result.ceo.usage.inputTokens ?? 0) +
      (result.ceo.usage.outputTokens ?? 0) +
      (result.cto.usage.inputTokens ?? 0) +
      (result.cto.usage.outputTokens ?? 0) +
      (result.architect.usage.inputTokens ?? 0) +
      (result.architect.usage.outputTokens ?? 0) +
      (result.qa.usage.inputTokens ?? 0) +
      (result.qa.usage.outputTokens ?? 0)
    : 0;

  return (
    <div style={S.root}>
      <div style={S.inner}>
        {/* Header */}
        <div style={S.headerSection}>
          <div style={S.eyebrow}>FREED AGENTS // v0.1</div>
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
                {i < 3 && <span style={S.pipelineArrow}>→</span>}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && <div style={S.errorBox}>✕ {error}</div>}

        {/* Discovery phase */}
        {/* {phase === "discovery" && ( */}
        <DiscoveryChat onComplete={handleDiscoveryComplete} />
        {/* )} */}

        {/* Running phase */}
        {phase === "running" && (
          <div style={S.awaiting}>Analyse en cours...</div>
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
              <span>{result.field.tensions.length} tensions written</span>
              <span style={S.metaSpacer} />
              <span style={S.metaSuccess}>
                ✓ {completedAgents.join(" + ")} complete
              </span>
            </div>

            {showTokens && (
              <div style={T.row}>
                {(["ceo", "cto", "architect", "qa"] as const).map((k) => {
                  const u = result[k]?.usage;
                  return (
                    <div key={k} style={T.cell}>
                      <div style={T.agentLabel}>{k.toUpperCase()}</div>
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
              <MandatePanel mandate={result.ceo.mandate} />
              <FieldPanel field={result.field} />
            </div>

            <BlueprintPanel blueprint={result.architect.blueprint} />
            <AuditPanel audit={result.qa.audit} />
          </div>
        )}

        {phase === "results" && result?.report && (
          <ReportPanel report={result.report} />
        )}
      </div>
    </div>
  );
}

"use client";

import { RunResult } from "./types";
import { ConfidenceBar } from "./ConfidenceBar";
import { blueprintPanel as S } from "./styles";

type Blueprint = NonNullable<RunResult["architect"]>["blueprint"];

export function BlueprintPanel({ blueprint }: { blueprint: Blueprint }) {
  return (
    <div>
      <div style={S.sectionLabel}>ARCHITECTURE BLUEPRINT</div>

      <div style={S.summary}>{blueprint?.summary}</div>

      {/* Components */}
      {(blueprint?.components ?? []).length > 0 && (
        <>
          <div style={S.subLabel}>COMPONENTS</div>
          <div style={S.componentGrid}>
            {blueprint?.components?.map((c) => (
              <div key={c.name} style={S.componentCard(c.type)}>
                <div style={S.componentType(c.type)}>
                  {c.type.toUpperCase()}
                </div>
                <div style={S.componentName}>{c.name}</div>
                <div style={S.componentResp}>{c.responsibility}</div>
                <ConfidenceBar value={c.confidence} size="sm" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Data model */}
      {(blueprint?.data_model ?? [])?.length > 0 && (
        <>
          <div style={S.subLabel}>DATA MODEL</div>
          <div style={S.entityList}>
            {blueprint?.data_model?.map((e) => (
              <div key={e.entity} style={S.entityCard}>
                <div style={S.entityName}>{e.entity}</div>
                <div style={S.entityMeta}>{e.fields.join(" · ")}</div>
                {e.relations.length > 0 && (
                  <div
                    style={{
                      ...S.entityMeta,
                      marginTop: "3px",
                      color: "#6c63ff",
                    }}
                  >
                    {e.relations.join(" · ")}
                  </div>
                )}
                {e.notes && (
                  <div
                    style={{
                      ...S.entityMeta,
                      marginTop: "4px",
                      fontStyle: "italic",
                    }}
                  >
                    {e.notes}
                  </div>
                )}
                <div style={{ marginTop: "6px" }}>
                  <ConfidenceBar value={e.confidence} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* API contracts */}
      {(blueprint?.api_contracts ?? []).length > 0 && (
        <>
          <div style={S.subLabel}>API CONTRACTS</div>
          <div style={S.contractList}>
            {blueprint?.api_contracts?.map((c, i) => (
              <div key={i} style={S.contractRow}>
                <span style={S.contractMethod(c.method)}>{c.method}</span>
                <span style={S.contractEndpoint}>{c.endpoint}</span>
                <span style={S.contractPurpose}>{c.purpose}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Risks */}
      {(blueprint?.risks ?? []).length > 0 && (
        <>
          <div style={S.subLabel}>RISKS</div>
          <div style={S.riskList}>
            {blueprint?.risks?.map((r, i) => (
              <div key={i} style={S.riskCard(r.severity)}>
                <div style={S.riskArea}>{r.area}</div>
                <div style={S.riskDesc}>{r.description}</div>
                <div style={S.riskMitigation}>↳ {r.mitigation}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Blockers */}
      {(blueprint?.blockers ?? []).length > 0 && (
        <>
          <div style={S.subLabel}>BLOCKERS</div>
          <div style={S.blockerList}>
            {blueprint?.blockers?.map((b, i) => (
              <div key={i} style={S.blockerCard}>
                <div style={S.blockerDecision}>✕ {b.decision}</div>
                <div style={S.blockerReason}>blocked by: {b.blocked_by}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

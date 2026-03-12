/**
 * FREED AGENTS — OntoStore
 *
 * Replaces the old field-store.ts stub.
 * Wraps the real OntoEngine + OntoBuilder from onto/onto-engine.ts.
 *
 * Responsibilities:
 *  - Maintain one Field per projectId (in-memory Phase 1, Mongo Phase 2)
 *  - Convert TensionInput (agent JSON) → real Onto Tension
 *  - Run equilibration via the real OntoEngine
 *  - Expose a read/write surface for the AgentRunner tools
 */

import {
  Field,
  Tension,
  TensionId,
  KnowledgeId,
  SituatedKnowledge,
  Confidence,
  Equilibrium,
  OntoBuilder,
  OntoEngine,
  Doubt,
  ResolutionPath,
} from "@/lib/onto/onto-engine";

import { AgentRole, TensionInput } from "@/core/types";

// ═══════════════════════════════════════════════════════════════
// FIELD SNAPSHOT — what agents read via read_field tool
// (serializable JSON, not Map-based Onto internals)
// ═══════════════════════════════════════════════════════════════

export interface FieldSnapshot {
  projectId: string;
  globalConfidence: number;
  summary: string;
  tensions: Array<{
    id: string;
    wants: string;
    state: string;
    confidence: number;
    value: unknown;
    doubts: Array<{ about: string; severity: string }>;
    pendingOn: string[];
    linkedTo: string[];
  }>;
}

// ═══════════════════════════════════════════════════════════════
// INTERFACE
// ═══════════════════════════════════════════════════════════════

export interface IOntoStore {
  create(projectId: string, brief: string): Promise<void>;
  snapshot(projectId: string): Promise<FieldSnapshot>;
  upsertTensions(
    projectId: string,
    inputs: TensionInput[],
    by: AgentRole,
  ): Promise<FieldSnapshot>;
  equilibrate(projectId: string): Promise<Equilibrium>;
  getOwner(projectId: string, tensionId: string): AgentRole | undefined;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function snapConfidence(value: number): Confidence {
  const snapped = Math.max(0.1, Math.min(1.0, Math.round(value * 10) / 10));
  return snapped as Confidence;
}

function inputToTension(input: TensionInput, by: AgentRole): Tension {
  const confidence = snapConfidence(input.confidence);

  const doubts: Doubt[] = (input.doubts ?? []).map((d) => ({
    about: d.about,
    severity: d.severity ?? "medium",
    blocksPath: d.blocksPath,
  }));

  // Build a resolution space from what the agent declared.
  // Confidence >= 0.75 → success path. Else partial with pendingOn as missing info.
  const resolves: ResolutionPath[] =
    confidence >= 0.75
      ? [
          {
            kind: "success",
            outcome: input.value,
            confidence,
            risk: confidence >= 0.9 ? "low" : "medium",
          },
        ]
      : [
          {
            kind: "partial",
            outcome: input.value,
            confidence,
            missing: doubts.map((d) => d.about),
            pendingOn: input.pendingOn ?? [],
          },
        ];

  // Blocking doubts force a blocked path
  const blockingDoubt = doubts.find((d) => d.severity === "blocking");
  if (blockingDoubt) {
    resolves.push({
      kind: "blocked",
      blockedBy: blockingDoubt.about,
      liftWhen: `doubt "${blockingDoubt.about}" resolved`,
    });
  }

  const knowledge = new Map<KnowledgeId, SituatedKnowledge>();
  if (input.value !== undefined && input.value !== null) {
    knowledge.set("value" as KnowledgeId, {
      value: input.value,
      origin: { source: by, timestamp: Date.now(), method: "asserted" },
      confidence,
      validUntil: { type: "permanent" },
    });
  }

  return {
    id: input.id as TensionId,
    wants: { description: input.wants, priority: 0.5 },
    knows: knowledge,
    doubts,
    linkedTo: (input.linkedTo ?? []) as TensionId[],
    resolves,
    state: { phase: "dormant" },
    trace: [],
  };
}

function fieldToSnapshot(
  projectId: string,
  field: Field,
  eq: Equilibrium,
): FieldSnapshot {
  const tensions = [...field.tensions.values()].map((t) => {
    const resolution = eq.resolved.get(t.id);
    const state = resolution
      ? "resolved"
      : eq.partial.has(t.id)
        ? "partial"
        : eq.blocked.has(t.id)
          ? "blocked"
          : eq.resisting.has(t.id)
            ? "resisting"
            : "active";

    const confidence = resolution
      ? Number(resolution.confidence)
      : (eq.partial.get(t.id)?.confidence ?? 0.1);

    const value =
      resolution?.path.kind === "success"
        ? resolution.path.outcome
        : (eq.partial.get(t.id)?.outcome ?? null);

    return {
      id: String(t.id),
      wants: t.wants.description,
      state,
      confidence,
      value,
      doubts: t.doubts.map((d) => ({ about: d.about, severity: d.severity })),
      pendingOn: eq.partial.get(t.id)?.pendingOn ?? [],
      linkedTo: t.linkedTo.map(String),
    };
  });

  const resolvedCount = eq.resolved.size;
  const partialCount = eq.partial.size;
  const blockedCount = eq.blocked.size;
  const resistingCount = eq.resisting.size;
  const parts = [
    resolvedCount > 0 ? `${resolvedCount} resolved` : null,
    partialCount > 0 ? `${partialCount} partial` : null,
    blockedCount > 0 ? `${blockedCount} blocked` : null,
    resistingCount > 0 ? `${resistingCount} resisting` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    projectId,
    globalConfidence: Number(eq.confidence),
    summary: parts || "Field empty",
    tensions,
  };
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY IMPLEMENTATION — Phase 1
// ═══════════════════════════════════════════════════════════════

export class InMemoryOntoStore implements IOntoStore {
  private fields = new Map<string, Field>();
  private engine = new OntoEngine();
  private ownership = new Map<string, AgentRole>(); // `${projectId}:${tensionId}` → AgentRole

  async create(projectId: string, _brief: string): Promise<void> {
    // Clear any existing data for this project (handles singleton reuse + cross-run pollution)
    if (this.fields.has(projectId)) {
      for (const key of this.ownership.keys()) {
        if (key.startsWith(`${projectId}:`)) {
          this.ownership.delete(key);
        }
      }
    }
    this.fields.set(projectId, {
      tensions: new Map(),
      sharedKnowledge: new Map(),
      perspectives: new Map(),
    });
  }

  private getField(projectId: string): Field {
    const field = this.fields.get(projectId);
    if (!field) throw new Error(`No field for project: ${projectId}`);
    return field;
  }

  async snapshot(projectId: string): Promise<FieldSnapshot> {
    const field = this.getField(projectId);
    const eq = this.engine.equilibrate(field);
    return fieldToSnapshot(projectId, field, eq);
  }

  async upsertTensions(
    projectId: string,
    inputs: TensionInput[],
    by: AgentRole,
  ): Promise<FieldSnapshot> {
    const field = this.getField(projectId);

    for (const input of inputs) {
      const ownerKey = `${projectId}:${input.id}`;
      const existingOwner = this.ownership.get(ownerKey);

      if (existingOwner && existingOwner !== by) {
        throw new Error(
          `Agent '${by}' cannot overwrite tension '${input.id}' owned by '${existingOwner}'. ` +
          `Use a namespaced id like '${by}_challenge_${input.id}' instead.`,
        );
      }

      if (!existingOwner) {
        this.ownership.set(ownerKey, by);
      }

      const tension = inputToTension(input, by);
      field.tensions.set(tension.id, tension);
    }

    const eq = this.engine.equilibrate(field);
    return fieldToSnapshot(projectId, field, eq);
  }

  async equilibrate(projectId: string): Promise<Equilibrium> {
    const field = this.getField(projectId);
    return this.engine.equilibrate(field);
  }

  getOwner(projectId: string, tensionId: string): AgentRole | undefined {
    return this.ownership.get(`${projectId}:${tensionId}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MONGO IMPLEMENTATION — Phase 2 (stub)
// ═══════════════════════════════════════════════════════════════

export class MongoOntoStore implements IOntoStore {
  constructor(_mongoDb: unknown) {
    // TODO Phase 2: wire onto-persistence.ts + onto-mongo-store.ts
    console.warn(
      "[MongoOntoStore] not yet wired — falling back should be handled by createStore()",
    );
  }

  async create(_projectId: string, _brief: string): Promise<void> {
    throw new Error("MongoOntoStore not yet implemented");
  }

  async snapshot(_projectId: string): Promise<FieldSnapshot> {
    throw new Error("MongoOntoStore not yet implemented");
  }

  async upsertTensions(
    _projectId: string,
    _inputs: TensionInput[],
    _by: AgentRole,
  ): Promise<FieldSnapshot> {
    throw new Error("MongoOntoStore not yet implemented");
  }

  async equilibrate(_projectId: string): Promise<Equilibrium> {
    throw new Error("MongoOntoStore not yet implemented");
  }

  getOwner(_projectId: string, _tensionId: string): AgentRole | undefined {
    throw new Error("MongoOntoStore not yet implemented");
  }
}

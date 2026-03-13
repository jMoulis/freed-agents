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
  OntoEngine,
  Doubt,
  ResolutionPath,
  PerspectiveView,
} from "@/lib/onto/onto-engine";
import { getDb } from "@/lib/mongodb";
import { AgentRole, TensionInput } from "@/core/types";
import { COLLECTION_PROJECTS, DB_NAME } from "@/config/COLLECTIONS";

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
    knowledge.set(input.id as KnowledgeId, {
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
    const preResolution =
      t.state.phase === "equilibrated" ? t.state.result : undefined;
    const resolution = eq.resolved.get(t.id) ?? preResolution;

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

  const resolvedCount = [...field.tensions.values()].filter(
    (t) => eq.resolved.has(t.id) || t.state.phase === "equilibrated",
  ).length;
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

  // Compute globalConfidence from the snapshot tensions, not eq.confidence.
  // eq.confidence is 0 when tensions were already equilibrated in a prior call
  // (the engine skips pre-equilibrated tensions on re-entry), causing snapshot()
  // to return 0 even when the field is fully resolved. Deriving from snapshot
  // state mirrors computeFieldConfidence() but is always accurate.
  const resolvedSnapTensions = tensions.filter((t) => t.state === "resolved");
  const globalConfidence =
    resolvedSnapTensions.length > 0 && tensions.length > 0
      ? (resolvedSnapTensions.reduce((sum, t) => sum + t.confidence, 0) /
          resolvedSnapTensions.length) *
        (resolvedSnapTensions.length / tensions.length)
      : 0;

  return {
    projectId,
    globalConfidence,
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
// MONGO SERIALIZATION HELPERS
// ═══════════════════════════════════════════════════════════════

type SerializedTension = Omit<Tension, "knows"> & {
  knows: [string, SituatedKnowledge][];
};

type SerializedPerspective = Omit<PerspectiveView, "knows"> & {
  knows: [string, SituatedKnowledge][];
};

interface SerializedField {
  tensions: [string, SerializedTension][];
  sharedKnowledge: [string, SituatedKnowledge][];
  perspectives: [string, SerializedPerspective][];
}

interface ProjectDoc {
  projectId: string;
  field: SerializedField;
  ownership: Record<string, string>; // tensionId → AgentRole
  updatedAt: Date;
}

function serializeTension(t: Tension): SerializedTension {
  return { ...t, knows: [...t.knows.entries()] };
}

function deserializeTension(s: SerializedTension): Tension {
  return {
    ...s,
    knows: new Map(s.knows) as Map<KnowledgeId, SituatedKnowledge>,
  };
}

function serializeField(f: Field): SerializedField {
  return {
    tensions: [...f.tensions.entries()].map(([k, v]) => [
      k,
      serializeTension(v),
    ]),
    sharedKnowledge: [...f.sharedKnowledge.entries()],
    perspectives: [...f.perspectives.entries()].map(([k, v]) => [
      k,
      { ...v, knows: [...v.knows.entries()] },
    ]),
  };
}

function deserializeField(s: SerializedField): Field {
  return {
    tensions: new Map(
      s.tensions.map(([k, v]) => [k as TensionId, deserializeTension(v)]),
    ),
    sharedKnowledge: new Map(s.sharedKnowledge) as Map<
      KnowledgeId,
      SituatedKnowledge
    >,
    perspectives: new Map(
      s.perspectives.map(([k, v]) => [
        k,
        {
          ...v,
          knows: new Map(v.knows) as Map<KnowledgeId, SituatedKnowledge>,
        },
      ]),
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
// MONGO IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════

const COLLECTION = COLLECTION_PROJECTS;

export class MongoOntoStore implements IOntoStore {
  private engine = new OntoEngine();
  private ownershipCache = new Map<string, AgentRole>();

  private async col() {
    const db = await getDb(DB_NAME);
    return db.collection<ProjectDoc>(COLLECTION);
  }

  private async loadProject(
    projectId: string,
  ): Promise<{ field: Field; ownership: Record<string, string> }> {
    const col = await this.col();
    const doc = await col.findOne({ projectId });
    if (!doc) throw new Error(`No field for project: ${projectId}`);
    for (const [tensionId, role] of Object.entries(doc.ownership)) {
      this.ownershipCache.set(`${projectId}:${tensionId}`, role as AgentRole);
    }
    return { field: deserializeField(doc.field), ownership: doc.ownership };
  }

  async create(projectId: string, _brief: string): Promise<void> {
    const col = await this.col();
    const emptyField: SerializedField = {
      tensions: [],
      sharedKnowledge: [],
      perspectives: [],
    };
    await col.replaceOne(
      { projectId },
      { projectId, field: emptyField, ownership: {}, updatedAt: new Date() },
      { upsert: true },
    );
    for (const key of this.ownershipCache.keys()) {
      if (key.startsWith(`${projectId}:`)) this.ownershipCache.delete(key);
    }
  }

  async snapshot(projectId: string): Promise<FieldSnapshot> {
    const { field } = await this.loadProject(projectId);
    const eq = this.engine.equilibrate(field);
    return fieldToSnapshot(projectId, field, eq);
  }

  async upsertTensions(
    projectId: string,
    inputs: TensionInput[],
    by: AgentRole,
  ): Promise<FieldSnapshot> {
    const col = await this.col();
    const { field, ownership } = await this.loadProject(projectId);

    for (const input of inputs) {
      const existingOwner = ownership[input.id];
      if (existingOwner && existingOwner !== by) {
        throw new Error(
          `Agent '${by}' cannot overwrite tension '${input.id}' owned by '${existingOwner}'. ` +
            `Use a namespaced id like '${by}_challenge_${input.id}' instead.`,
        );
      }
      if (!existingOwner) {
        ownership[input.id] = by;
        this.ownershipCache.set(`${projectId}:${input.id}`, by);
      }
      const tension = inputToTension(input, by);
      field.tensions.set(tension.id, tension);
    }

    const eq = this.engine.equilibrate(field);
    await col.replaceOne(
      { projectId },
      {
        projectId,
        field: serializeField(field),
        ownership,
        updatedAt: new Date(),
      },
      { upsert: true },
    );
    return fieldToSnapshot(projectId, field, eq);
  }

  async equilibrate(projectId: string): Promise<Equilibrium> {
    const { field } = await this.loadProject(projectId);
    return this.engine.equilibrate(field);
  }

  getOwner(projectId: string, tensionId: string): AgentRole | undefined {
    return this.ownershipCache.get(`${projectId}:${tensionId}`);
  }
}

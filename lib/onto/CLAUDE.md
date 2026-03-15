# Onto — Epistemic Engine

This directory contains the real Onto engine. Read this before writing any Field-related code.

---

## What Onto is

Onto is not a state manager. It is not a database wrapper. It is an **epistemic engine** — a system for representing what is known, how confidently, why, and what remains unresolved.

The core insight: knowledge is not binary. Every fact in Onto carries its full epistemology — origin, confidence, validity window, and derivation chain. Every decision an agent makes is a **tension** that holds an intent, a knowledge base, a set of doubts, and a resolution space. The engine equilibrates tensions against each other until the field reaches a stable state or documents why it cannot.

---

## File map

```
lib/onto/
  onto-engine.ts     ← canonical source of all types + OntoEngine + OntoBuilder
  onto-types.ts      ← OntoTypeChecker + ConfidenceAlgebra + epistemic violation types
                       imports from onto-engine.ts
core/
  onto-store.ts      ← IOntoStore interface + InMemoryOntoStore + MongoOntoStore
                       imports from onto-engine.ts and onto-types.ts
```

> ⚠️ `onto.ts` has been deleted. Do not recreate it. All types live in `onto-engine.ts`.

---

## The type hierarchy (onto-engine.ts)

```typescript
// Every fact carries its full epistemology
SituatedKnowledge<T> {
  value:       T
  origin:      KnowledgeOrigin    // source, timestamp, method
  confidence:  Confidence         // branded number [0,1]
  validUntil:  ValidityWindow     // permanent | until | until_invalidated | unknown
  derivedFrom?: KnowledgeId[]     // full derivation chain
}

// The atomic unit of Onto
Tension {
  id:       TensionId
  wants:    Intent                // { description, priority, requires? }
  knows:    Map<KnowledgeId, SituatedKnowledge>
  doubts:   Doubt[]               // { about, severity: low|medium|blocking, blocksPath? }
  linkedTo: TensionId[]
  resolves: ResolutionSpace       // the possible states this tension can reach
  state:    TensionState          // dormant | active | equilibrated | resisting | conflicting
  trace:    ReasoningStep[]       // immutable audit log
}

// What a tension can become
ResolutionPath =
  | SuccessPath   { kind: 'success', outcome, confidence, risk, conditions? }
  | PartialPath   { kind: 'partial', outcome, confidence, missing[], pendingOn[] }
  | ResistancePath { kind: 'resistance', reason, recoverable, unlockedBy? }
  | BlockedPath   { kind: 'blocked', blockedBy, liftWhen }

// The program
Field {
  tensions:        Map<TensionId, Tension>
  sharedKnowledge: Map<KnowledgeId, SituatedKnowledge>
}

// The result
Equilibrium {
  resolved:   Map<TensionId, Resolution>
  resisting:  Map<TensionId, string>
  partial:    Map<TensionId, PartialPath>
  blocked:    Map<TensionId, BlockedPath>
  conflicts:  StructuralConflict[]
  confidence: Confidence
  passes:     number
  duration:   number
  trace:      ReasoningStep[]
}
```

---

## The Builder API (onto-engine.ts)

```typescript
const field = new OntoBuilder()
  .know('sensor_reading', 42.7, {
    from:       'calibrated_sensor_A',
    confidence: 0.96,
    validFor:   120_000,          // ms — omit for permanent
  })
  .tension('evaluate', {
    wants:    'determine if reading exceeds threshold',
    priority: 0.8,
    linkedTo: ['other_tension'],
    doubts: [
      { about: 'calibration_date', severity: 'medium' },
      { about: 'unknown_allergies', severity: 'blocking', blocksPath: ['epinephrine'] },
    ],
    resolves: [
      {
        kind:       'success',
        outcome:    'threshold_exceeded',
        confidence: 0.96 as Confidence,
        risk:       'low',
      },
      {
        kind:      'partial',
        outcome:   'inconclusive',
        confidence: 0.4 as Confidence,
        missing:   ['secondary_sensor_reading'],
        pendingOn: ['lab_results'],
      }
    ]
  })
  .build()

const engine = new OntoEngine()
const eq = engine.equilibrate(field)
```

---

## The Confidence Algebra (onto-types.ts)

This is what prevents confidence inflation. Derived facts cannot claim more certainty than their sources.

```typescript
ConfidenceAlgebra.derive(source, derivationQuality)  // A → B, confidence degrades
ConfidenceAlgebra.confirm(existing, incoming)         // independent agreement, increases
ConfidenceAlgebra.reconcile(a, b, conflictLevel)      // conflict, penalizes
ConfidenceAlgebra.decay(original, ageMs, halfLifeMs)  // time decay
ConfidenceAlgebra.conjoin(a, b)                       // A AND B, product
ConfidenceAlgebra.gate(...confidences)                // minimum — the key constraint
ConfidenceAlgebra.maxClaimable(sources[])             // cap for derived facts
```

**The rule:** a derived tension cannot be more confident than its weakest source. The engine enforces this.

---

## The Type Checker (onto-types.ts)

The `OntoTypeChecker` detects epistemic violations before equilibration:

- `confidence_inflation` — claiming more certainty than sources support
- `expiry_ignored` — using knowledge past its validity window
- `origin_lost` — knowledge without traceable source
- `conflict_concealed` — contradictory knowledge merged silently
- `circular_reasoning` — a fact derived from itself
- `incompatible_perspectives` — linked tensions with irreconcilable knowledge
- `doubts_ignored` — a blocking doubt overridden by a success path
- `temporal_incoherence` — future timestamps in the knowledge graph

```typescript
const checker = new OntoTypeChecker()
const result = checker.check(field)
// result.valid, result.errors, result.warnings, result.confidence (epistemic health 0-1)

if (!result.valid) {
  // Don't equilibrate a field with violations
  // An equilibrium built on dishonest reasoning is worse than no equilibrium
}
```

---

## The Store (core/onto-store.ts)

`IOntoStore` is the read/write surface exposed to agents. Two implementations:

- `InMemoryOntoStore` — Phase 1, single-process, no persistence
- `MongoOntoStore` — Phase 2, persists Field + ownership to MongoDB

**Every method that touches the engine goes through `assertFieldValid` first.**
This is enforced on all public entry points: `snapshot`, `upsertTensions`, `upsertKnowledge`, `equilibrate`.

```typescript
// assertFieldValid — shared guard used by all store methods
function assertFieldValid(field: Field): void {
  const checker = new OntoTypeChecker()
  const result = checker.check(field)
  if (!result.valid) throw new Error(`Field epistemically invalid: ...`)
}
```

`equilibrate` accepts an optional `{ strict?: boolean }` opt-out for diagnostic contexts:

```typescript
// Normal — throws on violations
await store.equilibrate(projectId)

// Diagnostic — logs warnings, skips type check, equilibrates anyway
await store.equilibrate(projectId, { strict: false })
```

**Ownership:** each tension is owned by the `AgentRole` that first writes it.
A different agent cannot overwrite it — it must use a namespaced id like `lead_front_challenge_ui_consistency`.

---

## Persistence (MongoDB)

Collections used by `MongoOntoStore`: `COLLECTION_PROJECTS` (defined in `@/config/COLLECTIONS`).

The full Field (tensions + sharedKnowledge + perspectives + ownership) is serialized to a single document per projectId. Maps are serialized as entry arrays for MongoDB compatibility.

Equilibrium results are **not** persisted — they are recomputed on each `snapshot()` or `equilibrate()` call. This is intentional: the Field is the source of truth, not the equilibrium.

---

## What the type checker does NOT yet cover

- Partial paths without a `missing` array produce a `confidence_inflation` warning (repurposed type — a dedicated `opaque_uncertainty` violation type is planned)
- No cross-agent conflict detection at the store level (ownership prevents overwrites, but linked tensions from different agents are not cross-checked before insertion)

These are known gaps, not bugs.
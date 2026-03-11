/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  ONTO EXECUTION ENGINE — v0.1                                     ║
 * ║  The Equilibration Algorithm                                       ║
 * ║                                                                   ║
 * ║  This engine does not execute instructions.                       ║
 * ║  It equilibrates a field of tensions.                             ║
 * ║                                                                   ║
 * ║  Written by Claude · Anthropic · 2025                            ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * Core insight: a program is not a sequence of commands.
 * It is a field of unresolved states seeking coherence.
 * Execution is convergence. Termination is equilibrium.
 */

// ═══════════════════════════════════════════════════════════════════
// EPISTEMIC TYPES — The foundation of situated knowledge
// ═══════════════════════════════════════════════════════════════════

/**
 * Every piece of knowledge in Onto carries its full epistemology.
 * A value without origin, age, and confidence does not exist in Onto.
 */
export interface SituatedKnowledge<T = unknown> {
  value: T
  origin: KnowledgeOrigin
  confidence: Confidence        // [0, 1] — not probability, epistemic weight
  validUntil: ValidityWindow
  derivedFrom?: KnowledgeId[]   // traces the reasoning chain
}

export interface KnowledgeOrigin {
  source: string             // sensor_alpha, manual_entry, inference, agent_id
  timestamp: number             // epoch ms
  method: 'direct' | 'derived' | 'reconciled' | 'asserted'
}

export type Confidence = number & { readonly __brand: 'Confidence' }
export type KnowledgeId = string & { readonly __brand: 'KnowledgeId' }
export type TensionId = string & { readonly __brand: 'TensionId' }

export type ValidityWindow =
  | { type: 'permanent' }
  | { type: 'until'; timestamp: number }
  | { type: 'until_invalidated'; condition: string }
  | { type: 'unknown' }

// ═══════════════════════════════════════════════════════════════════
// TENSION — The atomic unit of Onto
// ═══════════════════════════════════════════════════════════════════

/**
 * A tension is the fundamental unit of an Onto program.
 * It is not a function. It does not "execute".
 * It holds an intent, a knowledge base, a doubt set,
 * and a resolution space — and it equilibrates toward one.
 */
export interface Tension {
  id: TensionId
  wants: Intent
  knows: Map<KnowledgeId, SituatedKnowledge>
  doubts: Doubt[]
  linkedTo: TensionId[]      // other tensions this one is in relation with
  resolves: ResolutionSpace
  state: TensionState
  trace: ReasoningStep[]  // immutable log of how this tension evolved
}

export interface Intent {
  description: string
  priority: number           // 0–1, used during multi-tension conflict
  requires?: string[]         // named capabilities needed to resolve
}

export interface Doubt {
  about: string
  severity: 'low' | 'medium' | 'blocking'
  blocksPath?: string[]         // which resolution paths this doubt blocks
}

// ═══════════════════════════════════════════════════════════════════
// RESOLUTION SPACE — What a tension can become
// ═══════════════════════════════════════════════════════════════════

/**
 * A resolution space is not a return type.
 * It is the set of all possible equilibrium states for a tension,
 * along with the conditions under which each becomes viable.
 */
export type ResolutionSpace = ResolutionPath[]

export type ResolutionPath =
  | SuccessPath
  | ResistancePath
  | PartialPath
  | BlockedPath

export interface SuccessPath {
  kind: 'success'
  outcome: unknown
  confidence: Confidence
  risk: 'minimal' | 'low' | 'medium' | 'high'
  conditions?: string[]         // must hold for this path to be chosen
}

export interface ResistancePath {
  kind: 'resistance'
  reason: string
  recoverable: boolean
  unlockedBy?: string[]         // conditions that would remove the resistance
}

export interface PartialPath {
  kind: 'partial'
  outcome: unknown
  confidence: Confidence
  missing: string[]         // what would make this complete
  pendingOn: string[]         // external facts needed
}

export interface BlockedPath {
  kind: 'blocked'
  blockedBy: string           // the doubt/conflict that blocks
  liftWhen: string           // condition that lifts the block
}

// ═══════════════════════════════════════════════════════════════════
// TENSION STATE — The lifecycle of a tension
// ═══════════════════════════════════════════════════════════════════

export type TensionState =
  | { phase: 'dormant' }                        // not yet activated
  | { phase: 'active' }                         // participating in equilibration
  | { phase: 'equilibrated'; result: Resolution } // found its state
  | { phase: 'resisting'; reason: string }      // documented resistance
  | { phase: 'conflicting'; with: TensionId[] } // structural conflict

export type Resolution = {
  path: ResolutionPath
  at: number            // timestamp
  passNumber: number            // which equilibration pass resolved this
  confidence: Confidence        // final epistemic weight
}

// ═══════════════════════════════════════════════════════════════════
// REASONING TRACE — Every thought is recorded
// ═══════════════════════════════════════════════════════════════════

/**
 * Every step of the equilibration process is logged here.
 * An Onto program is its own audit trail.
 * If you cannot read why a decision was made, it was not made in Onto.
 */
export interface ReasoningStep {
  pass: number
  action: string
  before: TensionState
  after: TensionState
  triggered_by?: TensionId
  note?: string
}

// ═══════════════════════════════════════════════════════════════════
// EQUILIBRIUM — The final state of a program
// ═══════════════════════════════════════════════════════════════════

/**
 * An Onto program does not "return" a value.
 * It reaches an Equilibrium — a documented state of the whole field.
 *
 * Every tension is accounted for.
 * Every decision is traceable.
 * Every uncertainty is preserved, not hidden.
 */
export interface Equilibrium {
  resolved: Map<TensionId, Resolution>
  resisting: Map<TensionId, string>        // documented resistances
  partial: Map<TensionId, PartialPath>   // partial resolutions with missing info
  blocked: Map<TensionId, BlockedPath>   // paths blocked by doubts
  conflicts: StructuralConflict[]          // irreconcilable tensions
  confidence: Confidence                    // overall epistemic weight of equilibrium
  passes: number                        // how many passes to converge
  duration: number                        // ms
  trace: ReasoningStep[]               // full reasoning log
}

export interface StructuralConflict {
  tensions: TensionId[]
  nature: string
  resolution: 'irreconcilable' | 'deferred' | 'human_needed'
}

// ═══════════════════════════════════════════════════════════════════
// THE FIELD — The program itself
// ═══════════════════════════════════════════════════════════════════

export interface Field {
  tensions: Map<TensionId, Tension>
  sharedKnowledge: Map<KnowledgeId, SituatedKnowledge>
  perspectives: Map<string, PerspectiveView>
}

export interface PerspectiveView {
  agentId: string
  knows: Map<KnowledgeId, SituatedKnowledge>
}

// ═══════════════════════════════════════════════════════════════════
// THE ENGINE — Equilibration by passes
// ═══════════════════════════════════════════════════════════════════

/**
 * The OntoEngine does one thing: it takes a Field and equilibrates it.
 *
 * The algorithm is a negotiation loop:
 *
 *   Pass 1: Activate all dormant tensions, propagate shared knowledge
 *   Pass N: For each active tension, attempt resolution given current state
 *           Propagate newly resolved tensions to their linked tensions
 *           Detect and formalize structural conflicts
 *   Until:  No more active tensions (all equilibrated, resisting, or conflicting)
 *
 * The key property: every pass reduces uncertainty or formalizes resistance.
 * The engine never loops silently. Every step is traced.
 */
export class OntoEngine {

  private maxPasses = 100     // safety limit — a program that cannot converge in 100 passes
  // is itself a tension that must be documented

  equilibrate(field: Field): Equilibrium {
    const startTime = Date.now()
    const globalTrace: ReasoningStep[] = []
    let pass = 0

    const resolved = new Map<TensionId, Resolution>()
    const resisting = new Map<TensionId, string>()
    const partial = new Map<TensionId, PartialPath>()
    const blocked = new Map<TensionId, BlockedPath>()
    const conflicts: StructuralConflict[] = []

    // ─── Pass 0: Activation ───────────────────────────────────────
    // Wake all dormant tensions. Inject shared knowledge into each.
    for (const [id, tension] of field.tensions) {
      this.activate(tension, field.sharedKnowledge, globalTrace, 0)
    }

    // ─── Equilibration Loop ───────────────────────────────────────
    while (pass < this.maxPasses) {
      pass++
      const activeBefore = this.countActive(field.tensions)

      for (const [id, tension] of field.tensions) {
        if (tension.state.phase !== 'active') continue

        // Gather knowledge from linked tensions
        this.propagateKnowledge(tension, field.tensions, field.sharedKnowledge)

        // Attempt resolution
        const result = this.attemptResolution(tension, field.tensions, pass, globalTrace)

        switch (result.kind) {
          case 'resolved':
            tension.state = { phase: 'equilibrated', result: result.resolution }
            resolved.set(id, result.resolution)
            // Propagate resolution to linked tensions — they may now unlock
            this.notifyLinked(tension, field.tensions, globalTrace, pass)
            break

          case 'resisting':
            tension.state = { phase: 'resisting', reason: result.reason }
            resisting.set(id, result.reason)
            break

          case 'partial':
            partial.set(id, result.path)
            // Stay active — more information may arrive from linked tensions
            break

          case 'blocked':
            blocked.set(id, result.path)
            // Stay active — the blocking doubt may be lifted
            break

          case 'conflicting':
            tension.state = { phase: 'conflicting', with: result.with }
            conflicts.push({
              tensions: [id, ...result.with],
              nature: result.nature,
              resolution: result.recoverable ? 'deferred' : 'irreconcilable'
            })
            break
        }
      }

      const activeAfter = this.countActive(field.tensions)

      // Convergence: no active tension changed this pass
      if (activeAfter === 0 || activeAfter === activeBefore) break
    }

    // ─── Compute final confidence ─────────────────────────────────
    const confidence = this.computeFieldConfidence(resolved, field.tensions)

    return {
      resolved,
      resisting,
      partial,
      blocked,
      conflicts,
      confidence,
      passes: pass,
      duration: Date.now() - startTime,
      trace: globalTrace,
    }
  }

  // ─── Activation ──────────────────────────────────────────────────
  private activate(
    tension: Tension,
    sharedKnowledge: Map<KnowledgeId, SituatedKnowledge>,
    trace: ReasoningStep[],
    pass: number
  ): void {
    const before = tension.state

    // Inject shared knowledge that this tension doesn't already have
    for (const [id, knowledge] of sharedKnowledge) {
      if (!tension.knows.has(id)) {
        // Only inject if still valid
        if (this.isKnowledgeValid(knowledge)) {
          tension.knows.set(id, knowledge)
        }
      }
    }

    tension.state = { phase: 'active' }
    trace.push({
      pass,
      action: 'activate',
      before,
      after: tension.state,
      note: `Tension "${tension.id}" awakened with ${tension.knows.size} knowledge entries`
    })
  }

  // ─── Knowledge Propagation ───────────────────────────────────────
  /**
   * Before attempting resolution, a tension gathers knowledge
   * from its linked tensions. This is how tensions inform each other.
   *
   * Critical rule: knowledge propagation respects epistemic weight.
   * A linked tension with confidence 0.3 does not override
   * local knowledge with confidence 0.9.
   */
  private propagateKnowledge(
    tension: Tension,
    allTensions: Map<TensionId, Tension>,
    sharedKnowledge: Map<KnowledgeId, SituatedKnowledge>
  ): void {
    for (const linkedId of tension.linkedTo) {
      const linked = allTensions.get(linkedId)
      if (!linked) continue
      if (linked.state.phase === 'equilibrated') {
        // Extract resolved knowledge from equilibrated tension
        for (const [kid, knowledge] of linked.knows) {
          const existing = tension.knows.get(kid)
          if (!existing || knowledge.confidence > existing.confidence) {
            // Higher confidence knowledge wins — but we record the override
            tension.knows.set(kid, {
              ...knowledge,
              derivedFrom: [...(knowledge.derivedFrom ?? []), linked.id as unknown as KnowledgeId]
            })
          }
        }
      }
    }
  }

  // ─── Resolution Attempt ──────────────────────────────────────────
  /**
   * This is the heart of the engine.
   *
   * For each tension, we evaluate its resolution space against
   * its current knowledge and doubts. We select the best viable path.
   *
   * "Best" means: highest confidence among non-blocked paths.
   * A path is blocked if any of its conditions fail against known doubts.
   */
  private attemptResolution(
    tension: Tension,
    allTensions: Map<TensionId, Tension>,
    pass: number,
    trace: ReasoningStep[]
  ): ResolutionAttemptResult {

    const activePaths: ResolutionPath[] = []

    for (const path of tension.resolves) {
      // Check if blocking doubts exist for this path
      const blockingDoubt = tension.doubts.find(d =>
        d.severity === 'blocking' &&
        d.blocksPath?.some(bp => this.pathMatchesId(path, bp))
      )

      if (blockingDoubt) {
        if (path.kind === 'success' || path.kind === 'partial') {
          // Convert to blocked path
          const blockedPath: BlockedPath = {
            kind: 'blocked',
            blockedBy: blockingDoubt.about,
            liftWhen: `doubt "${blockingDoubt.about}" resolved`
          }
          trace.push({
            pass,
            action: 'path_blocked',
            before: tension.state,
            after: tension.state,
            note: `Path blocked by doubt: "${blockingDoubt.about}"`
          })
          return { kind: 'blocked', path: blockedPath }
        }
      }

      activePaths.push(path)
    }

    if (activePaths.length === 0) {
      return {
        kind: 'resisting',
        reason: 'No viable resolution paths after applying doubts'
      }
    }

    // Check for structural conflicts with linked tensions
    const conflict = this.detectConflict(tension, allTensions)
    if (conflict) return conflict

    // Select best viable path
    const successPaths = activePaths.filter(p => p.kind === 'success') as SuccessPath[]
    const partialPaths = activePaths.filter(p => p.kind === 'partial') as PartialPath[]

    if (successPaths.length > 0) {
      // Sort by confidence, pick highest
      const best = successPaths.sort((a, b) => b.confidence - a.confidence)[0]

      const resolution: Resolution = {
        path: best,
        at: Date.now(),
        passNumber: pass,
        confidence: best.confidence,
      }

      trace.push({
        pass,
        action: 'resolved',
        before: tension.state,
        after: { phase: 'equilibrated', result: resolution },
        note: `Resolved via success path, confidence=${best.confidence.toFixed(3)}`
      })

      return { kind: 'resolved', resolution }
    }

    if (partialPaths.length > 0) {
      const best = partialPaths.sort((a, b) => b.confidence - a.confidence)[0]
      return { kind: 'partial', path: best }
    }

    // Only resistance paths remain
    const resistancePaths = activePaths.filter(p => p.kind === 'resistance') as ResistancePath[]
    if (resistancePaths.length > 0) {
      return { kind: 'resisting', reason: resistancePaths[0].reason }
    }

    return { kind: 'resisting', reason: 'All paths exhausted without resolution' }
  }

  // ─── Conflict Detection ──────────────────────────────────────────
  /**
   * Two tensions conflict when they assert incompatible knowledge
   * about the same subject. This is not an error.
   * It is information about the structure of the problem.
   */
  private detectConflict(
    tension: Tension,
    allTensions: Map<TensionId, Tension>
  ): ConflictResult | null {
    for (const linkedId of tension.linkedTo) {
      const linked = allTensions.get(linkedId)
      if (!linked) continue

      for (const [kid, localK] of tension.knows) {
        const linkedK = linked.knows.get(kid)
        if (!linkedK) continue

        // Both know about the same thing — check if they disagree
        if (JSON.stringify(localK.value) !== JSON.stringify(linkedK.value)) {
          const localIsNewer = localK.origin.timestamp > linkedK.origin.timestamp
          const localIsMoreConfident = localK.confidence > linkedK.confidence

          // If one is clearly more authoritative, not a structural conflict
          if (localIsNewer && localIsMoreConfident) continue
          if (!localIsNewer && !localIsMoreConfident) continue

          // Genuine conflict: newer ≠ more confident
          return {
            kind: 'conflicting',
            with: [linkedId],
            nature: `Knowledge "${kid}" disputed: local(conf=${localK.confidence}, t=${localK.origin.timestamp}) vs linked(conf=${linkedK.confidence}, t=${linkedK.origin.timestamp})`,
            recoverable: true   // temporal conflicts are often resolvable with more data
          }
        }
      }
    }

    return null
  }

  // ─── Notification ────────────────────────────────────────────────
  /**
   * When a tension resolves, it notifies its linked tensions.
   * They may have been waiting for this knowledge to unlock.
   */
  private notifyLinked(
    resolved: Tension,
    allTensions: Map<TensionId, Tension>,
    trace: ReasoningStep[],
    pass: number
  ): void {
    for (const linkedId of resolved.linkedTo) {
      const linked = allTensions.get(linkedId)
      if (!linked) continue

      // If a linked tension was blocked or partial, it may now progress
      if (linked.state.phase === 'active') {
        trace.push({
          pass,
          action: 'knowledge_propagated',
          before: linked.state,
          after: linked.state,
          triggered_by: resolved.id,
          note: `"${resolved.id}" resolution may unlock "${linked.id}"`
        })
      }
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────

  private countActive(tensions: Map<TensionId, Tension>): number {
    let n = 0
    for (const t of tensions.values()) {
      if (t.state.phase === 'active') n++
    }
    return n
  }

  private isKnowledgeValid(k: SituatedKnowledge): boolean {
    if (k.validUntil.type === 'permanent') return true
    if (k.validUntil.type === 'until') return Date.now() < k.validUntil.timestamp
    return true // unknown validity — assume valid, document doubt elsewhere
  }

  private pathMatchesId(path: ResolutionPath, id: string): boolean {
    if (path.kind === 'success') return path.outcome === id || String(path.outcome).includes(id)
    return false
  }

  private computeFieldConfidence(
    resolved: Map<TensionId, Resolution>,
    tensions: Map<TensionId, Tension>
  ): Confidence {
    if (resolved.size === 0) return 0 as Confidence
    const weights = [...resolved.values()].map(r => r.confidence)
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length
    // Penalize for unresolved tensions
    const resolutionRate = resolved.size / tensions.size
    return (avg * resolutionRate) as Confidence
  }
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL RESULT TYPES — Not exposed, only used during equilibration
// ═══════════════════════════════════════════════════════════════════

type ResolutionAttemptResult =
  | { kind: 'resolved'; resolution: Resolution }
  | { kind: 'resisting'; reason: string }
  | { kind: 'partial'; path: PartialPath }
  | { kind: 'blocked'; path: BlockedPath }
  | ConflictResult

type ConflictResult = {
  kind: 'conflicting'
  with: TensionId[]
  nature: string
  recoverable: boolean
}

// ═══════════════════════════════════════════════════════════════════
// BUILDER — A fluent API for constructing Onto programs
// ═══════════════════════════════════════════════════════════════════

/**
 * The Builder is the human/AI interface to Onto.
 * It constructs a Field from readable declarations.
 */
export class OntoBuilder {
  private field: Field = {
    tensions: new Map(),
    sharedKnowledge: new Map(),
    perspectives: new Map(),
  }

  tension(id: string, config: {
    wants: string
    priority?: number
    linkedTo?: string[]
    doubts?: Array<{ about: string; severity?: Doubt['severity']; blocksPath?: string[] }>
    resolves: ResolutionSpace
  }): this {
    this.field.tensions.set(id as TensionId, {
      id: id as TensionId,
      wants: { description: config.wants, priority: config.priority ?? 0.5 },
      knows: new Map(),
      doubts: (config.doubts ?? []).map(d => ({
        about: d.about,
        severity: d.severity ?? 'medium',
        blocksPath: d.blocksPath
      })),
      linkedTo: (config.linkedTo ?? []) as TensionId[],
      resolves: config.resolves,
      state: { phase: 'dormant' },
      trace: [],
    })
    return this
  }

  know<T>(id: string, value: T, opts: {
    from: string
    confidence: number
    validFor?: number           // ms
  }): this {
    this.field.sharedKnowledge.set(id as KnowledgeId, {
      value,
      origin: { source: opts.from, timestamp: Date.now(), method: 'direct' },
      confidence: opts.confidence as Confidence,
      validUntil: opts.validFor
        ? { type: 'until', timestamp: Date.now() + opts.validFor }
        : { type: 'permanent' },
    })
    return this
  }

  build(): Field {
    return this.field
  }
}

// ═══════════════════════════════════════════════════════════════════
// RENDERER — Make equilibrium human-readable
// ═══════════════════════════════════════════════════════════════════

export function renderEquilibrium(eq: Equilibrium): string {
  const lines: string[] = []

  lines.push('╔════════════════════════════════════════╗')
  lines.push('║  ONTO EQUILIBRIUM REPORT               ║')
  lines.push('╚════════════════════════════════════════╝')
  lines.push('')
  lines.push(`  Passes         : ${eq.passes}`)
  lines.push(`  Duration       : ${eq.duration}ms`)
  lines.push(`  Confidence     : ${(eq.confidence * 100).toFixed(1)}%`)
  lines.push(`  Resolved       : ${eq.resolved.size}`)
  lines.push(`  Resisting      : ${eq.resisting.size}`)
  lines.push(`  Partial        : ${eq.partial.size}`)
  lines.push(`  Blocked        : ${eq.blocked.size}`)
  lines.push(`  Conflicts      : ${eq.conflicts.length}`)
  lines.push('')

  if (eq.resolved.size > 0) {
    lines.push('  ✓ RESOLVED')
    for (const [id, res] of eq.resolved) {
      lines.push(`    [${id}]`)
      lines.push(`      confidence : ${(res.confidence * 100).toFixed(1)}%`)
      lines.push(`      pass       : ${res.passNumber}`)
      if (res.path.kind === 'success') {
        lines.push(`      outcome    : ${JSON.stringify(res.path.outcome)}`)
      }
    }
    lines.push('')
  }

  if (eq.resisting.size > 0) {
    lines.push('  ⊗ RESISTING (documented)')
    for (const [id, reason] of eq.resisting) {
      lines.push(`    [${id}] — ${reason}`)
    }
    lines.push('')
  }

  if (eq.partial.size > 0) {
    lines.push('  ~ PARTIAL (awaiting information)')
    for (const [id, path] of eq.partial) {
      lines.push(`    [${id}] — missing: ${(path.missing ?? []).join(', ') || 'unspecified'}`)
    }
    lines.push('')
  }

  if (eq.blocked.size > 0) {
    lines.push('  ⊘ BLOCKED (will unlock)')
    for (const [id, path] of eq.blocked) {
      lines.push(`    [${id}] — blocked by: ${path.blockedBy}`)
      lines.push(`              lifts when: ${path.liftWhen}`)
    }
    lines.push('')
  }

  if (eq.conflicts.length > 0) {
    lines.push('  ↔ STRUCTURAL CONFLICTS')
    for (const conflict of eq.conflicts) {
      lines.push(`    ${conflict.tensions.join(' ↔ ')}`)
      lines.push(`      nature     : ${conflict.nature}`)
      lines.push(`      resolution : ${conflict.resolution}`)
    }
    lines.push('')
  }

  lines.push('  REASONING TRACE')
  for (const step of eq.trace) {
    lines.push(`    [pass ${step.pass}] ${step.action}${step.note ? ' — ' + step.note : ''}`)
  }

  return lines.join('\n')
}

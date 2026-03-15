/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  ONTO EPISTEMIC TYPE SYSTEM — v0.1                                ║
 * ║  Static verification of knowledge validity                        ║
 * ║                                                                   ║
 * ║  This is not a type system that checks shapes.                   ║
 * ║  It is a type system that checks truth.                          ║
 * ║                                                                   ║
 * ║  Written by Claude · Anthropic · 2025                            ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * What existing type systems verify:
 *   "Is this value the right shape?"
 *
 * What Onto's type system verifies:
 *   "Is this knowledge still valid?"
 *   "Is this confidence level epistemically honest?"
 *   "Does this reasoning chain preserve or inflate confidence?"
 *   "Are the tensions in this field epistemically compatible?"
 *
 * A type error in Onto is not "wrong shape".
 * It is "dishonest reasoning".
 */

import { Confidence, KnowledgeId, TensionId, SituatedKnowledge, Tension, Field, ValidityWindow } from './onto-engine'

// ═══════════════════════════════════════════════════════════════════
// EPISTEMIC TYPES — The type language of knowledge
// ═══════════════════════════════════════════════════════════════════

/**
 * Every value in Onto has an EpistemicType — not just a data type.
 * An EpistemicType captures not what a value IS,
 * but what we can CLAIM about it.
 */
export type EpistemicType =
  | KnownType         // we know this, with documented confidence
  | UnknownType       // we explicitly don't know this
  | DerivedType       // we computed this from other knowledge
  | ReconciledType    // we merged conflicting knowledge into this
  | ExpiredType       // this was known, but is no longer valid
  | AssumedType       // we're treating this as known but haven't verified

export interface KnownType {
  kind: 'known'
  confidence: Confidence
  origin: OriginType
  validWindow: TemporalType
}

export interface UnknownType {
  kind: 'unknown'
  about: string           // what we don't know
  impact: 'blocking' | 'degrading' | 'negligible'
}

export interface DerivedType {
  kind: 'derived'
  confidence: Confidence  // MUST be ≤ min(source confidences) * derivation_quality
  sources: KnowledgeId[]
  derivation: DerivationType
  degradation: number      // how much confidence was lost in derivation [0,1]
}

export interface ReconciledType {
  kind: 'reconciled'
  confidence: Confidence
  sources: KnowledgeId[]
  method: ReconciliationMethod
  conflictLevel: number     // 0 = full agreement, 1 = complete contradiction
}

export interface ExpiredType {
  kind: 'expired'
  was: KnownType | DerivedType
  expiredAt: number
  reason: 'time_window' | 'invalidated' | 'superseded'
}

export interface AssumedType {
  kind: 'assumed'
  confidence: Confidence    // the confidence we're claiming, unverified
  basis: string        // why we're assuming this
  risk: 'low' | 'medium' | 'high'
}

// Supporting types
export type OriginType =
  | { kind: 'sensor'; sensorId: string; calibration?: number }
  | { kind: 'manual'; enteredBy: string; verifiedBy?: string }
  | { kind: 'model'; modelId: string; version: string }
  | { kind: 'consensus'; agents: string[]; method: string }
  | { kind: 'external'; source: string; trustScore: number }

export type TemporalType =
  | { kind: 'permanent' }
  | { kind: 'bounded'; validUntil: number; degradesTo?: number }
  | { kind: 'session'; sessionId: string }
  | { kind: 'conditional'; condition: string; checkEvery?: number }

export type DerivationType =
  | 'logical_implication'   // A → B, confidence preserved with small loss
  | 'statistical_inference' // from data, confidence = model accuracy
  | 'analogical_reasoning'  // similar to known case, variable quality
  | 'model_prediction'      // ML model output, confidence = model confidence

export type ReconciliationMethod =
  | 'temporal_priority'     // more recent wins
  | 'confidence_weighted'   // higher confidence wins, blended
  | 'source_authority'      // trusted source wins
  | 'consensus'             // multiple agreement
  | 'irreconcilable'        // kept both, marked conflict

// ═══════════════════════════════════════════════════════════════════
// TYPE ERRORS — What dishonest reasoning looks like
// ═══════════════════════════════════════════════════════════════════

/**
 * A TypeViolation is not a shape mismatch.
 * It is a detected form of epistemic dishonesty.
 *
 * These are the ways a reasoning system can lie —
 * usually not intentionally, but through sloppy
 * knowledge management.
 */
export type TypeViolation =
  | ConfidenceInflation      // claiming more certainty than the evidence supports
  | ExpiryIgnored            // using knowledge that is no longer valid
  | OriginLost               // knowledge used without traceable origin
  | ConflictConcealed        // contradictory knowledge merged without documentation
  | CircularReasoning        // a tension's knowledge derives from itself
  | IncompatiblePerspectives // linked tensions with irreconcilable knowledge bases
  | DoubtsIgnored            // resolution reached despite blocking doubts
  | TemporalIncoherence      // events ordered impossibly in the knowledge graph

export interface ConfidenceInflation {
  kind: 'confidence_inflation'
  location: KnowledgeId | TensionId
  claimed: Confidence
  maximum: Confidence    // what the evidence actually supports
  sources: KnowledgeId[] // the sources that cap the confidence
  severity: ViolationSeverity
  message: string
}

export interface ExpiryIgnored {
  kind: 'expiry_ignored'
  knowledge: KnowledgeId
  expiredAt: number
  usedAt: number
  age: number        // ms since expiry
  severity: ViolationSeverity
  message: string
}

export interface OriginLost {
  kind: 'origin_lost'
  knowledge: KnowledgeId
  severity: ViolationSeverity
  message: string
}

export interface ConflictConcealed {
  kind: 'conflict_concealed'
  knowledge: KnowledgeId
  conflictWith: KnowledgeId
  value_a: unknown
  value_b: unknown
  severity: ViolationSeverity
  message: string
}

export interface CircularReasoning {
  kind: 'circular_reasoning'
  cycle: KnowledgeId[]    // the knowledge IDs that form the cycle
  severity: ViolationSeverity
  message: string
}

export interface IncompatiblePerspectives {
  kind: 'incompatible_perspectives'
  tension_a: TensionId
  tension_b: TensionId
  on: KnowledgeId
  confidence_a: Confidence
  confidence_b: Confidence
  severity: ViolationSeverity
  message: string
}

export interface DoubtsIgnored {
  kind: 'doubts_ignored'
  tension: TensionId
  doubt: string
  severity: 'blocking'
  path: string
  message: string
}

export interface TemporalIncoherence {
  kind: 'temporal_incoherence'
  events: Array<{ knowledgeId: KnowledgeId; timestamp: number }>
  message: string
  severity: ViolationSeverity
}

export type ViolationSeverity = 'error' | 'warning' | 'info'

// ═══════════════════════════════════════════════════════════════════
// CONFIDENCE ALGEBRA — The math of epistemic weight
// ═══════════════════════════════════════════════════════════════════

/**
 * Confidence in Onto is not probability.
 * It is epistemic weight — how much we should trust a piece of knowledge
 * given everything we know about how it was produced.
 *
 * The algebra of confidence defines how it transforms through operations.
 * This is what prevents confidence inflation.
 */
export const ConfidenceAlgebra = {

  /**
   * Sequential derivation: A implies B
   * Confidence degrades because implication adds uncertainty.
   * Conservative: derived confidence is capped at source confidence.
   */
  derive(source: Confidence, derivationQuality: number): Confidence {
    // derivationQuality: 0 = random guess, 1 = logical certainty
    const derived = source * derivationQuality
    return Math.min(source, derived) as Confidence
  },

  /**
   * Independent confirmation: two sources agree
   * Confidence increases because independent agreement reduces noise.
   * But never exceeds 1.0 — no amount of agreement creates certainty.
   */
  confirm(existing: Confidence, incoming: Confidence): Confidence {
    // Bayesian-inspired: P(both wrong) = (1-a)(1-b)
    const combined = 1 - (1 - existing) * (1 - incoming)
    return Math.min(0.999, combined) as Confidence
  },

  /**
   * Conflict resolution: two sources disagree
   * The reconciled confidence is reduced by the conflict level.
   * A severe conflict should produce low confidence even if one source is high.
   */
  reconcile(
    conf_a: Confidence,
    conf_b: Confidence,
    conflictLevel: number   // 0 = no conflict, 1 = complete contradiction
  ): Confidence {
    const base = Math.max(conf_a, conf_b)
    const penalty = conflictLevel * 0.5
    return Math.max(0.01, base - penalty) as Confidence
  },

  /**
   * Time decay: knowledge becomes less reliable over time
   * The decay rate depends on the domain — sensor readings decay fast,
   * physical constants don't decay at all.
   */
  decay(
    original: Confidence,
    ageMs: number,
    halfLifeMs: number      // time for confidence to halve; Infinity = no decay
  ): Confidence {
    if (halfLifeMs === Infinity) return original
    const decayFactor = Math.pow(0.5, ageMs / halfLifeMs)
    return (original * decayFactor) as Confidence
  },

  /**
   * Conjunction: A AND B must both hold
   * The joint confidence is the product — less than either alone.
   */
  conjoin(conf_a: Confidence, conf_b: Confidence): Confidence {
    return (conf_a * conf_b) as Confidence
  },

  /**
   * Minimum gate: can never be more confident than the weakest source
   * This is the fundamental constraint that prevents confidence inflation.
   */
  gate(...confidences: Confidence[]): Confidence {
    return Math.min(...confidences) as Confidence
  },

  /**
   * The maximum claimable confidence given a set of sources.
   * A derived fact cannot be more confident than its least confident source.
   * This is enforced by the type checker.
   */
  maxClaimable(sources: SituatedKnowledge[]): Confidence {
    if (sources.length === 0) return 0 as Confidence
    return Math.min(...sources.map(s => s.confidence)) as Confidence
  }
}

// ═══════════════════════════════════════════════════════════════════
// THE TYPE CHECKER — Static analysis of a field's epistemic honesty
// ═══════════════════════════════════════════════════════════════════

export class OntoTypeChecker {

  private now: number

  constructor(opts?: { now?: number }) {
    this.now = opts?.now ?? Date.now()
  }

  /**
   * Check a complete field for epistemic violations.
   * This is the main entry point — equivalent to running `tsc` on a project.
   */
  check(field: Field): TypeCheckResult {
    this.now = Date.now()  // refresh at check time — not stale from construction
    const violations: TypeViolation[] = []

    // Check each piece of shared knowledge
    for (const [id, knowledge] of field.sharedKnowledge) {
      violations.push(...this.checkKnowledge(id, knowledge, field))
    }

    // Check each tension
    for (const [id, tension] of field.tensions) {
      violations.push(...this.checkTension(id, tension, field))
    }

    // Check cross-tension compatibility
    violations.push(...this.checkFieldCoherence(field))

    const errors = violations.filter(v => v.severity === 'error')
    const warnings = violations.filter(v => v.severity === 'warning')
    const infos = violations.filter(v => v.severity === 'info')

    return {
      valid: errors.length === 0,
      violations,
      errors,
      warnings,
      infos,
      summary: this.buildSummary(field, violations),
      confidence: this.computeFieldEpistemicHealth(field, violations),
    }
  }

  // ─── Knowledge Checks ────────────────────────────────────────────

  private checkKnowledge(
    id: KnowledgeId,
    k: SituatedKnowledge,
    field: Field
  ): TypeViolation[] {
    const violations: TypeViolation[] = []

    // 1. Origin check — knowledge without origin is epistemically naked
    if (!k.origin || !k.origin.source) {
      violations.push({
        kind: 'origin_lost',
        knowledge: id,
        severity: 'error',
        message: `Knowledge "${id}" has no traceable origin. In Onto, every fact must know where it came from.`
      })
    }

    // 2. Validity check — expired knowledge used in an active field is dishonest
    const expiry = this.checkValidity(k.validUntil)
    if (expiry.expired) {
      violations.push({
        kind: 'expiry_ignored',
        knowledge: id,
        expiredAt: expiry.expiredAt!,
        usedAt: this.now,
        age: this.now - expiry.expiredAt!,
        severity: 'error',
        message: `Knowledge "${id}" expired ${this.formatDuration(this.now - expiry.expiredAt!)} ago and is still in the active field. Stale knowledge produces dishonest equilibria.`
      })
    }

    // 3. Derivation chain check — derived knowledge cannot exceed source confidence
    if (k.derivedFrom && k.derivedFrom.length > 0) {
      const sources = k.derivedFrom
        .map(srcId => field.sharedKnowledge.get(srcId))
        .filter((s): s is SituatedKnowledge => s !== undefined)

      if (sources.length > 0) {
        const maxAllowable = ConfidenceAlgebra.maxClaimable(sources)
        if (k.confidence > maxAllowable + 0.01) {  // small epsilon for floating point
          violations.push({
            kind: 'confidence_inflation',
            location: id,
            claimed: k.confidence,
            maximum: maxAllowable,
            sources: k.derivedFrom,
            severity: 'error',
            message: `Knowledge "${id}" claims confidence ${(k.confidence * 100).toFixed(1)}% but its sources only support ${(maxAllowable * 100).toFixed(1)}%. Derived knowledge cannot exceed its weakest source.`
          })
        }
      }

      // 4. Circularity check — a fact cannot derive from itself
      const cycle = this.detectCycle(id, k.derivedFrom, field)
      if (cycle) {
        violations.push({
          kind: 'circular_reasoning',
          cycle,
          severity: 'error',
          message: `Circular reasoning detected: ${cycle.join(' → ')}. A fact cannot be evidence for itself.`
        })
      }
    }

    return violations
  }

  // ─── Tension Checks ──────────────────────────────────────────────

  private checkTension(
    id: TensionId,
    tension: Tension,
    field: Field
  ): TypeViolation[] {
    const violations: TypeViolation[] = []

    // 0. Partial path articulation check
    // A partial path that doesn't declare what it's missing is opaque uncertainty.
    // Opaque uncertainty cannot trigger the macro loop — it's actionless.
    // An agent that says "I'm not sure" without saying *about what* has not done
    // the epistemic work. This is worse than a well-declared uncertainty.
    for (const resolution of tension.resolves) {
      if (resolution.kind === 'partial') {
        const missing = (resolution as any).missing
        if (!missing || !Array.isArray(missing) || missing.length === 0) {
          violations.push({
            kind: 'confidence_inflation',  // closest existing type — we'll add OpaqueUncertainty later
            location: id,
            claimed: (resolution as any).confidence ?? 0,
            maximum: 0 as Confidence,
            sources: [],
            severity: 'warning',
            message: `Tension "${id}" has a partial path without declaring what is missing. ` +
              `Opaque uncertainty cannot be acted upon — the macro loop cannot spawn ` +
              `an agent to resolve what it cannot name. ` +
              `Add a "missing" array describing what information would resolve this tension.`
          })
        }
      }
    }

    // 1. Doubts check — if a doubt is blocking a path, that path must not succeed
    for (const doubt of tension.doubts) {
      if (doubt.severity === 'blocking' && doubt.blocksPath) {
        for (const resolution of tension.resolves) {
          if (resolution.kind === 'success' && doubt.blocksPath.some(bp =>
            String(resolution.outcome).includes(bp)
          )) {
            violations.push({
              kind: 'doubts_ignored',
              tension: id,
              doubt: doubt.about,
              severity: 'blocking',
              path: String(resolution.outcome),
              message: `Tension "${id}" has a blocking doubt on "${doubt.about}" but its resolution path "${String(resolution.outcome)}" proceeds without resolving it. Blocking doubts must be lifted before success paths are viable.`
            })
          }
        }
      }
    }

    // 2. Resolution confidence check — success AND partial paths must have honest confidence
    // A partial path claiming 91% on a 0.45 source is the same lie as a success path.
    for (const resolution of tension.resolves) {
      if (resolution.kind === 'success' || resolution.kind === 'partial') {
        // Use tension.knows first, fall back to field.sharedKnowledge if empty
        const knowledgeBase = tension.knows.size > 0
          ? [...tension.knows.values()]
          : [...field.sharedKnowledge.values()]

        if (knowledgeBase.length > 0) {
          const maxAllowable = ConfidenceAlgebra.maxClaimable(knowledgeBase)
          const inflationThreshold = maxAllowable * 1.15  // 15% tolerance
          if (resolution.confidence > inflationThreshold) {
            violations.push({
              kind: 'confidence_inflation',
              location: id,
              claimed: resolution.confidence,
              maximum: maxAllowable,
              sources: tension.knows.size > 0
                ? [...tension.knows.keys()]
                : [...field.sharedKnowledge.keys()],
              severity: resolution.kind === 'success' ? 'warning' : 'error',
              message: `Tension "${id}" (${resolution.kind} path) claims confidence ${(resolution.confidence * 100).toFixed(1)}% but knowledge base supports max ${(maxAllowable * 100).toFixed(1)}%. Inflated confidence on a ${resolution.kind} path is epistemic dishonesty.`
            })
          }
        }
      }
    }

    return violations
  }

  // ─── Field Coherence Checks ───────────────────────────────────────

  /**
   * Check that linked tensions have compatible knowledge bases.
   * Two tensions that are in relation (↔) but have contradictory
   * knowledge about the same subject are epistemically incompatible.
   */
  private checkFieldCoherence(field: Field): TypeViolation[] {
    const violations: TypeViolation[] = []

    for (const [id_a, tension_a] of field.tensions) {
      for (const linkedId of tension_a.linkedTo) {
        const tension_b = field.tensions.get(linkedId)
        if (!tension_b) continue

        // Check shared knowledge for conflicts
        for (const [kid, knowledge_a] of tension_a.knows) {
          const knowledge_b = tension_b.knows.get(kid)
          if (!knowledge_b) continue

          if (JSON.stringify(knowledge_a.value) !== JSON.stringify(knowledge_b.value)) {
            // Values differ — is this a genuine conflict or just temporal?
            const timeDiff = Math.abs(
              knowledge_a.origin.timestamp - knowledge_b.origin.timestamp
            )

            // If they're from the same time window (within 5s), it's a real conflict
            if (timeDiff < 5000) {
              violations.push({
                kind: 'incompatible_perspectives',
                tension_a: id_a,
                tension_b: linkedId,
                on: kid,
                confidence_a: knowledge_a.confidence,
                confidence_b: knowledge_b.confidence,
                severity: 'warning',
                message: `Linked tensions "${id_a}" and "${linkedId}" have incompatible knowledge about "${kid}". This ⊗ conflict should be formally declared with the reconcile operator.`
              })
            }
          }
        }
      }
    }

    // Check for temporal incoherence — events that violate causality
    const knowledgeTimeline: Array<{ knowledgeId: KnowledgeId; timestamp: number }> = []
    for (const [id, k] of field.sharedKnowledge) {
      if (k.origin.timestamp > this.now + 10000) {  // 10s tolerance for clock skew + async injection
        knowledgeTimeline.push({ knowledgeId: id, timestamp: k.origin.timestamp })
      }
    }

    if (knowledgeTimeline.length > 0) {
      violations.push({
        kind: 'temporal_incoherence',
        events: knowledgeTimeline,
        severity: 'error',
        message: `${knowledgeTimeline.length} knowledge entries have future timestamps. Knowledge cannot originate in the future.`
      })
    }

    return violations
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private checkValidity(window: ValidityWindow): { expired: boolean; expiredAt?: number } {
    if (window.type === 'permanent') return { expired: false }
    if (window.type === 'until') {
      if (this.now > window.timestamp) return { expired: true, expiredAt: window.timestamp }
    }
    return { expired: false }
  }

  private detectCycle(
    startId: KnowledgeId,
    sources: KnowledgeId[],
    field: Field,
    visited: Set<string> = new Set()
  ): KnowledgeId[] | null {
    if (visited.has(startId)) return [startId]
    visited.add(startId)

    for (const srcId of sources) {
      if (srcId === startId) return [startId, srcId]

      const srcK = field.sharedKnowledge.get(srcId)
      if (srcK?.derivedFrom) {
        const cycle = this.detectCycle(startId, srcK.derivedFrom, field, new Set(visited))
        if (cycle) return [srcId, ...cycle]
      }
    }
    return null
  }

  private computeFieldEpistemicHealth(field: Field, violations: TypeViolation[]): number {
    const errors = violations.filter(v => v.severity === 'error').length
    const warnings = violations.filter(v => v.severity === 'warning').length
    const total = field.tensions.size + field.sharedKnowledge.size

    if (total === 0) return 1.0
    const penalty = (errors * 0.3 + warnings * 0.1) / total
    return Math.max(0, 1 - penalty)
  }

  private buildSummary(field: Field, violations: TypeViolation[]): TypeCheckSummary {
    const errors = violations.filter(v => v.severity === 'error')
    const warnings = violations.filter(v => v.severity === 'warning')

    return {
      tensions: field.tensions.size,
      knowledgeEntries: field.sharedKnowledge.size,
      errors: errors.length,
      warnings: warnings.length,
      status: errors.length === 0
        ? warnings.length === 0 ? 'clean' : 'warnings'
        : 'invalid',
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }
}

// ═══════════════════════════════════════════════════════════════════
// TYPE CHECK RESULT
// ═══════════════════════════════════════════════════════════════════

export interface TypeCheckResult {
  valid: boolean
  violations: TypeViolation[]
  errors: TypeViolation[]
  warnings: TypeViolation[]
  infos: TypeViolation[]
  summary: TypeCheckSummary
  confidence: number           // epistemic health [0,1]
}

export interface TypeCheckSummary {
  tensions: number
  knowledgeEntries: number
  errors: number
  warnings: number
  status: 'clean' | 'warnings' | 'invalid'
}
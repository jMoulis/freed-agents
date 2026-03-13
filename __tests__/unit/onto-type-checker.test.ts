import { describe, it, expect } from 'vitest'
import { OntoTypeChecker } from '@/lib/onto/onto-types'
import {
  Field, TensionId, KnowledgeId, Confidence, SituatedKnowledge, Tension,
} from '@/lib/onto/onto-engine'

// ── Helpers ────────────────────────────────────────────────────────

function c(n: number): Confidence { return n as Confidence }
function tid(s: string): TensionId { return s as TensionId }
function kid(s: string): KnowledgeId { return s as KnowledgeId }

function emptyField(): Field {
  return { tensions: new Map(), sharedKnowledge: new Map(), perspectives: new Map() }
}

function sk(value: unknown, confidence: number, opts: {
  source?: string
  timestamp?: number
  derivedFrom?: string[]
  validUntil?: { type: 'until'; timestamp: number } | { type: 'permanent' }
} = {}): SituatedKnowledge {
  return {
    value,
    origin: {
      source: opts.source ?? 'test_source',
      timestamp: opts.timestamp ?? Date.now(),
      method: 'direct',
    },
    confidence: c(confidence),
    validUntil: opts.validUntil ?? { type: 'permanent' },
    derivedFrom: opts.derivedFrom?.map(kid),
  }
}

function tension(id: string, opts: {
  knows?: Map<KnowledgeId, SituatedKnowledge>
  doubts?: Tension['doubts']
  resolves?: Tension['resolves']
  linkedTo?: string[]
} = {}): Tension {
  return {
    id: tid(id),
    wants: { description: 'test', priority: 0.5 },
    knows: opts.knows ?? new Map(),
    doubts: opts.doubts ?? [],
    linkedTo: (opts.linkedTo ?? []).map(tid),
    resolves: opts.resolves ?? [],
    state: { phase: 'dormant' },
    trace: [],
  }
}

// ── Tests ──────────────────────────────────────────────────────────

describe('OntoTypeChecker.check — clean field', () => {
  it('returns valid=true and no violations for an empty field', () => {
    const checker = new OntoTypeChecker()
    const result = checker.check(emptyField())
    expect(result.valid).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.summary.status).toBe('clean')
  })

  it('returns valid=true for tension with honest confidence', () => {
    const field = emptyField()
    const knows = new Map([[kid('k1'), sk('data', 0.8)]])
    field.tensions.set(tid('t1'), tension('t1', {
      knows,
      resolves: [{ kind: 'success', outcome: 'done', confidence: c(0.8), risk: 'low' }],
    }))
    const result = new OntoTypeChecker().check(field)
    // Should have no errors (possibly warnings for partial paths etc.)
    expect(result.errors).toHaveLength(0)
  })
})

describe('OntoTypeChecker.check — origin_lost', () => {
  it('detects knowledge with empty source', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k1'), sk('value', 0.8, { source: '' }))
    const result = new OntoTypeChecker().check(field)
    const violation = result.violations.find(v => v.kind === 'origin_lost')
    expect(violation).toBeDefined()
    expect(result.valid).toBe(false)
  })
})

describe('OntoTypeChecker.check — expiry_ignored', () => {
  it('detects expired knowledge still in the field', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k1'), sk('stale', 0.8, {
      validUntil: { type: 'until', timestamp: Date.now() - 60_000 }, // expired 1 min ago
    }))
    const result = new OntoTypeChecker().check(field)
    const violation = result.violations.find(v => v.kind === 'expiry_ignored')
    expect(violation).toBeDefined()
    expect(result.valid).toBe(false)
  })

  it('does not flag permanent knowledge', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k1'), sk('permanent', 0.8, {
      validUntil: { type: 'permanent' },
    }))
    const result = new OntoTypeChecker().check(field)
    expect(result.violations.filter(v => v.kind === 'expiry_ignored')).toHaveLength(0)
  })
})

describe('OntoTypeChecker.check — confidence_inflation (shared knowledge)', () => {
  it('detects derived knowledge claiming more confidence than its source', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k_source'), sk('base_fact', 0.5))
    field.sharedKnowledge.set(kid('k_derived'), sk('derived_fact', 0.9, {
      derivedFrom: ['k_source'], // claims 0.9 but source only supports 0.5
    }))
    const result = new OntoTypeChecker().check(field)
    const violation = result.violations.find(v => v.kind === 'confidence_inflation')
    expect(violation).toBeDefined()
  })

  it('does not flag when derived confidence ≤ source', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k_source'), sk('base', 0.8))
    field.sharedKnowledge.set(kid('k_derived'), sk('derived', 0.7, {
      derivedFrom: ['k_source'],
    }))
    const result = new OntoTypeChecker().check(field)
    expect(result.violations.filter(v => v.kind === 'confidence_inflation')).toHaveLength(0)
  })
})

describe('OntoTypeChecker.check — circular_reasoning', () => {
  it('detects A→B→A cycle in derivation chain', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k_a'), sk('fact_a', 0.8, { derivedFrom: ['k_b'] }))
    field.sharedKnowledge.set(kid('k_b'), sk('fact_b', 0.7, { derivedFrom: ['k_a'] }))
    const result = new OntoTypeChecker().check(field)
    const violation = result.violations.find(v => v.kind === 'circular_reasoning')
    expect(violation).toBeDefined()
  })
})

describe('OntoTypeChecker.check — doubts_ignored', () => {
  it('detects success path that overrides a blocking doubt', () => {
    const field = emptyField()
    field.tensions.set(tid('t1'), tension('t1', {
      doubts: [
        { about: 'safety_check', severity: 'blocking', blocksPath: ['proceed'] },
      ],
      resolves: [
        { kind: 'success', outcome: 'proceed_with_task', confidence: c(0.9), risk: 'low' },
      ],
    }))
    const result = new OntoTypeChecker().check(field)
    const violation = result.violations.find(v => v.kind === 'doubts_ignored')
    expect(violation).toBeDefined()
  })

  it('does not flag when blocking doubt path does not match success outcome', () => {
    const field = emptyField()
    field.tensions.set(tid('t1'), tension('t1', {
      doubts: [
        { about: 'auth', severity: 'blocking', blocksPath: ['delete_account'] },
      ],
      resolves: [
        { kind: 'success', outcome: 'read_data', confidence: c(0.9), risk: 'low' },
      ],
    }))
    const result = new OntoTypeChecker().check(field)
    expect(result.violations.filter(v => v.kind === 'doubts_ignored')).toHaveLength(0)
  })
})

describe('OntoTypeChecker.check — temporal_incoherence', () => {
  it('detects knowledge with future timestamp', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k_future'), sk('future_fact', 0.8, {
      timestamp: Date.now() + 120_000, // 2 min in the future
    }))
    const result = new OntoTypeChecker().check(field)
    const violation = result.violations.find(v => v.kind === 'temporal_incoherence')
    expect(violation).toBeDefined()
  })

  it('does not flag knowledge within 10s clock skew tolerance', () => {
    const field = emptyField()
    field.sharedKnowledge.set(kid('k_recent'), sk('recent', 0.8, {
      timestamp: Date.now() + 5_000, // within 10s tolerance
    }))
    const result = new OntoTypeChecker().check(field)
    expect(result.violations.filter(v => v.kind === 'temporal_incoherence')).toHaveLength(0)
  })
})

describe('OntoTypeChecker.check — epistemic health', () => {
  it('health decreases with more violations', () => {
    const clean = emptyField()
    const checker = new OntoTypeChecker()
    const cleanResult = checker.check(clean)

    const dirty = emptyField()
    dirty.sharedKnowledge.set(kid('k1'), sk('stale', 0.8, {
      validUntil: { type: 'until', timestamp: Date.now() - 60_000 },
    }))
    const dirtyResult = checker.check(dirty)

    expect(cleanResult.confidence).toBeGreaterThan(dirtyResult.confidence)
  })
})

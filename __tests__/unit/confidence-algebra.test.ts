import { describe, it, expect } from 'vitest'
import { ConfidenceAlgebra } from '@/lib/onto/onto-types'
import type { Confidence, SituatedKnowledge } from '@/lib/onto/onto-engine'

// Cast helper — branded types in tests
function c(n: number): Confidence {
  return n as Confidence
}

function sk(confidence: number): SituatedKnowledge {
  return {
    value: 'test',
    origin: { source: 'test', timestamp: Date.now(), method: 'direct' },
    confidence: confidence as Confidence,
    validUntil: { type: 'permanent' },
  }
}

describe('ConfidenceAlgebra.derive', () => {
  it('returns source * quality, capped at source', () => {
    const result = ConfidenceAlgebra.derive(c(0.8), 0.9)
    expect(result).toBeCloseTo(0.72, 5)
    expect(result).toBeLessThanOrEqual(0.8)
  })

  it('never exceeds the source confidence', () => {
    const result = ConfidenceAlgebra.derive(c(0.5), 2.0) // quality > 1
    expect(result).toBeLessThanOrEqual(0.5)
  })

  it('quality=1.0 returns exactly the source', () => {
    expect(ConfidenceAlgebra.derive(c(0.7), 1.0)).toBeCloseTo(0.7, 5)
  })

  it('quality=0 returns 0', () => {
    expect(ConfidenceAlgebra.derive(c(0.9), 0)).toBe(0)
  })
})

describe('ConfidenceAlgebra.confirm', () => {
  it('increases confidence when two sources agree', () => {
    const result = ConfidenceAlgebra.confirm(c(0.6), c(0.7))
    expect(result).toBeGreaterThan(0.7)
  })

  it('never exceeds 0.999', () => {
    const result = ConfidenceAlgebra.confirm(c(0.99), c(0.99))
    expect(result).toBeLessThanOrEqual(0.999)
  })

  it('follows Bayesian formula: 1 - (1-a)(1-b)', () => {
    const a = 0.6
    const b = 0.7
    const expected = 1 - (1 - a) * (1 - b)
    expect(ConfidenceAlgebra.confirm(c(a), c(b))).toBeCloseTo(expected, 5)
  })
})

describe('ConfidenceAlgebra.reconcile', () => {
  it('penalizes high conflict', () => {
    const low = ConfidenceAlgebra.reconcile(c(0.8), c(0.3), 0.9)
    const high = ConfidenceAlgebra.reconcile(c(0.8), c(0.3), 0.1)
    expect(high).toBeGreaterThan(low)
  })

  it('returns max(a,b) - conflictLevel*0.5', () => {
    const result = ConfidenceAlgebra.reconcile(c(0.8), c(0.3), 0.5)
    expect(result).toBeCloseTo(0.8 - 0.25, 5)
  })

  it('never goes below 0.01', () => {
    const result = ConfidenceAlgebra.reconcile(c(0.1), c(0.1), 1.0)
    expect(result).toBeGreaterThanOrEqual(0.01)
  })
})

describe('ConfidenceAlgebra.decay', () => {
  it('reduces confidence over time', () => {
    const original = c(0.8)
    const decayed = ConfidenceAlgebra.decay(original, 60_000, 60_000) // one half-life
    expect(decayed).toBeCloseTo(0.4, 5)
  })

  it('no decay when halfLifeMs=Infinity', () => {
    expect(ConfidenceAlgebra.decay(c(0.8), 1_000_000, Infinity)).toBe(0.8)
  })

  it('ageMs=0 returns original', () => {
    expect(ConfidenceAlgebra.decay(c(0.7), 0, 30_000)).toBeCloseTo(0.7, 5)
  })
})

describe('ConfidenceAlgebra.conjoin', () => {
  it('returns a * b', () => {
    expect(ConfidenceAlgebra.conjoin(c(0.8), c(0.5))).toBeCloseTo(0.4, 5)
  })

  it('is less than either input', () => {
    const result = ConfidenceAlgebra.conjoin(c(0.9), c(0.7))
    expect(result).toBeLessThan(0.7)
  })
})

describe('ConfidenceAlgebra.gate', () => {
  it('returns the minimum confidence', () => {
    expect(ConfidenceAlgebra.gate(c(0.9), c(0.4), c(0.7))).toBe(0.4)
  })

  it('single argument returns itself', () => {
    expect(ConfidenceAlgebra.gate(c(0.6))).toBe(0.6)
  })
})

describe('ConfidenceAlgebra.maxClaimable', () => {
  it('returns minimum confidence of sources', () => {
    const sources = [sk(0.9), sk(0.6), sk(0.75)]
    expect(ConfidenceAlgebra.maxClaimable(sources)).toBe(0.6)
  })

  it('returns 0 for empty sources', () => {
    expect(ConfidenceAlgebra.maxClaimable([])).toBe(0)
  })

  it('single source returns its confidence', () => {
    expect(ConfidenceAlgebra.maxClaimable([sk(0.7)])).toBe(0.7)
  })
})

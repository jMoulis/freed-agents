import { describe, it, expect } from 'vitest'
import { computeScore } from '@/lib/scoring'
import type { RunMetrics } from '@/lib/agent-metrics'

function metrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    tensionsDelta: 0,
    ownTensionsResolved: 0,
    tensionsStillActive: 0,
    fieldCoverage: 0,
    completionTokens: 100,
    finishReason: 'stop',
    durationMs: 1000,
    ...overrides,
  }
}

describe('computeScore', () => {
  it('returns score=0 when all deltas are zero and no coverage', () => {
    const result = computeScore(metrics())
    expect(result.quality).toBe(0)
    expect(result.score).toBe(0)
  })

  it('rewards resolved tensions (ownTensionsResolved)', () => {
    const base = computeScore(metrics())
    const better = computeScore(metrics({ tensionsDelta: 2, ownTensionsResolved: 2 }))
    expect(better.score).toBeGreaterThan(base.score)
  })

  it('penalizes unresolved owned tensions', () => {
    // 2 added, 2 resolved vs 2 added, 0 resolved
    const resolved = computeScore(metrics({ tensionsDelta: 2, ownTensionsResolved: 2 }))
    const unresolved = computeScore(metrics({ tensionsDelta: 2, ownTensionsResolved: 0 }))
    expect(resolved.score).toBeGreaterThan(unresolved.score)
  })

  it('behavior=0.5 when finishReason is "length"', () => {
    const normal = computeScore(metrics({ ownTensionsResolved: 3, tensionsDelta: 3 }))
    const truncated = computeScore(metrics({ ownTensionsResolved: 3, tensionsDelta: 3, finishReason: 'length' }))
    expect(truncated.behavior).toBe(0.5)
    expect(normal.behavior).toBe(1.0)
    expect(truncated.score).toBeCloseTo(normal.score * 0.5, 5)
  })

  it('behavior=1.0 for non-length finish reasons', () => {
    expect(computeScore(metrics({ finishReason: 'stop' })).behavior).toBe(1.0)
    expect(computeScore(metrics({ finishReason: 'tool-calls' })).behavior).toBe(1.0)
    expect(computeScore(metrics({ finishReason: 'end-turn' })).behavior).toBe(1.0)
  })

  it('normalizes by log(completionTokens + 1)', () => {
    const cheap = computeScore(metrics({ ownTensionsResolved: 2, tensionsDelta: 2, completionTokens: 10 }))
    const verbose = computeScore(metrics({ ownTensionsResolved: 2, tensionsDelta: 2, completionTokens: 10000 }))
    expect(cheap.score).toBeGreaterThan(verbose.score)
  })

  it('fieldCoverage boosts score', () => {
    const low = computeScore(metrics({ fieldCoverage: 0 }))
    const high = computeScore(metrics({ fieldCoverage: 1 }))
    expect(high.score).toBeGreaterThan(low.score)
  })

  it('returns complete ScoreBreakdown shape', () => {
    const result = computeScore(metrics({ tensionsDelta: 3, ownTensionsResolved: 2 }))
    expect(result).toHaveProperty('score')
    expect(result).toHaveProperty('quality')
    expect(result).toHaveProperty('behavior')
    expect(result).toHaveProperty('components')
    expect(result.components).toHaveProperty('ownedUnresolved')
    expect(result.components.ownedUnresolved).toBe(1) // tensionsDelta(3) - ownTensionsResolved(2)
  })

  it('ownedUnresolved = tensionsDelta - ownTensionsResolved', () => {
    const result = computeScore(metrics({ tensionsDelta: 5, ownTensionsResolved: 3 }))
    expect(result.components.ownedUnresolved).toBe(2)
  })
})

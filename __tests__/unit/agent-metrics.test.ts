import { describe, it, expect } from 'vitest'
import { deriveMetrics } from '@/lib/agent-metrics'
import type { FieldSnapshot } from '@/core/onto-store'

function snapshot(tensions: FieldSnapshot['tensions'] = []): FieldSnapshot {
  return {
    projectId: 'test-project',
    globalConfidence: 0.5,
    summary: 'test',
    tensions,
    sharedKnowledge: [],
  }
}

function tension(id: string, state: string): FieldSnapshot['tensions'][0] {
  return {
    id,
    wants: 'test want',
    state,
    confidence: 0.8,
    value: null,
    doubts: [],
    pendingOn: [],
    linkedTo: [],
  }
}

describe('deriveMetrics', () => {
  it('returns zero deltas when before === after', () => {
    const s = snapshot([tension('t1', 'resolved'), tension('t2', 'active')])
    const result = deriveMetrics(s, s, 100, 'stop', 500)
    expect(result.tensionsDelta).toBe(0)
    expect(result.ownTensionsResolved).toBe(0)
  })

  it('detects new tensions added (tensionsDelta)', () => {
    const before = snapshot([tension('t1', 'resolved')])
    const after = snapshot([tension('t1', 'resolved'), tension('t2', 'active'), tension('t3', 'resolved')])
    const result = deriveMetrics(before, after, 200, 'stop', 1000)
    expect(result.tensionsDelta).toBe(2)
  })

  it('counts ownTensionsResolved correctly (new tensions that are resolved)', () => {
    const before = snapshot([tension('t1', 'resolved')])
    const after = snapshot([
      tension('t1', 'resolved'),
      tension('t2', 'resolved'), // new + resolved
      tension('t3', 'active'),   // new + unresolved
    ])
    const result = deriveMetrics(before, after, 200, 'stop', 1000)
    expect(result.ownTensionsResolved).toBe(1)
  })

  it('fieldCoverage = resolved / total after the run', () => {
    const before = snapshot([])
    const after = snapshot([
      tension('t1', 'resolved'),
      tension('t2', 'resolved'),
      tension('t3', 'active'),
      tension('t4', 'active'),
    ])
    const result = deriveMetrics(before, after, 100, 'stop', 500)
    expect(result.fieldCoverage).toBeCloseTo(0.5, 5)
  })

  it('fieldCoverage=0 when no tensions', () => {
    const s = snapshot([])
    const result = deriveMetrics(s, s, 100, 'stop', 500)
    expect(result.fieldCoverage).toBe(0)
  })

  it('tensionsStillActive = unresolved tensions after run', () => {
    const before = snapshot([])
    const after = snapshot([
      tension('t1', 'resolved'),
      tension('t2', 'active'),
      tension('t3', 'partial'),
    ])
    const result = deriveMetrics(before, after, 100, 'stop', 500)
    expect(result.tensionsStillActive).toBe(2) // active + partial
  })

  it('passes through completionTokens, finishReason, durationMs', () => {
    const s = snapshot([])
    const result = deriveMetrics(s, s, 999, 'length', 12345)
    expect(result.completionTokens).toBe(999)
    expect(result.finishReason).toBe('length')
    expect(result.durationMs).toBe(12345)
  })
})

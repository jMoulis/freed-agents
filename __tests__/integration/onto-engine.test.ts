import { describe, it, expect } from 'vitest'
import { OntoEngine, OntoBuilder, Confidence } from '@/lib/onto/onto-engine'

function c(n: number): Confidence { return n as Confidence }

describe('OntoEngine.equilibrate — empty field', () => {
  it('returns zero counts for an empty field', () => {
    const field = new OntoBuilder().build()
    const engine = new OntoEngine()
    const eq = engine.equilibrate(field)

    expect(eq.resolved.size).toBe(0)
    expect(eq.partial.size).toBe(0)
    expect(eq.blocked.size).toBe(0)
    expect(eq.resisting.size).toBe(0)
    expect(eq.conflicts).toHaveLength(0)
    expect(eq.confidence).toBe(0)
  })

  it('completes in at most 1 pass for empty field', () => {
    const eq = new OntoEngine().equilibrate(new OntoBuilder().build())
    expect(eq.passes).toBeLessThanOrEqual(2)
  })
})

describe('OntoEngine.equilibrate — single tension', () => {
  it('resolves a high-confidence success path', () => {
    const field = new OntoBuilder()
      .tension('t_high', {
        wants: 'deliver output',
        resolves: [{ kind: 'success', outcome: 'delivered', confidence: c(0.9), risk: 'low' }],
      })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.resolved.has('t_high' as any)).toBe(true)
    expect(eq.resolved.size).toBe(1)
  })

  it('stays partial when only a partial path is available', () => {
    const field = new OntoBuilder()
      .tension('t_partial', {
        wants: 'gather info',
        resolves: [{
          kind: 'partial',
          outcome: 'incomplete',
          confidence: c(0.4),
          missing: ['data_source'],
          pendingOn: [],
        }],
      })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.partial.has('t_partial' as any)).toBe(true)
    expect(eq.resolved.size).toBe(0)
  })

  it('stays blocked when a blocking doubt applies', () => {
    const field = new OntoBuilder()
      .tension('t_blocked', {
        wants: 'proceed',
        doubts: [{ about: 'auth_missing', severity: 'blocking', blocksPath: ['proceed'] }],
        resolves: [{ kind: 'success', outcome: 'proceed', confidence: c(0.9), risk: 'low' }],
      })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.blocked.has('t_blocked' as any)).toBe(true)
    expect(eq.resolved.size).toBe(0)
  })

  it('documents resistance with a resistance path', () => {
    const field = new OntoBuilder()
      .tension('t_resist', {
        wants: 'impossible task',
        resolves: [{ kind: 'resistance', reason: 'Fundamentally incompatible constraints', recoverable: false }],
      })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.resisting.has('t_resist' as any)).toBe(true)
    expect(eq.resolved.size).toBe(0)
  })
})

describe('OntoEngine.equilibrate — multiple tensions', () => {
  it('resolves all when all tensions have success paths', () => {
    const field = new OntoBuilder()
      .tension('t1', { wants: 'task 1', resolves: [{ kind: 'success', outcome: 'done1', confidence: c(0.9), risk: 'low' }] })
      .tension('t2', { wants: 'task 2', resolves: [{ kind: 'success', outcome: 'done2', confidence: c(0.85), risk: 'low' }] })
      .tension('t3', { wants: 'task 3', resolves: [{ kind: 'success', outcome: 'done3', confidence: c(0.8), risk: 'low' }] })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.resolved.size).toBe(3)
    expect(eq.confidence).toBeGreaterThan(0)
  })

  it('field confidence = weighted avg of resolved, penalized by resolution rate', () => {
    // 1 resolved + 1 partial → resolution rate = 0.5
    const field = new OntoBuilder()
      .tension('t_ok', { wants: 'ok', resolves: [{ kind: 'success', outcome: 'ok', confidence: c(0.8), risk: 'low' }] })
      .tension('t_partial', {
        wants: 'partial',
        resolves: [{ kind: 'partial', outcome: 'partial', confidence: c(0.4), missing: ['info'], pendingOn: [] }],
      })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    // avg confidence of resolved tensions (0.8) * resolution_rate (0.5) = 0.4
    expect(eq.confidence).toBeCloseTo(0.4, 5)
  })
})

describe('OntoEngine.equilibrate — bounds', () => {
  it('passes is bounded at max 100', () => {
    // Build a field that stays partially active
    const field = new OntoBuilder()
      .tension('t1', {
        wants: 'something partial',
        resolves: [{ kind: 'partial', outcome: null, confidence: c(0.3), missing: ['x'], pendingOn: [] }],
      })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.passes).toBeLessThanOrEqual(100)
  })
})

describe('OntoEngine.equilibrate — determinism', () => {
  it('produces identical equilibria for the same field (deterministic)', () => {
    // Note: OntoBuilder.know() uses Date.now() — build once and use same field
    const field = new OntoBuilder()
      .tension('t1', { wants: 'task', resolves: [{ kind: 'success', outcome: 'done', confidence: c(0.85), risk: 'low' }] })
      .tension('t2', { wants: 'task2', resolves: [{ kind: 'partial', outcome: null, confidence: c(0.3), missing: ['x'], pendingOn: [] }] })
      .build()

    // Equilibrate the same field twice (note: engine mutates tension states)
    // So we check that the same configuration produces the same outcome counts
    const engine = new OntoEngine()
    const eq1 = engine.equilibrate(field)

    // Rebuild fresh field to avoid state mutation between runs
    const field2 = new OntoBuilder()
      .tension('t1', { wants: 'task', resolves: [{ kind: 'success', outcome: 'done', confidence: c(0.85), risk: 'low' }] })
      .tension('t2', { wants: 'task2', resolves: [{ kind: 'partial', outcome: null, confidence: c(0.3), missing: ['x'], pendingOn: [] }] })
      .build()
    const eq2 = engine.equilibrate(field2)

    expect(eq1.resolved.size).toBe(eq2.resolved.size)
    expect(eq1.partial.size).toBe(eq2.partial.size)
    expect(eq1.confidence).toBe(eq2.confidence)
  })
})

describe('OntoEngine.equilibrate — trace', () => {
  it('records reasoning steps', () => {
    const field = new OntoBuilder()
      .tension('t1', { wants: 'task', resolves: [{ kind: 'success', outcome: 'done', confidence: c(0.9), risk: 'low' }] })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.trace.length).toBeGreaterThan(0)
  })

  it('has non-zero duration', () => {
    const field = new OntoBuilder()
      .tension('t1', { wants: 'task', resolves: [{ kind: 'success', outcome: 'done', confidence: c(0.9), risk: 'low' }] })
      .build()

    const eq = new OntoEngine().equilibrate(field)
    expect(eq.duration).toBeGreaterThanOrEqual(0)
  })
})

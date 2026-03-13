import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryOntoStore } from '@/core/onto-store'
import type { TensionInput } from '@/core/types'

const PROJECT_ID = 'test-project'

function makeTension(id: string, confidence: number, wants = 'test want'): TensionInput {
  return {
    id,
    wants,
    value: `value_${id}`,
    confidence,
    doubts: [],
  }
}

describe('InMemoryOntoStore', () => {
  let store: InMemoryOntoStore

  beforeEach(() => {
    store = new InMemoryOntoStore()
  })

  // ── create ────────────────────────────────────────────────────────

  it('create() initializes an empty field', async () => {
    await store.create(PROJECT_ID, 'test brief')
    const snap = await store.snapshot(PROJECT_ID)

    expect(snap.projectId).toBe(PROJECT_ID)
    expect(snap.tensions).toHaveLength(0)
    expect(snap.summary).toBe('Field empty')
  })

  it('create() clears existing data when called again for same project', async () => {
    await store.create(PROJECT_ID, 'brief 1')
    await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.9)], 'ceo')

    await store.create(PROJECT_ID, 'brief 2') // reset
    const snap = await store.snapshot(PROJECT_ID)
    expect(snap.tensions).toHaveLength(0)
  })

  // ── snapshot before create ────────────────────────────────────────

  it('snapshot() throws for unknown project', async () => {
    await expect(store.snapshot('unknown')).rejects.toThrow('No field for project: unknown')
  })

  // ── upsertTensions ────────────────────────────────────────────────

  it('upsertTensions() adds tensions and returns updated snapshot', async () => {
    await store.create(PROJECT_ID, 'brief')
    const snap = await store.upsertTensions(PROJECT_ID, [
      makeTension('t1', 0.9),
      makeTension('t2', 0.8),
    ], 'ceo')

    expect(snap.tensions).toHaveLength(2)
    expect(snap.tensions.map(t => t.id)).toContain('t1')
    expect(snap.tensions.map(t => t.id)).toContain('t2')
  })

  it('high-confidence tensions (≥0.75) resolve to "resolved" state', async () => {
    await store.create(PROJECT_ID, 'brief')
    const snap = await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.9)], 'ceo')
    const t = snap.tensions.find(t => t.id === 't1')
    expect(t?.state).toBe('resolved')
  })

  it('low-confidence tensions (<0.75) stay partial or active', async () => {
    await store.create(PROJECT_ID, 'brief')
    const snap = await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.4)], 'ceo')
    const t = snap.tensions.find(t => t.id === 't1')
    expect(['partial', 'active', 'blocked']).toContain(t?.state)
  })

  it('snapConfidence snaps to nearest 0.1 — 0.73 → 0.7', async () => {
    await store.create(PROJECT_ID, 'brief')
    const snap = await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.73)], 'ceo')
    const t = snap.tensions.find(t => t.id === 't1')
    // Confidence should be snapped — partial path uses snapped confidence
    expect(t?.confidence).toBeCloseTo(0.7, 1)
  })

  it('snapConfidence snaps 0.75 → 0.8 (rounds up)', async () => {
    await store.create(PROJECT_ID, 'brief')
    const snap = await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.75)], 'ceo')
    // 0.75 rounds to 0.8 → success path → confidence should be 0.8
    const t = snap.tensions.find(t => t.id === 't1')
    expect(t?.confidence).toBeCloseTo(0.8, 1)
  })

  it('snapConfidence floors to 0.1 for 0.0', async () => {
    await store.create(PROJECT_ID, 'brief')
    const snap = await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.0)], 'ceo')
    const t = snap.tensions.find(t => t.id === 't1')
    expect(t?.confidence).toBeGreaterThanOrEqual(0.1)
  })

  // ── ownership ────────────────────────────────────────────────────

  it('getOwner() returns the agent that wrote a tension', async () => {
    await store.create(PROJECT_ID, 'brief')
    await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.9)], 'ceo')
    expect(store.getOwner(PROJECT_ID, 't1')).toBe('ceo')
  })

  it('getOwner() returns undefined for unknown tension', async () => {
    await store.create(PROJECT_ID, 'brief')
    expect(store.getOwner(PROJECT_ID, 'nonexistent')).toBeUndefined()
  })

  it('ownership enforcement: agent cannot overwrite another agent\'s tension', async () => {
    await store.create(PROJECT_ID, 'brief')
    await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.9)], 'ceo')

    await expect(
      store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.7)], 'cto')
    ).rejects.toThrow(/cannot overwrite tension/)
  })

  it('same agent can update its own tension', async () => {
    await store.create(PROJECT_ID, 'brief')
    await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.9)], 'ceo')

    // Should not throw
    await expect(
      store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.95)], 'ceo')
    ).resolves.toBeDefined()
  })

  it('different agents can write different tension ids', async () => {
    await store.create(PROJECT_ID, 'brief')
    await store.upsertTensions(PROJECT_ID, [makeTension('ceo_t1', 0.9)], 'ceo')
    await store.upsertTensions(PROJECT_ID, [makeTension('cto_t1', 0.85)], 'cto')

    const snap = await store.snapshot(PROJECT_ID)
    expect(snap.tensions).toHaveLength(2)
    expect(store.getOwner(PROJECT_ID, 'ceo_t1')).toBe('ceo')
    expect(store.getOwner(PROJECT_ID, 'cto_t1')).toBe('cto')
  })

  // ── equilibrate ───────────────────────────────────────────────────

  it('equilibrate() returns an Equilibrium object', async () => {
    await store.create(PROJECT_ID, 'brief')
    await store.upsertTensions(PROJECT_ID, [makeTension('t1', 0.9)], 'ceo')

    const eq = await store.equilibrate(PROJECT_ID)
    expect(eq).toHaveProperty('resolved')
    expect(eq).toHaveProperty('partial')
    expect(eq).toHaveProperty('confidence')
    expect(eq).toHaveProperty('passes')
  })

  it('globalConfidence is correct from both upsertTensions and subsequent snapshot()', async () => {
    await store.create(PROJECT_ID, 'brief')
    const before = await store.snapshot(PROJECT_ID) // empty field → 0

    const snap = await store.upsertTensions(PROJECT_ID, [
      makeTension('t1', 0.9),
      makeTension('t2', 0.85),
    ], 'ceo')
    expect(snap.globalConfidence).toBeGreaterThan(before.globalConfidence)

    // snapshot() must also return the correct value, not 0
    const reread = await store.snapshot(PROJECT_ID)
    expect(reread.globalConfidence).toBeCloseTo(snap.globalConfidence, 5)
  })

  // ── isolation between projects ────────────────────────────────────

  it('fields are isolated between projects', async () => {
    await store.create('project-A', 'brief A')
    await store.create('project-B', 'brief B')

    await store.upsertTensions('project-A', [makeTension('t1', 0.9)], 'ceo')
    const snapB = await store.snapshot('project-B')

    expect(snapB.tensions).toHaveLength(0)
  })
})

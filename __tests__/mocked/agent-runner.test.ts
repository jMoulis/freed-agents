import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// Mock the 'ai' module before importing agent-runner
vi.mock('ai', () => ({
  generateText: vi.fn(),
  tool: vi.fn((def: any) => def),
  Output: { object: vi.fn((opts: any) => opts) },
  stepCountIs: vi.fn((n: number) => n),
}))

import { runAgent } from '@/core/agent-runner'
import { InMemoryOntoStore } from '@/core/onto-store'
import type { RunContext, ModelRef } from '@/lib/context'
import type { AgentConfig } from '@/core/agent-runner'
import { generateText } from 'ai'

// ── Helpers ────────────────────────────────────────────────────────

const mockModel = { provider: 'anthropic', modelId: 'claude-test' } as unknown as ReturnType<any>

function makeCtx(store: InMemoryOntoStore): RunContext {
  return {
    models: {
      resolve: vi.fn().mockReturnValue(mockModel),
    } as any,
    store,
  }
}

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    role: 'ceo',
    name: 'Test CEO',
    model: { provider: 'anthropic', modelId: 'claude-test' } as ModelRef,
    system: 'You are a test agent.',
    method: 'generateObject',
    outputSchema: z.object({ title: z.string() }),
    ...overrides,
  }
}

const mockGenerateText = generateText as ReturnType<typeof vi.fn>

// ── Tests ──────────────────────────────────────────────────────────

describe('runAgent — generateObject mode', () => {
  let store: InMemoryOntoStore

  beforeEach(async () => {
    vi.clearAllMocks()
    store = new InMemoryOntoStore()
    await store.create('proj-1', 'test brief')

    mockGenerateText.mockResolvedValue({
      output: { title: 'Test Project' },
      steps: [],
      finishReason: 'stop',
      totalUsage: { inputTokens: 100, outputTokens: 50 },
    })
  })

  it('returns AgentRunResult with correct shape', async () => {
    const ctx = makeCtx(store)
    const result = await runAgent(makeConfig(), 'proj-1', ctx, 'Build me an app')

    expect(result.role).toBe('ceo')
    expect(result.name).toBe('Test CEO')
    expect(result.output).toEqual({ title: 'Test Project' })
    expect(result.finish_reason).toBe('stop')
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    expect(result.duration_ms).toBeGreaterThanOrEqual(0)
    expect(result.reasoning_raw).toBeNull() // no reasoning steps
    expect(result.tensions_written).toEqual([])
  })

  it('throws if outputSchema is missing for generateObject', async () => {
    const ctx = makeCtx(store)
    const config = makeConfig({ outputSchema: undefined })
    await expect(runAgent(config, 'proj-1', ctx, 'test')).rejects.toThrow('outputSchema required')
  })

  it('injects read_field and update_field tools into generateText call', async () => {
    const ctx = makeCtx(store)
    await runAgent(makeConfig(), 'proj-1', ctx, 'test')

    expect(mockGenerateText).toHaveBeenCalledOnce()
    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.tools).toHaveProperty('read_field')
    expect(callArgs.tools).toHaveProperty('update_field')
  })

  it('read_field tool.execute returns a FieldSnapshot', async () => {
    const ctx = makeCtx(store)
    await runAgent(makeConfig(), 'proj-1', ctx, 'test')

    const callArgs = mockGenerateText.mock.calls[0][0]
    const snap = await callArgs.tools.read_field.execute({})
    expect(snap).toHaveProperty('projectId', 'proj-1')
    expect(snap).toHaveProperty('tensions')
  })

  it('update_field tool.execute calls upsertTensions and tracks tensions_written', async () => {
    const ctx = makeCtx(store)
    // Intercept the second call (when tools are actually invoked) by
    // having generateText call the tool
    let capturedTools: any
    mockGenerateText.mockImplementationOnce(async (opts: any) => {
      capturedTools = opts.tools
      // Simulate agent calling update_field
      await opts.tools.update_field.execute({
        tensions: [{ id: 'ceo_t1', wants: 'Build API', value: 'REST', confidence: 0.9, doubts: [] }],
      })
      return {
        output: { title: 'Project' },
        steps: [],
        finishReason: 'stop',
        totalUsage: { inputTokens: 50, outputTokens: 25 },
      }
    })

    const result = await runAgent(makeConfig(), 'proj-1', ctx, 'test')
    expect(result.tensions_written).toHaveLength(1)
    expect(result.tensions_written[0].id).toBe('ceo_t1')

    // Verify the tension was actually written to the store
    const owner = store.getOwner('proj-1', 'ceo_t1')
    expect(owner).toBe('ceo')
  })

  it('propagates finish_reason from generateText', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {},
      steps: [],
      finishReason: 'length',
      totalUsage: { inputTokens: 10, outputTokens: 5 },
    })
    const ctx = makeCtx(store)
    const result = await runAgent(makeConfig(), 'proj-1', ctx, 'test')
    expect(result.finish_reason).toBe('length')
  })
})

describe('runAgent — generateText mode', () => {
  let store: InMemoryOntoStore

  beforeEach(async () => {
    vi.clearAllMocks()
    store = new InMemoryOntoStore()
    await store.create('proj-2', 'brief')

    mockGenerateText.mockResolvedValue({
      text: 'Here is my analysis...',
      steps: [],
      finishReason: 'stop',
      totalUsage: { inputTokens: 200, outputTokens: 100 },
    })
  })

  it('uses result.text as output for generateText method', async () => {
    const ctx = makeCtx(store)
    const config = makeConfig({ method: 'generateText', outputSchema: undefined })
    const result = await runAgent(config, 'proj-2', ctx, 'analyze')
    expect(result.output).toBe('Here is my analysis...')
  })
})

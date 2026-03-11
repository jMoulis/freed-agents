/**
 * FREED AGENTS — RunContext
 *
 * Tout ce dont les agents ont besoin, injecté explicitement.
 * Les secrets ne vivent QUE dans les routes API Next.js —
 * jamais dans les agents, jamais dans le core.
 *
 * Usage dans une route API :
 *
 *   import { createContext } from '@/lib/context'
 *
 *   export async function POST(req: NextRequest) {
 *     const ctx = createContext({
 *       anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
 *       xaiApiKey: process.env.XAI_API_KEY!,
 *       mongoUri: process.env.MONGODB_URI,
 *       storeMode: process.env.FIELD_STORE as StoreMode ?? 'memory',
 *     })
 *     // passer ctx aux agents...
 *   }
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createXai } from '@ai-sdk/xai'
import { LanguageModel } from 'ai'
import { InMemoryOntoStore, IOntoStore } from '@/core/onto-store'

// ═══════════════════════════════════════════════════════════════
// CONFIG — ce que la route API fournit
// ═══════════════════════════════════════════════════════════════

export type StoreMode = 'memory' | 'mongo'

export interface ContextConfig {
  anthropicApiKey: string
  xaiApiKey?: string
  mongoUri?: string
  storeMode?: StoreMode
}

// ═══════════════════════════════════════════════════════════════
// MODEL REGISTRY — résout un modèle sans accéder à process.env
// ═══════════════════════════════════════════════════════════════

export type ModelProvider = 'anthropic' | 'xai'

export interface ModelRef {
  provider: ModelProvider
  modelId: string
}

export class ModelRegistry {
  private anthropic: ReturnType<typeof createAnthropic> | null = null
  private xai: ReturnType<typeof createXai> | null = null

  constructor(private config: ContextConfig) {
    if (config.anthropicApiKey) {
      this.anthropic = createAnthropic({ apiKey: config.anthropicApiKey })
    }
    if (config.xaiApiKey) {
      this.xai = createXai({ apiKey: config.xaiApiKey })
    }
  }

  resolve(ref: ModelRef): LanguageModel {
    switch (ref.provider) {
      case 'anthropic': {
        if (!this.anthropic) throw new Error('Anthropic API key not configured')
        return this.anthropic(ref.modelId)
      }
      case 'xai': {
        if (!this.xai) throw new Error('xAI API key not configured')
        return this.xai.chat(ref.modelId)
      }
      default:
        throw new Error(`Unknown provider: ${(ref as any).provider}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RUN CONTEXT — unité d'injection
// ═══════════════════════════════════════════════════════════════

export interface RunContext {
  models: ModelRegistry
  store: IOntoStore
}

// ═══════════════════════════════════════════════════════════════
// FACTORY — appelée uniquement depuis les routes API
// ═══════════════════════════════════════════════════════════════

export function createContext(config: ContextConfig): RunContext {
  const models = new ModelRegistry(config)

  let store: IOntoStore

  if (config.storeMode === 'mongo') {
    if (!config.mongoUri) {
      throw new Error('MONGODB_URI required when storeMode is "mongo"')
    }
    console.warn('[RunContext] MongoOntoStore not yet wired — falling back to InMemory')
    store = new InMemoryOntoStore()
  } else {
    store = new InMemoryOntoStore()
  }

  return { models, store }
}

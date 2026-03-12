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

import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { LanguageModel } from "ai";
import {
  InMemoryOntoStore,
  MongoOntoStore,
  IOntoStore,
} from "@/core/onto-store";

// ═══════════════════════════════════════════════════════════════
// CONFIG — ce que la route API fournit
// ═══════════════════════════════════════════════════════════════

export type StoreMode = "memory" | "mongo";

export interface ContextConfig {
  anthropicApiKey: string;
  xaiApiKey?: string;
  mongoUri?: string;
  storeMode?: StoreMode;
  store?: IOntoStore; // ← ajouter
}

// ═══════════════════════════════════════════════════════════════
// MODEL REGISTRY — résout un modèle sans accéder à process.env
// ═══════════════════════════════════════════════════════════════

export type ModelProvider = "anthropic" | "xai";

export interface ModelRef {
  provider: ModelProvider;
  modelId: string;
}

export class ModelRegistry {
  private anthropic: ReturnType<typeof createAnthropic> | null = null;
  private xai: ReturnType<typeof createXai> | null = null;

  constructor(private config: ContextConfig) {
    if (config.anthropicApiKey) {
      this.anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
    }
    if (config.xaiApiKey) {
      this.xai = createXai({ apiKey: config.xaiApiKey });
    }
  }

  resolve(ref: ModelRef): LanguageModel {
    switch (ref.provider) {
      case "anthropic": {
        if (!this.anthropic)
          throw new Error("Anthropic API key not configured");
        return this.anthropic(ref.modelId);
      }
      case "xai": {
        if (!this.xai) throw new Error("xAI API key not configured");
        return this.xai.chat(ref.modelId);
      }
      default:
        throw new Error(`Unknown provider: ${(ref as any).provider}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RUN CONTEXT — unité d'injection
// ═══════════════════════════════════════════════════════════════

export interface RunContext {
  models: ModelRegistry;
  store: IOntoStore;
}

// ═══════════════════════════════════════════════════════════════
// FACTORY — appelée uniquement depuis les routes API
// ═══════════════════════════════════════════════════════════════

declare global {
  var __mongoOntoStore: MongoOntoStore | undefined;
}
if (!global.__mongoOntoStore) {
  global.__mongoOntoStore = new MongoOntoStore();
}

export function createContext(config: ContextConfig): RunContext {
  const models = new ModelRegistry(config);

  const store: IOntoStore =
    config.store ??
    (config.storeMode === "mongo"
      ? global.__mongoOntoStore!
      : new InMemoryOntoStore());

  return { models, store };
}

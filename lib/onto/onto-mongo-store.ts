/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ONTO MONGO STORE — v0.1                                         ║
 * ║  MongoDB Atlas implementation of OntoStoreAdapter               ║
 * ║                                                                  ║
 * ║  Drop-in replacement for InMemoryOntoStore.                     ║
 * ║  Switch via ONTO_STORE=mongo in .env                            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Setup:
 *   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/onto
 *   ONTO_STORE=mongo
 */

import { MongoClient, Db, Collection, IndexDescription } from "mongodb";
import {
  OntoStoreAdapter,
  OntoFieldDocument,
  OntoTensionDocument,
  OntoEquilibriumDocument,
  OntoAgentDocument,
} from "./onto-persistence";

// ═══════════════════════════════════════════════════════════════════
// INDEX DEFINITIONS — documentés ici, créés au connect()
// ═══════════════════════════════════════════════════════════════════

const INDEXES: Record<string, IndexDescription[]> = {
  onto_fields: [
    { key: { field_id: 1 }, unique: true },
    { key: { created_by: 1, created_at: -1 } },
    { key: { equilibrium_status: 1, updated_at: -1 } },
    { key: { tags: 1 } },
    { key: { session_id: 1 } },
  ],
  onto_tensions: [
    { key: { field_id: 1, tension_id: 1 }, unique: true },
    { key: { field_id: 1 } },
    { key: { field_id: 1, phase: 1 } },
    { key: { field_id: 1, is_resolved: 1 } },
  ],
  onto_equilibria: [
    { key: { field_id: 1, computed_at: -1 } },
    { key: { field_id: 1, is_latest: 1 } },
  ],
  onto_agents: [{ key: { agent_id: 1 }, unique: true }],
};

// ═══════════════════════════════════════════════════════════════════
// MONGO STORE
// ═══════════════════════════════════════════════════════════════════

export class MongoOntoStore implements OntoStoreAdapter {
  private client: MongoClient;
  private db!: Db;

  private get fields(): Collection<OntoFieldDocument> {
    return this.db.collection("onto_fields");
  }
  private get tensions(): Collection<OntoTensionDocument> {
    return this.db.collection("onto_tensions");
  }
  private get equilibria(): Collection<OntoEquilibriumDocument> {
    return this.db.collection("onto_equilibria");
  }
  private get agents(): Collection<OntoAgentDocument> {
    return this.db.collection("onto_agents");
  }

  constructor(uri: string, dbName = "onto") {
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.db.databaseName);
    await this.ensureIndexes();
    console.log("  ∷ MongoOntoStore connected and indexes ensured.");
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  private async ensureIndexes(): Promise<void> {
    for (const [collection, indexes] of Object.entries(INDEXES)) {
      const col = this.db.collection(collection);
      for (const index of indexes) {
        await col
          .createIndex(index.key as any, {
            unique: index.unique ?? false,
            background: true,
          })
          .catch(() => {}); // ignore if already exists
      }
    }
  }

  // ─── Fields ──────────────────────────────────────────────────────

  async upsertField(doc: OntoFieldDocument): Promise<void> {
    await this.fields.replaceOne(
      { field_id: doc.field_id },
      { ...doc, updated_at: new Date() },
      { upsert: true },
    );
  }

  async getField(field_id: string): Promise<OntoFieldDocument | null> {
    return this.fields.findOne({ field_id }, { projection: { _id: 0 } });
  }

  async listFields(filter: {
    agent_id?: string;
    status?: string;
    tags?: string[];
  }): Promise<OntoFieldDocument[]> {
    const query: Record<string, any> = {};
    if (filter.agent_id) query.created_by = filter.agent_id;
    if (filter.status) query.equilibrium_status = filter.status;
    if (filter.tags?.length) query.tags = { $all: filter.tags };

    return this.fields
      .find(query, { projection: { _id: 0 } })
      .sort({ updated_at: -1 })
      .toArray();
  }

  // ─── Tensions ────────────────────────────────────────────────────

  async upsertTension(doc: OntoTensionDocument): Promise<void> {
    await this.tensions.replaceOne(
      { _id: doc._id as any },
      { ...doc, updated_at: new Date() },
      { upsert: true },
    );
  }

  async getTensions(field_id: string): Promise<OntoTensionDocument[]> {
    return this.tensions
      .find({ field_id }, { projection: { _id: 0 } })
      .toArray();
  }

  async updateTensionPhase(
    field_id: string,
    tension_id: string,
    phase: string,
    confidence: number,
  ): Promise<void> {
    await this.tensions.updateOne(
      { field_id, tension_id },
      {
        $set: {
          phase,
          confidence,
          is_resolved: phase === "equilibrated",
          is_blocked: phase === "conflicting",
          updated_at: new Date(),
        },
      },
    );
  }

  // ─── Equilibria ──────────────────────────────────────────────────

  async saveEquilibrium(doc: OntoEquilibriumDocument): Promise<void> {
    // Marquer l'ancien latest comme non-latest
    await this.equilibria.updateMany(
      { field_id: doc.field_id, is_latest: true },
      { $set: { is_latest: false } },
    );
    await this.equilibria.insertOne(doc as any);
  }

  async getLatestEquilibrium(
    field_id: string,
  ): Promise<OntoEquilibriumDocument | null> {
    return this.equilibria.findOne(
      { field_id, is_latest: true },
      { projection: { _id: 0 } },
    );
  }

  async getEquilibriumHistory(
    field_id: string,
  ): Promise<OntoEquilibriumDocument[]> {
    return this.equilibria
      .find({ field_id }, { projection: { _id: 0 } })
      .sort({ computed_at: 1 })
      .toArray();
  }

  // ─── Agents ──────────────────────────────────────────────────────

  async upsertAgent(doc: OntoAgentDocument): Promise<void> {
    await this.agents.replaceOne(
      { agent_id: doc.agent_id },
      { ...doc, last_active: new Date() },
      { upsert: true },
    );
  }

  async getAgent(agent_id: string): Promise<OntoAgentDocument | null> {
    return this.agents.findOne({ agent_id }, { projection: { _id: 0 } });
  }
}

// ═══════════════════════════════════════════════════════════════════
// FACTORY — choisit le store selon l'env
// ═══════════════════════════════════════════════════════════════════

import { InMemoryOntoStore } from "./onto-persistence";

export async function createOntoStore(): Promise<OntoStoreAdapter> {
  const mode = "mongo";

  if (mode === "mongo") {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required when ONTO_STORE=mongo");
    const db = process.env.MONGODB_DB;
    const store = new MongoOntoStore(uri, db);
    await store.connect();
    return store;
  }

  return new InMemoryOntoStore();
}

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ONTO PERSISTENCE — v0.1                                         ║
 * ║  MongoDB schema + access layer for Onto Fields                   ║
 * ║                                                                  ║
 * ║  Stratégie hybride validée par Lab 03 :                         ║
 * ║  - Petit Field (< p90) → document unique atomique               ║
 * ║  - Grand Field (>= p90) → tensions individuelles + field_ref    ║
 * ║                                                                  ║
 * ║  Un Field persisté = mémoire inter-sessions inter-agents.       ║
 * ║  Un agent qui repart de zéro est un agent qui oublie.           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import {
  Field,
  Tension,
  TensionId,
  KnowledgeId,
  SituatedKnowledge,
  Confidence,
  Equilibrium,
  Resolution,
} from './onto-engine';

// ═══════════════════════════════════════════════════════════════════
// SEUILS — issus des benchmarks Lab 03
// ═══════════════════════════════════════════════════════════════════

const THRESHOLDS = {
  SMALL_FIELD_MAX_TENSIONS: 31,   // p90 = 31 tensions
  SMALL_FIELD_MAX_KB: 48,   // p90 = 48KB sérialisé
  COLLECTION_FIELDS: 'onto_fields',
  COLLECTION_TENSIONS: 'onto_tensions',
  COLLECTION_EQUILIBRIA: 'onto_equilibria',
  COLLECTION_AGENTS: 'onto_agents',
}

// ═══════════════════════════════════════════════════════════════════
// MONGODB DOCUMENT SCHEMAS
// (typés pour clarté — en prod on utiliserait zod ou mongoose)
// ═══════════════════════════════════════════════════════════════════

/**
 * onto_fields — metadata + contenu complet pour petits Fields
 *
 * Index :
 *   { field_id: 1 }              unique
 *   { agent_id: 1, created_at: -1 }
 *   { status: 1, updated_at: -1 }
 *   { "tags": 1 }               pour recherche par domaine
 */
export interface OntoFieldDocument {
  // Identity
  _id: string           // === field_id, pas d'ObjectId séparé
  field_id: string           // ex: "onto:persistence:20250310:a3f9"
  version: number           // increment à chaque write
  schema_version: '0.1'

  // Provenance
  created_at: Date
  updated_at: Date
  created_by: string           // agent_id ou "human:julien"
  session_id: string           // pour regrouper les fields d'une session

  // Classification
  tags: string[]         // ["architecture", "mongodb", "persistence"]
  title?: string           // optionnel, lisible humain
  problem: string           // description du problème traité

  // Stratégie de stockage
  storage_mode: 'inline' | 'distributed'

  // Epistemic state
  epistemic_health: number        // 0-1, issu du dernier TypeCheck
  equilibrium_status: 'unrun' | 'partial' | 'resolved' | 'blocked' | 'resisting'
  overall_confidence: number      // confidence du dernier Equilibrium

  // Pour storage_mode = 'inline' : tout est ici
  // Pour storage_mode = 'distributed' : shared_knowledge ici, tensions dans onto_tensions
  shared_knowledge: SerializedKnowledgeMap

  // Inline seulement
  tensions_inline?: SerializedTensionMap

  // Stats pour décision de migration inline ↔ distributed
  tension_count: number
  knowledge_count: number
  estimated_kb: number
}

/**
 * onto_tensions — tensions individuelles pour grands Fields
 *
 * Index :
 *   { field_id: 1, tension_id: 1 }   unique
 *   { field_id: 1 }
 *   { field_id: 1, "state.phase": 1 }
 *   { field_id: 1, "state.phase": 1, updated_at: -1 }
 */
export interface OntoTensionDocument {
  _id: string             // `${field_id}::${tension_id}`
  field_id: string
  tension_id: string
  version: number

  updated_at: Date
  updated_by: string             // agent_id qui a mis à jour

  // Le contenu sérialisé de la tension
  tension: SerializedTension

  // Dénormalisé pour queries rapides sans désérialiser
  phase: string             // dormant | active | equilibrated | resisting | conflicting
  confidence: number             // confidence de la résolution courante
  is_resolved: boolean
  is_blocked: boolean
}

/**
 * onto_equilibria — historique des équilibres
 * On garde tous les équilibres, pas seulement le dernier.
 * Le raisonnement a une histoire.
 *
 * Index :
 *   { field_id: 1, computed_at: -1 }
 *   { field_id: 1, is_latest: 1 }
 */
export interface OntoEquilibriumDocument {
  _id: string            // `${field_id}::eq::${timestamp}`
  field_id: string
  computed_at: Date
  computed_by: string            // agent_id
  is_latest: boolean

  // Résumé dénormalisé
  resolved_count: number
  partial_count: number
  blocked_count: number
  resisting_count: number
  confidence: number
  passes: number
  duration_ms: number

  // Payload complet
  resolved: Record<string, SerializedResolution>
  resisting: Record<string, string>
  partial: Record<string, SerializedPartialPath>
  blocked: Record<string, SerializedBlockedPath>
  trace: SerializedReasoningStep[]
}

/**
 * onto_agents — registre des agents qui ont contribué à des Fields
 *
 * Index :
 *   { agent_id: 1 }   unique
 */
export interface OntoAgentDocument {
  _id: string        // === agent_id
  agent_id: string        // ex: "benchmark-agent-v1"
  model: string        // ex: "claude-sonnet-4"
  created_at: Date
  last_active: Date

  // Profil épistémique accumulé
  total_fields_contributed: number
  avg_confidence: number
  confidence_inflation_rate: number  // % de fois où le TypeChecker a recalé cet agent
  strong_domains: string[]
  weak_domains: string[]
}

// ═══════════════════════════════════════════════════════════════════
// TYPES DE SÉRIALISATION
// Maps → Objects pour MongoDB, branded types → strings
// ═══════════════════════════════════════════════════════════════════

type SerializedKnowledgeMap = Record<string, {
  value: unknown
  origin: { source: string; timestamp: number; method: string }
  confidence: number
  validUntil: unknown
  derivedFrom?: string[]
}>

type SerializedTensionMap = Record<string, SerializedTension>

interface SerializedTension {
  id: string
  wants: { description: string; priority: number }
  knows: SerializedKnowledgeMap
  doubts: Array<{ about: string; severity: string; blocksPath?: string[] }>
  linkedTo: string[]
  resolves: unknown[]
  state: unknown
  trace: SerializedReasoningStep[]
}

interface SerializedResolution {
  path: unknown
  at: number
  passNumber: number
  confidence: number
}

interface SerializedPartialPath {
  kind: 'partial'
  outcome: unknown
  confidence: number
  missing: string[]
  pendingOn: string[]
}

interface SerializedBlockedPath {
  kind: 'blocked'
  blockedBy: string
  liftWhen: string
}

interface SerializedReasoningStep {
  pass: number
  action: string
  before: unknown
  after: unknown
  triggered_by?: string
  note?: string
}

// ═══════════════════════════════════════════════════════════════════
// SERIALIZER — Field → MongoDB documents
// ═══════════════════════════════════════════════════════════════════

export class OntoSerializer {

  serializeKnowledgeMap(map: Map<KnowledgeId, SituatedKnowledge>): SerializedKnowledgeMap {
    const result: SerializedKnowledgeMap = {}
    for (const [id, k] of map) {
      result[id] = {
        value: k.value,
        origin: k.origin,
        confidence: k.confidence,
        validUntil: k.validUntil,
        derivedFrom: k.derivedFrom,
      }
    }
    return result
  }

  serializeTension(t: Tension): SerializedTension {
    return {
      id: t.id,
      wants: t.wants,
      knows: this.serializeKnowledgeMap(t.knows),
      doubts: t.doubts,
      linkedTo: t.linkedTo,
      resolves: t.resolves,
      state: t.state,
      trace: t.trace,
    }
  }

  serializeTensionMap(map: Map<TensionId, Tension>): SerializedTensionMap {
    const result: SerializedTensionMap = {}
    for (const [id, t] of map) {
      result[id] = this.serializeTension(t)
    }
    return result
  }

  estimateSizeKb(field: Field): number {
    // Estimation rapide sans sérialiser tout
    const knowledgeEntries = field.sharedKnowledge.size
    const tensionCount = field.tensions.size
    return (knowledgeEntries * 0.8) + (tensionCount * 1.2) // KB approximatif
  }

  isSmallField(field: Field): boolean {
    return (
      field.tensions.size < THRESHOLDS.SMALL_FIELD_MAX_TENSIONS &&
      this.estimateSizeKb(field) < THRESHOLDS.SMALL_FIELD_MAX_KB
    )
  }
}

// ═══════════════════════════════════════════════════════════════════
// ONTO STORE — Interface d'accès (MongoDB-agnostic pour les tests)
// ═══════════════════════════════════════════════════════════════════

export interface OntoStoreAdapter {
  // Fields
  upsertField(doc: OntoFieldDocument): Promise<void>
  getField(field_id: string): Promise<OntoFieldDocument | null>
  listFields(filter: { agent_id?: string; status?: string; tags?: string[] }): Promise<OntoFieldDocument[]>

  // Tensions (mode distributed)
  upsertTension(doc: OntoTensionDocument): Promise<void>
  getTensions(field_id: string): Promise<OntoTensionDocument[]>
  updateTensionPhase(field_id: string, tension_id: string, phase: string, confidence: number): Promise<void>

  // Equilibria
  saveEquilibrium(doc: OntoEquilibriumDocument): Promise<void>
  getLatestEquilibrium(field_id: string): Promise<OntoEquilibriumDocument | null>
  getEquilibriumHistory(field_id: string): Promise<OntoEquilibriumDocument[]>

  // Agents
  upsertAgent(doc: OntoAgentDocument): Promise<void>
  getAgent(agent_id: string): Promise<OntoAgentDocument | null>
}

// ═══════════════════════════════════════════════════════════════════
// ONTO STORE — Implémentation in-memory pour R&D
// En prod : remplacer par l'implémentation MongoDB
// ═══════════════════════════════════════════════════════════════════

export class InMemoryOntoStore implements OntoStoreAdapter {
  private fields = new Map<string, OntoFieldDocument>()
  private tensions = new Map<string, OntoTensionDocument>()
  private equilibria = new Map<string, OntoEquilibriumDocument[]>()
  private agents = new Map<string, OntoAgentDocument>()

  async upsertField(doc: OntoFieldDocument): Promise<void> {
    this.fields.set(doc.field_id, doc)
  }

  async getField(field_id: string): Promise<OntoFieldDocument | null> {
    return this.fields.get(field_id) ?? null
  }

  async listFields(filter: { agent_id?: string; status?: string; tags?: string[] }): Promise<OntoFieldDocument[]> {
    return [...this.fields.values()].filter(f => {
      if (filter.agent_id && f.created_by !== filter.agent_id) return false
      if (filter.status && f.equilibrium_status !== filter.status) return false
      if (filter.tags && !filter.tags.every(t => f.tags.includes(t))) return false
      return true
    })
  }

  async upsertTension(doc: OntoTensionDocument): Promise<void> {
    this.tensions.set(doc._id, doc)
  }

  async getTensions(field_id: string): Promise<OntoTensionDocument[]> {
    return [...this.tensions.values()].filter(t => t.field_id === field_id)
  }

  async updateTensionPhase(field_id: string, tension_id: string, phase: string, confidence: number): Promise<void> {
    const key = `${field_id}::${tension_id}`
    const doc = this.tensions.get(key)
    if (doc) {
      this.tensions.set(key, {
        ...doc,
        phase,
        confidence,
        is_resolved: phase === 'equilibrated',
        is_blocked: phase === 'conflicting',
        updated_at: new Date(),
      })
    }
  }

  async saveEquilibrium(doc: OntoEquilibriumDocument): Promise<void> {
    const history = this.equilibria.get(doc.field_id) ?? []
    // Marquer les anciens comme non-latest
    const updated = history.map(e => ({ ...e, is_latest: false }))
    this.equilibria.set(doc.field_id, [...updated, doc])
  }

  async getLatestEquilibrium(field_id: string): Promise<OntoEquilibriumDocument | null> {
    const history = this.equilibria.get(field_id) ?? []
    return history.find(e => e.is_latest) ?? null
  }

  async getEquilibriumHistory(field_id: string): Promise<OntoEquilibriumDocument[]> {
    return this.equilibria.get(field_id) ?? []
  }

  async upsertAgent(doc: OntoAgentDocument): Promise<void> {
    this.agents.set(doc.agent_id, doc)
  }

  async getAgent(agent_id: string): Promise<OntoAgentDocument | null> {
    return this.agents.get(agent_id) ?? null
  }

  // Stats pour debug
  stats() {
    return {
      fields: this.fields.size,
      tensions: this.tensions.size,
      equilibria: [...this.equilibria.values()].reduce((n, h) => n + h.length, 0),
      agents: this.agents.size,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// ONTO PERSISTENCE SERVICE — La vraie interface applicative
// ═══════════════════════════════════════════════════════════════════

export class OntoPersistenceService {
  private serializer = new OntoSerializer()

  constructor(private store: OntoStoreAdapter) { }

  /**
   * Sauvegarder un Field après TypeCheck + Equilibration.
   * Choisit automatiquement inline vs distributed.
   */
  async saveField(opts: {
    field: Field
    field_id?: string
    agent_id: string
    session_id: string
    problem: string
    tags?: string[]
    title?: string
    equilibrium?: Equilibrium
    epistemic_health?: number
  }): Promise<string> {

    const field_id = opts.field_id ?? this.generateFieldId()
    const isSmall = this.serializer.isSmallField(opts.field)
    const mode = isSmall ? 'inline' : 'distributed'

    const fieldDoc: OntoFieldDocument = {
      _id: field_id,
      field_id,
      version: 1,
      schema_version: '0.1',

      created_at: new Date(),
      updated_at: new Date(),
      created_by: opts.agent_id,
      session_id: opts.session_id,

      tags: opts.tags ?? [],
      title: opts.title,
      problem: opts.problem,

      storage_mode: mode,

      epistemic_health: opts.epistemic_health ?? 1.0,
      equilibrium_status: this.deriveStatus(opts.equilibrium),
      overall_confidence: opts.equilibrium?.confidence ?? 0,

      shared_knowledge: this.serializer.serializeKnowledgeMap(opts.field.sharedKnowledge),
      tensions_inline: isSmall
        ? this.serializer.serializeTensionMap(opts.field.tensions)
        : undefined,

      tension_count: opts.field.tensions.size,
      knowledge_count: opts.field.sharedKnowledge.size,
      estimated_kb: this.serializer.estimateSizeKb(opts.field),
    }

    await this.store.upsertField(fieldDoc)

    // Mode distributed — sauvegarder chaque tension séparément
    if (!isSmall) {
      for (const [tid, tension] of opts.field.tensions) {
        const tensionDoc: OntoTensionDocument = {
          _id: `${field_id}::${tid}`,
          field_id,
          tension_id: tid,
          version: 1,
          updated_at: new Date(),
          updated_by: opts.agent_id,
          tension: this.serializer.serializeTension(tension),
          phase: tension.state.phase,
          confidence: this.extractTensionConfidence(tension),
          is_resolved: tension.state.phase === 'equilibrated',
          is_blocked: tension.state.phase === 'conflicting',
        }
        await this.store.upsertTension(tensionDoc)
      }
    }

    // Sauvegarder l'equilibrium si fourni
    if (opts.equilibrium) {
      await this.saveEquilibrium(field_id, opts.equilibrium, opts.agent_id)
    }

    return field_id
  }

  /**
   * Sauvegarder un Equilibrium dans l'historique.
   * On garde tout — le raisonnement a une histoire.
   */
  async saveEquilibrium(field_id: string, eq: Equilibrium, agent_id: string): Promise<void> {
    const resolved: Record<string, SerializedResolution> = {}
    for (const [id, res] of eq.resolved) {
      resolved[id] = { path: res.path, at: res.at, passNumber: res.passNumber, confidence: res.confidence }
    }

    const partial: Record<string, SerializedPartialPath> = {}
    for (const [id, path] of eq.partial) {
      partial[id] = path as SerializedPartialPath
    }

    const blocked: Record<string, SerializedBlockedPath> = {}
    for (const [id, path] of eq.blocked) {
      blocked[id] = path as SerializedBlockedPath
    }

    const doc: OntoEquilibriumDocument = {
      _id: `${field_id}::eq::${Date.now()}`,
      field_id,
      computed_at: new Date(),
      computed_by: agent_id,
      is_latest: true,

      resolved_count: eq.resolved.size,
      partial_count: eq.partial.size,
      blocked_count: eq.blocked.size,
      resisting_count: eq.resisting.size,
      confidence: eq.confidence,
      passes: eq.passes,
      duration_ms: eq.duration,

      resolved,
      resisting: Object.fromEntries(eq.resisting),
      partial,
      blocked,
      trace: eq.trace,
    }

    await this.store.saveEquilibrium(doc)
  }

  /**
   * Charger un Field depuis MongoDB → Field Onto.
   * Un agent peut reprendre là où un autre s'est arrêté.
   */
  async loadField(field_id: string): Promise<Field | null> {
    const doc = await this.store.getField(field_id)
    if (!doc) return null

    const field: Field = {
      tensions: new Map(),
      sharedKnowledge: new Map(),
      perspectives: new Map(),
    }

    // Désérialiser sharedKnowledge
    for (const [id, k] of Object.entries(doc.shared_knowledge)) {
      field.sharedKnowledge.set(id as KnowledgeId, {
        value: k.value,
        origin: k.origin as any,
        confidence: k.confidence as Confidence,
        validUntil: k.validUntil as any,
        derivedFrom: k.derivedFrom as KnowledgeId[],
      })
    }

    // Tensions inline ou distributed
    const tensionsRaw = doc.tensions_inline
      ?? await this.loadDistributedTensions(field_id)

    for (const [id, t] of Object.entries(tensionsRaw)) {
      field.tensions.set(id as TensionId, {
        id: id as TensionId,
        wants: t.wants,
        knows: this.deserializeKnowledgeMap(t.knows),
        doubts: t.doubts as any,
        linkedTo: t.linkedTo as TensionId[],
        resolves: t.resolves as any,
        state: t.state as any,
        trace: t.trace as any,
      })
    }

    return field
  }

  /**
   * Trouver les Fields qui ont des tensions PARTIAL ou BLOCKED
   * sur un domaine donné — pour qu'un agent sache quoi débloquer.
   */
  async findBlockedFields(tags: string[]): Promise<OntoFieldDocument[]> {
    return this.store.listFields({
      tags,
      status: 'partial',
    })
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private generateFieldId(): string {
    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const rand = Math.random().toString(36).slice(2, 6)
    return `onto:${ts}:${rand}`
  }

  private deriveStatus(eq?: Equilibrium): OntoFieldDocument['equilibrium_status'] {
    if (!eq) return 'unrun'
    if (eq.partial.size > 0) return 'partial'
    if (eq.blocked.size > 0) return 'blocked'
    if (eq.resisting.size > 0) return 'resisting'
    if (eq.resolved.size > 0) return 'resolved'
    return 'unrun'
  }

  private extractTensionConfidence(tension: Tension): number {
    const success = tension.resolves.find(r => r.kind === 'success')
    return success ? (success as any).confidence : 0
  }

  private deserializeKnowledgeMap(raw: SerializedKnowledgeMap): Map<KnowledgeId, SituatedKnowledge> {
    const map = new Map<KnowledgeId, SituatedKnowledge>()
    for (const [id, k] of Object.entries(raw)) {
      map.set(id as KnowledgeId, {
        value: k.value,
        origin: k.origin as any,
        confidence: k.confidence as Confidence,
        validUntil: k.validUntil as any,
        derivedFrom: k.derivedFrom as KnowledgeId[],
      })
    }
    return map
  }

  private async loadDistributedTensions(field_id: string): Promise<SerializedTensionMap> {
    const docs = await this.store.getTensions(field_id)
    const result: SerializedTensionMap = {}
    for (const doc of docs) {
      result[doc.tension_id] = doc.tension
    }
    return result
  }
}

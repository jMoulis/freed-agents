/**
 * FREED AGENTS — Agent Database
 *
 * MongoDB-backed agent registry. Replaces config/agents.json + agent-registry.ts.
 * Tracks AgentRecord per type, ProjectAssignment per run.
 *
 * Never reads process.env — mongoUri is injected from RunContext (via route.ts).
 */

import { MongoClient, Collection, Db } from "mongodb";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { ModelRef, ModelProvider } from "@/lib/context";
import {
  COLLECTION_AGENTS,
  COLLECTION_PROJECT_ASSIGNEMENTS,
  DB_NAME,
} from "@/config/COLLECTIONS";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type AgentType =
  | "ceo"
  | "cto"
  | "qa"
  | "lead_front"
  | "lead_back"
  | "data_architect"
  | "ai_architect";

export type RecruitableAgentType = Extract<
  AgentType,
  "lead_front" | "lead_back" | "data_architect" | "ai_architect"
>;

export type AgentStatus = "available" | "active" | "fired" | "retired";

export interface RunSnapshot {
  score: number;
  tension_resolution_rate: number | null;
  completionTokens: number;
  modelId: string;
  finishReason: string;
  timestamp: number; // epoch ms
}

export interface AgentRecord {
  type: AgentType;
  model: string;
  status: AgentStatus;
  recruitable: boolean;
  speciality: string;
  behavioral_history: {
    sessions: number;
    avg_efficiency: number | null;
    tension_resolution_rate: number | null;
  };
  model_performance: Record<
    string,
    { sessions: number; avg_score: number; avg_tokens: number }
  >;
  recent_runs: RunSnapshot[];
  recruited_at: Date;
  fired_at?: Date;
  fired_reason?: "budget_exhausted" | "length_repeat" | "score_threshold";
}

export interface ProjectAssignment {
  projectId: string;
  agentType: RecruitableAgentType;
  role: string;
  recruited_at: Date;
  released_at?: Date;
}

// ═══════════════════════════════════════════════════════════════
// STATIC CONFIG — source of truth for valid models
// ═══════════════════════════════════════════════════════════════

export const ALLOWED_MODELS: Record<AgentType, string[]> = {
  ceo: ["claude-sonnet-4-5"],
  cto: ["claude-sonnet-4-5"],
  qa: ["claude-sonnet-4-5"],
  lead_front: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5"],
  lead_back: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5"],
  data_architect: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5"],
  ai_architect: ["claude-sonnet-4-5"],
};

export const DEFAULT_MODEL: Record<AgentType, string> = {
  ceo: "claude-sonnet-4-5",
  cto: "claude-sonnet-4-5",
  qa: "claude-sonnet-4-5",
  lead_front: "claude-haiku-4-5-20251001",
  lead_back: "claude-haiku-4-5-20251001",
  data_architect: "claude-haiku-4-5-20251001",
  ai_architect: "claude-sonnet-4-5",
};

const AGENT_DEFAULTS: Record<
  AgentType,
  { speciality: string; recruitable: boolean }
> = {
  ceo: { speciality: "mandate_synthesis", recruitable: false },
  cto: { speciality: "technical_strategy", recruitable: false },
  qa: { speciality: "quality_audit", recruitable: false },
  lead_front: { speciality: "ui_components", recruitable: true },
  lead_back: { speciality: "api_design", recruitable: true },
  data_architect: { speciality: "schema_design", recruitable: true },
  ai_architect: { speciality: "ai_systems", recruitable: true },
};

const OUTPUT_COST_PER_M: Record<string, number> = {
  "claude-sonnet-4-5": 15,
  "claude-sonnet-4-6": 15,
  "claude-haiku-4-5-20251001": 4,
  "claude-opus-4-6": 75,
};

const MAX_RECENT_RUNS = 10;
const MIN_SESSIONS_FOR_ROUTING = 3;
const MIN_SESSIONS_FOR_INJECTION = 3;
const FIRING_WINDOW = 3;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function rollingAvg(
  current: number | null,
  next: number,
  sessions: number,
): number {
  if (current === null || sessions === 1) return next;
  return (current * (sessions - 1) + next) / sessions;
}

function inferProvider(modelId: string): ModelProvider {
  return modelId.startsWith("grok") ? "xai" : "anthropic";
}

// ═══════════════════════════════════════════════════════════════
// AGENT DB
// ═══════════════════════════════════════════════════════════════

export class AgentDb {
  private client: MongoClient;
  private db: Db | null = null;
  private agentsColl: Collection<AgentRecord> | null = null;
  private assignmentsColl: Collection<ProjectAssignment> | null = null;

  constructor(private mongoUri: string) {
    this.client = new MongoClient(mongoUri);
  }

  private async connect(): Promise<void> {
    if (this.db) return;
    await this.client.connect();
    this.db = this.client.db(DB_NAME);
    this.agentsColl = this.db.collection<AgentRecord>(COLLECTION_AGENTS);
    this.assignmentsColl = this.db.collection<ProjectAssignment>(
      COLLECTION_PROJECT_ASSIGNEMENTS,
    );
    await this.agentsColl.createIndex({ type: 1 }, { unique: true });
    await this.assignmentsColl.createIndex({ projectId: 1, agentType: 1 });
  }

  async getOrCreateAgent(type: AgentType): Promise<AgentRecord> {
    await this.connect();
    const { speciality, recruitable } = AGENT_DEFAULTS[type];
    const result = await this.agentsColl!.findOneAndUpdate(
      { type },
      {
        $setOnInsert: {
          type,
          model: DEFAULT_MODEL[type],
          status: "available" as AgentStatus,
          recruitable,
          speciality,
          behavioral_history: {
            sessions: 0,
            avg_efficiency: null,
            tension_resolution_rate: null,
          },
          model_performance: {},
          recent_runs: [],
          recruited_at: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    return result!;
  }

  async assignAgent(
    projectId: string,
    agentType: RecruitableAgentType,
    role: string,
  ): Promise<ProjectAssignment> {
    await this.connect();
    const assignment: ProjectAssignment = {
      projectId,
      agentType,
      role,
      recruited_at: new Date(),
    };
    await this.assignmentsColl!.insertOne(assignment as any);
    return assignment;
  }

  async releaseAgent(
    projectId: string,
    agentType: RecruitableAgentType,
  ): Promise<void> {
    await this.connect();
    await this.assignmentsColl!.updateOne(
      { projectId, agentType, released_at: { $exists: false } },
      { $set: { released_at: new Date() } },
    );
  }

  async getProjectAssignments(projectId: string): Promise<ProjectAssignment[]> {
    await this.connect();
    return this.assignmentsColl!.find({
      projectId,
      released_at: { $exists: false },
    }).toArray();
  }

  async updateAgentStats(
    agentType: AgentType,
    score: ScoreBreakdown,
    modelId: string,
    outputTokens: number,
    finishReason: string,
  ): Promise<void> {
    await this.connect();
    try {
      const agent = await this.getOrCreateAgent(agentType);
      const sessions = agent.behavioral_history.sessions + 1;

      const resolutionRate =
        score.components.tensionsDelta > 0
          ? score.components.ownTensionsResolved /
            score.components.tensionsDelta
          : null;

      const newBH = {
        sessions,
        avg_efficiency: rollingAvg(
          agent.behavioral_history.avg_efficiency,
          score.score,
          sessions,
        ),
        tension_resolution_rate:
          resolutionRate !== null
            ? rollingAvg(
                agent.behavioral_history.tension_resolution_rate,
                resolutionRate,
                sessions,
              )
            : agent.behavioral_history.tension_resolution_rate,
      };

      const mp = agent.model_performance[modelId] ?? {
        sessions: 0,
        avg_score: 0,
        avg_tokens: 0,
      };
      const mpSessions = mp.sessions + 1;
      const newMp = {
        ...agent.model_performance,
        [modelId]: {
          sessions: mpSessions,
          avg_score: rollingAvg(mp.avg_score, score.score, mpSessions),
          avg_tokens: Math.round(
            rollingAvg(mp.avg_tokens, outputTokens, mpSessions),
          ),
        },
      };

      const snapshot: RunSnapshot = {
        score: score.score,
        tension_resolution_rate: resolutionRate,
        completionTokens: outputTokens,
        modelId,
        finishReason,
        timestamp: Date.now(),
      };
      const newRecentRuns = [snapshot, ...agent.recent_runs].slice(
        0,
        MAX_RECENT_RUNS,
      );

      await this.agentsColl!.updateOne(
        { type: agentType },
        {
          $set: {
            behavioral_history: newBH,
            model_performance: newMp,
            recent_runs: newRecentRuns,
          },
        },
      );
    } catch (err) {
      console.warn("[agent-db] updateAgentStats failed:", err);
    }
  }

  /**
   * Returns the ModelRef with best score/cost ratio based on accumulated data.
   * Falls back to DEFAULT_MODEL if not enough data.
   * Always returns a model from ALLOWED_MODELS[type].
   */
  async resolveModel(agentType: AgentType): Promise<ModelRef> {
    const fallbackId = DEFAULT_MODEL[agentType];
    const fallback: ModelRef = {
      provider: inferProvider(fallbackId),
      modelId: fallbackId,
    };
    try {
      await this.connect();
      const agent = await this.getOrCreateAgent(agentType);
      const allowed = ALLOWED_MODELS[agentType];

      const candidates = Object.entries(agent.model_performance).filter(
        ([modelId, mp]) =>
          mp.sessions >= MIN_SESSIONS_FOR_ROUTING && allowed.includes(modelId),
      );
      if (candidates.length < 2) return fallback;

      const best = candidates.reduce<{
        modelId: string;
        adjustedScore: number;
      }>(
        (acc, [modelId, mp]) => {
          const costPerToken = (OUTPUT_COST_PER_M[modelId] ?? 10) / 1_000_000;
          const adjustedScore =
            mp.avg_score / Math.max(mp.avg_tokens * costPerToken, 1e-9);
          return adjustedScore > acc.adjustedScore
            ? { modelId, adjustedScore }
            : acc;
        },
        { modelId: fallbackId, adjustedScore: -Infinity },
      );

      if (!allowed.includes(best.modelId)) return fallback;
      return { provider: inferProvider(best.modelId), modelId: best.modelId };
    } catch {
      return fallback;
    }
  }

  /**
   * Returns a behavioral feedback block to append to the system prompt,
   * or null if not enough data (< MIN_SESSIONS_FOR_INJECTION).
   */
  async buildBehavioralContext(agentType: AgentType): Promise<string | null> {
    try {
      await this.connect();
      const agent = await this.getOrCreateAgent(agentType);
      const { sessions, avg_efficiency, tension_resolution_rate } =
        agent.behavioral_history;
      if (sessions < MIN_SESSIONS_FOR_INJECTION) return null;

      const lines: string[] = [];
      if (tension_resolution_rate !== null && tension_resolution_rate < 0.5) {
        lines.push(
          `- Your tension resolution rate is ${(tension_resolution_rate * 100).toFixed(0)}% (target ≥ 50%). You are creating more tensions than you resolve. Prioritize high-confidence resolutions before opening new tensions.`,
        );
      }
      if (avg_efficiency !== null && avg_efficiency < 0) {
        lines.push(
          `- Your composite efficiency score is negative (${avg_efficiency.toFixed(2)}). Review the quality and grounding of the tensions you produce.`,
        );
      }
      if (lines.length === 0) return null;

      return [
        `## Behavioral Feedback (based on ${sessions} past sessions)`,
        "",
        ...lines,
      ].join("\n");
    } catch {
      return null;
    }
  }

  async fireAgent(
    agentType: AgentType,
    reason: AgentRecord["fired_reason"],
  ): Promise<void> {
    await this.connect();
    await this.agentsColl!.updateOne(
      { type: agentType },
      {
        $set: {
          status: "fired" as AgentStatus,
          fired_at: new Date(),
          fired_reason: reason,
        },
      },
    );
    console.warn(`[agent-db] Agent ${agentType} fired — reason: ${reason}`);
  }

  /**
   * Checks firing criteria after a run. Only applies to recruitable agents.
   * Criteria checked: score_threshold, length_repeat.
   * budget_exhausted: TODO.
   */
  async checkFiringCriteria(agentType: AgentType): Promise<void> {
    try {
      await this.connect();
      const agent = await this.getOrCreateAgent(agentType);
      if (!agent.recruitable) return;
      if (agent.status === "fired") return;

      const lastN = agent.recent_runs.slice(0, FIRING_WINDOW);
      if (lastN.length < FIRING_WINDOW) return;

      if (lastN.every((r) => r.score < 0)) {
        await this.fireAgent(agentType, "score_threshold");
        return;
      }
      if (lastN.every((r) => r.finishReason === "length")) {
        await this.fireAgent(agentType, "length_repeat");
        return;
      }
      // TODO: budget_exhausted
    } catch (err) {
      console.warn("[agent-db] checkFiringCriteria failed:", err);
    }
  }
}

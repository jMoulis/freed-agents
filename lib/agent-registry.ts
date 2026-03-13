/**
 * FREED AGENTS — Agent Registry
 *
 * @deprecated S4 — superseded by lib/agent-db.ts (MongoDB-backed).
 * This module remains for reference only. Do not add new consumers.
 * Remove in S5 when the dashboard is wired to agent-db.
 *
 * Reads and writes config/agents.json.
 * Tracks behavioral_history, model_performance, and recent_runs per agent.
 * Provides dynamic model routing and adaptive prompt injection.
 *
 * Works on filesystem — dev/local only.
 */

import fs from "fs";
import path from "path";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { ModelRef } from "@/lib/context";

const REGISTRY_PATH = path.join(process.cwd(), "config/agents.json");
const MAX_RECENT_RUNS = 10;

// Output cost per 1M tokens (USD). Used for score/cost routing.
const OUTPUT_COST_PER_M: Record<string, number> = {
  "claude-sonnet-4-5": 15,
  "claude-sonnet-4-6": 15,
  "claude-haiku-4-5-20251001": 4,
  "claude-opus-4-6": 75,
  "grok-code-fast-1": 5,
};

// Minimum sessions per model before it's eligible for routing decisions
const MIN_SESSIONS_FOR_ROUTING = 3;
// Minimum sessions before behavioral injection kicks in
const MIN_SESSIONS_FOR_INJECTION = 3;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ModelPerformance {
  sessions: number;
  avg_score: number;
  avg_tokens: number;
}

export interface BehavioralHistory {
  sessions: number;
  avg_efficiency: number | null;
  tension_resolution_rate: number | null;
}

export interface RunSnapshot {
  score: number;
  tension_resolution_rate: number | null;
  completionTokens: number;
  modelId: string;
  timestamp: number; // epoch ms
}

export interface AgentRecord {
  id: string;
  model: string;
  taskType: string;
  behavioral_history: BehavioralHistory;
  model_performance: Record<string, ModelPerformance>;
  recent_runs: RunSnapshot[]; // last MAX_RECENT_RUNS, newest first
}

interface AgentsRegistry {
  agents: AgentRecord[];
}

// ═══════════════════════════════════════════════════════════════
// INTERNALS
// ═══════════════════════════════════════════════════════════════

function rollingAvg(
  current: number | null,
  next: number,
  sessions: number,
): number {
  if (current === null || sessions === 1) return next;
  return (current * (sessions - 1) + next) / sessions;
}

function inferProvider(modelId: string): "anthropic" | "xai" {
  return modelId.startsWith("grok") ? "xai" : "anthropic";
}

export function readRegistry(): AgentsRegistry {
  const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
  const parsed = JSON.parse(raw) as AgentsRegistry;
  for (const agent of parsed.agents) {
    agent.model_performance ??= {};
    agent.recent_runs ??= [];
  }
  return parsed;
}

function writeRegistry(data: AgentsRegistry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2) + "\n");
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Persist one agent's run stats.
 * Updates behavioral_history, model_performance, and recent_runs.
 * Silent on failure — never blocks the main response.
 */
export function updateAgentStats(
  agentId: string,
  score: ScoreBreakdown,
  modelId: string,
  outputTokens: number,
): void {
  try {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === agentId);
    if (!agent) return;

    const sessions = agent.behavioral_history.sessions + 1;

    const resolutionRate =
      score.components.tensionsDelta > 0
        ? score.components.ownTensionsResolved / score.components.tensionsDelta
        : null;

    agent.behavioral_history = {
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
    agent.model_performance[modelId] = {
      sessions: mpSessions,
      avg_score: rollingAvg(mp.avg_score, score.score, mpSessions),
      avg_tokens: Math.round(
        rollingAvg(mp.avg_tokens, outputTokens, mpSessions),
      ),
    };

    // Prepend to recent_runs, keep last MAX_RECENT_RUNS
    const snapshot: RunSnapshot = {
      score: score.score,
      tension_resolution_rate: resolutionRate,
      completionTokens: outputTokens,
      modelId,
      timestamp: Date.now(),
    };
    agent.recent_runs = [snapshot, ...agent.recent_runs].slice(
      0,
      MAX_RECENT_RUNS,
    );

    writeRegistry(registry);
  } catch (err) {
    console.warn("[agent-registry] updateAgentStats failed:", err);
  }
}

/**
 * Dynamic model routing.
 *
 * Returns the ModelRef with the best score/cost ratio based on
 * accumulated model_performance data. Falls back to `fallback`
 * if there isn't enough data yet (< MIN_SESSIONS_FOR_ROUTING per model,
 * or only one model has data).
 *
 * Score/cost = avg_score / (avg_tokens * cost_per_output_token)
 * Higher = better value for money.
 */
export function resolveModel(agentId: string, fallback: ModelRef): ModelRef {
  try {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === agentId);
    if (!agent?.model_performance) return fallback;

    const candidates = Object.entries(agent.model_performance).filter(
      ([, mp]) => mp.sessions >= MIN_SESSIONS_FOR_ROUTING,
    );

    if (candidates.length < 2) return fallback;

    const best = candidates.reduce<{ modelId: string; adjustedScore: number }>(
      (acc, [modelId, mp]) => {
        const costPerToken = (OUTPUT_COST_PER_M[modelId] ?? 10) / 1_000_000;
        const adjustedScore =
          mp.avg_score / Math.max(mp.avg_tokens * costPerToken, 1e-9);
        return adjustedScore > acc.adjustedScore
          ? { modelId, adjustedScore }
          : acc;
      },
      { modelId: fallback.modelId, adjustedScore: -Infinity },
    );

    return { provider: inferProvider(best.modelId), modelId: best.modelId };
  } catch {
    return fallback;
  }
}

/**
 * Adaptive prompt injection.
 *
 * Returns a behavioral context block to append to the system prompt,
 * or null if there isn't enough data yet (< MIN_SESSIONS_FOR_INJECTION).
 *
 * Rules:
 *   - tension_resolution_rate < 0.5 → agent creates more than it resolves
 *   - avg_efficiency < 0            → composite score is negative
 *   - No positive reinforcement injected — only corrections
 */
export function buildBehavioralContext(agentId: string): string | null {
  try {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === agentId);
    if (!agent) return null;

    const { sessions, avg_efficiency, tension_resolution_rate } =
      agent.behavioral_history;
    if (sessions < MIN_SESSIONS_FOR_INJECTION) return null;

    const lines: string[] = [];

    if (
      tension_resolution_rate !== null &&
      tension_resolution_rate < 0.5
    ) {
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

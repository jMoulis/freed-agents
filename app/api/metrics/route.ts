/**
 * GET /api/metrics
 *
 * Returns the full agent registry from MongoDB — behavioral history,
 * model performance, and recent run snapshots.
 *
 * Falls back to config/agents.json (deprecated) if MONGODB_URI is not set.
 */

import { NextResponse } from "next/server";
import { AgentDb } from "@/lib/agent-db";
import { readRegistry } from "@/lib/agent-registry";

export async function GET() {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (mongoUri) {
      const agentDb = new AgentDb(mongoUri);
      const types = [
        "ceo", "cto", "qa",
        "lead_front", "lead_back", "data_architect", "ai_architect",
      ] as const;
      const agents = await Promise.all(types.map((t) => agentDb.getOrCreateAgent(t)));
      return NextResponse.json({ agents });
    }

    // Fallback: filesystem registry (deprecated, no MongoDB)
    const registry = readRegistry();
    return NextResponse.json(registry);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to read registry" },
      { status: 500 },
    );
  }
}

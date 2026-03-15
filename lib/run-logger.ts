/**
 * FREED AGENTS — Run Logger
 *
 * Writes structured NDJSON logs to logs/runs-YYYY-MM-DD.ndjson.
 * Fire-and-forget — never throws, never blocks the pipeline.
 *
 * Each line is a JSON object:
 *   { ts, agent, projectId, event, data }
 *
 * Read with:
 *   cat logs/runs-*.ndjson | jq 'select(.agent == "qa_lead")'
 */

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "logs");

function logPath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(LOG_DIR, `runs-${date}.ndjson`);
}

export function writeRunLog(
  agent: string,
  projectId: string,
  event: string,
  data: unknown,
): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ ts: Date.now(), agent, projectId, event, data });
    appendFileSync(logPath(), line + "\n");
  } catch {
    // logger must never crash the pipeline
  }
}

/**
 * Returns a bound logger for a specific agent + project.
 * Usage: const log = makeLogger("qa_lead", projectId)
 *        log("step_finish", { stepNumber: 2, finishReason: "tool-calls" })
 */
export function makeLogger(agent: string, projectId: string) {
  return (event: string, data: unknown) => writeRunLog(agent, projectId, event, data);
}

# Freed Agents — Manifest

AI-native software engineering firm. Non-technical clients submit a plain-language brief → a chain of specialized AI agents produces a full technical spec. No humans in the production loop.

---

## Roadmap

### Sprint 1 — Core Pipeline ✅
- [x] Onto engine integration (OntoEngine, InMemoryOntoStore)
- [x] Agent runner (generateText + generateObject, field tools)
- [x] CEO agent (ProjectMandate, read_field → update_field)
- [x] CTO agent
- [x] Architect agent
- [x] QA Lead agent
- [x] Discovery agent (streamText, render_form tool, UIMessage stream)
- [x] `/api/discovery` route (streaming, projectId via `x-project-id` header)
- [x] Discovery → CEO Field handoff via shared projectId
- [x] **MongoOntoStore** (serialization, lazy connect, ownership cache) — originally planned S5, delivered S1
- [x] `onto-persistence.ts` — hybrid inline/distributed strategy — originally planned S5, delivered S1
- [x] Frontend: DiscoveryChat, DynamicForm, phase machine, pipeline view
- [x] Run end-to-end validé: Discovery → CEO → CTO → Architect → QA Lead → Report

### Sprint 2 — Scoring & Behavioral Observability ✅
- [x] `lib/agent-metrics.ts` — derive RunMetrics from FieldSnapshot diff
- [x] `lib/scoring.ts` — composite score formula (`ownedUnresolved`, `fieldCoverage`, token normalization)
- [x] Wire scores into `/api/run` response
- [x] `model_performance` per model per agent — tracks `avg_score`, `avg_tokens`, `sessions`
- [x] Dynamic model routing — `resolveModel()` picks best score/cost ratio (activates after 3 sessions/model)

### Sprint 3 — Behavioral Optimization & MongoDB ✅
- [x] `lib/agent-db.ts` — MongoDB-backed agent registry (`AgentRecord`, `ProjectAssignment`) replaces `config/agents.json` + `agent-registry.ts`
- [x] Persist scores to Mongo — `AgentDb.updateAgentStats()`, rolling avg per model
- [x] Adaptive prompt injection — `AgentDb.buildBehavioralContext()` appends feedback block to system prompt after ≥ 3 sessions
- [x] Extended thinking on all agents — `thinkingBudget` per agent config, `providerOptions` wired in both `generateObject` and `generateText` branches
- [x] `project_runs` collection — full run result persisted (blueprints, scores, reports, clarification_needed)
- [ ] Score trend dashboarding

### Sprint 4 — Specialized Agents + Dynamic HR ✅
> Split Architect V1 → 4 specialized agents

| Agent | Domain | Model |
|-------|--------|-------|
| Lead Front | Components, routing, UX flows, responsive | haiku-4-5 + thinking |
| Lead Back | API design, auth, third-party integrations | haiku-4-5 + thinking |
| Data Architect | Schema, relations, indexes, migrations, retention | haiku-4-5 + thinking |
| UX Architect | User journeys, IA, accessibility, responsive strategy | haiku-4-5 + thinking |
| AI Architect | Prompts, models, costs, latency (optional, AI projects only) | sonnet-4-5 |

- [x] Each agent reads Field independently, writes with namespaced tension ids
- [x] Sequential staging — `data → [back + ux] → front → [ai?] → QA` — per-stage snapshots for accurate scoring
- [x] Dynamic recruitment — `AgentDb.getProjectAssignments()` + default fallback set
- [x] Firing criteria — `score_threshold` (3× negative score), `length_repeat` (3× finish=length)
- [x] `AgentDb.assignAgent` / `releaseAgent` — project assignment lifecycle
- [x] `sharedKnowledge` wired — agents can publish cross-cutting facts (stack, auth method, GDPR scope) via `update_field { knowledge: [...] }`; injected into all tensions at equilibration
- [x] `OntoTypeChecker` / `assertFieldValid` — epistemic validation on every store write
- [x] QA Lead: `claude-sonnet-4-6` + thinking budget 10 000 — reasoning traces from all specialists injected as meta-epistemic input; writes `qa_methodology_*` tensions
- [x] Clarification flow — QA `red` or `yellow + critical questions` → `clarification_needed` in response → frontend re-opens PM for targeted client follow-up

### Sprint 5 — Bidirectionality (planned)
> Agents respond to each other until convergence

- [ ] `AgentMessage` bus (QA → Lead Back, QA → Data Architect, etc.)
- [ ] Manual loop pattern with separate message histories per agent (AI SDK v4 constraint)
- [ ] Progressive pressure at convergence milestones (normal → convergence warning → last chance)
- [ ] Convergence criterion: `globalConfidence delta < threshold` between passes
- [ ] Hard `maxRounds` guard on every loop

### Sprint 6 — Production Hardening (planned)
- [ ] Auth, rate limiting, cost guardrails
- [ ] Score trend dashboarding
- [ ] Webhook delivery of reports
- [ ] Field versioning / audit replay
- [ ] Dashboard: Field tensions, confidence, equilibration history per projectId

---

## Invariants

| Rule | Detail |
|------|--------|
| Field = epistemic only | Never store metrics or scores in the Field |
| Agent registry = MongoDB | `AgentRecord` in `agent-db.ts` — no filesystem config |
| Tension ownership | An agent never modifies another agent's tension — use namespaced challenge ids |
| Inference before question | Discovery only asks what it cannot infer |
| Convergence mandatory | Every loop has a hard `maxRounds` guard |
| `process.env` in routes only | All other code receives injected `RunContext` |
| Field validity enforced | `assertFieldValid` runs on every store write — epistemic violations throw |

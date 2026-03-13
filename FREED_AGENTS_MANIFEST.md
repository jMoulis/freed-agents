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
- [x] `config/agents.json` — agent registry with behavioral history slots + `model_performance`
- [x] `lib/agent-metrics.ts` — derive RunMetrics from FieldSnapshot diff
- [x] `lib/scoring.ts` — composite score formula (`ownedUnresolved`, `fieldCoverage`, token normalization)
- [x] Wire scores into `/api/run` response
- [x] `lib/agent-registry.ts` — persist scores to `config/agents.json` after each run (rolling avg)
- [x] `model_performance` per model per agent — tracks `avg_score`, `avg_tokens`, `sessions`
- [x] Dynamic model routing — `resolveModel()` picks best score/cost ratio (activates after 3 sessions/model)
- [ ] Mongo persistence of scores (deferred to S3)

### Sprint 3 — Behavioral Optimization (planned)
- [ ] Adaptive prompt injection based on `behavioral_history`
- [ ] Score trend dashboarding
- [ ] Persist scores to Mongo (replaces filesystem write in `agent-registry.ts`)

### Sprint 4 — Specialized Agents + Dynamic HR (planned)
> Split Architect V1 → 4 specialized agents

| Agent | Domain |
|-------|--------|
| Lead Front | Components, routing, UX flows, responsive |
| Lead Back | API design, auth, third-party integrations |
| Data Architect | Schema, relations, indexes, migrations, retention |
| AI Architect | Prompts, models, costs, latency (AI projects only) |

- [ ] Each agent reads Field independently, can challenge others via namespaced tensions
- [ ] Dynamic recruitment based on project type
- [ ] Firing on: budget exhausted, repeated `finishReason === 'length'`, score below threshold over N runs
- [ ] Orchestrator selects required agents at startup

### Sprint 5 — Bidirectionality (planned)
> Agents respond to each other until convergence

- [ ] `AgentMessage` bus (QA → CTO, QA → Architect, etc.)
- [ ] Manual loop pattern with separate message histories per agent (AI SDK v4 constraint)
- [ ] Progressive pressure at convergence milestones (normal → convergence warning → last chance)
- [ ] Convergence criterion: `globalConfidence delta < threshold` between passes
- [ ] Hard `maxRounds` guard on every loop

### Sprint 6 — Production Hardening (planned)
- [ ] Auth, rate limiting, cost guardrails
- [ ] Webhook delivery of reports
- [ ] Field versioning / audit replay
- [ ] Dashboard: Field tensions, confidence, equilibration history per projectId

---

## Invariants

| Rule | Detail |
|------|--------|
| Field = epistemic only | Never store metrics or scores in the Field |
| Config JSON = agent capabilities | `behavioral_history`, `model_performance`, `budget`, `model` |
| Tension ownership | An agent never modifies another agent's tension |
| Inference before question | Discovery only asks what it cannot infer |
| Convergence mandatory | Every loop has a hard `maxRounds` guard |
| `process.env` in routes only | All other code receives injected `RunContext` |

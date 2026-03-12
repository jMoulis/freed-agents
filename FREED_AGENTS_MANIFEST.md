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
- [x] Discovery → CEO Field handoff via MongoDB
- [x] **MongoOntoStore** (serialization, lazy connect, ownership cache) — originally planned S5, delivered S1
- [x] Frontend: DiscoveryChat, DynamicForm, phase machine, pipeline view

### Sprint 2 — Scoring Observability 🔄
- [x] `config/agents.json` — agent registry with behavioral history slots
- [x] `lib/agent-metrics.ts` — derive RunMetrics from FieldSnapshot diff
- [x] `lib/scoring.ts` — composite score formula
- [x] Wire scores into `/api/run` response
- [ ] Mongo persistence of scores (deferred to S3)

### Sprint 3 — Behavioral Optimization (planned)
- [ ] Persist scores to `config/agents.json` after each run
- [ ] Adaptive prompt injection based on `behavioral_history`
- [ ] Score trend dashboarding

### Sprint 4 — Dynamic Agent Factory (planned)
- [ ] Spawn task-specific agents at runtime from CEO/CTO mandate
- [ ] Agent-to-agent tension challenges

### Sprint 5 — Production Hardening (planned)
- [ ] Auth, rate limiting, cost guardrails
- [ ] Webhook delivery of reports
- [ ] Field versioning / audit replay

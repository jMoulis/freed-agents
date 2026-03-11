# Freed Agents — Project Manifest

## What this is

Freed Agents is an AI-native software engineering firm. No humans in the production loop.

A non-technical client — an HR manager, a founder, anyone — submits a brief in plain language. A chain of specialized AI agents handles everything from there: understanding the brief, making architectural decisions, composing a team, producing a full technical specification. The client receives a deliverable. They never speak to an engineer.

The thesis is simple: if an agent can hold a decision with an honest confidence level, doubt what it doesn't know, and pass that uncertainty forward to the next agent — then a chain of such agents can do what a team of humans does, without the coordination overhead, the politics, or the bottlenecks.

---

## The epistemic engine: Onto

The central piece of the system is not the agents. It is the **Field**.

Onto is a home-built epistemic engine. Its core idea: knowledge is not binary. Every decision an agent makes comes with a confidence score (0.1 to 1.0), a list of doubts, and dependencies on other open questions. These units are called **tensions**.

The Field is the shared memory of the entire firm. Agents don't talk to each other directly — they read and write the Field. When the CEO agent finishes, the CTO reads what the CEO knew and doubted. When the CTO finishes, the Architect reads the accumulated field. Each agent inherits the honest epistemic state of every agent before it.

The Field also computes a **global equilibrium** at any point — a weighted confidence score across all tensions, a summary of what is resolved vs. still open.

Onto is not a library pulled from npm. It was built specifically for this purpose. It has its own type system, its own equilibration algorithm, its own persistence layer, and its own confidence algebra. It is the intellectual core of Freed Agents. **The source lives in `onto/`.**

---

## The agents

Each agent is a specialist. They share a common runner (`AgentRunner`) that handles tool injection, the field read/write cycle, and structured output. What makes each agent different is its role, its system prompt, and its output schema.

**CEO** — receives the raw client brief. Produces a structured project mandate. Initializes the Field with first-level tensions that capture what is known and what is not.

**CTO** — reads the CEO's Field. Makes technical decisions: stack choice, build vs. buy, team composition, effort estimate. Uses `sendReasoning: true` so its chain-of-thought is captured.

**Architect** — reads CEO + CTO tensions. Produces system design: modules, APIs, data models, integration points.

**QA Lead** — reads the full Field. Identifies risk areas, edge cases, test strategy. Flags tensions with low confidence as areas requiring human review.

**Dynamic Agent Factory** — the CTO can spawn specialized agents on demand based on what the project requires.

---

## What's built

- **Onto engine** — full source in `onto/`. Types, equilibration engine, type checker, confidence algebra, persistence layer, MongoDB store.
- **AgentRunner** — shared runner with auto-injected field tools (`read_field`, `update_field`)
- **RunContext** — dependency injection for models and store. API keys live only in the API route.
- **CEO Agent** — complete, with Zod output schema and system prompt
- **API route** `POST /api/run` — accepts a brief, runs the CEO, returns mandate + field equilibrium
- **Frontend** — dark theme interface, two-column layout (Mandate + Epistemic Field), live confidence bar, expandable tension cards

---

## What's next

Immediate: **CTO Agent**, then Dynamic Agent Factory, Architect, QA Lead, full orchestrator. Then MongoDB persistence using the real `OntoFieldStore` from `onto/onto-persistence.ts`.

The goal: a single `POST /api/run` with a plain-text brief returns a production-ready technical specification — written, reviewed, and internally contested by agents that genuinely didn't agree on everything.

---

## The right question

When working on this codebase, always ask: *does this make the Field more honest, or less?* That's the test.
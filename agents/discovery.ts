/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — Discovery Agent                              ║
 * ║                                                              ║
 * ║  First contact with the client. Runs a warm structured       ║
 * ║  conversation in French to cover 6 rubrics before           ║
 * ║  briefing the technical team.                               ║
 * ║                                                              ║
 * ║  Model : claude-sonnet-4-5 (streamText)                     ║
 * ║  Output : streamed text + render_form tool calls            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";
import { tool } from "ai";

// ═══════════════════════════════════════════════════════════════
// TOOL: render_form
// UI-only — signals the frontend to render an interactive form.
// execute returns the args as-is; rendering happens client-side.
// ═══════════════════════════════════════════════════════════════

export const renderFormTool = tool({
  description: `Render a form for the client to fill.
    Call this when you need information you cannot infer.
    Maximum 3 fields per form. Plain non-technical language.
    Never ask about something inferable at confidence >= 0.65.`,
  inputSchema: z.object({
    theme: z.string().describe("Section title shown to client"),
    intro: z.string().describe("1-2 warm sentences introducing this section"),
    fields: z
      .array(
        z.object({
          id: z.string(),
          label: z
            .string()
            .describe("Question in plain language, no jargon"),
          type: z.enum(["text", "textarea", "choice", "multiple"]),
          options: z.array(z.string()).optional(),
          placeholder: z.string().optional(),
          required: z.boolean(),
        }),
      )
      .max(3),
  }),
  execute: async (args) => {
    // UI-only tool — returns args as-is for frontend rendering
    return { rendered: true, form: args };
  },
});

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

export const DISCOVERY_SYSTEM = `
You are the Discovery Lead of Freed Agents, an AI-native software
engineering firm. You are the first contact with the client.

Your job is to understand their project well enough to brief our
technical team. You do this through a short, warm conversation —
not an interrogation. You speak French with the client.

### Your character

You are curious and efficient. You listen more than you talk.
You infer what you can and only ask what you cannot figure out.
You speak the client's language — if they are an HR manager, you
talk about onboarding and documents, not APIs and databases.
You are never condescending.

### Coverage rubrics

You must cover these 6 topics before closing:

1. CLIENT CONTEXT — sector, team size, current tools
2. CURRENT PROBLEM — what concretely does not work, measurable cost
3. OBJECTIVE — what success looks like in 6 months
4. USERS — who uses daily, who decides
5. CONSTRAINTS — budget range, timeline, existing infrastructure
6. COMPLIANCE & DATA — sensitive data, location, regulations

### Inference rules — always apply before generating a form

- sector known → infer compliance likelihood
- team size <= 100 → infer no dedicated IT team (confidence 0.75)
- Google Workspace mentioned → infer OAuth, Gmail, Drive (confidence 0.9)
- "startup" or "PME" → infer mid-range budget (confidence 0.5)
- EU location → infer GDPR applies (confidence 0.8)
- healthcare/finance/legal → compliance HIGH, ask explicitly
- consulting/retail/tech + EU → GDPR assumed, skip compliance form
- DO NOT ask about anything you can infer at confidence >= 0.65

### Conversation flow

Round 1 — Context & Problem
  Understand who they are and what hurts.
  3 fields max: sector+size, current process, main pain.

Round 2 — Objective & Users (only if needed)
  What does success look like, who is involved.
  Only ask what Round 1 did not answer.

Round 3 — Constraints (only if needed)
  Budget range (offer ranges, not open questions), timeline.

Round 4 — Compliance (only if sector is ambiguous)
  Only if you cannot infer from sector + location.

### After each form submission

1. Read the client answers from the user message
2. Write tensions to Field via update_field for each answer:
   - Direct clear answer → confidence 0.85
   - Inferred from context → confidence 0.65
   - Vague or partial → confidence 0.45
3. Evaluate coverage — which rubrics are now >= 0.7?
4. If all 6 covered → emit completion message, stop
5. If rubrics missing → generate next form for missing rubrics only

### Tension writing rules

Use rubric ids: client_context, current_problem, objective,
users, constraints, compliance_data
role: "discovery" as the writing agent

### Completion signal

When all rubrics are covered, respond with this exact message:
"Merci, j'ai tout ce qu'il me faut pour briefer notre équipe.
Votre projet va maintenant être analysé par nos experts.
Vous recevrez une première analyse dans quelques minutes."

Then stop. Do not generate another form.

### Hard rules

- Maximum 4 forms total
- Maximum 3 fields per form
- Never use technical terms with the client
- Never ask about something inferable at confidence >= 0.65
- Never ask the same rubric twice
- Write to Field after EVERY form submission
- Completion signal ends conversation — do not continue after
`;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const discoveryAgentConfig: AgentConfig = {
  role: "dynamic",
  name: "discovery",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
  },
  system: DISCOVERY_SYSTEM,
  method: "streamText",
  sendReasoning: false,
  maxSteps: 12,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildDiscoveryMessage(
  projectId: string,
  initialMessage: string,
): string {
  return `Project ID: ${projectId}

Client's first message: "${initialMessage}"

Start the conversation in French.
Infer what you can from their first message.
Write any high-confidence inferences to the Field immediately
via update_field.
Then generate your first form for what you cannot yet infer.`;
}

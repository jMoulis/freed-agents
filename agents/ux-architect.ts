/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FREED AGENTS — UX Architect Agent                           ║
 * ║                                                              ║
 * ║  Specialist for user experience architecture.               ║
 * ║  Recruited by the PM when the project has a UI layer.       ║
 * ║                                                              ║
 * ║  Tension namespace : ux_                                     ║
 * ║  Model : claude-haiku-4-5-20251001 (default, upgradeable)   ║
 * ║  Output : UxBlueprint                                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { AgentConfig } from "@/core/agent-runner";

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA
// ═══════════════════════════════════════════════════════════════

const UserJourneySchema = z.object({
  role: z.string().describe("User role (e.g. HR Manager, Employee, Admin)"),
  description: z
    .string()
    .describe("One sentence describing this user and their primary goal"),
  key_steps: z
    .array(z.string())
    .describe("Ordered steps the user takes to accomplish their main task"),
  entry_points: z
    .array(z.string())
    .describe("How/where users enter this journey"),
  critical_moments: z
    .array(z.string())
    .describe("High-stakes moments where errors or confusion would be costly"),
  confidence: z.number().describe("0.1–1.0"),
});

const AccessibilityRequirementSchema = z.object({
  requirement: z.string(),
  wcag_level: z.enum(["A", "AA", "AAA"]),
  rationale: z.string(),
});

const InteractionPatternSchema = z.object({
  name: z
    .string()
    .describe("Pattern name (e.g. Inline validation, Progressive disclosure)"),
  description: z.string(),
  applies_to: z.array(z.string()).describe("Which journeys or screens"),
});

const RiskSchema = z.object({
  area: z.string(),
  description: z.string(),
  mitigation: z.string(),
  severity: z.enum(["low", "medium", "high", "blocking"]),
});

const BlockerSchema = z.object({
  decision: z.string().describe("What cannot be designed yet"),
  blocked_by: z.string().describe("Which unresolved tension blocks it"),
});

export const UxBlueprintSchema = z.object({
  summary: z.string().describe(
    "One paragraph: what UX architecture we are designing and key decisions.",
  ),
  user_journeys: z
    .array(UserJourneySchema)
    .describe("One journey per major user role"),
  information_architecture: z
    .string()
    .describe(
      "How content and sections are organized — navigation structure, page hierarchy. Empty string if blocked.",
    ),
  accessibility_requirements: z
    .array(AccessibilityRequirementSchema)
    .describe("WCAG requirements and specific accessibility constraints"),
  responsive_strategy: z.object({
    primary_platform: z.enum(["mobile", "desktop", "equal"]),
    rationale: z.string(),
    breakpoint_notes: z.string(),
  }),
  interaction_patterns: z
    .array(InteractionPatternSchema)
    .describe("Key micro-interactions and interaction conventions"),
  error_and_empty_states: z
    .array(
      z.object({
        context: z.string().describe("When this state occurs"),
        description: z.string().describe("What the user sees and can do"),
      }),
    )
    .describe("Error states and empty states that must be designed"),
  risks: z.array(RiskSchema),
  blockers: z.array(BlockerSchema),
});

export type UxBlueprint = z.infer<typeof UxBlueprintSchema>;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — loaded from prompts/ux-architect.md
// ═══════════════════════════════════════════════════════════════

const SYSTEM = readFileSync(
  join(process.cwd(), "prompts/ux-architect.md"),
  "utf-8",
);

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

export const uxArchitectAgentConfig: AgentConfig = {
  role: "ux_architect",
  name: "ux_architect",
  model: {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
  },
  system: SYSTEM,
  method: "generateObject",
  outputSchema: UxBlueprintSchema,
  sendReasoning: false,
  maxSteps: 20,
};

// ═══════════════════════════════════════════════════════════════
// USER MESSAGE BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildUxArchitectMessage(projectId: string): string {
  return `## UX Architecture — Project ${projectId}

The PM has completed the client interview and written all discovery tensions to the epistemic field.

Your task:
1. Call read_field to understand the users, journeys, business rules, and constraints the PM documented
2. Write your UX tensions (ux_ prefix) for journeys, IA, accessibility, responsive strategy, interaction patterns
3. Produce your UxBlueprint — be precise about user journeys and interaction design

Stay within your domain: user experience, journeys, information architecture, accessibility, responsive design.
Do not describe frontend implementation details (components, frameworks, state management).
If user roles or journeys are underspecified, flag them as ux_gap_* tensions and express low confidence.`;
}

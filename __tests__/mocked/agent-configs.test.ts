import { describe, it, expect, vi } from "vitest";
import { ceoAgentConfig, ProjectMandateSchema } from "@/agents/ceo";
import { ctoAgentConfig, buildCtoConfig, StackProposalSchema } from "@/agents/cto";
import { qaLeadAgentConfig, AuditReportSchema } from "@/agents/qa-lead";
import { leadFrontAgentConfig, FrontBlueprintSchema } from "@/agents/lead-front";
import { leadBackAgentConfig, BackBlueprintSchema } from "@/agents/lead-back";
import { dataArchitectAgentConfig, DataBlueprintSchema } from "@/agents/data-architect";
import { aiArchitectAgentConfig, AiBlueprintSchema } from "@/agents/ai-architect";
import type { AgentConfig } from "@/core/agent-runner";

const configs: Array<{ name: string; config: AgentConfig }> = [
  { name: "CEO",            config: ceoAgentConfig },
  { name: "CTO",            config: ctoAgentConfig },
  { name: "QA Lead",        config: qaLeadAgentConfig },
  { name: "Lead Front",     config: leadFrontAgentConfig },
  { name: "Lead Back",      config: leadBackAgentConfig },
  { name: "Data Architect", config: dataArchitectAgentConfig },
  { name: "AI Architect",   config: aiArchitectAgentConfig },
];

// ── Structural validation ─────────────────────────────────────────

describe("AgentConfig — structural requirements", () => {
  for (const { name, config } of configs) {
    it(`${name}: has required fields (role, name, model, system, method)`, () => {
      expect(config.role).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.model).toBeDefined();
      expect(config.model.provider).toMatch(/^(anthropic|xai)$/);
      expect(config.model.modelId).toBeTruthy();
      expect(config.system).toBeTruthy();
      expect(config.method).toMatch(
        /^(generateObject|generateText|streamText)$/,
      );
    });

    it(`${name}: system prompt is non-empty string (>50 chars)`, () => {
      expect(typeof config.system).toBe("string");
      expect(config.system.length).toBeGreaterThan(50);
    });
  }

  it("CEO uses generateObject method", () => {
    expect(ceoAgentConfig.method).toBe("generateObject");
  });

  it("CTO uses generateObject method", () => {
    expect(ctoAgentConfig.method).toBe("generateObject");
  });

  it("QA Lead uses generateObject method", () => {
    expect(qaLeadAgentConfig.method).toBe("generateObject");
  });

  it("Lead Front uses generateObject method", () => {
    expect(leadFrontAgentConfig.method).toBe("generateObject");
  });

  it("Lead Back uses generateObject method", () => {
    expect(leadBackAgentConfig.method).toBe("generateObject");
  });

  it("Data Architect uses generateObject method", () => {
    expect(dataArchitectAgentConfig.method).toBe("generateObject");
  });

  it("AI Architect uses generateObject method", () => {
    expect(aiArchitectAgentConfig.method).toBe("generateObject");
  });
});

describe("AgentConfig — generateObject configs have outputSchema", () => {
  for (const { name, config } of configs) {
    if (config.method === "generateObject") {
      it(`${name}: has outputSchema`, () => {
        expect(config.outputSchema).toBeDefined();
      });
    }
  }
});

describe("buildCtoConfig — recruit_agent tool", () => {
  it("returns a config with recruit_agent tool", () => {
    const config = buildCtoConfig(vi.fn());
    expect(config.tools).toHaveProperty("recruit_agent");
  });

  it("recruit_agent.execute calls onRecruit with agentType and reason", async () => {
    const onRecruit = vi.fn().mockResolvedValue(undefined);
    const config = buildCtoConfig(onRecruit);
    await config.tools!.recruit_agent.execute(
      { agentType: "lead_front", reason: "Project has a UI layer" },
      {} as any,
    );
    expect(onRecruit).toHaveBeenCalledOnce();
    expect(onRecruit).toHaveBeenCalledWith("lead_front", "Project has a UI layer");
  });

  it("recruit_agent.execute returns { status: recruited, agentType }", async () => {
    const config = buildCtoConfig(vi.fn().mockResolvedValue(undefined));
    const result = await config.tools!.recruit_agent.execute(
      { agentType: "data_architect", reason: "Project persists data" },
      {} as any,
    );
    expect(result).toMatchObject({ status: "recruited", agentType: "data_architect" });
  });

  it("preserves all base ctoAgentConfig fields", () => {
    const config = buildCtoConfig(vi.fn());
    expect(config.role).toBe(ctoAgentConfig.role);
    expect(config.model).toEqual(ctoAgentConfig.model);
    expect(config.method).toBe(ctoAgentConfig.method);
    expect(config.outputSchema).toBe(ctoAgentConfig.outputSchema);
  });
});

describe("Specialist agents — namespace and domain constraints", () => {
  it("Lead Front uses front_ tension namespace", () => {
    expect(leadFrontAgentConfig.system).toContain("front_");
  });

  it("Lead Back uses back_ tension namespace", () => {
    expect(leadBackAgentConfig.system).toContain("back_");
  });

  it("Data Architect uses data_ tension namespace", () => {
    expect(dataArchitectAgentConfig.system).toContain("data_");
  });

  it("AI Architect uses ai_ tension namespace", () => {
    expect(aiArchitectAgentConfig.system).toContain("ai_");
  });

  it("Lead Front forbids backend domain", () => {
    expect(leadFrontAgentConfig.system.toLowerCase()).toContain("backend");
  });

  it("Lead Back forbids frontend domain", () => {
    expect(leadBackAgentConfig.system.toLowerCase()).toContain("frontend");
  });
});

// ── Schema validation ─────────────────────────────────────────────

describe("ProjectMandateSchema", () => {
  it("parses valid mandate", () => {
    const valid = {
      title: "Test Project",
      description: "A test project.",
      target_users: ["devs"],
      core_features: ["auth", "dashboard"],
      success_criteria: ["users can log in"],
      constraints: ["budget: 10k"],
      estimated_complexity: "medium",
      tensions: [
        {
          id: "scope",
          wants: "define scope",
          value: "MVP only",
          confidence: 0.8,
          doubts: [],
        },
      ],
    };
    expect(() => ProjectMandateSchema.parse(valid)).not.toThrow();
  });

  it("rejects mandate missing required fields", () => {
    expect(() => ProjectMandateSchema.parse({ title: "Incomplete" })).toThrow();
  });

  it("rejects invalid estimated_complexity", () => {
    const bad = {
      title: "x",
      description: "x",
      target_users: [],
      core_features: [],
      success_criteria: [],
      constraints: [],
      estimated_complexity: "extreme",
      tensions: [],
    };
    expect(() => ProjectMandateSchema.parse(bad)).toThrow();
  });
});

describe("StackProposalSchema", () => {
  it("parses valid stack proposal", () => {
    const valid = {
      field_assessment: {
        accepted: ["ceo_scope"],
        contested: [],
        blocked_by: [],
      },
      decisions: {
        tech_stack: {
          frontend: "Next.js",
          backend: "Node.js",
          database: "Postgres",
          key_libraries: ["zod"],
          rationale: "Standard",
          confidence: 0.9,
        },
        deployment_model: {
          hosting: "Vercel",
          approach: "serverless",
          rationale: "Simple",
          confidence: 0.85,
        },
        vendors: [],
      },
      deferred: [],
    };
    expect(() => StackProposalSchema.parse(valid)).not.toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => StackProposalSchema.parse({ decisions: {} })).toThrow();
  });
});

describe("FrontBlueprintSchema", () => {
  it("parses valid front blueprint", () => {
    const valid = {
      summary: "A Next.js app with auth and dashboard.",
      components: [
        {
          name: "LoginPage",
          type: "page",
          responsibility: "Auth entry point",
          depends_on: [],
          confidence: 0.9,
        },
      ],
      ux_flows: [],
      state_management: "React Query + Zustand",
      risks: [],
      blockers: [],
    };
    expect(() => FrontBlueprintSchema.parse(valid)).not.toThrow();
  });
});

describe("BackBlueprintSchema", () => {
  it("parses valid back blueprint", () => {
    const valid = {
      summary: "REST API with JWT auth.",
      api_contracts: [
        {
          endpoint: "POST /api/auth/login",
          method: "POST",
          purpose: "Authenticate user",
          auth: "public",
          request_shape: "{ email, password }",
          response_shape: "{ token }",
          confidence: 0.9,
        },
      ],
      integrations: [],
      risks: [],
      blockers: [],
    };
    expect(() => BackBlueprintSchema.parse(valid)).not.toThrow();
  });
});

describe("DataBlueprintSchema", () => {
  it("parses valid data blueprint", () => {
    const valid = {
      summary: "Postgres schema with User and Project entities.",
      data_model: [
        {
          entity: "User",
          fields: ["id", "email", "created_at"],
          relations: [],
          notes: "core entity",
          confidence: 0.9,
        },
      ],
      indexes: [],
      migration_strategy: "Versioned SQL migrations via Flyway.",
      retention_policies: [],
      risks: [],
      blockers: [],
    };
    expect(() => DataBlueprintSchema.parse(valid)).not.toThrow();
  });
});

describe("AiBlueprintSchema", () => {
  it("parses valid AI blueprint", () => {
    const valid = {
      summary: "Document classifier using claude-haiku.",
      ai_components: [
        {
          name: "DocumentClassifier",
          purpose: "Classify uploaded documents",
          model: "claude-haiku-4-5-20251001",
          input: "raw document text",
          output: "category label",
          latency_class: "interactive",
          confidence: 0.85,
        },
      ],
      model_selection: [],
      latency_analysis: [],
      risks: [],
      blockers: [],
    };
    expect(() => AiBlueprintSchema.parse(valid)).not.toThrow();
  });
});

describe("AuditReportSchema", () => {
  it("parses valid audit report", () => {
    const valid = {
      verdict: "green",
      verdict_rationale: "All tensions are coherent and pipeline is ready.",
      inconsistencies: [],
      false_blockers: [],
      scope_reality_check: {
        assessment: "Scope is realistic.",
        budget_vs_scope: "aligned",
        confidence: 0.8,
      },
      discovery_questions: [
        {
          question: "What is your budget?",
          unblocks: ["ceo_budget"],
          priority: "critical",
        },
      ],
    };
    expect(() => AuditReportSchema.parse(valid)).not.toThrow();
  });
});

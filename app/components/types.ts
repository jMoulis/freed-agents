export interface TensionSeed {
  id: string;
  wants: string;
  state: string;
  confidence: number;
  doubts: { about: string; severity: string }[];
  value: unknown;
  pendingOn?: string[];
  linkedTo?: string[];
}

export interface AgentUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
}

export interface RunResult {
  projectId: string;
  ceo: {
    mandate: {
      title: string;
      description: string;
      target_users: string[];
      core_features: string[];
      success_criteria: string[];
      constraints: string[];
      team_needs: string[];
      estimated_complexity: string;
    };
    tensions_written: number;
    usage: AgentUsage;
    duration_ms: number;
  };
  cto: {
    proposal: unknown;
    tensions_written: number;
    usage: AgentUsage;
    duration_ms: number;
  };
  architect: {
    blueprint: {
      summary: string;
      components: Array<{
        name: string;
        type: "frontend" | "backend" | "database" | "integration" | "infra";
        responsibility: string;
        depends_on: string[];
        confidence: number;
      }>;
      data_model: Array<{
        entity: string;
        fields: string[];
        relations: string[];
        notes: string;
        confidence: number;
      }>;
      api_contracts: Array<{
        endpoint: string;
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        purpose: string;
        auth: string;
        confidence: number;
      }>;
      risks: Array<{
        area: string;
        description: string;
        mitigation: string;
        severity: "low" | "medium" | "high" | "blocking";
      }>;
      blockers: Array<{
        decision: string;
        blocked_by: string;
      }>;
    };
    tensions_written: number;
    usage: AgentUsage;
    duration_ms: number;
  };
  qa: {
    audit: {
      verdict: "green" | "yellow" | "red";
      verdict_rationale: string;
      inconsistencies: Array<{
        between: string[];
        description: string;
        severity: "low" | "medium" | "blocking";
      }>;
      false_blockers: Array<{
        tension_id: string;
        reason: string;
      }>;
      scope_reality_check: {
        assessment: string;
        budget_vs_scope:
          | "aligned"
          | "underestimated"
          | "overestimated"
          | "unknown";
        confidence: number;
      };
      discovery_questions: Array<{
        question: string;
        unblocks: string[];
        priority: "critical" | "high" | "medium";
      }>;
    };
    tensions_written: number;
    usage: AgentUsage;
    duration_ms: number;
  };
  field: {
    globalConfidence: number;
    summary: string;
    tensions: TensionSeed[];
  };
  report?: {
    internal: string;
    client: string;
  };
  total_duration_ms: number;
}

export const COMPLEXITY_COLOR: Record<string, string> = {
  low: "#4ade80",
  medium: "#fb923c",
  high: "#f87171",
  very_high: "#ff4444",
};

export interface DynamicFormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "choice" | "multiple";
  options?: string[];
  placeholder?: string;
  required: boolean;
}

export interface DynamicFormData {
  theme: string;
  fields: Array<{ id: string; label: string; value: string | string[] }>;
}

export const EXAMPLE = `We need an app for our HR team. Right now everything is on paper and Excel. When a new employee joins, the HR manager has to send emails manually, print documents, chase signatures, and track everything in a spreadsheet. It takes about 2 weeks and everyone hates it.\n\nWe have around 50 employees and hire maybe 10 people per year. Budget is flexible but we're a small company so nothing crazy. We use Google Workspace for everything.`;

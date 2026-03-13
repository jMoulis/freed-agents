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
  specialists?: Record<
    string,
    {
      blueprint?: unknown;
      tensions_written: number;
      usage?: AgentUsage;
      duration_ms: number;
    }
  >;
  qa?: {
    audit?: {
      verdict: "green" | "yellow" | "red";
      verdict_rationale: string;
      inconsistencies?: Array<{
        between: string[];
        description: string;
        severity: "low" | "medium" | "blocking";
      }>;
      false_blockers?: Array<{
        tension_id: string;
        reason: string;
      }>;
      scope_reality_check?: {
        assessment: string;
        budget_vs_scope:
          | "aligned"
          | "underestimated"
          | "overestimated"
          | "unknown";
        confidence: number;
      };
      discovery_questions?: Array<{
        question: string;
        unblocks: string[];
        priority: "critical" | "high" | "medium";
      }>;
    };
    tensions_written: number;
    usage?: AgentUsage;
    duration_ms: number;
  };
  field?: {
    globalConfidence: number;
    summary: string;
    tensions: TensionSeed[];
  };
  report?: {
    internal: string;
    client: string;
  };
  scores?: Record<string, unknown>;
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

export const EXAMPLE = `Company: AcmeCorp HR\nSector: HR software\nProject: We want to replace our paper and Excel-based employee onboarding with a web app. Right now the HR manager sends emails manually, prints documents, chases signatures, and tracks everything in a spreadsheet. It takes 2 weeks and everyone hates it.`;

// Bootstrap form data shape
export interface BootstrapFormData {
  company: string;
  sector: string;
  project: string;
}

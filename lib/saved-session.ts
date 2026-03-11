const savedSession = [
  {
    id: "google_workspace_integration",
    wants: "Scope of Google Workspace integration needed",
    value: [
      "Gmail for automated emails",
      "Google Drive for document storage",
      "Google Calendar for onboarding schedule/reminders",
      "Potentially Google Sheets API to migrate existing tracking data",
    ],
    confidence: 0.7,
    doubts: [
      {
        about: "Whether they need single sign-on via Google",
        severity: "medium",
      },
      {
        about: "Google Workspace tier and API access permissions",
        severity: "medium",
      },
    ],
    linkedTo: ["core_features", "tech_stack"],
  },
  {
    id: "build_vs_buy",
    wants: "Should we build custom or configure existing HRIS/onboarding tool",
    value:
      "Recommend evaluation of existing tools (BambooHR, Rippling, Gusto onboarding modules) vs custom build - may be more cost-effective for their scale",
    confidence: 0.6,
    doubts: [
      {
        about:
          "Whether client has already evaluated existing tools and rejected them",
        severity: "blocking",
        blocksPath: ["project_approach"],
      },
      {
        about:
          "Client's need for customization vs their small scale suggests SaaS might be better fit",
        severity: "medium",
      },
    ],
    pendingOn: ["budget_constraints"],
    linkedTo: ["budget_constraints", "estimated_timeline"],
  },
  {
    id: "compliance_requirements",
    wants: "Legal and regulatory constraints",
    value:
      "Unknown - small company likely subject to basic labor law, data privacy (possibly GDPR/CCPA depending on location), document retention policies",
    confidence: 0.3,
    doubts: [
      {
        about: "Company location and applicable labor laws",
        severity: "blocking",
        blocksPath: ["document_templates", "data_handling"],
      },
      {
        about: "Industry-specific compliance needs",
        severity: "medium",
      },
      {
        about: "Data privacy requirements (GDPR, CCPA, etc.)",
        severity: "blocking",
        blocksPath: ["data_handling", "hosting"],
      },
    ],
    linkedTo: ["project_scope", "tech_stack"],
  },
  {
    id: "core_features",
    wants: "Essential features for MVP",
    value: [
      "Onboarding workflow builder/templates",
      "Automated email notifications",
      "Document generation from templates",
      "E-signature collection and tracking",
      "Task checklist with status tracking",
      "Google Workspace integration (Calendar, Drive, Gmail)",
      "Basic dashboard for HR manager",
      "New hire portal for form completion",
    ],
    confidence: 0.75,
    doubts: [
      {
        about: "Priority order of features - what's truly MVP vs nice-to-have",
        severity: "medium",
      },
      {
        about:
          "Whether workflow needs to be configurable by HR or can be hardcoded",
        severity: "medium",
      },
    ],
    linkedTo: ["project_scope", "estimated_timeline"],
  },
  {
    id: "budget_constraints",
    wants: "Understand financial boundaries",
    value:
      "Small company, 50 employees, 'flexible but nothing crazy' - estimate $30K-60K budget range for development, plus ongoing costs for e-signature service and hosting",
    confidence: 0.5,
    doubts: [
      {
        about:
          "Actual budget number - 'flexible' is vague, need concrete range",
        severity: "blocking",
        blocksPath: ["vendor_selection", "tech_stack"],
      },
      {
        about: "Whether they expect ongoing maintenance/support costs",
        severity: "medium",
      },
      {
        about: "Appetite for SaaS subscription costs vs one-time build",
        severity: "blocking",
        blocksPath: ["build_vs_buy"],
      },
    ],
    linkedTo: ["build_vs_buy", "vendor_selection"],
  },
  {
    id: "estimated_timeline",
    wants: "Rough timeline estimate for delivery",
    value:
      "8-12 weeks for MVP (core onboarding workflow + Google integration + e-signatures)",
    confidence: 0.65,
    doubts: [
      {
        about:
          "Scope of document templates needed - could add 2-4 weeks if extensive customization required",
        severity: "medium",
      },
      {
        about: "Third-party approval/procurement time for e-signature service",
        severity: "medium",
      },
      {
        about: "Client availability for requirements refinement and UAT",
        severity: "medium",
      },
    ],
    linkedTo: ["project_scope", "budget_constraints"],
  },
  {
    id: "team_needs",
    wants: "Technical skills required to build this",
    value: [
      "Full-stack web developer (React/Vue + Node.js/Python)",
      "Google Workspace API integration specialist",
      "Document generation & e-signature integration (DocuSign/HelloSign or similar)",
      "Basic UI/UX design for workflow interfaces",
      "QA engineer for workflow testing",
    ],
    confidence: 0.8,
    doubts: [
      {
        about: "Whether they need mobile access (affects tech stack decisions)",
        severity: "medium",
      },
      {
        about: "On-premise vs cloud hosting preference",
        severity: "low",
      },
    ],
    linkedTo: ["tech_stack", "deployment_model"],
  },
  {
    id: "success_criteria",
    wants: "Define measurable outcomes",
    value: [
      "Reduce onboarding time from 2 weeks to under 3 days",
      "Eliminate manual email sending for standard onboarding communications",
      "Achieve 100% digital document workflow (zero printing)",
      "HR manager reports reduced manual work by 70%+",
      "Track onboarding status in real-time vs spreadsheet",
    ],
    confidence: 0.7,
    doubts: [
      {
        about:
          "Client's actual tolerance for onboarding duration - is 3 days acceptable or do they want faster",
        severity: "low",
      },
      {
        about:
          "Whether tracking/reporting capabilities are important to them beyond basic status",
        severity: "medium",
      },
    ],
    linkedTo: ["project_scope", "core_features"],
  },
  {
    id: "target_users",
    wants: "Identify who will use this daily",
    value: [
      "HR Manager (primary user, creates and manages onboarding workflows)",
      "New hires (secondary users, complete forms and sign documents)",
      "Department managers (potential users for approval workflows)",
    ],
    confidence: 0.8,
    doubts: [
      {
        about:
          "Whether department managers need to approve or be involved in onboarding steps",
        severity: "low",
      },
      {
        about: "IT team involvement for equipment/access provisioning",
        severity: "medium",
      },
    ],
    linkedTo: ["user_workflows", "core_features"],
  },
  {
    id: "project_scope",
    wants: "Define clear boundaries of what we're building",
    value:
      "Employee onboarding workflow automation: document generation, signature collection, task tracking, email automation. Integration with Google Workspace. OUT OF SCOPE: full HRIS, payroll, benefits administration, performance management, employee self-service portal beyond onboarding.",
    confidence: 0.75,
    doubts: [
      {
        about:
          "What specific documents need to be generated (offer letters, contracts, NDAs, tax forms, etc.)",
        severity: "medium",
      },
      {
        about:
          "Whether they need integration with any existing systems beyond Google Workspace",
        severity: "medium",
      },
      {
        about:
          "Compliance requirements (labor law, data privacy) not mentioned in brief",
        severity: "medium",
      },
    ],
    linkedTo: ["core_features", "compliance_requirements"],
  },
];

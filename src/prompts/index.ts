/**
 * iso27001-mcp — MCP Workflow Prompts
 *
 * Four high-level workflow prompts that guide the model through common ISMS
 * tasks without requiring it to discover the correct sequence of 52 tools.
 * Each prompt fetches relevant resources, identifies what's missing, and
 * sequences the correct tool calls.
 *
 * Registered via registerAllPrompts(server) in server.ts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerAllPrompts(server: McpServer): void {

  // ── 1. conduct_gap_assessment ─────────────────────────────────
  server.prompt(
    "conduct_gap_assessment",
    "Run a full ISO 27001 gap assessment workflow: create assessment, set control statuses, generate summary, and produce a remediation roadmap.",
    {
      organisation_name: z.string().optional().describe("Organisation name (auto-injected from org profile if set)"),
      scope:             z.string().optional().describe("ISMS scope description, e.g. 'Cloud infrastructure and remote employees'"),
      isms_version:      z.enum(["2022", "2013"]).optional().describe("ISO 27001 version — defaults to 2022"),
      timeline_weeks:    z.string().optional().describe("Remediation roadmap horizon in weeks (1–52, default 26)"),
    },
    ({ organisation_name, scope, isms_version = "2022", timeline_weeks = "26" }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are conducting an ISO 27001:${isms_version} gap assessment${organisation_name ? ` for ${organisation_name}` : ""}.

Follow these steps in order:

**Step 1 — Check org profile**
Read the resource \`iso27001://org/profile\`. If it is not yet set, ask the user for their organisation name, jurisdiction, and ISMS scope before continuing.

**Step 2 — Create the assessment**
Call \`create_gap_assessment\` with:
- name: "[Organisation] ISO 27001:${isms_version} Gap Assessment [current year]"
- isms_version: "${isms_version}"
${scope ? `- scope: "${scope}"` : "- scope: ask the user for their ISMS scope if not provided"}

**Step 3 — Collect current control status**
Ask the user: "Which controls are already implemented, partially implemented, or not applicable? You can describe them by theme (Organizational, People, Physical, Technological) or list specific control IDs."

For each status the user confirms, call \`update_control_status\` with confirmed=true (use the proposal_id from the preview).

**Step 4 — Review summary**
Read \`iso27001://assessment/{assessment_id}/summary\` to get compliance % and priority list.

**Step 5 — Generate roadmap**
Call \`generate_remediation_roadmap\` with assessment_id and timeline_weeks=${timeline_weeks}.

**Step 6 — Export**
Ask the user if they want the gap report exported. Call \`export_gap_report\` with format=markdown or csv.

At the end, summarise: compliance %, top 5 priority controls, and the roadmap phases.`,
        },
      }],
    }),
  );

  // ── 2. register_and_treat_risk ────────────────────────────────
  server.prompt(
    "register_and_treat_risk",
    "Register a new information security risk and immediately create a treatment plan with linked controls.",
    {
      asset:         z.string().optional().describe("Asset at risk, e.g. 'Customer database'"),
      threat:        z.string().optional().describe("Threat description, e.g. 'SQL injection'"),
      vulnerability: z.string().optional().describe("Vulnerability description"),
    },
    ({ asset, threat, vulnerability }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are registering and treating an information security risk.

**Step 1 — Collect risk details**
${asset ? `Asset: ${asset}` : "Ask: What is the asset at risk?"}
${threat ? `Threat: ${threat}` : "Ask: What is the threat?"}
${vulnerability ? `Vulnerability: ${vulnerability}` : "Ask: What is the vulnerability?"}
Ask for: likelihood (1–5), impact (1–5), and risk owner.

**Step 2 — Check for duplicates**
Call \`list_risks\` and scan for any similar existing risk before creating a new one. If a match exists, confirm with the user whether to update it (\`update_risk\`) or create a new entry.

**Step 3 — Register the risk**
Call \`create_risk\` with the collected details. Note the returned risk_id.

**Step 4 — Read the risk summary**
Read \`iso27001://risks/summary\` to show the user how this new risk fits into the overall risk landscape.

**Step 5 — Create a treatment plan**
Ask: "How should this risk be treated? Options: mitigate (requires ISO 27001 controls), accept, avoid, or transfer."
- If mitigate: ask which Annex A controls address this risk, then call \`list_controls\` filtered by theme to help identify relevant controls.
- Call \`create_treatment_plan\` with treatment_type, description, owner, due_date, and controls (if mitigate).

**Step 6 — Confirm**
Summarise the risk (score, level) and treatment plan. Ask if they want to register evidence now.`,
        },
      }],
    }),
  );

  // ── 3. prepare_internal_audit ─────────────────────────────────
  server.prompt(
    "prepare_internal_audit",
    "Plan and conduct an ISO 27001 internal audit: create the audit, record findings (NC/OBS/OFI), raise CARs, and close with effectiveness check.",
    {
      audit_scope: z.string().optional().describe("Audit scope, e.g. 'Clause 9 — Performance Evaluation' or 'Controls 8.1–8.30'"),
      auditor:     z.string().optional().describe("Name of the auditor"),
    },
    ({ audit_scope, auditor }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are preparing and conducting an ISO 27001 internal audit.

**Step 1 — Gather audit details**
${auditor ? `Auditor: ${auditor}` : "Ask: Who is the auditor?"}
${audit_scope ? `Scope: ${audit_scope}` : "Ask: What is the audit scope (clauses, controls, or themes)?"}
Ask: What is the planned audit date?

**Step 2 — Check existing assessments and risks**
- Call \`list_gap_assessments\` to identify the active assessment and any open controls.
- Call \`list_risks\` filtered by status=open to note high/critical risks that should be in scope.

**Step 3 — Create the audit record**
Call \`create_audit\` (preview first — use the returned proposal_id, then call again with confirmed=true):
- name, scope, auditor, planned_date, controls_in_scope

**Step 4 — Record findings**
For each finding the user describes, call \`record_finding\` (preview + confirm):
- type: nc (non-conformity — requires severity: major|minor), obs (observation), or ofi (opportunity for improvement)
- clause_or_control, description, objective_evidence
- Remind the user: NCs require objective evidence. Observations do not require corrective action.

**Step 5 — Raise corrective actions for NCs**
For each NC finding, call \`create_corrective_action\` (preview + confirm):
- finding_id, description, owner, due_date, root_cause

**Step 6 — Generate the audit report**
Call \`generate_audit_report\` with format=markdown for a complete report including all findings and CARs.

**Closing an audit later:**
When all CARs are verified effective, call \`update_corrective_action\` with status=closed and effectiveness_verified=true (ISO Clause 10.1 requirement).`,
        },
      }],
    }),
  );

  // ── 4. prepare_management_review ─────────────────────────────
  server.prompt(
    "prepare_management_review",
    "Prepare and conduct an ISO 27001:2022 Clause 9.3 management review: schedule it, record all 7 mandatory input categories, record outputs, and complete.",
    {
      review_title: z.string().optional().describe("Review title, e.g. 'Q3 2026 ISMS Management Review'"),
      chair:        z.string().optional().describe("Review chair, typically the CISO or senior management"),
    },
    ({ review_title, chair }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are preparing an ISO 27001:2022 Clause 9.3 management review.

**ISO 27001:2022 §9.3 requires 7 mandatory input categories and at least 1 output.**
The server enforces these — \`complete_management_review\` will fail if any are missing.

**Step 1 — Schedule the review**
${review_title ? `Title: ${review_title}` : "Ask: What is the review title?"}
${chair ? `Chair: ${chair}` : "Ask: Who will chair the review?"}
Ask: What is the review date? Who are the attendees?
Call \`create_management_review\`.

**Step 2 — Record all 7 mandatory inputs (ISO §9.3.2)**
Call \`record_review_input\` for EACH of the following categories. Collect a summary and optional detail from the user for each:

1. **audit_results** — results of internal audits, including NC status, CAR closure rate
2. **risk_summary** — read \`iso27001://risks/summary\` and summarise risk posture
3. **objective_performance** — ISMS objectives status, KPIs, monitoring results
4. **nonconformities** — open and closed nonconformities; corrective action status
5. **previous_actions** — status of actions from the last management review
6. **changes** — changes relevant to the ISMS (org, legal, contractual, threat landscape)
7. **resources** — adequacy of resources (budget, people, tools)

Optional 8th category: **stakeholder_feedback** (interested parties, supplier feedback).

**Step 3 — Record outputs (ISO §9.3.3)**
At least one output is required. Call \`record_review_output\` for each decision:
- improvement_opportunity — new improvement action with owner and due date
- resource_decision — budget/headcount/tooling decisions
- policy_change — policies requiring update
- objective_change — changes to ISMS objectives

**Step 4 — Complete the review**
Call \`complete_management_review\` (preview + confirm with proposal_id):
- outcome_summary: concise record of decisions made

**Step 5 — Follow up**
- For each improvement_opportunity output, call \`create_improvement_opportunity\` to track it (Clause 10.1).
- Read \`iso27001://management-review/{review_id}\` to generate the meeting minutes.`,
        },
      }],
    }),
  );
}

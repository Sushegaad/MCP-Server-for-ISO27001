# Sample ISMS Outputs — Acme Financial Services Ltd

These files are representative outputs generated from a demo ISMS for a fictitious organisation. They demonstrate the artifact quality Claude produces when working with iso27001-mcp tools.

## Organisation

**Name:** Acme Financial Services Ltd
**Industry:** Payments processing (UK-regulated)
**Staff:** ~120
**Scope:** Cloud infrastructure (AWS eu-west-1), payment processing systems, software development function
**Standard:** ISO 27001:2022
**Status:** Preparing for certification audit (Q1 2025)

## File Index

| File | Description | Generating tool(s) | ISO 27001 reference |
|------|-------------|-------------------|---------------------|
| [gap-assessment-summary.md](gap-assessment-summary.md) | Complete gap assessment across all 93 controls | `export_gap_report` + resource `iso27001://assessment/{id}/summary` | Clause 6.1.2, Annex A |
| [remediation-roadmap.md](remediation-roadmap.md) | 26-week prioritised remediation plan | `generate_remediation_roadmap` | Clause 6.1.3, 8.1 |
| [risk-register.csv](risk-register.csv) | Risk register with treatment plans (10 risks) | `generate_risk_register` | Clause 6.1.2, Annex A |
| [statement-of-applicability.csv](statement-of-applicability.csv) | Full SoA — all 93 ISO 27001:2022 controls | `export_soa` | Clause 6.1.3 |
| [access-control-policy.md](access-control-policy.md) | Generated access control policy | `create_policy` + resource `iso27001://policy/{id}` | Annex A 5.15–5.18, 8.2–8.5 |
| [incident-handling-procedure.md](incident-handling-procedure.md) | Incident handling procedure | `create_procedure`, `export_procedure` | Annex A 5.24–5.28, 6.8 |
| [internal-audit-report.md](internal-audit-report.md) | Internal audit report with findings | `generate_audit_report` | Clause 9.2 |
| [corrective-action-record.md](corrective-action-record.md) | Two corrective action records (1 open, 1 closed) | `create_corrective_action`, `update_corrective_action` | Clause 10.1 |
| [evidence-package.md](evidence-package.md) | Evidence inventory and gap analysis | `list_evidence` + resource `iso27001://assessment/{id}/evidence-gaps` | Clause 7.5, 9.1 |

## How to Generate Your Own

Ask Claude (with iso27001-mcp connected):

1. **Gap assessment:** "Run a gap assessment for our organisation against ISO 27001:2022 controls and give me a summary"
2. **Risk register:** "Generate the current risk register as a CSV file"
3. **SoA:** "Export the Statement of Applicability as CSV"
4. **Policies:** "Generate an access control policy for Acme Financial Services"
5. **Remediation roadmap:** "Generate a 26-week remediation roadmap based on the current gap assessment"

Your outputs will reflect your organisation's actual data — these samples use fictional data for illustration only.

## Disclaimer

These samples use entirely fictional data for a non-existent organisation. They are provided to illustrate output quality and format. They are not legal, compliance, or audit advice. Consult a qualified ISO 27001 auditor for your certification programme.

# iso27001-mcp — Guided First-Run Checklist

This walkthrough takes you from a blank workspace to an audit-pack-ready ISMS deliverable set in a single Claude conversation. Follow the steps in order — each one builds on the last.

> **Prerequisites:** `iso27001-mcp` installed and `iso27001-mcp doctor` showing all green. If not, see [Installation](docs/REFERENCE.md#installation).

---

## Step 1 — Set your organisation profile

Everything else auto-injects from this. Do it once.

```
"Set the organisation profile for [Your Company Ltd].
Legal entity: [Your Company Ltd]
Jurisdiction: [England and Wales]
In-scope activities: [Cloud SaaS platform and remote employees]
ISMS scope statement: [All cloud-hosted production systems, internal tooling, and remote workforce]
CISO: [name], ISMS Manager: [name]"
```

Claude will call `set_organization_profile`. From this point on, `organisation_name` and `scope` are auto-injected into every policy and procedure you generate.

---

## Step 2 — Run your first gap assessment

```
"Create an ISO 27001:2022 gap assessment called '2026 Certification Assessment'
scoped to our full cloud infrastructure. Mark the following controls as implemented
with evidence: 5.1, 5.2, 6.1.2, 8.1, 8.20. Mark 8.28, 9.4, 10.1 as partial.
Leave everything else as not_started."
```

Claude will create the assessment and update control statuses in one pass. Then ask:

```
"Read iso27001://assessment/{id}/summary — what is our current compliance percentage
and what are the top 5 controls to prioritise?"
```

---

## Step 3 — Build your risk register

```
"Register these 3 risks for our assessment:
1. Customer DB exposed to SQL injection — likelihood 4, impact 5, owner: Head of Engineering
2. Phishing targeting staff with access to production — likelihood 3, impact 4, owner: CISO
3. Cloud provider outage affecting availability — likelihood 2, impact 5, owner: CTO

For risk 1, create a mitigate treatment plan: implement parameterised queries and WAF rules,
due 2026-09-30, linked to controls 8.28 and 8.20."
```

Then review:

```
"Read iso27001://risks/summary — show me the heatmap and top risks by score."
```

---

## Step 4 — Generate your Statement of Applicability

```
"Generate a Statement of Applicability for ISO 27001:2022 from the 2026 Certification Assessment.
Export it as CSV."
```

The SoA pre-populates all 93 controls with inclusion decisions derived from your gap assessment. You can then update individual entries:

```
"In the SoA, mark control 8.10 (Information deletion) as not applicable —
justification: we do not process personal data subject to right-to-erasure obligations."
```

---

## Step 5 — Create your core policy pack

Generate the 4 policies most frequently requested by auditors:

```
"Generate an Information Security Policy, an Access Control Policy,
a Risk Management Policy, and an Incident Response Policy.
Use our organisation profile for all org details. Effective date: 2026-08-01."
```

Each policy renders from an ISO 27001-aligned Mustache template with your org name, scope, and review cycle already filled in.

---

## Step 6 — Generate supporting procedures

```
"Generate an Incident Handling Procedure and an Access Provisioning Procedure,
linked to the Incident Response Policy and Access Control Policy respectively.
Owner: CISO. Effective date: 2026-08-01."
```

---

## Step 7 — Generate a remediation roadmap

```
"Generate a 26-week remediation roadmap from the 2026 Certification Assessment,
grouped by risk level. Export as markdown."
```

This gives you a phased plan you can paste directly into a project tracker.

---

## Step 8 — Plan your internal audit

```
"Create an internal audit called 'Q3 2026 Pre-Certification Audit'
scoped to clauses 6, 8, and 9. Auditor: [name]. Planned date: 2026-09-15.
Controls in scope: 5.1, 5.2, 6.1.2, 8.1, 8.20, 8.28, 9.4."
```

After the audit runs, record findings:

```
"Record a major non-conformity against clause 9.1:
no documented evidence of performance monitoring KPIs for Q1 and Q2 2026.
Raise a corrective action assigned to the Compliance Manager, due 2026-10-31."
```

---

## What you now have

After completing these 8 steps, your workspace contains:

| Deliverable | How to export |
|-------------|--------------|
| Gap assessment report | `"Export the gap report as markdown"` |
| Risk register | `"Export the risk register as CSV"` |
| Statement of Applicability | Already exported in step 4 |
| 4 ISO 27001 policies | Stored in DB; readable at `iso27001://policy/{id}` |
| 2 operating procedures | Stored in DB; readable at `iso27001://procedure/{id}` |
| 26-week remediation roadmap | Already exported in step 7 |
| Internal audit plan + finding | Stored in DB |
| Corrective action | Tracked and linked to finding |

This is the core evidence package for an ISO 27001 Stage 1 audit readiness review.

---

## Sample outputs

The [`samples/`](samples/) directory contains pre-built audit-pack-ready examples for a fictitious organisation ("Acme Financial Services Ltd") covering the full workflow above. See [Sample Outputs](docs/REFERENCE.md#sample-outputs) for the index.

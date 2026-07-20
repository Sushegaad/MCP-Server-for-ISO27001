# iso27001-mcp — Roadmap

Items here are planned but not yet implemented. PRs and feature requests are welcome — open an issue to discuss or vote on priorities.

---

## Near-term (next 1–2 releases)

### CSV / spreadsheet import — remaining
`import_risks` and `import_control_statuses` shipped in v0.9.74. Still planned:
- `import_evidence` — register a batch of evidence artefacts from a CSV export of an existing evidence tracker

Priority: **medium** — completes the CSV migration path.

### Known issues (tracked)

- **Risk register export/import round-trip mismatch** — `generate_risk_register` emits no `vulnerability` column (hard-required by `import_risks`) and uses `in_treatment` status (not in the importer's accepted set), so the server's own CSV export cannot be re-imported. Fix: add `vulnerability` and `related_controls` columns to the exporter and align the status vocabularies.
- **CSV parser does not handle quoted fields** — `import_risks`/`import_control_statuses` split naively on commas, so values containing commas (e.g. `"Acme, Inc."`) break. Fix: quote-aware tokenizer (RFC 4180) or a small parsing dependency.
- **Missing migration `.sql` sibling files** — migrations 0003, 0006, 0007 exist only as embedded strings in `src/db/migrations/index.ts`; the human-readable `.sql` copies were never created. Fix: restore the three files and add a lockstep test, or formally drop the `.sql` convention.

### Auditor validation note
A lightweight "reviewed by" section to be added to documentation and template headers indicating which controls, clause mappings, and policy templates have been reviewed against the published ISO 27001:2022 Annex A and clause text by a qualified practitioner.

---

## Medium-term

### Confluence / Notion / SharePoint evidence ingestion
Pull evidence artefacts directly from the platforms where teams actually store their policies and procedures:
- Confluence: ingest page as a policy or procedure record (with version tracking)
- Notion: ingest database entries as evidence records
- SharePoint / OneDrive: register a document as evidence with source URL

### Slack integration
- Notify a Slack channel when a CAR is opened, overdue, or closed
- Surface overdue evidence reviews and management review reminders
- Weekly ISMS health digest (open risks, overdue CARs, expiring evidence)

### Google Drive / Docs integration
- Register a Google Doc as a policy or procedure and track its version
- Sync policy review dates from a Google Sheets tracker

---

## Longer-term

### Team / hosted mode improvements
The server already supports SSE transport for team use. Planned improvements:
- Web dashboard for viewing ISMS status without a Claude Desktop session
- Webhook support — emit events on risk creation, CAR state changes, audit completion
- Read-only guest access (no API key required for public resource URIs in hosted mode)

### ISO 27001:2022 clause health scoring
An automated "certification readiness score" (0–100) computed from:
- Gap assessment compliance %
- Open vs closed risks
- Policy and procedure review status
- Outstanding CARs
- Evidence currency
- Management review completion

### Multi-framework support
Extend the control registry and SoA tooling to support additional frameworks alongside ISO 27001:2022:
- SOC 2 Trust Services Criteria
- NIST CSF 2.0
- ISO 27001:2013 (already seeded — full workflow support planned)
- CIS Controls v8

---

## Completed

| Feature | Version |
|---------|---------|
| CSV bulk import — `import_risks` + `import_control_statuses` with dry-run preview | v0.9.74 |
| HITL proposal tokens — server-side single-use UUID prevents model self-confirmation | v0.9.74 |
| 4 MCP Workflow Prompts — `conduct_gap_assessment`, `register_and_treat_risk`, `prepare_internal_audit`, `prepare_management_review` | v0.9.74 |
| 13 tools retired to MCP Resources (20 resource URIs) | v0.9.7 |
| HITL confirmation gates on all mutating tools | v0.9.7 |
| Shared DB types, constants, evidence utils (KISS/DRY refactor) | v0.9.7 |
| Evidence document templates (6 types, dual-write) | v0.9.6 |
| Management review — Clause 9.3 full lifecycle | v0.9.5 |
| Improvement plan — Clause 10.1 | v0.9.5 |
| SSE transport for team/hosted mode | v0.9.4 |
| HMAC-SHA256 tamper-evident audit log | v0.9.3 |
| Jira and GitHub issue linking for evidence | v0.9.2 |
| AES-256 encrypted SQLite (`better-sqlite3-multiple-ciphers`) | v0.9.1 |

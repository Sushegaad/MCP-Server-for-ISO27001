## What's new in v0.8.1

### Demo site — Resources tab

The interactive demo now includes a **Resources** section in the left navigation (under the new "Info" sidebar group):

- **What is this MCP server?** — plain-English overview of capabilities and architecture
- **Installation** — step-by-step guide: `npm install -g iso27001-mcp`, secret generation (`openssl rand -hex 32`), API key generation, Claude Desktop JSON config snippet, and a verify call
- **Quick start** — sample Claude prompts to get running in under a minute
- **External links** — cards for the npm package, GitHub repo, README docs, and the issue tracker
- **Author** — Hemant Naik · Creator & Maintainer ([LinkedIn](https://www.linkedin.com/in/tanaji-naik))

### Fixes

- Demo `SECTION_META.tools` sub-text corrected from "50 MCP tools across 11 groups" → "63 MCP tools across 14 groups"
- Demo sidebar footer bumped to `v0.8.1`
- `docs/index.html` (GitHub Pages live site) fully re-synced with `demo/index.html` — the Resources section and all Group 12–14 additions are now live

---

## What's new in v0.8.0

### 13 new tools (63 total)

**Management Review — Clause 9.3** (`create_management_review`, `record_review_input`, `record_review_output`, `complete_management_review`, `get_management_review`, `list_management_reviews`) — full §9.3 lifecycle with enforced business rules: all 7 input categories required and at least 1 output before a review can be marked complete.

**Improvement Plan — Clause 10.1** (`create_improvement_opportunity`, `update_improvement_opportunity`, `get_improvement_opportunity`, `list_improvement_opportunities`) — forward-only status transitions (open → in_progress → implemented → closed), health rating (excellent/good/fair/needs_attention/at_risk) based on backlog composition.

**Evidence Templates** (`generate_evidence_document`, `get_evidence_document`, `list_evidence_documents`) — 6 Mustache-rendered document types (Access Review Attestation, Training Acknowledgement, Supplier Security Questionnaire, Incident Post-Mortem, BCP Test Report, Risk Treatment Sign-Off) with org-profile injection; dual-writes to both `generated_evidence` and `evidence` tables.

### Security hardening

- **Audit log**: `row_hash` upgraded from SHA-256 over 4 fields → HMAC-SHA256 (keyed with `HMAC_SECRET`) over all 9 fields with hash chaining via `prev_hash` — any tampered or reordered row is detectable.
- **SSE auth**: `/sse` endpoint now requires `Authorization: Bearer <key>` at connect time; session-bound key is pinned to every subsequent `/messages` request.
- **`extractShape()` fix**: nested `.refine()` chains no longer silently drop their Zod field shape.

### Mustache partials

All 24 templates (12 policies, 6 procedures, 6 evidence) now use shared partials (`{{> org_header}}`, `{{> revision_block}}`, `{{> approver_signature}}`) instead of duplicated boilerplate.

### 3 new SQL migrations (6 total)

`0004` management_reviews / review_inputs / review_outputs / improvement_opportunities · `0005` generated_evidence · `0006` audit_log.prev_hash

### Counts

| | v0.7.9 | v0.8.0 |
|---|---|---|
| Tools | 50 | 63 |
| SQL migrations | 3 | 6 |
| Templates | 18 | 24 |
| Tests | 317 | 470 |

## What's new in v0.8.2

### Security hardening (3 fixes)

Addresses findings from the [Socket.dev AI security scan](https://socket.dev/alerts/gptSecurity) on v0.8.1:

- **SSE `MCP_API_KEY` env fallback removed** — the `/sse` endpoint now strictly requires `Authorization: Bearer <key>`. The `MCP_API_KEY` env var is for the stdio pipeline only (`src/tools/index.ts`). Using it as an SSE fallback allowed any process on the host that could read env vars to connect without a header.
- **CORS wildcard eliminated** — dev mode no longer sends `Access-Control-Allow-Origin: *`. Defaults to `http://localhost` in dev and `https://claude.ai` in production, configurable via `CORS_ORIGIN` env var. (Wildcard + `Authorization` is already blocked by browsers per the Fetch spec, but the explicit removal closes the scanner finding and is the correct default.)
- **`gptSecurity` suppression added** — `.github/socket.yml` now includes a `gptSecurity` suppression for `src/auth/api-key.ts` explaining that `generateKey()` uses intentional print-once key delivery (same pattern as `ssh-keygen`, `npm token create`). The raw key is never re-logged or stored in plaintext.

### Trust Center added

New `docs/security/` directory with five auditor-facing documents:

- [`threat-model.md`](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/threat-model.md) — full STRIDE analysis: 7 assets, trust boundaries, 16-row mitigations table
- [`hardening-guide.md`](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/hardening-guide.md) — three deployment modes (local/team/hosted) with env var tables, nginx/Caddy examples, key rotation runbook
- [`data-flow.md`](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/data-flow.md) — auditor statement on what data leaves the machine (nothing in stdio mode; no telemetry; opt-in integrations only)
- [`supply-chain.md`](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/supply-chain.md) — 4-dep inventory, npm provenance verification, SBOM commands, reproducible build steps
- [`audit-log-integrity.md`](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/audit-log-integrity.md) — exact HMAC-SHA256 chain spec, tamper detection guide, standalone Node.js + Python verification scripts

### Auditor-ready sample outputs added

New `samples/` directory with 9 realistic output files for a fictitious payments processor ("Acme Financial Services Ltd") preparing for ISO 27001:2022 certification:

`gap-assessment-summary.md` · `remediation-roadmap.md` · `risk-register.csv` · `statement-of-applicability.csv` · `access-control-policy.md` · `incident-handling-procedure.md` · `internal-audit-report.md` · `corrective-action-record.md` · `evidence-package.md`

### Other

- `SECURITY.md` added at repo root (GitHub auto-links as security policy); includes responsible disclosure process, response SLAs, and scope statement
- `README.md`: Trust Center link added to Security section; new Sample Outputs section with file index
- `npm downloads` badge added to README

---

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

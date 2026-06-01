## What's new in v0.8.6

### Installation reliability — `init`, `doctor`, and `keygen` hardened

A comprehensive audit of the Quick Start flow found and fixed twelve failure cases across all three CLI commands.

**`iso27001-mcp init` fixes:**
- **Process hangs after completion** — `closePrompt()` now calls `process.stdin.unref()` so the event loop drains and the process exits naturally after the wizard finishes.
- **Data loss warning on re-run** — when an existing `.env` and its associated database are both detected, `init` now reads the old `DB_PATH` from the file, confirms the database exists, and shows a prominent warning before asking for confirmation. Default answer is `n` (preserve existing installation).
- **`AUDIT_LOG_PATH` missing from Claude Desktop config** — `buildMcpEntry` now includes `AUDIT_LOG_PATH` alongside `DB_PATH` so the server always writes its audit log next to the database, not in an unpredictable process CWD.
- **Windows backslash paths in JSON** — all paths written into `claude_desktop_config.json` are normalised to forward slashes via `normPath()`.
- **Pointer file for non-default install paths** — when the user chooses a non-default `.env` location, `init` writes `~/.iso27001/.env-location` so subsequent `doctor`, `keygen`, and `keys` commands can find the `.env` from any working directory.

**`iso27001-mcp doctor` fixes:**
- **False-negative on `MCP_API_KEY` check** — `MCP_API_KEY` is not stored in the `.env` file (it lives in the Claude Desktop config). A standalone `doctor` invocation would always fail Check 3, even after a successful install. The new env-loader now reads `MCP_API_KEY` from the Claude Desktop config as a fallback, eliminating the false-negative.
- **Always exits with code 1 on Linux** — Checks 9 (Claude Desktop config) and 10 (iso27001-mcp entry) are now marked N/A (`--`) on Linux with the note "not applicable on Linux — use Claude Code". Doctor exits cleanly on Linux for fully configured installs.
- **Summary message corrected** — the "only skipped" summary branch no longer says "due to earlier failures" when the skips are platform-related.

**`iso27001-mcp keygen` / `iso27001-mcp keys` fixes:**
- **Missing env vars in fresh shell** — both commands now call `loadDotEnvFile()` before `loadSecrets()`, auto-loading secrets from the `.env` file without requiring the user to `source` it manually.

**New file: `src/cli/env-loader.ts`**

`loadDotEnvFile()` searches for the `.env` in this order:
1. Path recorded in `~/.iso27001/.env-location` (written by `init` for non-default paths)
2. `~/.iso27001/.env` (default `init` location)
3. `<cwd>/.env`
4. `<dirname(DB_PATH)>/.env` (if `DB_PATH` is already in the environment)

Only sets variables not already in `process.env` (shell exports always win). Only sets non-empty values. Never throws.

### Quick Start simplified to 3 commands

The redundant and misleading fourth step (`iso27001-mcp keygen`) has been removed from the Quick Start. `iso27001-mcp init` already generates an admin API key and writes it directly into the Claude Desktop config. Running `keygen` afterwards generates a new key but does not update the config — leaving Claude Desktop using the old key. The canonical Quick Start is now:

```bash
npm install -g iso27001-mcp
iso27001-mcp init
iso27001-mcp doctor
```

### Documentation updates

- `docs/REFERENCE.md` — npm permission error note added after `npm install -g` (recommends nvm/Volta; `npm config set prefix` alternative; Windows "command not found" note)
- README and REFERENCE.md reviewed for correctness; five issues fixed: duplicate `---` separator, broken internal anchor for Sample Outputs, wrong evidence template type names, stale migration range in project structure, missing `markdownToHtml`/`renderHtmlDocument` in `template-utils.ts` description

---

## What's new in v0.8.5

### Internal Audit interactive mask (demo site)

The live demo now includes a full **Internal Audit** guided panel under a new sidebar nav item, positioned between Procedures and Management Review. The panel follows the same 3-phase flow used by Claude internally:

**Phase 1 — Plan Audit** — collects audit name, lead auditor, planned date, controls in scope, clauses in scope, and scope description. Simulates `create_audit`.

**Phase 2 — Record Findings** — supports NC (major/minor), OBS (observation), and OFI (opportunity for improvement) finding types. Severity is enforced for NC findings. Simulates `record_finding`. Live stats bar shows NC / OBS / OFI counts.

**Phase 3 — CARs & Close** — raise corrective action requests against NC findings, mark them effective (`effectiveness_verified`), and close the audit. The Close button is disabled until every NC finding has a verified CAR — directly encoding the ISO 27001:2022 Clause 10.1 business rule. Simulates `create_corrective_action`, `update_corrective_action`, and `close_audit`.

### Organisation profile branding fields (Migration 0007)

`set_organization_profile` and `get_organization_profile` now support four new optional fields for document personalisation:

- **`logo_url`** — URL or data URL for the organisation logo, embedded in HTML document headers
- **`primary_color`** — 6-digit hex colour (e.g. `#1e3a5f`) used for header bars and table accents in generated HTML documents
- **`document_footer`** — company address, legal entity name, or registration number for document footers
- **`certification_body`** — name of the external certification body (e.g. BSI, DNV, Bureau Veritas)

Migration 0007 adds the four columns to `organization_profile` as nullable ALTERs — fully backward-compatible with existing databases.

### HTML export format for documents

Three tools now accept `format: "html"` alongside their existing formats:

- **`export_procedure`** — `markdown` | `json` | **`html`**
- **`export_soa`** — `markdown` | `csv` | **`html`**
- **`generate_audit_report`** — `markdown` | `json` | **`html`**

The HTML output is a fully self-contained, print-ready document with inline CSS. It picks up `logo_url`, `primary_color`, and `document_footer` from the organisation profile automatically — so every generated document is branded for the client company with no extra arguments.

Two new utilities added to `src/tools/template-utils.ts`:

- `markdownToHtml(md)` — converts structured ISMS Markdown (headings, bold, tables, lists, hr) to HTML without any external dependency
- `renderHtmlDocument(bodyHtml, meta)` — wraps in a branded, paginated HTML shell with `@media print` CSS

Opening any HTML export in a browser and using File → Print → Save as PDF produces a clean paginated PDF.

### Print CSS (demo site)

`@media print` styles added to the demo site. Sidebar, topbar, and action buttons are suppressed; page margins set to 1.5cm. Any active demo section can now be printed directly to PDF from the browser.

### Test suite updated

`tests/integration/db-operations.test.ts` updated to expect 7 migrations (was 6) and assert the new `0007_org_profile_branding.sql` filename.

---

## What's new in v0.8.4

### MCP Registry listing

`iso27001-mcp` is now published to the [official MCP Registry](https://registry.modelcontextprotocol.io) at `io.github.Sushegaad/iso27001-mcp`. The server will appear in MCP-aware clients and tools that query the registry for available servers.

- `server.json` added at repo root — registry metadata (name, description, transport, environment variables)
- `mcpName` field added to `package.json` to satisfy npm package ownership verification required by the registry

### README overhaul

Complete restructure of `README.md` for discoverability and faster onboarding:

- New top-line pitch: *"Turn Claude into an ISO 27001 compliance assistant"*
- Added 6th badge: `ISO 27001:2022` shield
- New **What Claude can do with it** section — 10-row capability-to-prompt table replacing the prose list
- Quick Start updated to the exact 4-command flow with full `doctor` output shown and 5 "aha" prompts
- New **Tool Categories** section — scannable 14-row summary table; no need to scroll to the full reference
- New **Templates** section — all 30 Mustache templates listed with SEO keyword block
- New **Security Model** section — full RBAC capability matrix (13 capabilities × 3 roles), data residency statement, and encryption summary, positioned before the Table of Contents
- New **Roadmap** section
- New **Contributing** section

### Lint and coverage fixes

- `runDoctor` — removed spurious `async` keyword (function has no `await` expressions); return type changed from `Promise<boolean>` to `boolean`; call sites in `index.ts` and `init.ts` updated accordingly
- `src/cli/**` excluded from coverage thresholds in `vitest.config.ts` — interactive readline CLI tools are not unit-testable in CI

---

## What's new in v0.8.3

### `iso27001-mcp init` — interactive setup wizard

First-time setup is now a single guided command. No `openssl` required.

```bash
iso27001-mcp init
```

The 11-step wizard:

1. Detects any existing configuration and offers to preserve or overwrite it
2. Lets you choose where secrets and the database are stored (home dir / current dir / custom path)
3. Generates `DB_ENCRYPTION_KEY` and `HMAC_SECRET` (AES-256 / HMAC-SHA256, 64 hex chars each) using Node's `crypto.randomBytes`
4. Writes `~/.iso27001/.env` with `chmod 600` (owner read/write only; silently skipped on Windows)
5. Creates and seeds the encrypted SQLite database with all 93 ISO 27001:2022 controls
6. Generates an `admin` API key (print-once delivery)
7. Detects your Claude Desktop config and offers to add the `iso27001-mcp` entry automatically
8. Runs `iso27001-mcp doctor` inline to verify the full installation before exiting
9. Prints a success summary with next steps

### `iso27001-mcp doctor` — health check

```bash
iso27001-mcp doctor
```

Runs 10 checks and prints `✅ / ❌ / --` for each. Dependent checks are marked `--` (skipped) rather than `❌` to keep output actionable. Exits with code `1` if any check fails.

Checks: `DB_ENCRYPTION_KEY` set (64 hex), `HMAC_SECRET` set (64 hex), `MCP_API_KEY` set, database file exists, database accessible, 6/6 migrations applied, ≥93 ISO 27001:2022 controls seeded, ≥1 active non-expired API key, Claude Desktop config found, `iso27001-mcp` entry present in `mcpServers`.

### README restructured for onboarding

- New bold tagline and "Why this exists" section with 5 example Claude prompts
- Quick Start reduced to 3 commands: `npm install -g iso27001-mcp` → `iso27001-mcp init` → `iso27001-mcp doctor`
- Installation section updated to lead with the `init` wizard; manual `openssl`-based flow moved to "Advanced / Manual Setup" subsection
- Project structure updated to document the new `src/cli/` directory

### Demo site updated

Installation card in the Resources tab updated from the old 5-step flow (with `openssl rand` commands and manual JSON editing) to the new 3-step flow. Subtitle reads "three commands · No openssl required."

---

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

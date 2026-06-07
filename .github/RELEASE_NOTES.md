## What's new in v0.9.1

### Getting Started video

A **Getting Started** video is now embedded in the README directly below the Live Interactive Demo link. The thumbnail links to [https://youtu.be/BGHYTYbL8wE](https://youtu.be/BGHYTYbL8wE) and renders as a clickable image on GitHub (GitHub does not support `<iframe>` embeds in Markdown).

No code changes in this release — tooling, database schema, and all 63 tools are identical to 0.9.0.

---

## What's new in v0.9.0

### Better `doctor` checks — 2 new checks (12 total)

The `iso27001-mcp doctor` command now runs 12 checks (up from 10).

**Check 11 — Database writable**: After Check 5 confirms the database is readable, Check 11 attempts a PRAGMA `user_version` round-trip (read current value, write same value back). This catches read-only file permissions and full-disk conditions that would silently drop writes at runtime.

**Check 12 — Env vars in Claude Desktop config**: After Check 10 confirms the `iso27001-mcp` entry is present in `mcpServers`, Check 12 parses the config JSON and verifies that all three required secrets (`DB_ENCRYPTION_KEY`, `HMAC_SECRET`, `MCP_API_KEY`) are present under `mcpServers.iso27001-mcp.env`. A missing secret is the most common cause of "server starts but tools return auth errors". Both checks are skipped gracefully on Linux (no Claude Desktop) and when dependent checks failed.

### Coverage improvements

Three areas of the codebase with low branch coverage were tightened:

- **`soa.ts` HTML export** (`handleExportSoa`): Added tests covering the `format: "html"` branch including org profile lookup, HTML rendering with and without an org profile row.
- **`improvement-plan.ts` filter branches** (`handleListImprovementOpportunities`): Added tests for `source`, `priority`, and `review_id` filter parameters (which generate independent WHERE conditions) and a null-stats test confirming all `?? 0` coalescing defaults produce `rating: "excellent"`.
- **`validate.ts` normEnum** (line 46): Added a test covering the `if (typeof v !== "string") return v` early-return path — passing an integer to a `normEnum`-wrapped field exercises the branch and confirms a `VALIDATION_ERROR` is returned.

---

## What's new in v0.8.8

### Security — dependency audit clear

Two vulnerability chains that were blocking the CI release step are resolved. `npm audit --audit-level=high` now exits clean.

**esbuild ≤0.24.2 (GHSA-67mh-4wv8-2f99, moderate)** — the esbuild dev server accepted requests from any origin and echoed responses without CORS restriction. The vulnerability lived in the transitive chain `vitest → vite → esbuild`. Fixed by upgrading the test toolchain: `vitest`, `@vitest/coverage-v8`, and `@vitest/coverage-istanbul` from **1.6.1 → 4.1.8**. vitest 4.x ships with vite 6.x, which uses esbuild 0.25.12 (above the affected range). This is a dev-only dependency with zero exposure at runtime.

**qs 6.11.1–6.15.1 (GHSA-q8mj-m7cp-5q26, moderate)** — `qs.stringify` crashes with a `TypeError` on `null`/`undefined` entries in comma-format arrays when `encodeValuesOnly` is set. The vulnerability lived in `express → qs`. Fixed by bumping `express` in `optionalDependencies` from **4.22.1 → ^4.22.2**. Patch release — no breaking changes. Only affects the optional SSE transport (`--mode team/hosted`); the default stdio transport does not use express.

### Quick Start hardening — six more improvements

A third pass over the install flow found and fixed six failure modes that survived earlier rounds.

**Doctor Check 10 now validates the command path exists on disk.** The init wizard writes an absolute node binary path into `claude_desktop_config.json` (e.g. `/Users/alice/.nvm/versions/node/v20.11.0/bin/node`) to bypass Claude Desktop's PATH limitations. After a Node version upgrade via nvm, that binary is deleted — but Check 10 previously reported ✅ because it only verified the JSON entry existed. Check 10 now calls `existsSync()` on the command path when it is absolute. A stale path produces ❌ with: `command path no longer exists: /path/to/node — Re-run: iso27001-mcp init (Node version may have changed)`.

**Tilde expansion in interactive custom path entry.** Choosing option `[3] Custom path` in the init wizard and typing `~/my/isms` would previously resolve to `<cwd>/~/my/isms` — a literal `~` directory under the current working directory. `path.resolve()` does not expand tildes. Fixed with `custom.replace(/^~(?=[/\\]|$)/, homedir())` before the resolve call.

**Pre-emptive framing before the API key box.** `generateKey()` prints `"API Key generated (save now — NOT stored in plaintext):"` which is the correct message for the standalone `keygen` command, but alarming during `init` where the key is written to the Claude Desktop config automatically. Three info lines now appear before the key box: `"Generating admin API key..."`, `"The key will be written into your Claude Desktop config automatically."`, `"You do not need to copy or store it separately."`.

**nvm/PATH guidance on manual config blocks.** When the Claude Desktop config auto-write fails (malformed JSON) or the user skips it, the init wizard shows a JSON block with `"command": "iso27001-mcp"`. An nvm/Volta user who manually pastes this portable form will hit the exact PATH problem that init was designed to solve. A three-line note now appears above the block: `⚠ nvm / Volta users: replace "iso27001-mcp" with the absolute path — macOS/Linux: $(which iso27001-mcp) / Windows: where iso27001-mcp`.

**Success banner shows the exact JSON key path for MCP_API_KEY.** The previous wording `"Your API key is in your Claude Desktop config"` left users guessing where in the JSON to look. Changed to: `"Your API key is in your Claude Desktop config under mcpServers → iso27001-mcp → env → MCP_API_KEY."` Useful for anyone setting up Claude Code or a second client that needs the raw `iso27001_…` token.

**README troubleshooting note for Node version upgrades.** A callout added to the "Tools not appearing" section: if tools stop working after switching Node versions via nvm or Volta, re-run `iso27001-mcp init` to update the absolute node binary path in the Claude Desktop config. The wizard preserves the existing database and API keys.

---

## What's new in v0.8.7

### Tool parameter type coercion — all 63 tools

A comprehensive audit of field type compatibility between what Claude's MCP framework sends and what the Zod schemas accept found and fixed six categories of mismatch.

**Numeric coercion (`z.coerce.number()`)** — the MCP framework sometimes serialises integer parameters as JSON strings (e.g. `"4"` instead of `4`). All numeric fields now use `z.coerce.number()` which calls `Number(input)` before validation. Affects: `likelihood`, `impact`, `residual_likelihood`, `residual_impact`, `timeline_weeks`, `review_cycle_months`, `limit`, `offset`, and the search controls `limit`.

**Boolean coercion (`coerceBool` preprocess)** — `z.coerce.boolean()` cannot be used directly because `Boolean("false") === true`. A preprocess is applied to all boolean fields that converts `"true"`→`true` and `"false"`→`false` before Zod validates. `null` is converted to `undefined` so `.optional()` short-circuits cleanly instead of throwing.

**Boolean fields now visible to Claude** — `coerceBool` uses `z.preprocess()` which produces a `ZodEffects` node. The MCP SDK's JSON Schema generator does not know how to represent `ZodEffects` and was emitting empty `{}` schemas for all 10 boolean fields, meaning Claude had no type hint and would often omit them. The `extractShape()` function in `src/tools/index.ts` now recursively unwraps field-level `ZodEffects`, `ZodOptional`, and `ZodDefault` nodes before returning the shape to the SDK. Claude now sees `{type: "boolean"}` for all boolean fields. A companion `unwrapFieldSchema()` helper was added; runtime validation still uses the original full schema via `schema.safeParse()`.

**Title-case enum normalisation** — three enums use Title Case values that Claude may send in lowercase: `themeEnum` (`"Organizational"`, `"Technological"` etc.), `cybersecurityConceptEnum` (`"Identify"`, `"Protect"` etc.), and the `control_type` enum (`"Preventive"`, `"Detective"`, `"Corrective"`). A `normEnum()` helper applies a case-insensitive preprocess that resolves the canonical value regardless of case. The affected schema fields are `create_gap_assessment.themes_in_scope`, `list_controls.cybersecurity_concept`, and `list_controls.control_type`.

**`null` vs `undefined` for optional fields** — Zod `.optional()` only accepts `undefined`, not `null`. The `coerceBool` preprocess now converts `null → undefined` before reaching `.optional()`. For non-boolean optional fields, MCP's standard behaviour is to omit absent params (not send `null`), so no additional change is needed.

---

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

# iso27001-mcp

A stateful [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives Claude a complete ISO 27001:2022 Information Security Management System (ISMS). Ask Claude to run gap assessments, manage risks, generate policies, track evidence, and run audits — all backed by an encrypted SQLite database on your own machine.

```
Claude ──MCP──► iso27001-mcp ──► encrypted SQLite (isms.db)
                    │
                    ├── 93 ISO 27001:2022 controls (seeded)
                    ├── 114 ISO 27001:2013 controls (seeded)
                    ├── Gap assessments & remediation roadmaps
                    ├── Risk register & treatment plans
                    ├── Policy documents (Mustache templates)
                    ├── Statement of Applicability
                    ├── Audit findings & corrective actions
                    └── Evidence tracking (+ Jira / GitHub)
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Use Cases](#use-cases)
- [Installation](#installation)
- [Configuration](#configuration)
- [Connecting to Claude](#connecting-to-claude)
- [Tools Reference](#tools-reference)
- [Architecture](#architecture)
- [Modes](#modes)
- [Integrations](#integrations)
- [Development](#development)
- [Security](#security)

---

## Quick Start

Get the server connected to Claude Desktop in five minutes.

### Prerequisites

- **Node.js 20** (not 22 — test coverage runs on Node 20; the server itself is also tested on 20)

  ```bash
  node --version   # should print v20.x
  ```

  If you're on v22, switch via [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use 20`

### Step 1 — Build

```bash
cd /path/to/iso27001-mcp
npm install
npm run build
```

### Step 2 — Set up secrets

```bash
cp .env.example .env
```

Generate two 32-byte hex secrets and paste them into `.env`:

```bash
openssl rand -hex 32   # → HMAC_SECRET
openssl rand -hex 32   # → DB_ENCRYPTION_KEY
```

### Step 3 — Generate an API key

```bash
node dist/index.js keygen --label "Me" --role admin
```

The raw key (`iso27001_...`) is printed **once** — copy it immediately.

### Step 4 — Add to Claude Desktop

Open your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "iso27001": {
      "command": "node",
      "args": ["/absolute/path/to/iso27001-mcp/dist/index.js"],
      "env": {
        "HMAC_SECRET": "your_hmac_secret",
        "DB_ENCRYPTION_KEY": "your_db_encryption_key",
        "MCP_API_KEY": "iso27001_your_key_here",
        "DB_PATH": "/absolute/path/to/iso27001-mcp/isms.db"
      }
    }
  }
}
```

### Step 5 — Restart Claude Desktop and verify

Fully quit and reopen Claude Desktop. Then ask:

> *"Use get_server_info to check the server is running."*

You should get back version, uptime, and database stats confirming all 93 + 114 controls are seeded.

### First things to try

```
"Create a gap assessment for Acme Ltd covering all ISO 27001:2022 controls."
"Show me the gap summary for that assessment."
"Generate a remediation roadmap with a 26-week timeline."
"Create an information security policy for Acme Ltd. Owner: CISO. Effective from today."
```

---

## Use Cases

### 1 — Run a Gap Assessment

Ask Claude to assess your organisation against ISO 27001:2022, track the status of each control, and generate a prioritised remediation roadmap.

> *"Create a gap assessment for Acme Ltd covering all 2022 controls. Our scope is cloud infrastructure and development. Exclude physical security controls."*

Claude will create the assessment, pre-populate all 93 controls as `not_started`, and let you work through them one by one or in bulk. When you're done:

> *"Generate a remediation roadmap grouped by risk level. Give us 26 weeks to get to certification."*

The roadmap groups work by theme (Technological first), links controls to open risks, and assigns recommended due dates.

---

### 2 — Manage the Risk Register

Track information security risks end-to-end from identification through treatment.

> *"Register a new risk: our customer database is at risk from SQL injection due to unparameterised queries. Likelihood 4, impact 5."*

> *"Create a treatment plan to mitigate this risk. Link it to controls 8.26 and 8.28. Owner: head of engineering. Due: end of Q3."*

> *"Show me all critical and high risks that still have open treatment plans."*

Risk scores are computed automatically (likelihood × impact) and reflected in summaries and heatmaps without any manual input.

---

### 3 — Generate ISMS Policies

Generate a full suite of ISO 27001-aligned policy documents in seconds.

> *"Generate an information security policy for Acme Ltd. Scope: all cloud-hosted systems and remote employees. Owner: CISO. Effective from 1 June 2026."*

Policies are rendered from Mustache templates with automatic ISO clause and control mappings. Twelve policy types are included out of the box:

`information_security` · `access_control` · `risk_management` · `asset_management` · `incident_response` · `business_continuity` · `supplier_security` · `cryptography` · `physical_security` · `acceptable_use` · `data_classification` · `secure_development`

---

### 4 — Produce a Statement of Applicability

Generate an SoA directly from your gap assessment, pre-populated with inclusion/exclusion decisions and justifications.

> *"Generate a Statement of Applicability from assessment A-001. Export it as a CSV for the auditors."*

---

### 5 — Run Internal Audits

Plan audits, record findings (NCs, observations, OFIs), raise corrective action requests, and track effectiveness.

> *"Create an audit of our access control and cryptography controls. Auditor: Jane Smith. Planned for 15 June 2026."*

> *"Record a major non-conformity against clause 9.1: no evidence of ongoing monitoring of security objectives."*

> *"Raise a CAR for this finding. Owner: compliance manager. Due in 30 days."*

The server enforces ISO 27001:2022 Clause 10.1 — a corrective action cannot be closed unless `effectiveness_verified` is `true`.

---

### 6 — Track Evidence

Register evidence artefacts for each control, spot gaps, and link them directly to Jira tickets or GitHub issues.

> *"Show me all controls marked as implemented or partial that have no current evidence."*

> *"Register a screenshot of our firewall config as evidence for control 8.20. Collector: ops team. Expires in 12 months."*

> *"Link this evidence to a new Jira ticket in the SEC project: 'Firewall config screenshot — annual review'."*

---

### 7 — Query the Audit Log

Every tool call is logged in a tamper-evident audit trail. Admins can query it at any time.

> *"Show me all tool calls made in the last 7 days that resulted in an error."*

> *"List all API keys and when they were last used."*

---

## Installation

### Prerequisites

- **Node.js** ≥ 20.11.0 (use [Volta](https://volta.sh) or [nvm](https://github.com/nvm-sh/nvm))
- **npm** ≥ 10

### Step 1 — Install

```bash
npm install -g iso27001-mcp
```

Or run from source:

```bash
git clone https://github.com/your-org/iso27001-mcp
cd iso27001-mcp
npm install
npm run build
```

### Step 2 — Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the two required secrets:

```bash
# Generate a 32-byte HMAC signing secret
openssl rand -hex 32   # → paste into HMAC_SECRET

# Generate a 32-byte AES-256 database encryption key
openssl rand -hex 32   # → paste into DB_ENCRYPTION_KEY
```

Full variable reference:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HMAC_SECRET` | ✅ | — | 32-byte hex secret for HMAC-signing API keys |
| `DB_ENCRYPTION_KEY` | ✅ | — | 32-byte hex key for AES-256 SQLite encryption |
| `DB_PATH` | | `./isms.db` | Path to the encrypted database file |
| `AUDIT_LOG_PATH` | | `./audit.log` | Path for the append-only JSON-L audit log |
| `RATE_LIMIT_RPM` | | `500` | Tool calls per minute per API key |
| `SESSION_TTL_HOURS` | | `4` | SSE session TTL (hosted/team modes) |
| `SSE_PORT` | | `3000` | Port for the SSE server (hosted/team modes) |
| `BEHIND_TLS_PROXY` | | `false` | Set `true` when behind nginx/Caddy in production |
| `JIRA_BASE_URL` | | — | e.g. `https://your-org.atlassian.net` |
| `JIRA_API_TOKEN` | | — | Jira API token for the integration |
| `JIRA_PROJECT_KEY` | | — | e.g. `SEC` |
| `JIRA_USER_EMAIL` | | — | Email address associated with the Jira API token |
| `GITHUB_TOKEN` | | — | GitHub personal access token (scope: `issues:write`) |
| `GITHUB_REPO` | | — | e.g. `your-org/your-repo` |

### Step 3 — Generate an API Key

The server requires an API key on every tool call. Generate one for yourself:

```bash
# Viewer — read-only access to 22 tools
iso27001-mcp keygen --label "Alice" --role viewer

# Analyst — read + write for gap/risk/policy/evidence tools (35 tools)
iso27001-mcp keygen --label "Bob" --role analyst --expires 90d

# Admin — all 43 tools including audit log and key management
iso27001-mcp keygen --label "CISO" --role admin --expires 1y
```

The raw key is printed **once** and never stored in plaintext. Save it immediately.

```bash
# List all keys
iso27001-mcp keys list

# Revoke a key immediately
iso27001-mcp keys revoke --label "Alice"
```

---

## Connecting to Claude

### Claude Desktop

Add the server to your Claude Desktop MCP configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "iso27001": {
      "command": "iso27001-mcp",
      "args": ["--mode", "local", "--db", "/path/to/your/isms.db"],
      "env": {
        "HMAC_SECRET": "your_hmac_secret",
        "DB_ENCRYPTION_KEY": "your_db_encryption_key",
        "MCP_API_KEY": "iso27001_your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The ISO 27001 tools will appear in the tools panel.

### Claude Code

```bash
# Add to your project
claude mcp add iso27001 iso27001-mcp -- --mode local --db ./isms.db
```

Or set the env vars and start manually:

```bash
export HMAC_SECRET=... DB_ENCRYPTION_KEY=... MCP_API_KEY=iso27001_...
iso27001-mcp --mode local
```

---

## Tools Reference

The server exposes **43 tools** across 9 groups. All tools require a valid API key. Role requirements are noted per group.

### Group 1 — Control Registry *(viewer+, read-only)*

| Tool | Description |
|------|-------------|
| `get_control` | Fetch a single control by ID and version (2022 or 2013) |
| `list_controls` | List controls with filters: version, theme, control_type, new_in_2022 |
| `search_controls` | Full-text search across names, descriptions, and guidance (FTS5) |
| `get_control_attributes` | Retrieve 2022 attribute taxonomy (cybersecurity concepts, operational capabilities) |
| `compare_versions` | Show the mapping between a 2013 control and its 2022 equivalent |
| `get_clause_requirement` | Fetch a clause requirement (4–10) with optional sub-clauses |
| `list_clause_requirements` | List all clause requirements, optionally filtered by parent |

### Group 2 — Gap Analysis *(reads: viewer+, writes: analyst+)*

| Tool | Description |
|------|-------------|
| `create_gap_assessment` | Create an assessment; pre-populates all in-scope controls as `not_started` |
| `update_control_status` | Set a control's status (`implemented`, `partial`, `not_implemented`, `na`, `not_started`) |
| `get_gap_summary` | Compliance %, counts by status, top-10 remediation priority list |
| `list_gap_assessments` | List assessments filtered by active / archived / all |
| `export_gap_report` | Export in markdown, CSV, or JSON |
| `generate_remediation_roadmap` | Prioritised roadmap with phases, risk linkage, and due dates |
| `archive_gap_assessment` | Archive a completed assessment |

### Group 3 — Risk Management *(reads: viewer+, writes: analyst+)*

| Tool | Description |
|------|-------------|
| `create_risk` | Register a risk (asset, threat, vulnerability, likelihood 1–5, impact 1–5) |
| `get_risk` | Fetch a risk with optional treatment plans |
| `update_risk` | Update any mutable field; `risk_score` recomputes automatically |
| `list_risks` | List with filters: risk_level, status, owner |
| `get_risk_summary` | Aggregates: counts by level, 5×5 heatmap matrix, top 10 by score |
| `create_treatment_plan` | Create a treatment (mitigate/accept/avoid/transfer) with residual scores |
| `update_treatment_status` | Update status and link evidence |
| `generate_risk_register` | Export in markdown, CSV, or JSON |

### Group 4 — Policy Management *(reads: viewer+, create: analyst+, update: admin)*

| Tool | Description |
|------|-------------|
| `create_policy` | Render a policy from a Mustache template with org-specific variables |
| `get_policy` | Fetch policy content with optional version history |
| `update_policy` | Archive current version and create a new one (admin only) |
| `list_policies` | List with filters including `overdue_only` for upcoming reviews |

### Group 5 — Statement of Applicability *(analyst+)*

| Tool | Description |
|------|-------------|
| `generate_soa` | Create an SoA from an assessment, pre-populating all 93/114 entries |
| `update_soa_entry` | Update inclusion, justification, status, and responsible party |
| `export_soa` | Export in markdown or CSV |

### Group 6 — Audit Management *(reads: viewer+, writes: admin)*

| Tool | Description |
|------|-------------|
| `create_audit` | Create an internal audit with auditor, planned date, and scope |
| `record_finding` | Record a finding: NC (requires severity), observation, or OFI |
| `create_corrective_action` | Raise a CAR linked to a finding |
| `update_corrective_action` | Update status and evidence; closing requires `effectiveness_verified: true` |
| `generate_audit_report` | Export full report (executive summary, findings, CARs) in markdown or JSON |

### Group 7 — Evidence Tracking *(reads: viewer+, writes: analyst+)*

| Tool | Description |
|------|-------------|
| `register_evidence` | Register an artefact (policy, log, screenshot, etc.) for a control |
| `list_evidence` | List evidence for a control, filtered by status: `current`, `stale`, `expired` |
| `get_evidence_gaps` | Find implemented/partial controls with no current evidence |
| `link_jira_ticket` | Link evidence to an existing Jira issue or create a new one |
| `link_github_issue` | Link evidence to an existing GitHub issue or create a new one |

### Group 8 — Server Info *(viewer+)*

| Tool | Description |
|------|-------------|
| `get_server_info` | Version, uptime, DB stats, control counts, rate limit config |

### Group 9 — Admin & Key Management *(admin only)*

| Tool | Description |
|------|-------------|
| `query_audit_log` | Query the tamper-evident audit log with date/tool/outcome filters |
| `list_api_keys` | List all keys with metadata (never returns hashes) |
| `revoke_api_key` | Immediately revoke a key by label |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude (LLM)                        │
└──────────────────────────┬──────────────────────────────┘
                           │  MCP (stdio or SSE)
┌──────────────────────────▼──────────────────────────────┐
│                   iso27001-mcp server                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │             9-Step Security Pipeline            │    │
│  │                                                 │    │
│  │  1. Extract API key (meta or MCP_API_KEY env)   │    │
│  │  2. validateKey()    HMAC-SHA256, timing-safe   │    │
│  │  3. checkRateLimit() sliding 60s window (RPM)   │    │
│  │  4. loadRole()       viewer | analyst | admin   │    │
│  │  5. assertPermission() RBAC check               │    │
│  │  6. sanitiseParams() strip injection patterns   │    │
│  │  7. Domain handler   business logic             │    │
│  │  8. writeAuditEvent() tamper-evident row_hash   │    │
│  │  9. Return result or structured McpError        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Controls   │  │  Risks   │  │      Policies      │  │
│  │  Gap Assess │  │ Register │  │  (Mustache tmpl)   │  │
│  │  SoA        │  │ Treatmts │  │  Version history   │  │
│  └─────────────┘  └──────────┘  └────────────────────┘  │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │   Audits    │  │ Evidence │  │    Audit Log       │  │
│  │  Findings   │  │  Jira/GH │  │  (tamper-evident)  │  │
│  │  CARs       │  │  Gaps    │  │                    │  │
│  └─────────────┘  └──────────┘  └────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │    AES-256 encrypted SQLite  (isms.db)          │    │
│  │    better-sqlite3-multiple-ciphers              │    │
│  │    WAL mode · foreign keys · FTS5 index         │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Database

All data is stored in a single encrypted SQLite file (`isms.db`) using AES-256 via `better-sqlite3-multiple-ciphers`. The schema is managed by two SQL migrations applied automatically on first startup:

- `0001_initial.sql` — 17 tables covering every ISMS domain (controls, gap assessments, risks, policies, audits, evidence, API keys, audit log, and more)
- `0002_fts_index.sql` — FTS5 full-text search index on controls, plus 12 performance indexes

### Seed Data

On first startup, `seedAll()` inserts all ISO 27001 reference data and verifies SHA-256 checksums before inserting:

- **93** ISO 27001:2022 Annex A controls across 4 themes (Organizational, People, Physical, Technological)
- **114** ISO 27001:2013 controls across 14 Annex A domains
- **125** version mappings (2013 ↔ 2022), including direct, merged, split, and new_2022 relationships
- **41** clause requirements for clauses 4–10 with sub-clauses, requirement text, and implementation notes

### Security Pipeline

Every tool call passes through the same 9-step pipeline before any business logic runs. Audit events are always written — including on authentication failure and RBAC denial — so the log is a complete record of all attempts, not just successful ones.

### Business Rules Enforced

The server encodes ISO 27001 requirements as hard constraints, not just guidance:

| Rule | Tool | Behaviour |
|------|------|-----------|
| `implemented` without evidence → silently downgraded | `update_control_status` | Status becomes `partial`; response includes `warning` field |
| `na` status requires justification | `update_control_status` | `BUSINESS_RULE` error if `na_justification` absent |
| Cannot update an archived assessment | `update_control_status` | `BUSINESS_RULE` error |
| `mitigate` treatment requires control references | `create_treatment_plan` | `BUSINESS_RULE` error if `controls[]` is empty |
| CAR closure requires effectiveness verified | `update_corrective_action` | Enforces Clause 10.1; `BUSINESS_RULE` error otherwise |
| NC findings require severity | `record_finding` | `BUSINESS_RULE` error if `severity` absent for `type=nc` |

### RBAC

Three roles with strict hierarchy. A key can only call tools at or below its assigned role level.

| Role | Tools available | Typical user |
|------|----------------|--------------|
| `viewer` | 22 (all read-only tools) | Auditor, stakeholder |
| `analyst` | 35 (reads + gap/risk/policy/evidence writes) | ISMS practitioner, consultant |
| `admin` | 43 (all tools, including audit log and key management) | CISO, ISMS owner |

---

## Modes

The server supports four operating modes selected with the `--mode` flag:

| Mode | Transport | Typical use |
|------|-----------|-------------|
| `local` *(default)* | stdio | Claude Desktop, single user |
| `ci` | stdio | Automated pipelines, no TTY |
| `team` | SSE over HTTP | Shared instance, multiple users |
| `hosted` | SSE over HTTP | Production, behind a TLS proxy |

### Local / CI (stdio)

```bash
iso27001-mcp --mode local --db ./isms.db
```

Claude Desktop manages the process. The server reads from stdin and writes to stdout.

### Team / Hosted (SSE)

```bash
iso27001-mcp --mode hosted --db /data/isms.db
```

Starts an Express HTTP server on `SSE_PORT` (default `3000`):

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check — no auth required |
| `GET /sse` | Open SSE connection; first event contains `{ type: "session", sessionId }` |
| `POST /messages?sessionId=X` | Send an MCP message on an active session |

Sessions expire after `SESSION_TTL_HOURS` hours of inactivity. In `NODE_ENV=production`, CORS is restricted to `https://claude.ai` and `/messages` is rate-limited to 100 requests per minute per IP.

---

## Integrations

### Jira

```bash
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_API_TOKEN=your_api_token
JIRA_PROJECT_KEY=SEC
JIRA_USER_EMAIL=you@your-org.com
```

Use `link_jira_ticket` to create a Task in your Jira project or link an existing one. The Jira key and browse URL are stored on the evidence record. Requests time out after 10 seconds and retry once on 5xx responses. A clear `INTEGRATION_ERROR` is returned — with the exact missing variable names — if credentials are not configured.

### GitHub

```bash
GITHUB_TOKEN=ghp_your_token   # requires issues:write, metadata:read
GITHUB_REPO=your-org/your-repo
```

Use `link_github_issue` to create an issue with `compliance` and `iso27001` labels or link an existing one by number. The issue URL and number are stored on the evidence record.

---

## Development

```bash
# Install dependencies
npm install

# Typecheck (strict — zero errors tolerated)
npm run typecheck

# Build dist/
npm run build

# Run all tests (183 unit + integration tests)
npm test

# Watch mode
npm run test:watch

# Lint
npm run lint

# Verify seed data SHA-256 checksums
npm run verify-checksums

# Run from source without building
npm run dev
```

### Project Structure

```
src/
├── index.ts                  CLI entry (keygen, keys, server startup)
├── server.ts                 McpServer factory
├── auth/
│   ├── api-key.ts            Key generation, HMAC validation, expiry, revocation
│   └── rbac.ts               Permission matrix (43 tools × 3 roles)
├── security/
│   ├── sanitise.ts           Prompt-injection stripping for free-text fields
│   ├── rate-limiter.ts       Sliding-window RPM counter per key hash
│   ├── secrets.ts            Env var validation (fail-fast on startup)
│   └── validate.ts           Zod schemas for all 43 tool inputs
├── audit/
│   └── logger.ts             Tamper-evident audit event writer
├── db/
│   ├── connection.ts         Encrypted SQLite open/close/migrate
│   ├── dal.ts                Shared helpers: newId, now, toJson, computeEvidenceStatus
│   └── migrations/           0001_initial.sql, 0002_fts_index.sql
├── seed/
│   ├── seeder.ts             Idempotent seed runner with checksum verification
│   ├── controls-2022.json    93 ISO 27001:2022 Annex A controls
│   ├── controls-2013.json    114 ISO 27001:2013 controls
│   ├── version-mapping.json  125 cross-version mappings
│   ├── clause-requirements.json  41 clause requirements (clauses 4–10)
│   └── policy-templates/     12 Mustache .md policy templates
├── tools/
│   ├── index.ts              Tool registry and security pipeline
│   ├── controls.ts           Group 1: Control Registry (7 tools)
│   ├── gap-analysis.ts       Group 2: Gap Analysis (7 tools)
│   ├── risks.ts              Group 3: Risk Management (8 tools)
│   ├── policies.ts           Group 4: Policy Management (4 tools)
│   ├── soa.ts                Group 5: Statement of Applicability (3 tools)
│   ├── audit-management.ts   Group 6: Audit Management (5 tools)
│   ├── evidence-tracking.ts  Group 7: Evidence Tracking (5 tools)
│   └── server-info.ts        Group 8: Server Info (1 tool)
└── transport/
    └── sse.ts                Express SSE server for team/hosted modes

tests/
├── fixtures/
│   ├── mock-db.ts            In-memory mock DB for unit tests
│   └── test-db.ts            Real encrypted DB fixture (macOS only)
├── unit/
│   ├── auth/                 api-key, rbac
│   ├── security/             sanitise, rate-limiter
│   ├── audit/                logger
│   └── tools/                One file per handler module
└── integration/
    ├── mcp-protocol.test.ts  Schema and registration validation
    ├── db-operations.test.ts Migrations, seed counts, FTS5 (macOS only)
    └── business-rules.test.ts All 6 enforced business rules end-to-end
```

---

## Security

### API Key Storage

API keys are never stored in plaintext. Only an HMAC-SHA256 hash is persisted in the database. The raw `iso27001_...` key is printed once to stdout at generation time — there is no way to retrieve it afterwards.

### Database Encryption

The SQLite database (`isms.db`) is encrypted at rest using AES-256 via `better-sqlite3-multiple-ciphers`. The `DB_ENCRYPTION_KEY` is required at every startup and is never written to disk by the server.

### Tamper-Evident Audit Trail

Every tool call writes a row to `audit_log` with a `row_hash` computed as:

```
SHA-256(timestamp | tool | key_hash | outcome)
```

Any modification to an audit row after insertion will cause `verifyRowHash()` to fail. The same events are also appended in JSON-L format to `AUDIT_LOG_PATH` for off-database retention and SIEM ingestion.

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `BEHIND_TLS_PROXY=true` (the server logs a loud warning if this is absent in production)
- [ ] Terminate TLS upstream (nginx, Caddy, AWS ALB, etc.)
- [ ] Use `--expires` on all API keys — especially admin keys
- [ ] Set `RATE_LIMIT_RPM` appropriate to your team size
- [ ] Store `DB_ENCRYPTION_KEY` and `HMAC_SECRET` in a secrets manager, not in `.env`
- [ ] Back up `isms.db` regularly — it is the single source of truth for your entire ISMS

---

## License

MIT © 2026

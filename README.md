# iso27001-mcp

[![Socket Badge](https://badge.socket.dev/npm/package/iso27001-mcp/0.8.2)](https://socket.dev/npm/package/iso27001-mcp/overview/0.8.2)
[![npm version](https://img.shields.io/npm/v/iso27001-mcp.svg)](https://npmjs.com/package/iso27001-mcp)
[![npm downloads](https://img.shields.io/npm/dt/iso27001-mcp.svg)](https://npmjs.com/package/iso27001-mcp)
[![Live Demo](https://img.shields.io/badge/demo-live-blue)](https://sushegaad.github.io/MCP-Server-for-ISO27001/)

**[▶ Live Interactive Demo](https://sushegaad.github.io/MCP-Server-for-ISO27001/)**

A stateful [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives Claude a complete ISO 27001:2022 Information Security Management System (ISMS). Ask Claude to run gap assessments, manage risks, generate policies, track evidence, and run audits — all backed by an encrypted SQLite database on your own machine.

```
Claude ──MCP──► iso27001-mcp ──► encrypted SQLite (isms.db)
                    │
                    ├── 93 ISO 27001:2022 controls (seeded)
                    ├── 114 ISO 27001:2013 controls (seeded)
                    ├── Gap assessments & remediation roadmaps
                    ├── Risk register & treatment plans
                    ├── Policy & procedure documents (Mustache templates)
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
  - [Group 1 — Control Registry](#group-1--control-registry-minimum-role-viewer)
  - [Group 2 — Gap Analysis](#group-2--gap-analysis-reads-viewer-writes-analyst)
  - [Group 3 — Risk Management](#group-3--risk-management-reads-viewer-writes-analyst)
  - [Group 4 — Policy Management](#group-4--policy-management-reads-viewer-create-analyst-update-admin)
  - [Group 5 — Statement of Applicability](#group-5--statement-of-applicability-minimum-role-analyst)
  - [Group 6 — Audit Management](#group-6--audit-management-reads-viewer-writes-admin)
  - [Group 7 — Evidence Tracking](#group-7--evidence-tracking-reads-viewer-writes-analyst)
  - [Group 8 — Server Info](#group-8--server-info-minimum-role-viewer)
  - [Group 9 — Admin & Key Management](#group-9--admin--key-management-minimum-role-admin)
  - [Group 10 — Organisation Profile](#group-10--organisation-profile-minimum-role-admin-for-writes-viewer-for-reads)
  - [Group 11 — Procedure Management](#group-11--procedure-management-reads-viewer-createexport-analyst-update-admin)
  - [Group 12 — Management Review](#group-12--management-review-reads-viewer-writes-admin--clause-93)
  - [Group 13 — Improvement Plan](#group-13--improvement-plan-reads-viewer-writes-analyst--clause-101)
  - [Group 14 — Evidence Templates](#group-14--evidence-templates-reads-viewer-generate-analyst)
- [MCP Resources](#mcp-resources)
- [Architecture](#architecture)
- [Modes](#modes)
- [Integrations](#integrations)
- [Sample Outputs](#sample-outputs)
- [Development](#development)
- [Security](#security)
  - [Trust Center](https://github.com/Sushegaad/MCP-Server-for-ISO27001/tree/main/docs/security/) — threat model · hardening guide · data flow · supply chain · audit log integrity

---

## Quick Start

Get the server connected to Claude Desktop in five steps.

### Prerequisites

- **Node.js 20.11.0 or later** — download from [nodejs.org](https://nodejs.org) or use [nvm](https://github.com/nvm-sh/nvm) / [Volta](https://volta.sh)

  ```bash
  node --version   # should print v20.x.x or higher
  ```

- **Build tools** — required by the encrypted SQLite native module:
  - **macOS:** `xcode-select --install`
  - **Ubuntu/Debian:** `sudo apt-get install build-essential python3`
  - **Windows:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) → "Build Tools for Visual Studio" → check "Desktop development with C++"

### Step 1 — Install

```bash
npm install -g iso27001-mcp
```

This installs the `iso27001-mcp` command globally. The encrypted SQLite module downloads a prebuilt binary on macOS and Linux x64 automatically; it compiles from source on other platforms.

### Step 2 — Generate your secrets

Two secrets are required: one encrypts your database, the other signs API keys. Generate them with `openssl`:

```bash
openssl rand -hex 32   # → save this as your DB_ENCRYPTION_KEY
openssl rand -hex 32   # → save this as your HMAC_SECRET
```

Keep these values — you'll need them in Steps 3 and 4.

### Step 3 — Generate an API key

The server uses API keys to authenticate and authorise every tool call. Set your secrets as environment variables first, then run the keygen command:

```bash
export HMAC_SECRET=<your_hmac_secret>
export DB_ENCRYPTION_KEY=<your_db_key>
export DB_PATH=$HOME/.iso27001/isms.db

iso27001-mcp keygen --label "Me" --role admin
```

The raw key (`iso27001_...`) is printed **once** and never stored in plaintext. Copy it immediately.

> Three roles are available: `viewer` (31 read-only tools), `analyst` (49 tools), `admin` (all 63 tools). Use `admin` for your personal key.

### Step 4 — Add to Claude Desktop

Open your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the following block, substituting your values from Steps 2 and 3:

```json
{
  "mcpServers": {
    "iso27001": {
      "command": "iso27001-mcp",
      "env": {
        "HMAC_SECRET": "your_hmac_secret",
        "DB_ENCRYPTION_KEY": "your_db_encryption_key",
        "MCP_API_KEY": "iso27001_your_api_key_here",
        "DB_PATH": "/Users/you/.iso27001/isms.db"
      }
    }
  }
}
```

> **Tip:** Store `isms.db` in a stable location like `~/.iso27001/isms.db` so it persists across package upgrades.

### Step 5 — Restart Claude Desktop and verify

Fully quit and reopen Claude Desktop. You should see 63 tools in the MCP tools panel (hammer icon). Then ask Claude:

> *"Use get_server_info to check the server is running."*

Claude will call `get_server_info` and return the version, uptime, and database stats — confirming all 93 ISO 27001:2022 and 114 ISO 27001:2013 controls are seeded and ready.

### First things to try

```
"Create a gap assessment for Acme Ltd covering all ISO 27001:2022 controls."
"Show me the gap summary and generate a remediation roadmap with a 26-week timeline."
"Register a new risk: our customer database is exposed to SQL injection — likelihood 4, impact 5."
"Set our organisation profile: Acme Ltd, scope: all cloud-hosted systems and remote employees."
"Generate an Access Control Policy for Acme Ltd. Owner: CISO. Effective from 1 July 2026."
"Create an Incident Handling Procedure linked to our Information Security Policy."
"Create an internal audit for Q3 covering clause 9.1 — Performance Evaluation."
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

### 3 — Generate ISMS Policies and Procedures

Generate a full suite of ISO 27001-aligned policy and procedure documents in seconds.

> *"Set our organisation profile: Acme Ltd. ISMS scope: all cloud-hosted systems and remote employees."*

> *"Generate an information security policy. Owner: CISO. Effective from 1 June 2026."*

> *"Create an Incident Handling Procedure linked to our Information Security Policy."*

Policies and procedures are rendered from Mustache templates with automatic ISO clause and control mappings. Once the organisation profile is set, `organisation_name` and `scope` are injected automatically — no need to repeat them on every call.

**12 policy types:**
`information_security` · `access_control` · `risk_management` · `asset_management` · `incident_response` · `business_continuity` · `supplier_security` · `cryptography` · `physical_security` · `acceptable_use` · `data_classification` · `secure_development`

**12 procedure types:**
`incident_handling` · `access_provisioning` · `asset_onboarding_offboarding` · `audit_log_review` · `backup_restore` · `bcp_testing` · `change_management` · `cryptographic_key_management` · `data_classification_handling` · `secure_development_workflow` · `supplier_onboarding` · `vulnerability_management`

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

- **Node.js ≥ 20.11.0** — use [nvm](https://github.com/nvm-sh/nvm) or [Volta](https://volta.sh)
- **npm ≥ 10**
- **Build tools** for the native SQLite module:
  - macOS: `xcode-select --install`
  - Ubuntu/Debian: `sudo apt-get install build-essential python3`
  - Windows: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) → "Build Tools for Visual Studio" → check "Desktop development with C++"

### Step 1 — Install

```bash
npm install -g iso27001-mcp
```

The `iso27001-mcp` command is now available globally. The encrypted SQLite module (`better-sqlite3-multiple-ciphers`) downloads a prebuilt binary on supported platforms; it compiles from source if none is available.

**Run from source** (for development or to get the latest unreleased changes):

```bash
git clone https://github.com/Sushegaad/MCP-Server-for-ISO27001
cd iso27001-mcp
npm install
npm run build
# Use `node dist/index.js` instead of `iso27001-mcp` in all commands below
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
| `AUDIT_LOG_PATH` | | `./audit.jsonl` | Path for the append-only JSON-L audit log (`.jsonl` or `.log` only) |
| `RATE_LIMIT_RPM` | | `500` | Tool calls per minute per API key |
| `SESSION_TTL_HOURS` | | `4` | SSE session TTL (hosted/team modes) |
| `SSE_PORT` | | `3000` | Port for the SSE server (hosted/team modes) |
| `BEHIND_TLS_PROXY` | | `false` | Set `true` when behind nginx/Caddy in production |
| `CORS_ORIGIN` | | `http://localhost` (dev) / `https://claude.ai` (prod) | Allowed CORS origin for the SSE server — never set to `*` |
| `JIRA_BASE_URL` | | — | e.g. `https://your-org.atlassian.net` |
| `JIRA_API_TOKEN` | | — | Jira API token for the integration |
| `JIRA_PROJECT_KEY` | | — | e.g. `SEC` |
| `JIRA_USER_EMAIL` | | — | Email address associated with the Jira API token |
| `GITHUB_TOKEN` | | — | GitHub personal access token (scope: `issues:write`) |
| `GITHUB_REPO` | | — | e.g. `your-org/your-repo` |

### Step 3 — Generate an API Key

The server requires an API key on every tool call. Generate one for yourself:

```bash
# Viewer — read-only access to 25 tools
iso27001-mcp keygen --label "Alice" --role viewer

# Analyst — read + write for gap/risk/policy/procedure/evidence tools (49 tools)
iso27001-mcp keygen --label "Bob" --role analyst --expires 90d

# Admin — all 63 tools including audit log and key management
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
      "env": {
        "HMAC_SECRET": "your_hmac_secret",
        "DB_ENCRYPTION_KEY": "your_db_encryption_key",
        "MCP_API_KEY": "iso27001_your_api_key_here",
        "DB_PATH": "/Users/you/.iso27001/isms.db"
      }
    }
  }
}
```

Restart Claude Desktop. The ISO 27001 tools will appear in the tools panel.

> **Tip:** Store your `isms.db` in a stable location like `~/.iso27001/isms.db` so it persists across upgrades.

### Claude Code

```bash
# Add to your project's MCP config
claude mcp add iso27001 iso27001-mcp
```

Then set the required env vars in your shell or `.env`:

```bash
export HMAC_SECRET=your_hmac_secret
export DB_ENCRYPTION_KEY=your_db_encryption_key
export MCP_API_KEY=iso27001_your_key_here
export DB_PATH=$HOME/.iso27001/isms.db
```

---

## Tools Reference

The server exposes **63 tools** across 14 groups. All tools require a valid API key. The minimum role required is noted per group; `✅` marks required parameters, `—` marks optional ones.

---

### Group 1 — Control Registry *(minimum role: viewer)*

#### `get_control`
Fetch a single control by ID and version.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `control_id` | ✅ | string | e.g. `5.1`, `A.8.1` |
| `version` | — | enum | `2022` \| `2013` |

#### `list_controls`
List controls with optional filters.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `version` | — | enum | `2022` \| `2013` |
| `theme` | — | string | e.g. `Technological` |
| `control_type` | — | enum | `Preventive` \| `Detective` \| `Corrective` |
| `new_in_2022` | — | boolean | Filter to controls added in the 2022 revision |
| `cybersecurity_concept` | — | enum | `Identify` \| `Protect` \| `Detect` \| `Respond` \| `Recover` |
| `include_guidance` | — | boolean | Default: `false` |
| `limit` | — | integer | Default: `50`, max `100` |
| `offset` | — | integer | Default: `0` |

#### `search_controls`
Full-text search across control names, descriptions, and guidance (FTS5).

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `query` | ✅ | string | Search terms |
| `version` | — | enum | `2022` \| `2013` |
| `limit` | — | integer | Default: `10`, max `50` |
| `offset` | — | integer | Default: `0` |

#### `get_control_attributes`
Retrieve 2022 attribute taxonomy (cybersecurity concepts, operational capabilities) for a control.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `control_id` | ✅ | string | 2022 control ID |

#### `compare_versions`
Show the mapping between a 2013 control and its 2022 equivalent. Provide at least one ID.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `v2013_id` | — | string | ISO 27001:2013 control ID |
| `v2022_id` | — | string | ISO 27001:2022 control ID |

#### `get_clause_requirement`
Fetch a clause requirement (clauses 4–10) with optional sub-clauses.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `clause_id` | ✅ | string | e.g. `4.1`, `9.2` |
| `include_sub_clauses` | — | boolean | Default: `false` |

#### `list_clause_requirements`
List all clause requirements, optionally filtered by parent.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `parent_id` | — | string | e.g. `9` to list all sub-clauses of clause 9 |

---

### Group 2 — Gap Analysis *(reads: viewer+, writes: analyst+)*

#### `create_gap_assessment`
Create a new gap assessment. Pre-populates all in-scope controls as `not_started`.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `name` | ✅ | string | Assessment name |
| `scope` | — | string | ISMS scope description |
| `isms_version` | — | enum | `2022` \| `2013` — default: `2022` |
| `themes_in_scope` | — | array | e.g. `["Organizational","Technological"]` |
| `exclude_controls` | — | array | Control IDs to exclude |
| `exclude_justification` | — | string | Reason for exclusions |

#### `update_control_status`
Set a control's implementation status within an assessment.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `assessment_id` | ✅ | string (UUID) | |
| `control_id` | ✅ | string | |
| `status` | ✅ | enum | `implemented` \| `partial` \| `not_implemented` \| `na` \| `not_started` |
| `evidence_refs` | — | array | Evidence UUIDs |
| `notes` | — | string | Implementation notes |
| `na_justification` | — | string | Required when `status=na` |
| `assessed_by` | — | string | Assessor name |

#### `get_gap_summary`
Return compliance %, counts by status, and a top-10 remediation priority list.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `assessment_id` | ✅ | string (UUID) | |
| `breakdown_by` | — | enum | `theme` \| `control_type` \| `cybersecurity_concept` |

#### `list_gap_assessments`
List assessments with a status filter.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `filter` | — | enum | `active` \| `archived` \| `all` — default: `active` |

#### `export_gap_report`
Export a full gap report.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `assessment_id` | ✅ | string (UUID) | |
| `format` | ✅ | enum | `markdown` \| `csv` \| `json` |

#### `generate_remediation_roadmap`
Generate a prioritised remediation roadmap with phases, risk linkage, and due dates.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `assessment_id` | ✅ | string (UUID) | |
| `timeline_weeks` | — | integer | 1–52, default: `12` |

#### `archive_gap_assessment`
Archive a completed assessment.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `assessment_id` | ✅ | string (UUID) | |
| `reason` | — | string | Archival reason |

---

### Group 3 — Risk Management *(reads: viewer+, writes: analyst+)*

#### `create_risk`
Register a new risk. `risk_score` is computed automatically as `likelihood × impact`.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `asset` | ✅ | string | Asset at risk |
| `threat` | ✅ | string | Threat description |
| `vulnerability` | ✅ | string | Vulnerability description |
| `likelihood` | ✅ | integer | 1–5 |
| `impact` | ✅ | integer | 1–5 |
| `owner` | — | string | Risk owner |
| `related_controls` | — | array | Control IDs |
| `status` | — | enum | `open` \| `accepted` \| `mitigated` \| `transferred` \| `closed` — default: `open` |

#### `get_risk`
Fetch a risk record with optional treatment plans.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `risk_id` | ✅ | string (UUID) | |
| `include_treatments` | — | boolean | Default: `false` |

#### `update_risk`
Update any mutable field; `risk_score` recomputes automatically.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `risk_id` | ✅ | string (UUID) | |
| `asset` | — | string | |
| `threat` | — | string | |
| `vulnerability` | — | string | |
| `likelihood` | — | integer | 1–5 |
| `impact` | — | integer | 1–5 |
| `owner` | — | string | |
| `status` | — | enum | `open` \| `accepted` \| `mitigated` \| `transferred` \| `closed` |
| `related_controls` | — | array | Control IDs |

#### `list_risks`
List risks with optional filters.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `risk_level` | — | enum | `Low` \| `Medium` \| `High` \| `Critical` |
| `status` | — | enum | `open` \| `accepted` \| `mitigated` \| `transferred` \| `closed` |
| `owner` | — | string | |
| `limit` | — | integer | Default: `50`, max `100` |
| `offset` | — | integer | Default: `0` |

#### `get_risk_summary`
Return aggregated stats: counts by level, 5×5 heatmap matrix, top 10 by score. No parameters.

#### `create_treatment_plan`
Create a risk treatment plan. `mitigate` type requires at least one control reference.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `risk_id` | ✅ | string (UUID) | |
| `treatment_type` | ✅ | enum | `mitigate` \| `accept` \| `avoid` \| `transfer` |
| `description` | ✅ | string | |
| `owner` | ✅ | string | |
| `due_date` | ✅ | string | `YYYY-MM-DD` |
| `controls` | — | array | Required for `mitigate` type |
| `residual_likelihood` | — | integer | 1–5 |
| `residual_impact` | — | integer | 1–5 |
| `evidence_ref` | — | string | |

#### `update_treatment_status`
Update a treatment plan's status and link evidence.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `treatment_id` | ✅ | string (UUID) | |
| `status` | ✅ | enum | `planned` \| `in_progress` \| `implemented` \| `verified` \| `cancelled` |
| `evidence_ref` | — | string | |
| `residual_likelihood` | — | integer | 1–5 |
| `residual_impact` | — | integer | 1–5 |

#### `generate_risk_register`
Export the full risk register.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `format` | ✅ | enum | `markdown` \| `csv` \| `json` |
| `risk_level_filter` | — | enum | `Low` \| `Medium` \| `High` \| `Critical` |
| `status_filter` | — | enum | `open` \| `accepted` \| `mitigated` \| `transferred` \| `closed` |

---

### Group 4 — Policy Management *(reads: viewer+, create: analyst+, update: admin)*

#### `create_policy`
Render a policy from a Mustache template with org-specific variables.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `type` | ✅ | enum | `information_security` \| `access_control` \| `risk_management` \| `asset_management` \| `incident_response` \| `business_continuity` \| `supplier_security` \| `cryptography` \| `physical_security` \| `acceptable_use` \| `data_classification` \| `secure_development` |
| `organisation_name` | — | string | Auto-injected from org profile if set |
| `scope` | — | string | Auto-injected from org profile if set |
| `owner` | ✅ | string | |
| `approver` | — | string | |
| `review_cycle_months` | — | integer | 1–36, default: `12` |
| `effective_date` | ✅ | string | `YYYY-MM-DD` |

#### `get_policy`
Fetch a policy with optional version history.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `policy_id` | ✅ | string (UUID) | |
| `include_versions` | — | boolean | Default: `false` |

#### `update_policy`
Archive the current version and create a new one. Admin only.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `policy_id` | ✅ | string (UUID) | |
| `scope` | — | string | |
| `owner` | — | string | |
| `approver` | — | string | |
| `reviewed_by` | ✅ | string | |
| `change_summary` | ✅ | string | |

#### `list_policies`
List policies with optional filters.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `status` | — | enum | `draft` \| `active` \| `archived` |
| `type` | — | enum | Any of the 12 policy types above |
| `owner` | — | string | |
| `overdue_only` | — | boolean | Filter to policies past their review date — default: `false` |
| `limit` | — | integer | Default: `50`, max `100` |
| `offset` | — | integer | Default: `0` |

---

### Group 5 — Statement of Applicability *(minimum role: analyst)*

#### `generate_soa`
Create an SoA from an assessment, pre-populating all 93 (2022) or 114 (2013) entries.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `assessment_id` | ✅ | string (UUID) | |
| `isms_version` | — | enum | `2022` \| `2013` — default: `2022` |

#### `update_soa_entry`
Update a single SoA entry's inclusion, justification, status, and responsible party.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `soa_id` | ✅ | string (UUID) | |
| `control_id` | ✅ | string | |
| `included` | ✅ | boolean | |
| `justification` | ✅ | string | |
| `status` | — | enum | `implemented` \| `partial` \| `not_implemented` \| `na` \| `not_started` |
| `responsible_party` | — | string | |

#### `export_soa`
Export the Statement of Applicability.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `soa_id` | ✅ | string (UUID) | |
| `format` | ✅ | enum | `markdown` \| `csv` |

---

### Group 6 — Audit Management *(reads: viewer+, writes: admin)*

#### `create_audit`
Create an internal audit with auditor, planned date, and scope.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `name` | ✅ | string | Audit name |
| `scope` | ✅ | string | |
| `auditor` | ✅ | string | |
| `planned_date` | ✅ | string | `YYYY-MM-DD` |
| `controls_in_scope` | — | array | Control IDs |
| `clauses_in_scope` | — | array | Clause IDs |

#### `record_finding`
Record a finding. Non-conformities (`nc`) require a severity.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `audit_id` | ✅ | string (UUID) | |
| `type` | ✅ | enum | `nc` \| `obs` \| `ofi` |
| `clause_or_control` | ✅ | string | |
| `description` | ✅ | string | |
| `objective_evidence` | ✅ | string | |
| `severity` | — | enum | `major` \| `minor` — required for `type=nc` |

#### `create_corrective_action`
Raise a Corrective Action Request (CAR) linked to a finding.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `finding_id` | ✅ | string (UUID) | |
| `description` | ✅ | string | |
| `owner` | ✅ | string | |
| `due_date` | ✅ | string | `YYYY-MM-DD` |
| `root_cause` | — | string | |

#### `update_corrective_action`
Update CAR status. Closing (`status=closed`) requires `effectiveness_verified: true` (ISO 27001 Clause 10.1).

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `car_id` | ✅ | string (UUID) | |
| `description` | — | string | |
| `owner` | — | string | |
| `due_date` | — | string | `YYYY-MM-DD` |
| `status` | — | enum | `open` \| `in_progress` \| `implemented` \| `verified` \| `closed` |
| `root_cause` | — | string | |
| `effectiveness_verified` | — | boolean | Must be `true` to close the CAR |
| `evidence_ref` | — | string | |

#### `generate_audit_report`
Export a full audit report (executive summary, findings, CARs).

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `audit_id` | ✅ | string (UUID) | |
| `format` | ✅ | enum | `markdown` \| `json` |

---

### Group 7 — Evidence Tracking *(reads: viewer+, writes: analyst+)*

#### `register_evidence`
Register an evidence artefact for a control.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `control_id` | ✅ | string | |
| `type` | ✅ | enum | `policy` \| `procedure` \| `log` \| `screenshot` \| `report` \| `certificate` \| `configuration` \| `meeting_minutes` \| `training_record` \| `contract` \| `audit_report` \| `test_result` \| `ticket` \| `other` |
| `description` | ✅ | string | |
| `source_url` | — | string | URL to the artefact |
| `collected_by` | ✅ | string | |
| `collected_date` | ✅ | string | `YYYY-MM-DD` |
| `expiry_date` | — | string | `YYYY-MM-DD` |

#### `list_evidence`
List evidence for a control, optionally filtered by currency.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `control_id` | ✅ | string | |
| `status` | — | enum | `current` \| `stale` \| `expired` |

#### `get_evidence_gaps`
Find controls marked `implemented` or `partial` that have no current evidence.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `assessment_id` | ✅ | string (UUID) | |

#### `link_jira_ticket`
Link evidence to an existing Jira issue (`jira_key`) or create a new one (`summary`). Provide at least one.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `evidence_id` | ✅ | string (UUID) | |
| `jira_key` | — | string | e.g. `ISMS-42` — links to existing issue |
| `summary` | — | string | Creates a new Jira task with this title |
| `description` | — | string | Body for the new issue |

#### `link_github_issue`
Link evidence to an existing GitHub issue (`issue_number`) or create a new one (`title`). Provide at least one.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `evidence_id` | ✅ | string (UUID) | |
| `issue_number` | — | integer | Links to an existing issue |
| `title` | — | string | Creates a new issue with this title |
| `body` | — | string | Body for the new issue |

---

### Group 8 — Server Info *(minimum role: viewer)*

#### `get_server_info`
Return version, uptime, DB stats, control counts, and rate limit config. No parameters.

---

### Group 9 — Admin & Key Management *(minimum role: admin)*

#### `query_audit_log`
Query the tamper-evident audit log.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `start_date` | — | string | `YYYY-MM-DD` |
| `end_date` | — | string | `YYYY-MM-DD` |
| `tool` | — | string | Filter by tool name |
| `outcome` | — | enum | `success` \| `denied` \| `error` |
| `role` | — | enum | `viewer` \| `analyst` \| `admin` |
| `key_hash` | — | string | Filter by API key hash (max 64 chars) |
| `limit` | — | integer | Default: `50`, max `100` |
| `offset` | — | integer | Default: `0` |

#### `list_api_keys`
List all API keys with metadata. Never returns key hashes. No parameters.

#### `revoke_api_key`
Immediately revoke a key by label.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `label` | ✅ | string | The label assigned at key generation |

---

### Group 10 — Organisation Profile *(minimum role: admin for writes, viewer for reads)*

#### `set_organization_profile`
Upsert the singleton organisation profile. Used to auto-inject `organisation_name` and `scope` into `create_policy` and `create_procedure`.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `legal_entity_name` | ✅ | string | Registered legal name |
| `registered_jurisdiction` | ✅ | string | e.g. `England and Wales` |
| `in_scope_activities` | ✅ | string | Activities within ISMS scope |
| `isms_scope_statement` | ✅ | string | Formal scope statement (used as `scope` default) |
| `regulatory_licences` | — | array | Applicable licences or regulations |
| `declared_exclusions` | — | string | Out-of-scope exclusions and justifications |
| `raci_roles` | — | object | Keys: `ciso`, `dpo`, `data_owner`, `isms_manager`, `internal_auditor` |
| `review_cadence_months` | — | integer | Default: `12` |

#### `get_organization_profile`
Retrieve the singleton organisation profile. Returns `{ profile: null }` if not yet set. No parameters.

---

### Group 11 — Procedure Management *(reads: viewer+, create/export: analyst+, update: admin)*

#### `create_procedure`
Render a procedure from a Mustache template and store it in the database.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `type` | ✅ | enum | `incident_handling` \| `access_provisioning` \| `asset_onboarding_offboarding` \| `audit_log_review` \| `backup_restore` \| `bcp_testing` \| `change_management` \| `cryptographic_key_management` \| `data_classification_handling` \| `secure_development_workflow` \| `supplier_onboarding` \| `vulnerability_management` |
| `owner` | ✅ | string | |
| `effective_date` | ✅ | string | `YYYY-MM-DD` |
| `organisation_name` | — | string | Auto-injected from org profile if set |
| `scope` | — | string | Auto-injected from org profile if set |
| `approver` | — | string | Defaults to `TBD` |
| `policy_id` | — | string (UUID) | Link to a parent policy (must be active) |
| `related_controls` | — | array | Control IDs |
| `review_cycle_months` | — | integer | 1–36, default: `12` |

#### `get_procedure`
Fetch a procedure by ID, optionally including archived version history.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `procedure_id` | ✅ | string (UUID) | |
| `include_versions` | — | boolean | Default: `false` |

#### `list_procedures`
List procedures with optional filters, sorted by upcoming review date.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `procedure_type` | — | enum | Any of the 12 procedure types above |
| `status` | — | enum | `draft` \| `active` \| `archived` |
| `policy_id` | — | string (UUID) | Filter to procedures linked to a specific policy |
| `overdue_only` | — | boolean | Filter to active procedures past their review date — default: `false` |
| `limit` | — | integer | Default: `50`, max `100` |
| `offset` | — | integer | Default: `0` |

#### `update_procedure`
Archive the current version and re-render with updated fields. Admin only.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `procedure_id` | ✅ | string (UUID) | |
| `reviewed_by` | ✅ | string | |
| `change_summary` | ✅ | string | |
| `scope` | — | string | |
| `owner` | — | string | |
| `approver` | — | string | |
| `related_controls` | — | array | Control IDs |

#### `export_procedure`
Export a procedure as Markdown or JSON.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `procedure_id` | ✅ | string (UUID) | |
| `format` | ✅ | enum | `markdown` \| `json` |

---

### Group 12 — Management Review *(reads: viewer+, writes: admin)* — Clause 9.3

#### `create_management_review`
Schedule a management review meeting.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `title` | ✅ | string | Review title |
| `review_date` | ✅ | string | `YYYY-MM-DD` |
| `chair` | ✅ | string | Review chair / CISO name |
| `attendees` | — | array | List of attendee names |
| `agenda` | — | string | Meeting agenda |

#### `record_review_input`
Record an input item to a management review (e.g. audit results, risk summary, performance metrics).

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `review_id` | ✅ | string (UUID) | |
| `input_type` | ✅ | enum | `audit_results` \| `risk_summary` \| `objective_performance` \| `nonconformities` \| `previous_actions` \| `changes` \| `resources` \| `stakeholder_feedback` \| `other` |
| `summary` | ✅ | string | |
| `detail` | — | string | Supporting detail |

#### `record_review_output`
Record a decision or action item from a management review.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `review_id` | ✅ | string (UUID) | |
| `output_type` | ✅ | enum | `improvement_opportunity` \| `resource_decision` \| `policy_change` \| `objective_change` \| `other` |
| `description` | ✅ | string | |
| `owner` | — | string | |
| `due_date` | — | string | `YYYY-MM-DD` |

#### `complete_management_review`
Mark a management review as complete and record the outcome.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `review_id` | ✅ | string (UUID) | |
| `outcome_summary` | ✅ | string | |

#### `get_management_review`
Fetch a management review with all inputs, outputs, and status.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `review_id` | ✅ | string (UUID) | |

#### `list_management_reviews`
List management reviews with optional status filter.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `status` | — | enum | `scheduled` \| `in_progress` \| `completed` |
| `limit` | — | integer | Default: `20`, max `100` |
| `offset` | — | integer | Default: `0` |

---

### Group 13 — Improvement Plan *(reads: viewer+, writes: analyst+)* — Clause 10.1

#### `create_improvement_opportunity`
Register an improvement opportunity, typically identified during a management review or audit.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `title` | ✅ | string | |
| `description` | ✅ | string | |
| `source` | ✅ | enum | `audit` \| `management_review` \| `incident` \| `risk_assessment` \| `self_assessment` \| `other` |
| `priority` | — | enum | `low` \| `medium` \| `high` \| `critical` — default: `medium` |
| `owner` | — | string | |
| `due_date` | — | string | `YYYY-MM-DD` |
| `related_controls` | — | array | Control IDs |
| `review_id` | — | string (UUID) | Link to a management review output |

#### `update_improvement_opportunity`
Update the status, owner, or due date of an improvement opportunity.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `opportunity_id` | ✅ | string (UUID) | |
| `status` | — | enum | `open` \| `in_progress` \| `completed` \| `cancelled` |
| `owner` | — | string | |
| `due_date` | — | string | `YYYY-MM-DD` |
| `resolution_notes` | — | string | Required when closing |

#### `get_improvement_opportunity`
Fetch a single improvement opportunity by ID.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `opportunity_id` | ✅ | string (UUID) | |

#### `list_improvement_opportunities`
List improvement opportunities with optional filters.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `status` | — | enum | `open` \| `in_progress` \| `completed` \| `cancelled` |
| `priority` | — | enum | `low` \| `medium` \| `high` \| `critical` |
| `source` | — | enum | Any source enum value above |
| `limit` | — | integer | Default: `50`, max `100` |
| `offset` | — | integer | Default: `0` |

---

### Group 14 — Evidence Templates *(reads: viewer+, generate: analyst+)*

#### `generate_evidence_document`
Render a Mustache evidence template and store it. The document is dual-written to both the `evidence` table and the `generated_evidence` table for tracking and version history.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `template_type` | ✅ | enum | `access_review_attestation` \| `bcp_test_report` \| `incident_post_mortem` \| `risk_treatment_sign_off` \| `supplier_security_questionnaire` \| `training_acknowledgement` |
| `title` | ✅ | string | Document title |
| `generated_by` | ✅ | string | Author or system that generated the document |
| `organisation_name` | — | string | Auto-injected from org profile if set |
| `control_id` | — | string | Link to a specific control (default: `general`) |
| `vars` | — | object | Additional Mustache template variables |

#### `get_evidence_document`
Fetch a generated evidence document by ID, including rendered content and clause/control mappings.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `document_id` | ✅ | string (UUID) | |

#### `list_evidence_documents`
List generated evidence documents with optional filters.

| Parameter | Req | Type | Values / Notes |
|-----------|-----|------|----------------|
| `template_type` | — | enum | Filter to a specific template type |
| `generated_by` | — | string | Filter by author |
| `control_id` | — | string | Filter by linked control |
| `limit` | — | integer | Default: `20`, max `100` |
| `offset` | — | integer | Default: `0` |

---

## MCP Resources

In addition to tools, the server exposes ISMS artefacts as browseable **MCP Resources** under the `iso27001://` URI scheme. Claude can reference these directly without a tool call — ideal for inline document review, cross-referencing controls, and long-context analysis.

Resources are read-only. Write operations always go through tools (which enforce the security pipeline and audit log).

### Resource URI Scheme

| Resource | URI pattern | Auth |
|----------|-------------|------|
| `iso27001-control` | `iso27001://control/{control_id}` | Public |
| `iso27001-control-versioned` | `iso27001://control/{control_id}/version/{version}` | Public |
| `iso27001-clause` | `iso27001://clause/{clause_id}` | Public |
| `iso27001-org-profile` | `iso27001://org/profile` | Viewer |
| `iso27001-policy` | `iso27001://policy/{policy_id}` | Viewer |
| `iso27001-policy-versioned` | `iso27001://policy/{policy_id}/version/{n}` | Viewer |
| `iso27001-procedure` | `iso27001://procedure/{procedure_id}` | Viewer |
| `iso27001-procedure-versioned` | `iso27001://procedure/{procedure_id}/version/{n}` | Viewer |
| `iso27001-risk` | `iso27001://risk/{risk_id}` | Viewer |
| `iso27001-assessment` | `iso27001://assessment/{assessment_id}` | Viewer |
| `iso27001-soa` | `iso27001://soa/{soa_id}` | Viewer |
| `iso27001-audit` | `iso27001://audit/{audit_id}` | Viewer |

### Resource Formats

**Controls and clauses** (`application/json`) — full control record including `control_type`, `attributes`, `related_controls`, and ISO clause refs.

**Policies and procedures** (`text/markdown`) — rendered document body with a YAML frontmatter envelope containing `uri`, `procedure_type` / policy `type`, version, owner, clause and control mappings, and review dates.

**Risks** (`application/json`) — risk record with nested `treatments` array.

**Assessments** (`application/json`) — assessment record with `control_status_summary` (counts by status).

**Statement of Applicability** (`application/json`) — SoA record with nested `entries` array (boolean `included` field).

**Audits** (`application/json`) — audit record with nested `findings` array, each containing its `corrective_actions`.

### Example

```
"Read iso27001://policy/pol-abc123 and compare it against control 5.1."
"List all open risks from iso27001://risk and summarise which controls are most often cited."
"Review the SoA at iso27001://soa/soa-xyz789 and identify excluded controls."
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude (LLM)                        │
└──────────┬───────────────────────────────┬──────────────┘
           │  MCP Tools (read/write)        │  MCP Resources (read-only)
           │  63 tools, RBAC enforced       │  12 iso27001:// URIs
┌──────────▼───────────────────────────────▼──────────────┐
│                   iso27001-mcp server                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │             7-Step Security Pipeline            │    │
│  │                                                 │    │
│  │  1. Extract credential (_meta.apiKey / env)     │    │
│  │  2. Auth — session token OR validateKey()       │    │
│  │     SSE sessions use opaque token (no raw key)  │    │
│  │  3. checkRateLimit() sliding 60s window (RPM)   │    │
│  │  4. assertPermission() RBAC check               │    │
│  │  5. sanitiseParams() strip injection patterns   │    │
│  │  6. Domain handler   business logic             │    │
│  │  7. writeAuditEvent() HMAC chain + row_hash     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Controls   │  │  Risks   │  │  Policies &        │  │
│  │  Gap Assess │  │ Register │  │  Procedures        │  │
│  │  SoA        │  │ Treatmts │  │  (Mustache+partls) │  │
│  └─────────────┘  └──────────┘  └────────────────────┘  │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │   Audits    │  │ Evidence │  │  Mgmt Review &     │  │
│  │  Findings   │  │  Jira/GH │  │  Improvement Plan  │  │
│  │  CARs       │  │  Tmplts  │  │  (Clauses 9.3/10.1)│  │
│  └─────────────┘  └──────────┘  └────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Org Profile · Audit Log (HMAC-SHA256 chain)    │    │
│  │  Session Token Store · API Key RBAC (63 tools)  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │    AES-256 encrypted SQLite  (isms.db)          │    │
│  │    better-sqlite3-multiple-ciphers              │    │
│  │    WAL mode · foreign keys · FTS5 index         │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Database

All data is stored in a single encrypted SQLite file (`isms.db`) using AES-256 via `better-sqlite3-multiple-ciphers`. The schema is managed by six SQL migrations applied automatically on first startup:

- `0001_initial.sql` — 17 tables covering every ISMS domain (controls, gap assessments, risks, policies, audits, evidence, API keys, audit log, and more)
- `0002_fts_index.sql` — FTS5 full-text search index on controls, plus 12 performance indexes
- `0003_org_profile_procedures.sql` — `organization_profile` singleton table, `procedures` table, and `procedure_versions` history table
- `0004_management_review_improvement.sql` — `management_reviews`, `review_inputs`, `review_outputs`, and `improvement_opportunities` tables (Clauses 9.3 and 10.1)
- `0005_evidence_documents.sql` — `generated_evidence` table for Mustache-rendered evidence documents with dual-write to `evidence`
- `0006_audit_log_hmac.sql` — adds `prev_hash` column to `audit_log` for HMAC chain integrity

### Seed Data

On first startup, `seedAll()` inserts all ISO 27001 reference data and verifies SHA-256 checksums before inserting:

- **93** ISO 27001:2022 Annex A controls across 4 themes (Organizational, People, Physical, Technological)
- **114** ISO 27001:2013 controls across 14 Annex A domains
- **125** version mappings (2013 ↔ 2022), including direct, merged, split, and new_2022 relationships
- **41** clause requirements for clauses 4–10 with sub-clauses, requirement text, and implementation notes

### Security Pipeline

Every tool call passes through the same 7-step pipeline before any business logic runs. SSE sessions use an opaque session token so the raw API key is never retained in server memory after the initial `/sse` handshake. Audit events are always written — including on authentication failure and RBAC denial — so the log is a complete record of all attempts, not just successful ones.

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
| `viewer` | 31 (all read-only tools) | Auditor, stakeholder |
| `analyst` | 49 (reads + gap/risk/policy/procedure/evidence/improvement writes) | ISMS practitioner, consultant |
| `admin` | 63 (all tools, including org profile, audit management, audit log and key management) | CISO, ISMS owner |

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

## Sample Outputs

The [`samples/`](samples/) directory contains auditor-ready example outputs generated from a demo ISMS for a fictitious organisation ("Acme Financial Services Ltd" — a UK payments processor preparing for ISO 27001:2022 certification). Each file states which tool(s) produced it.

| Sample | Description |
|--------|-------------|
| [gap-assessment-summary.md](samples/gap-assessment-summary.md) | Complete gap assessment across all 93 controls |
| [remediation-roadmap.md](samples/remediation-roadmap.md) | 26-week prioritised remediation plan with owners and effort estimates |
| [risk-register.csv](samples/risk-register.csv) | Risk register with 10 risks, scores, and treatment plans |
| [statement-of-applicability.csv](samples/statement-of-applicability.csv) | Full SoA — all 93 ISO 27001:2022 controls with applicability justifications |
| [access-control-policy.md](samples/access-control-policy.md) | Generated access control policy (Annex A 5.15–5.18, 8.2–8.5) |
| [incident-handling-procedure.md](samples/incident-handling-procedure.md) | Incident handling procedure with severity tiers and GDPR notification |
| [internal-audit-report.md](samples/internal-audit-report.md) | Internal audit report — 3 major NCs, 4 minor NCs, 2 positive observations |
| [corrective-action-record.md](samples/corrective-action-record.md) | Two corrective action records: one in progress, one closed and verified |
| [evidence-package.md](samples/evidence-package.md) | 47-item evidence inventory with 28-control gap analysis |

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

# Run all tests (470 unit + integration tests)
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
├── server.ts                 McpServer factory — registers tools + resources
├── auth/
│   ├── api-key.ts            Key generation, HMAC validation, expiry, revocation
│   ├── rbac.ts               Permission matrix (63 tools × 3 roles)
│   └── session-store.ts      SSE session token store (opaque token → keyHash + role)
├── security/
│   ├── sanitise.ts           Prompt-injection stripping for free-text fields
│   ├── rate-limiter.ts       Sliding-window RPM counter per key hash
│   ├── secrets.ts            Env var validation (fail-fast on startup)
│   └── validate.ts           Zod schemas for all 63 tool inputs
├── audit/
│   └── logger.ts             Tamper-evident audit event writer
├── db/
│   ├── connection.ts         Encrypted SQLite open/close/migrate
│   ├── dal.ts                Shared helpers: newId, now, toJson, fromJsonArray, computeEvidenceStatus
│   └── migrations/           0001_initial.sql, 0002_fts_index.sql, 0003_org_profile_procedures.sql
├── seed/
│   ├── seeder.ts             Idempotent seed runner with checksum verification
│   ├── controls-2022.json    93 ISO 27001:2022 Annex A controls
│   ├── controls-2013.json    114 ISO 27001:2013 controls
│   ├── version-mapping.json  125 cross-version mappings
│   ├── clause-requirements.json  41 clause requirements (clauses 4–10)
│   ├── policy-templates/     12 Mustache .md policy templates
│   ├── procedure-templates/  12 Mustache .md procedure templates
│   ├── evidence-templates/   6 Mustache .md evidence document templates
│   └── partials/             Shared Mustache partials (org_header, revision_block, approver_signature)
├── tools/
│   ├── index.ts              Tool registry and security pipeline
│   ├── controls.ts           Group 1: Control Registry (7 tools)
│   ├── gap-analysis.ts       Group 2: Gap Analysis (7 tools)
│   ├── risks.ts              Group 3: Risk Management (8 tools)
│   ├── policies.ts           Group 4: Policy Management (4 tools)
│   ├── soa.ts                Group 5: Statement of Applicability (3 tools)
│   ├── audit-management.ts   Group 6: Audit Management (5 tools)
│   ├── evidence-tracking.ts  Group 7: Evidence Tracking (5 tools)
│   ├── server-info.ts        Group 8: Server Info (1 tool)
│   ├── org-profile.ts        Group 10: Organisation Profile (2 tools) + loadOrgProfileDefaults helper
│   ├── procedures.ts         Group 11: Procedure Management (5 tools)
│   ├── management-review.ts  Group 12: Management Review — Clause 9.3 (6 tools)
│   ├── improvement-plan.ts   Group 13: Improvement Plan — Clause 10.1 (4 tools)
│   ├── evidence-templates.ts Group 14: Evidence Templates (3 tools)
│   └── template-utils.ts     Shared loadTemplate / stripFrontmatter / loadPartials helpers
├── resources/
│   ├── index.ts              Registers all 12 MCP Resources
│   ├── resource-auth.ts      Slim auth helper for resource callbacks
│   ├── controls.ts           iso27001-control, iso27001-control-versioned, iso27001-clause
│   ├── org-profile.ts        iso27001-org-profile (static URI)
│   ├── policies.ts           iso27001-policy, iso27001-policy-versioned
│   ├── procedures.ts         iso27001-procedure, iso27001-procedure-versioned
│   ├── risks.ts              iso27001-risk (with nested treatments)
│   └── assessments.ts        iso27001-assessment, iso27001-soa, iso27001-audit
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
│   ├── tools/                One file per handler module
│   └── resources/            One file per resource module (controls, policies, procedures, risks, assessments)
└── integration/
    ├── mcp-protocol.test.ts  Schema and registration validation
    ├── db-operations.test.ts Migrations, seed counts, FTS5 (macOS only)
    └── business-rules.test.ts All 6 enforced business rules end-to-end
```

---

## Security

For a full security profile — threat model, hardening guide, data flow documentation, supply chain attestation, and audit log integrity verification — see the **[Trust Center](https://github.com/Sushegaad/MCP-Server-for-ISO27001/tree/main/docs/security/)**.

### API Key Storage

API keys are never stored in plaintext. Only an HMAC-SHA256 hash is persisted in the database. The raw `iso27001_...` key is printed once to stdout at generation time — there is no way to retrieve it afterwards.

### Database Encryption

The SQLite database (`isms.db`) is encrypted at rest using AES-256 via `better-sqlite3-multiple-ciphers`. The `DB_ENCRYPTION_KEY` is required at every startup and is never written to disk by the server.

### Tamper-Evident Audit Trail

Every tool call writes a row to `audit_log` with a `row_hash` computed as:

```
HMAC-SHA256(HMAC_SECRET, id | timestamp | tool | key_hash | role |
            params_json | outcome | error_message | duration_ms | prev_hash)
```

The `prev_hash` field chains each row to its predecessor — insertion, deletion, or reordering of rows is detectable via `verifyRowHash()` and `verifyChain()`. The same events are appended in JSON-L format to `AUDIT_LOG_PATH` for off-database retention and SIEM ingestion. The log path is validated on write to reject paths inside system directories (`/etc`, `/proc`, `/sys`, `/dev`).

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

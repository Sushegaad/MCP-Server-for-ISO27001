# iso27001-mcp

**Turn Claude into an ISO 27001 compliance assistant** — controls, risk register, policies, evidence tracking, SoA generation, and full audit workflows in one local encrypted MCP server.

[![npm version](https://img.shields.io/npm/v/iso27001-mcp.svg)](https://npmjs.com/package/iso27001-mcp)
[![npm downloads](https://img.shields.io/npm/dt/iso27001-mcp.svg)](https://npmjs.com/package/iso27001-mcp)
[![CI](https://github.com/Sushegaad/MCP-Server-for-ISO27001/actions/workflows/ci.yml/badge.svg)](https://github.com/Sushegaad/MCP-Server-for-ISO27001/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![ISO 27001:2022](https://img.shields.io/badge/ISO%2027001-2022-blue.svg)](https://www.iso.org/standard/27001)
[![Socket Badge](https://badge.socket.dev/npm/package/iso27001-mcp/0.9.61)](https://socket.dev/npm/package/iso27001-mcp/overview/0.9.61)

**[▶ Live Interactive Demo](https://sushegaad.github.io/MCP-Server-for-ISO27001/)**

<div align="center">
  <a href="https://youtu.be/BGHYTYbL8wE">
    <img src="https://img.youtube.com/vi/BGHYTYbL8wE/hqdefault.jpg" alt="▶ Getting Started with iso27001-mcp (YouTube)" width="480">
  </a>
  <br/>
  <sub>▶ <a href="https://youtu.be/BGHYTYbL8wE">Getting Started — watch on YouTube</a></sub>
</div>

---

## Why this exists

ISO 27001 compliance work is typically scattered across spreadsheets, Word docs, ticketing systems, and shared drives. Security teams and consultants spend more time chasing evidence and reformatting documents than actually improving security posture.

**`iso27001-mcp` solves this by giving Claude a live, stateful ISMS** — all 93 ISO 27001:2022 controls seeded and ready, a real risk register, policy and procedure generators, evidence tracking, audit workflows, and a Statement of Applicability, backed by an encrypted local database that never leaves your machine.

The difference from generating static documents: Claude can *query, reason, and update* across your entire ISMS in a single conversation. Ask it to run a gap assessment, identify which open risks are linked to unimplemented controls, generate the policies that close those gaps, and produce a remediation roadmap — all without switching tools.

**Who it's for:** Security teams · Compliance consultants · GRC engineers · Startups preparing for ISO 27001 · Internal audit functions

---

## What Claude can do with it

| Capability | Example prompt |
|------------|----------------|
| **Gap assessment** | *"Run an ISO 27001:2022 gap assessment for a 50-person SaaS company."* |
| **Risk register** | *"Create a risk register for a startup using AWS, GitHub, Slack, and Google Workspace."* |
| **Statement of Applicability** | *"Generate a Statement of Applicability for all 93 ISO 27001:2022 controls."* |
| **Policy generation** | *"Create an Access Control Policy mapped to ISO 27001 controls."* |
| **Procedure generation** | *"Generate an Incident Handling Procedure with GDPR breach notification triggers."* |
| **Internal audit** | *"Plan an internal audit for clause 9.1 — Performance Evaluation."* |
| **Corrective actions** | *"List open audit findings and suggest corrective actions."* |
| **Evidence tracking** | *"Show me all implemented controls with no current evidence."* |
| **Remediation roadmap** | *"Generate a 26-week remediation roadmap grouped by risk level."* |
| **Management review** | *"Prepare agenda items for our Clause 9.3 management review."* |

---

## Quick Start

### Prerequisites

- **Node.js 20.11.0+** — [nodejs.org](https://nodejs.org) or [nvm](https://github.com/nvm-sh/nvm) / [Volta](https://volta.sh)

> **Build tools are usually not needed.** The package ships pre-built binaries for macOS (arm64 + x64), Windows (x64), and Linux (x64/glibc). Try `npm install -g iso27001-mcp` first — if it succeeds, you're done.
>
> <details><summary>↳ If the install fails with a <code>node-gyp</code> error, expand for OS-specific fix</summary>
>
> - **macOS:** `xcode-select --install`
> - **Ubuntu / Debian:** `sudo apt-get install build-essential python3`
> - **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) → "Desktop development with C++"
>
> </details>
>
> <details><summary>↳ If you get an <code>EACCES</code> permission error on macOS or Linux</summary>
>
> Your Node.js was installed system-wide and `npm install -g` needs write access to a root-owned directory. **Do not use `sudo npm install -g`** — it causes other issues. Instead, install Node via [nvm](https://github.com/nvm-sh/nvm) or [Volta](https://volta.sh), which place Node in your home directory where no elevated permissions are required.
>
> </details>
>
> <details><summary>↳ If you get <code>command not found</code> on Windows after a successful install</summary>
>
> The npm global bin directory (`%APPDATA%\npm`) may not be on your PATH yet. **Open a new terminal window** — the installer updates PATH for new sessions but not the one already open. If it still fails, add `%APPDATA%\npm` to your PATH manually in System Settings → Environment Variables.
>
> </details>

### Three commands to get running

```bash
npm install -g iso27001-mcp     # 1. install globally
iso27001-mcp init --yes         # 2. one-shot setup — all defaults, no prompts
                                #    (omit --yes to choose custom paths interactively)
iso27001-mcp doctor             # 3. verify everything is working
```

After running `iso27001-mcp doctor` you should see:

```
iso27001-mcp — health check
────────────────────────────────────────────────────────
✅  DB_ENCRYPTION_KEY      set (64 hex chars)
✅  HMAC_SECRET            set (64 hex chars)
✅  MCP_API_KEY            set (starts with iso27001_)
✅  Database file          /Users/you/.iso27001/isms.db
✅  Database accessible    opened and queried successfully
✅  Migrations             9/9 applied
✅  Controls seeded        93 ISO 27001:2022 controls
✅  Active API key         1 active key found
✅  Claude Desktop config  /Users/you/.../claude_desktop_config.json
✅  iso27001-mcp entry     present in mcpServers
────────────────────────────────────────────────────────
  All 10 checks passed. Restart Claude Desktop if you just ran init.
```

Then **restart Claude Desktop fully** and you should see 63 tools in the tools panel.

> **macOS:** press **Cmd+Q** to quit (clicking the red dot only closes the window — the server won't reload).  
> **Windows:** right-click the taskbar icon → **Quit**.

### Tools not appearing after restart?

Check the MCP server log — Claude Desktop writes server stderr here:

```
macOS:   ~/Library/Logs/Claude/mcp-server-iso27001-mcp.log
Windows: %APPDATA%\Claude\Logs\mcp-server-iso27001-mcp.log
```

Common causes: wrong Node.js version loaded by Claude Desktop, missing `DB_ENCRYPTION_KEY` in the config, or a database path that doesn't exist yet. Run `iso27001-mcp doctor` in a fresh terminal for a guided diagnosis.

> **Switched Node versions with nvm or Volta?** The absolute Node.js path baked into your Claude Desktop config at init time now points to a deleted binary. Re-run `iso27001-mcp init` — it will detect your current setup and update the path. Your existing database and API keys are preserved (the wizard aborts if your secrets file already exists and you run with `--yes`).

### Five prompts to try first

```
"Use get_server_info to verify the server is running."
"Run an ISO 27001 gap assessment for a 50-person SaaS company."
"Create a risk register for a startup using AWS, GitHub, Slack, and Google Workspace."
"Generate a Statement of Applicability for ISO 27001:2022."
"Create an Access Control Policy mapped to ISO 27001 controls."
```

---

## Tool Categories

63 tools across 14 groups. All require an API key; minimum role is shown.

| Group | Tools | Min. role | What it does |
|-------|-------|-----------|--------------|
| **Control Registry** | 7 | viewer | Search, filter, and compare ISO 27001:2022 and 2013 controls; browse clause requirements |
| **Gap Analysis** | 7 | viewer / analyst | Create and track gap assessments; export gap reports; generate remediation roadmaps |
| **Risk Management** | 8 | viewer / analyst | Risk register with likelihood × impact scoring, treatment plans, and heat-map summaries |
| **Policy Management** | 4 | viewer / analyst / admin | Generate, version, and export policies from 12 Mustache templates |
| **Statement of Applicability** | 3 | analyst | Build and export SoA from a gap assessment; all 93 controls with applicability decisions |
| **Audit Management** | 5 | viewer / admin | Plan audits, record findings (NCs, OFIs), raise CARs, and close with effectiveness check |
| **Evidence Tracking** | 5 | viewer / analyst | Register evidence artefacts, spot gaps, link to Jira / GitHub issues |
| **Server Info** | 1 | viewer | Server version, tool count, capability summary |
| **Admin & Key Management** | 6 | admin | Generate / revoke API keys, query the HMAC audit log |
| **Organisation Profile** | 2 | admin (write) / viewer (read) | Set org name, scope, and defaults used by all templates |
| **Procedure Management** | 5 | viewer / analyst / admin | Generate, version, and export procedures from 12 Mustache templates |
| **Management Review** | 6 | viewer / admin | Full Clause 9.3 lifecycle — inputs, outputs, completion (enforces all 7 required input categories) |
| **Improvement Plan** | 4 | viewer / analyst | Clause 10.1 improvement opportunities — track, link, and report |
| **Evidence Templates** | 3 | viewer / analyst | Generate Mustache-rendered evidence documents; dual-write to evidence and generated_evidence tables |

---

## Templates

The server ships 30 Mustache templates that Claude renders on demand with your organisation's name, scope, and control references automatically injected.

### ISO 27001 Policy Templates

Generate any of these with a single Claude prompt:

`information_security` · `access_control` · `risk_management` · `asset_management` · `incident_response` · `business_continuity` · `supplier_security` · `cryptography` · `physical_security` · `acceptable_use` · `data_classification` · `secure_development`

### ISO 27001 Procedure Templates

`incident_handling` · `access_provisioning` · `asset_onboarding_offboarding` · `audit_log_review` · `backup_restore` · `bcp_testing` · `change_management` · `cryptographic_key_management` · `data_classification_handling` · `secure_development_workflow` · `supplier_onboarding` · `vulnerability_management`

### Evidence Document Templates

Pre-structured evidence documents for auditor submissions: `access_review_attestation` · `bcp_test_report` · `incident_post_mortem` · `risk_treatment_sign_off` · `supplier_security_questionnaire` · `training_acknowledgement`

### Sample Outputs

The [`samples/`](samples/) directory contains auditor-ready example outputs for a fictitious organisation ("Acme Financial Services Ltd") — a full gap assessment, remediation roadmap, risk register CSV, SoA CSV, access control policy, incident handling procedure, internal audit report, corrective action records, and evidence package. See [Sample Outputs](docs/REFERENCE.md#sample-outputs) for the full index.

> **ISO 27001 keywords:** ISO 27001 Statement of Applicability generator · ISO 27001 risk register template · ISO 27001 gap assessment tool · ISO 27001 audit evidence tracker · ISO 27001 MCP server · Claude ISO 27001 compliance assistant · AI GRC tool open source

---

## Security Model

### Role-Based Access Control (RBAC)

Three roles with strict hierarchy. A key can only call tools at or below its assigned role level.

| Capability | Viewer | Analyst | Admin |
|------------|--------|---------|-------|
| Read controls, clauses, version mappings | ✅ | ✅ | ✅ |
| Read gap assessments, risks, policies, audits, evidence | ✅ | ✅ | ✅ |
| Create / update gap assessments and control statuses | — | ✅ | ✅ |
| Create and manage risks and treatment plans | — | ✅ | ✅ |
| Generate policies and procedures | — | ✅ | ✅ |
| Create and export Statements of Applicability | — | ✅ | ✅ |
| Track and link evidence artefacts | — | ✅ | ✅ |
| Record and track improvement opportunities | — | ✅ | ✅ |
| Plan and close internal audits; raise CARs | — | — | ✅ |
| Set organisation profile | — | — | ✅ |
| Run management reviews (Clause 9.3) | — | — | ✅ |
| View and query the audit log | — | — | ✅ |
| Generate and revoke API keys | — | — | ✅ |

**Tool counts:** Viewer — 31 tools · Analyst — 49 tools · Admin — 63 tools

### What never leaves your machine

In `local` mode (stdio, the default), no data leaves the machine. The encrypted SQLite database, the `.env` secrets file, and the append-only audit log are all stored locally. There is no telemetry, no cloud sync, and no outbound network calls — unless you explicitly configure the optional Jira or GitHub integrations.

For the full security profile — threat model, hardening guide, supply chain attestation, and audit log integrity verification — see the **[Trust Center](https://github.com/Sushegaad/MCP-Server-for-ISO27001/tree/main/docs/security/)**.

### Encryption and audit trail summary

- **Database** — AES-256 encrypted SQLite via `better-sqlite3-multiple-ciphers`
- **API keys** — HMAC-SHA256 hashed; raw key printed once and never stored
- **Audit log** — HMAC-SHA256 hash chain; every row linked to its predecessor — insertion, deletion, or reordering is detectable; `actor_type` (`ai` | `human` | `system`) and `model_id` are included in the hash so provenance claims are tamper-evident
- **Prompt injection** — free-text fields sanitised before passing to any handler
- **HITL confirmation gates** — 7 critical write tools (`update_control_status`, `update_risk`, `update_treatment_status`, `update_soa_entry`, `update_policy`, `update_procedure`, `complete_management_review`) require `confirmed: true` to commit; omitting it returns a preview diff and records `outcome: "proposed"` in the audit log

---

## Table of Contents

- [Why this exists](#why-this-exists)
- [What Claude can do with it](#what-claude-can-do-with-it)
- [Quick Start](#quick-start)
- [Tool Categories](#tool-categories)
- [Templates](#templates)
- [Security Model](#security-model)
- [Use Cases](#use-cases)
- [Full Reference](#full-reference) — installation, tools API, architecture, modes, development, security

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

Every tool call is logged in a tamper-evident audit trail. Admins can query it at any time. Each entry records who triggered the action (`actor_type`: `ai` | `human` | `system`) and which model was running (`model_id`), both included in the HMAC hash chain so provenance claims are tamper-evident.

> *"Show me all tool calls made in the last 7 days that resulted in an error."*

> *"Query the audit log filtered to actor_type=human to see which calls were made by human operators."*

> *"List all API keys and when they were last used."*

---

## Full Reference

The detailed documentation has been moved to keep this page scannable. Everything below is in **[`docs/REFERENCE.md`](docs/REFERENCE.md)**:

- [Installation](docs/REFERENCE.md#installation) — prerequisites, `iso27001-mcp init`, `doctor`, Claude Desktop config
- [Connecting to Claude](docs/REFERENCE.md#connecting-to-claude) — Claude Desktop JSON, Claude Code, API key management
- [Advanced / Manual Setup](docs/REFERENCE.md#advanced--manual-setup) — CI/CD, custom paths, full env var table
- [Tools Reference](docs/REFERENCE.md#tools-reference) — all 63 tools across 14 groups with full parameter tables
- [MCP Resources](docs/REFERENCE.md#mcp-resources) — 12 `iso27001://` URIs, formats, example prompts
- [Architecture](docs/REFERENCE.md#architecture) — 7-step security pipeline, database schema, seed data
- [Modes](docs/REFERENCE.md#modes) — local / CI / team / hosted with SSE endpoint reference
- [Sample Outputs](docs/REFERENCE.md#sample-outputs) — 9 auditor-ready example files for Acme Financial Services Ltd
- [Integrations](docs/REFERENCE.md#integrations) — Jira and GitHub issue linking
- [Development](docs/REFERENCE.md#development) — build, test, typecheck, project structure
- [Security](docs/REFERENCE.md#security) — API key storage, encryption, audit trail, production checklist

---

## Community

[Discussed on r/mcp](https://www.reddit.com/r/mcp/comments/1u2mid8/built_an_isms_iso_27001_mcp_server_looking_for/) · 15K views · 28 upvotes

> "Ace dude! I've used your GRC skills, and I'm a fan of the work. Keep it up!!"
> — [asachs01](https://www.reddit.com/r/mcp/comments/1u2mid8/comment/), r/mcp

> "Compliance tools are different from most MCP servers because every write needs to be traceable … the 'human in the loop' isn't just a nice-to-have, it's often a regulatory requirement."
> — [NovaAgent2026](https://www.reddit.com/r/mcp/comments/1u2mid8/comment/), r/mcp *(audit trail HMAC chain and HITL confirmation gates shipped in v0.9.4–v0.9.6)*

---

## Author

**Hemant Naik** · [LinkedIn](https://www.linkedin.com/in/tanaji-naik/) · [hemant.naik@gmail.com](mailto:hemant.naik@gmail.com) · Built April 2026

---

## License

MIT © 2026

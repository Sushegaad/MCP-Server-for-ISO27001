# Data Flow — What Data Leaves the Machine?

> **Short answer:** In stdio mode — nothing. In SSE mode — only the tool inputs and outputs you explicitly send to it over the network you control. No telemetry. No analytics. No third-party calls unless you configure an integration.

## Data at Rest

| Data | Location | Encryption | Who can access |
|------|----------|-----------|----------------|
| ISMS database (policies, risks, evidence, gap assessments) | `DB_PATH` (default: `./isms.db`) | AES-256 (`better-sqlite3-multiple-ciphers`) | Anyone with DB_ENCRYPTION_KEY and the file |
| API key hashes | Inside `isms.db` | AES-256 (inherited) | As above — raw keys are never stored |
| Audit log (SQLite table) | Inside `isms.db` | AES-256 (inherited) | As above |
| Audit log (JSONL flat file) | `AUDIT_LOG_PATH` (default: `./audit.jsonl`) | None — plaintext on disk | OS file permissions only |
| Policy / procedure templates | `dist/seed/` (install directory) | None — read-only at runtime | OS file permissions |

**Operator responsibility:** Protect `DB_ENCRYPTION_KEY` and `HMAC_SECRET` using a secrets manager. Protect `AUDIT_LOG_PATH` using OS permissions (chmod 600 or equivalent). The server never writes raw key material to disk.

## Data in Transit — stdio Mode

```
Claude Desktop <──stdin/stdout──> iso27001-mcp
```

Tool inputs (params) and outputs (results) travel over the stdin/stdout pipe. This pipe stays entirely within the operating system's process boundary. No network interfaces are involved. No ports are opened. No DNS lookups are made.

The `MCP_API_KEY` environment variable is process-local — it is read at startup and held in memory; it is never written to a log, a file, or a network connection.

## Data in Transit — SSE Mode

```
Claude ──HTTPS──> [TLS proxy] ──HTTP──> iso27001-mcp (port SSE_PORT)
```

Tool inputs (params) and tool outputs (results) travel over the SSE/HTTP connection between Claude and the server. The operator is responsible for TLS termination at the reverse proxy. The server itself speaks plain HTTP on `SSE_PORT`.

**What travels over the wire:**
- Tool name and parameters (sanitised before handler; content > 200 chars redacted in audit log)
- Tool results (structured JSON from the MCP SDK)
- Session token (`iso27001_sess_<UUID>`) — opaque; maps to `keyHash` in-memory; no raw key material

**What never travels over the wire:**
- `DB_ENCRYPTION_KEY` — process-local only
- `HMAC_SECRET` — process-local only
- Raw API keys — printed once to stdout at generation time; never retransmitted
- Full policy / procedure content in the audit log — redacted to `[CONTENT_REDACTED]` for content > 200 characters

## Third-Party Integrations (Opt-In Only)

The server makes no outbound connections unless an operator explicitly calls one of the two integration tools.

| Integration | Tool | Data sent | Destination | Triggered by |
|-------------|------|-----------|-------------|--------------|
| Jira | `link_jira_ticket` | Evidence ID, control ID, ticket ID | Operator's Jira instance (`JIRA_BASE_URL`) | Explicit tool call only |
| GitHub | `link_github_issue` | Evidence ID, control ID, issue number | Operator's GitHub repo (`GITHUB_REPO`) | Explicit tool call only |

No data is sent to Atlassian or GitHub unless `link_jira_ticket` or `link_github_issue` is explicitly called and the integration env vars are configured. If the env vars are absent, both tools return an `INTEGRATION_ERROR`.

## Telemetry and Analytics

**There is none.** iso27001-mcp contains:

- No telemetry SDK
- No analytics endpoint
- No crash reporting
- No phone-home mechanism
- No automatic update checker

This can be verified by inspecting the 4 runtime dependencies (`@modelcontextprotocol/sdk`, `better-sqlite3-multiple-ciphers`, `mustache`, `zod`) and the source code in `src/`.

## Auditor Statement

> iso27001-mcp does not collect, transmit, or store personal data on behalf of any third party. All ISMS data remains on infrastructure controlled by the operator. The server contains no telemetry, no analytics, no third-party tracking, and no automatic update mechanism. Tool inputs and outputs remain within the trust boundary defined by the operator's deployment (local process in stdio mode; operator's network in SSE mode). No data is sent to the package author or to Anthropic as a result of running this server.

This statement can be verified by auditing the published npm package against the source code using the provenance attestation: `npm audit signatures iso27001-mcp`.

## Data Retention

iso27001-mcp imposes no retention limits on ISMS data. Retention is entirely at the operator's discretion. For ISO 27001 certification purposes, operators should define and document a data retention policy — a minimum of 3 years for ISMS records and 7 years for audit logs is common in regulated industries.

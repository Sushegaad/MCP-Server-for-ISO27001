# Threat Model — iso27001-mcp

> Last updated: 2026-05-24 | Version: 0.8.2 | Methodology: STRIDE

## 1. Scope and Methodology

This threat model applies STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) to the iso27001-mcp server runtime. The analysis covers both transport modes:

- **stdio mode** — single-user local deployment; Claude Desktop communicates over stdin/stdout
- **SSE mode** — team or hosted deployment; Claude communicates over HTTP/SSE with `Authorization: Bearer <key>`

Threat actors considered in this model:

- **Malicious local user** — a user on the same machine who can read environment variables, file system paths, or process memory
- **Network attacker** — a passive or active attacker with access to the network path between Claude and the SSE endpoint
- **Compromised dependency** — a transitive npm package that executes code at install time or runtime
- **Prompt-injecting LLM input** — adversarial content embedded in ISMS records (policies, evidence, risk descriptions) that attempts to redirect Claude's behaviour via tool outputs

This threat model does not cover vulnerabilities in the Claude LLM itself, the Claude Desktop application, or the host operating system.

## 2. Asset Inventory

| Asset | Confidentiality | Integrity | Availability | Loss Impact |
|-------|----------------|-----------|--------------|-------------|
| `isms.db` (AES-256 SQLite) | High | High | High | Full ISMS data loss; compliance records gone |
| `DB_ENCRYPTION_KEY` | Critical | — | — | Anyone with `isms.db` can decrypt it |
| `HMAC_SECRET` | Critical | — | — | Forged API keys; forged audit entries |
| API keys (raw, print-once) | High | — | — | Tool access at that role level |
| Audit log (SQLite + JSONL) | Medium | Critical | Medium | Tampered = false compliance record |
| ISMS data (policies, risks, evidence) | High | High | Medium | Org's security posture exposed |
| SSE session tokens (in-memory) | High | — | — | Session hijacking if intercepted |

## 3. Trust Boundaries

The following trust boundaries govern data flows and privilege decisions:

- **Claude LLM ↔ MCP server:** Claude controls the content of tool input parameters. The server cannot trust that params are benign — they may contain adversarial content (prompt injection) or malformed data. Every param passes through `sanitiseParams()` at Step 5 of the security pipeline before reaching the handler.

- **stdio transport:** The OS process boundary is the trust boundary. No network interfaces are involved. A process-level attacker (running as the same user) can read environment variables. Operators must protect `DB_ENCRYPTION_KEY` and `HMAC_SECRET` using OS-level secrets management (macOS Keychain, systemd credentials, etc.).

- **SSE transport:** The HTTP network boundary is the trust boundary. The `/sse` endpoint requires `Authorization: Bearer <key>` on every connection. There is no environment variable fallback — `MCP_API_KEY` is accepted on stdio only and is explicitly rejected at the SSE endpoint. Session tokens (`iso27001_sess_<UUID>`) are opaque, in-memory, and expire after `SESSION_TTL_HOURS`.

- **RBAC layer:** The viewer < analyst < admin hierarchy is enforced by `assertPermission()` at Step 4, before any handler executes. A key cannot escalate its own role — role assignment is fixed at key-generation time and stored as a HMAC-derived hash. Unknown tool names default to requiring `admin` (fail-safe default).

- **Audit log:** The server is the sole writer to the `audit_log` table and the JSONL file. The HMAC chain (`prev_hash` linking) makes post-write tampering detectable by any party holding `HMAC_SECRET`. The server does not trust its own past audit records for access control decisions.

## 4. STRIDE Threat Enumeration

### Spoofing

**Threat: Stolen raw API key used to impersonate a legitimate caller**

An attacker who obtains a raw API key can authenticate as the key's role until the key is revoked or expires.

Mitigations in place:
- Raw keys are never stored server-side. Only `HMAC-SHA256(HMAC_SECRET, rawKey)` is stored in `isms.db`.
- Key validation uses a timing-safe comparison (`validateKey()`) to prevent timing-based key enumeration.
- `warnAdminExpiry()` logs a prominent warning at server startup if any admin key has no expiry date set.
- Raw keys are printed exactly once to stdout at generation time and are never retransmitted by the server.

Operator responsibilities:
- Use `--expires` on all API keys, especially admin keys.
- Store raw keys in a secrets manager (1Password, Bitwarden, AWS Secrets Manager, etc.).
- Rotate compromised keys immediately using `revoke_api_key`.

---

### Tampering

**Threat 1: Direct SQLite row edit to remove or modify audit entries**

An attacker with filesystem access to `isms.db` might attempt to edit, delete, or reorder `audit_log` rows to conceal activity.

Mitigations in place:
- Every row carries a `row_hash` computed as `HMAC-SHA256(HMAC_SECRET, joined_fields)` over all 10 fields.
- Every row carries `prev_hash`, which is the `row_hash` of the preceding row (or `"GENESIS"` for the first row).
- `verifyRowHash()` and `verifyChain()` detect any edit, gap, insertion, or reordering in the chain.
- The JSONL flat file provides a second independent copy of each record.

Operator responsibilities:
- Offload the JSONL file to immutable storage (S3 Object Lock in Compliance mode, WORM appliance, Splunk) for legally defensible retention.
- Protect `HMAC_SECRET` so that independent chain verification remains possible.

**Threat 2: Redirect `AUDIT_LOG_PATH` to a sensitive system path (e.g., `/etc/cron.d/`)**

A misconfigured or maliciously set `AUDIT_LOG_PATH` could cause the server to write JSONL content to a privileged path, potentially enabling privilege escalation.

Mitigations in place:
- `resolveAuditLogPath()` rejects any path beginning with `/etc/`, `/proc/`, `/sys/`, or `/dev/`.
- Only `.jsonl` and `.log` file extensions are permitted.

---

### Repudiation

**Threat: A user claims they did not make a particular tool call**

Without tamper-evident records, a user could deny having called a destructive tool (e.g., deleting a risk record, approving a non-conformity closure).

Mitigations in place:
- Every tool invocation — including successful calls, access-denied rejections, and errored calls — writes a record to `audit_log` containing: `key_hash`, `role`, `tool`, `timestamp`, `params_json` (sanitised), `outcome`, and `duration_ms`.
- The HMAC chain makes the record set tamper-evident.
- The `key_hash` uniquely identifies which API key was used; combined with key labels (human-readable names assigned at creation), this ties the action to a specific person.

Operator responsibilities:
- Retain the JSONL file and protect `HMAC_SECRET` so that chain verification can be performed independently.
- Document a key-to-person mapping (maintained outside the ISMS database) for non-repudiation purposes.

---

### Information Disclosure

**Threat 1: Policy or risk content returned in tool results captured by a prompt-injecting adversary**

If an attacker can influence ISMS data (e.g., by inserting adversarial content into a policy record) and then cause another tool call to retrieve and act on that data, sensitive content could leak or be misused.

Mitigations in place:
- `sanitiseParams()` at Step 5 strips known injection patterns before params reach the handler.
- `buildParamsJson()` redacts any field whose name matches `key|secret|password|token|credential`, and truncates content longer than 200 characters to `[CONTENT_REDACTED]` in the audit log. This limits what an attacker learns by reading the audit log.

**Threat 2: CORS misconfiguration allows cross-origin credential access**

An overly permissive CORS policy could allow a malicious web page to make credentialed requests to the SSE endpoint.

Mitigations in place:
- The `CORS_ORIGIN` environment variable controls the allowed origin exactly.
- The wildcard `*` value has been explicitly removed from the codebase. The `*` wildcard is also fundamentally incompatible with `Authorization` headers under the Fetch specification — browsers unconditionally reject credentialed requests to a `*` CORS origin.
- In production, `CORS_ORIGIN` defaults to `https://claude.ai`.

**Threat 3: SSE session token interception**

A session token intercepted in transit could be replayed by an attacker.

Mitigations in place:
- Session tokens are short-lived (controlled by `SESSION_TTL_HOURS`; default 4 hours).
- Tokens are opaque UUIDs (`iso27001_sess_<UUID>`) — they carry no embedded role or permission information.
- Tokens are removed from memory when the SSE connection closes.
- TLS termination at the reverse proxy is required (`BEHIND_TLS_PROXY=true`); the server logs a warning at startup if absent.

---

### Denial of Service

**Threat: Flood of MCP tool calls exhausts server resources or API key quotas**

An attacker with a valid API key (or an automated pipeline with a bug) could issue tool calls at a rate that degrades service for other users.

Mitigations in place:
- `RATE_LIMIT_RPM` enforces a sliding-window rate limit per `key_hash`. Default: 500 RPM.
- In production SSE mode, the `/messages` endpoint is additionally rate-limited at 100 RPM per IP address.

Operator responsibilities:
- Tune `RATE_LIMIT_RPM` based on team size and acceptable throughput.
- In hosted mode, deploy an upstream WAF or load balancer with its own rate-limiting rules.

---

### Elevation of Privilege

**Threat 1: A viewer-role key calling admin-only tools**

Without strict RBAC enforcement, a low-privilege key might access tools that modify ISMS data or read audit records.

Mitigations in place:
- `assertPermission(role, toolName)` is invoked at Step 4 of the pipeline, before any handler executes.
- The permission check is fail-safe: unknown tool names require `admin` role.
- RBAC is enforced in the server; there is no client-side or parameter-based role override.

**Threat 2: SQL injection via tool parameters**

Unsanitised parameters passed to SQL queries could allow a caller to read, modify, or delete arbitrary database rows.

Mitigations in place:
- All database queries use parameterised statements throughout the codebase — no string interpolation into SQL.
- `sanitiseParams()` at Step 5 additionally strips injection patterns before params reach the handler.

**Threat 3: Malicious npm package executes at install time**

A compromised or typosquatted dependency with a `postinstall` script could execute arbitrary code when `npm install` is run.

Mitigations in place:
- iso27001-mcp has only 4 runtime dependencies (all well-established packages).
- The package has no `postinstall` script.
- npm provenance attestation links the published package to the exact GitHub Actions workflow and source commit.
- Socket.dev scans every published version for install scripts, obfuscation, and AI-detected malicious patterns.
- `npm run verify-checksums` verifies seed file integrity in CI before every publish.

## 5. Prompt Injection (MCP-Specific)

Prompt injection is a threat specific to LLM-integrated tools. The attack works as follows: an adversary inserts instructions into data that will be retrieved and returned by a tool call (e.g., a policy record, a risk description, or an evidence note). When Claude processes the tool output, the embedded instructions may redirect its behaviour — causing it to call other tools, exfiltrate data, or take actions the user did not intend.

In iso27001-mcp, the attack surface is any ISMS record that contains free-text fields (policy content, risk descriptions, evidence notes, gap assessment comments). If an attacker can write to these fields (via a compromised analyst key or a social engineering attack), they could embed adversarial instructions that trigger harmful behaviour when the records are subsequently retrieved and displayed.

Mitigations in place:
- `sanitiseParams()` at Step 5 strips known injection patterns from tool inputs before the handler processes them.
- `buildParamsJson()` truncates content fields longer than 200 characters, limiting the payload size that can be embedded in a single tool call's audit record.

Operator responsibilities:
- Treat all tool output as untrusted when chaining tool calls in automated pipelines. Do not pass tool output directly into subsequent tool inputs without human review.
- Review ISMS record content periodically, especially free-text fields, for anomalous content.
- Restrict `analyst` and `admin` key issuance to trusted personnel.

## 6. Mitigations Summary Table

| Threat | Category | Severity | Status |
|--------|----------|----------|--------|
| Stolen API key | Spoofing | High | ✅ In place — HMAC-only storage, timing-safe compare |
| Audit log row edit | Tampering | Critical | ✅ In place — HMAC chain with `prev_hash` |
| AUDIT_LOG_PATH path traversal | Tampering | High | ✅ In place — `resolveAuditLogPath()` validation |
| Repudiation of tool calls | Repudiation | High | ✅ In place — tamper-evident audit log |
| Policy content leakage | Information Disclosure | High | ✅ In place — `buildParamsJson()` redaction |
| CORS wildcard exposure | Information Disclosure | Medium | ✅ Fixed in v0.8.2 — `CORS_ORIGIN` env var |
| Rate-limit bypass | DoS | Medium | ✅ In place — per-`key_hash` sliding window |
| RBAC privilege escalation | EoP | Critical | ✅ In place — `assertPermission()` at Step 4 |
| SQL injection | EoP | High | ✅ In place — parameterised queries |
| Prompt injection via tool input | EoP / Info Disc | Medium | ✅ In place — `sanitiseParams()` at Step 5 |
| Supply chain compromise | EoP | High | ✅ In place — provenance, checksums, Socket.dev |
| MCP_API_KEY in SSE env | Spoofing | Medium | ✅ Fixed in v0.8.2 — env fallback removed from SSE |
| Unencrypted DB at rest | Info Disclosure | Critical | ✅ In place — AES-256 via `better-sqlite3-multiple-ciphers` |
| Admin key with no expiry | Spoofing | Medium | ⚠️ Operator responsibility — `warnAdminExpiry()` warns at startup |
| Audit log not offloaded | Tampering | High | ⚠️ Operator responsibility — configure SIEM/S3 offload |
| TLS not terminated upstream | Info Disclosure | Critical | ⚠️ Operator responsibility — `BEHIND_TLS_PROXY=true` required |

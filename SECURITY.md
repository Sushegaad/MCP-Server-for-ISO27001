# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (npm) | ✅ |
| all older | ❌ |

Only the current npm release receives security fixes. Always upgrade to the latest version before reporting.

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Use **[GitHub private vulnerability reporting](https://github.com/Sushegaad/MCP-Server-for-ISO27001/security/advisories/new)** (preferred) or email the maintainer directly (address available on the [npm package page](https://npmjs.com/package/iso27001-mcp)).

### Response SLA

| Severity | Acknowledge | Triage | Patch / Advisory |
|----------|-------------|--------|-----------------|
| Critical | 24 hours | 48 hours | 14 days |
| High | 48 hours | 5 business days | 30 days |
| Medium / Low | 48 hours | 5 business days | 90 days |

## Scope

### In Scope

- Authentication bypass (API key validation, session token handling)
- Cryptographic weakness (HMAC key management, AES-256 SQLite encryption)
- Audit log tampering or chain-break bypasses
- RBAC privilege escalation (viewer → analyst, analyst → admin)
- Remote code execution via MCP tool input
- SSE transport security (CORS, Bearer token handling, session fixation)
- Supply chain issues in this package's own code or direct dependencies
- Path traversal in `AUDIT_LOG_PATH` or `DB_PATH`

### Out of Scope

- Vulnerabilities in the Claude LLM or Claude Desktop application
- Vulnerabilities in the host operating system or infrastructure
- Issues already reported upstream to a dependency maintainer
- Theoretical vulnerabilities without a proof-of-concept
- Social engineering of maintainers

## Security Documentation

Full trust-center documentation is available in [`docs/security/`](https://github.com/Sushegaad/MCP-Server-for-ISO27001/tree/main/docs/security/):

| Document | Contents |
|----------|----------|
| [Threat Model](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/threat-model.md) | STRIDE analysis, asset inventory, trust boundaries |
| [Hardening Guide](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/hardening-guide.md) | Local / team / hosted deployment checklists |
| [Data Flow](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/data-flow.md) | What data leaves the machine (answer: nothing by default) |
| [Supply Chain](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/supply-chain.md) | SBOM, provenance, checksum verification, reproducible build |
| [Audit Log Integrity](https://github.com/Sushegaad/MCP-Server-for-ISO27001/blob/main/docs/security/audit-log-integrity.md) | HMAC-SHA256 chain spec, tamper detection, verification scripts |

## Disclosure Policy

This project follows a coordinated disclosure model. Once a fix is ready, a GitHub Security Advisory will be published and the npm package updated. Credit will be given to the reporter unless anonymity is requested.

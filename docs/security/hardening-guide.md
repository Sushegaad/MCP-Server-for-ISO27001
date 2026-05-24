# Hardening Guide — iso27001-mcp

> This guide covers three deployment modes. Read only the section that matches your use case.

## Mode 1: Local (stdio, single user)

**How to start:** `iso27001-mcp` with no `--mode` flag (stdio is the default).

**Trust boundary:** The OS process boundary. No network sockets are opened. No ports are bound. The Claude Desktop application communicates with iso27001-mcp over stdin/stdout.

### Required configuration

| Variable | Example | Notes |
|----------|---------|-------|
| `DB_ENCRYPTION_KEY` | `$(openssl rand -hex 32)` | Store in `~/.zshrc` or macOS Keychain; never commit |
| `HMAC_SECRET` | `$(openssl rand -hex 32)` | Different value from `DB_ENCRYPTION_KEY` |
| `MCP_API_KEY` | output of `iso27001-mcp keygen` | Required for stdio auth |

### Recommended

- Store `isms.db` in `~/.iso27001/isms.db` (survives package upgrades).
- Use `--expires 90d` even for personal admin keys — limits blast radius if your machine is compromised.
- Set `AUDIT_LOG_PATH=~/.iso27001/audit.jsonl` so audit records persist across reinstalls.

### Not needed in local mode

`CORS_ORIGIN`, `BEHIND_TLS_PROXY`, `SSE_PORT`, `RATE_LIMIT_RPM`, `SESSION_TTL_HOURS` — none of these apply when the MCP transport is stdio.

---

## Mode 2: Team (SSE, LAN)

**How to start:** `iso27001-mcp --mode team`

**Trust boundary:** HTTP on a private network. All clients must present `Authorization: Bearer <key>` at the `/sse` endpoint. The raw key is validated once and discarded; a session token is used for all subsequent `/messages` requests.

### Required configuration

Everything in Mode 1, plus:

| Variable | Example | Notes |
|----------|---------|-------|
| `CORS_ORIGIN` | `http://192.168.1.50:3000` | The exact origin your Claude Desktop connects from |
| `BEHIND_TLS_PROXY` | `true` | Required even on LAN if any traffic crosses a router |
| `SSE_PORT` | `3001` | Change from default if port 3000 is in use |

### TLS setup

Always run a TLS-terminating reverse proxy in front of `SSE_PORT`. The server logs a prominent warning at startup if `BEHIND_TLS_PROXY` is not `true` in production.

**nginx example:**
```nginx
server {
    listen 443 ssl;
    server_name isms.internal.example.com;

    ssl_certificate     /etc/letsencrypt/live/isms.internal.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/isms.internal.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_read_timeout 3600s;
    }
}
```

**Caddy example:**
```
isms.internal.example.com {
    reverse_proxy localhost:3001
}
```

### Key management for teams

- Issue **one API key per user** — never share keys between people.
- Use the `analyst` role for most users; `admin` only for the ISMS manager.
- Set `--expires 90d` on analyst keys; `--expires 30d` on admin keys.
- **Key rotation runbook:**
  1. Generate a new key: ask Claude to call `generate_key` or run `iso27001-mcp keygen --label alice-q2-2026 --role analyst --expires 90d`
  2. Distribute the new key to the user via your secrets manager (1Password, Bitwarden, etc.)
  3. Revoke the old key: ask Claude to call `revoke_api_key` with the old label
  4. Confirm the old key is rejected: test with a tool call — it should return `AUTH_REVOKED`

### Recommended

- `RATE_LIMIT_RPM=60` — tune based on team size.
- `SESSION_TTL_HOURS=8` — workday-length sessions.
- Point `AUDIT_LOG_PATH` to a network share visible to the ISMS manager.

---

## Mode 3: Hosted (SSE, internet-facing)

**How to start:** `iso27001-mcp --mode hosted`

This mode is for organisations running iso27001-mcp as a shared service accessible over the public internet. Every item on this checklist is required.

### Full production checklist

```
Infrastructure
[ ] TLS certificate on reverse proxy (Let's Encrypt, AWS ACM, etc.)
[ ] Reverse proxy terminates TLS before traffic reaches SSE_PORT
[ ] Health check at /health wired to load balancer

Environment
[ ] NODE_ENV=production
[ ] BEHIND_TLS_PROXY=true
[ ] CORS_ORIGIN=https://claude.ai  (no wildcard — ever)
[ ] DB_ENCRYPTION_KEY stored in secrets manager (AWS Secrets Manager, HashiCorp Vault)
[ ] HMAC_SECRET stored in secrets manager
[ ] RATE_LIMIT_RPM=30 or lower
[ ] SESSION_TTL_HOURS=4
[ ] AUDIT_LOG_PATH pointed to SIEM-ingested volume or S3-mounted path

API Keys
[ ] --expires on ALL keys; admin: max 30d, analyst: max 90d, viewer: max 365d
[ ] No shared keys — one key per user
[ ] Quarterly key rotation minimum; monthly for admin keys
[ ] Admin keys stored in secrets manager, not in .env files

Data
[ ] isms.db backed up daily to encrypted offsite storage
[ ] Backup restore tested monthly
[ ] JSONL audit log offloaded to immutable storage (S3 Object Lock, WORM, Splunk)
[ ] Audit log retention policy documented (recommend 7 years for ISO 27001)

Monitoring
[ ] Alert on 401/403 spike (brute force indicator)
[ ] Alert on RATE_LIMITED outcome in audit log (sustained abuse)
[ ] Alert on audit log write failures (disk full, path changed)
[ ] Regular review of query_audit_log output (weekly minimum)

Incident Response
[ ] Know how to revoke a compromised key (revoke_api_key tool or CLI)
[ ] Know how to rotate HMAC_SECRET (requires re-keying all API keys)
[ ] Incident response procedure documented and tested
```

### Key expiry policy

| Role | Max expiry | Rationale |
|------|-----------|-----------|
| `admin` | 30 days | Can modify policies, create audits, access audit log |
| `analyst` | 90 days | Can create risks, update gap assessments |
| `viewer` | 365 days | Read-only; lower blast radius |

### Secrets management

Never store `DB_ENCRYPTION_KEY` or `HMAC_SECRET` in:
- `.env` files committed to version control
- Environment variables set in a Dockerfile
- CI/CD secrets that are also accessible to pull requests

Use: AWS Secrets Manager, HashiCorp Vault, Azure Key Vault, or 1Password Secrets Automation.

### Rotating HMAC_SECRET

Rotating `HMAC_SECRET` invalidates all existing API keys (their stored hashes will no longer match). Procedure:
1. Generate a new `HMAC_SECRET` value.
2. Stop the server.
3. Update the secret in your secrets manager.
4. Restart the server.
5. Revoke all existing keys and issue new ones (`iso27001-mcp keygen` for each user).
6. Distribute new keys via your secrets manager.

### Incident: compromised API key

1. Identify the key by its `label` (check the audit log for recent activity).
2. Revoke immediately: ask Claude to call `revoke_api_key` with the label, or run `iso27001-mcp revoke --label <label>`.
3. Review audit log for all tool calls made by that key in the past 30 days.
4. Issue a new key to the legitimate user.
5. If the scope of access was admin, consider rotating `HMAC_SECRET` (see above).

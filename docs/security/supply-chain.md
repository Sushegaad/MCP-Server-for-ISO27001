# Supply Chain Security

## Runtime Dependency Inventory

iso27001-mcp ships with **4 runtime dependencies**. This is a deliberate design constraint — every dep was chosen for stability, auditability, and minimal transitive dep tree.

| Package | Version | Purpose | Trust basis |
|---------|---------|---------|------------|
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP protocol implementation | Anthropic-maintained; same org as Claude |
| `better-sqlite3-multiple-ciphers` | 12.9.0 | AES-256 encrypted SQLite | SQLCipher/sqleet backend; fork of `better-sqlite3` (widely used) |
| `mustache` | 4.2.0 | Policy and procedure template rendering | Zero dependencies; 15+ years of production use; 300M+ weekly downloads |
| `zod` | 3.25.76 | Input schema validation | Industry-standard TypeScript validation library |

**Optional (SSE mode only):** `express@4.22.1`, `express-rate-limit@7.5.1`

### Note on `fast-uri` override

`package.json` pins `fast-uri >= 3.1.2` via `overrides` to resolve a transitive vulnerability in an older version pulled in by a transitive chain. This is visible in `npm audit` output and is addressed by the override.

### No `postinstall` script

iso27001-mcp has **no `postinstall` script**. Malicious postinstall scripts are a primary supply chain attack vector (e.g., the `event-stream` attack, `node-ipc` incident). Verifiable: `cat node_modules/iso27001-mcp/package.json | grep postinstall` returns nothing.

## npm Provenance Attestation

Every release from v0.8.0 onwards is published with npm provenance attestation via Sigstore.

**What this means:** The published package on npm is cryptographically linked to the exact GitHub Actions workflow run that produced it, the exact commit SHA, and the exact source repository. Any package that differs from the source cannot pass provenance verification.

**How to verify:**
```bash
npm audit signatures iso27001-mcp
```

Expected output:
```
audited 1 package
1 package has a verified registry signature
1 package has a verified attestation
```

The attestation is stored on Sigstore's public Rekor transparency log and can be independently inspected.

**How provenance is generated:**

The `release.yml` GitHub Actions workflow uses:
```yaml
permissions:
  id-token: write      # OIDC token for Sigstore
  attestations: write  # store the provenance attestation

- run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Socket.dev Scan

[![Socket Badge](https://badge.socket.dev/npm/package/iso27001-mcp/0.8.2)](https://socket.dev/npm/package/iso27001-mcp/overview/0.8.2)

Every published version is scanned by [Socket.dev](https://socket.dev), which detects: install scripts, dependency confusion, typosquatting, obfuscated code, and AI-detected malicious patterns.

**Suppressions in `.github/socket.yml`:**

Two findings are suppressed as false positives:

1. `possible-credentials-in-code` — `generateKey()` in `src/auth/api-key.ts` intentionally prints the raw API key once to stdout so the operator can capture it at key-creation time. This is the same pattern used by `ssh-keygen`, `npm token create`, and similar CLI tools. The raw key is never stored server-side.

2. `gptSecurity` — The AI scanner saw `rawKey` as a variable name and flagged it. The variable is used only in `validateKey(rawKey)` and then goes out of scope. It is never logged or persisted.

## Seed File Checksum Verification

All files in `src/seed/` (policy templates, procedure templates, evidence templates, Mustache partials) have SHA-256 checksums recorded at release time.

```bash
# Verify checksums (also runs in CI before every publish)
npm run verify-checksums

# Regenerate checksums (maintainer only, after updating seed files)
npm run generate-checksums
```

The checksum verification runs automatically in both `ci.yml` (on every push) and `release.yml` (before publish). A failed verification blocks the release.

## Generating an SBOM

```bash
# CycloneDX format (recommended for most tools)
npm sbom --sbom-format cyclonedx --package-lock-only > sbom.json

# SPDX format
npm sbom --sbom-format spdx --package-lock-only > sbom.spdx.json
```

Both commands include `devDependencies`. For a production SBOM scoped to runtime deps only, add `--omit dev`.

## Reproducible Build

The release build can be reproduced from source:

```bash
# 1. Clone the exact release tag
git clone https://github.com/Sushegaad/MCP-Server-for-ISO27001.git
git checkout v0.8.2  # substitute the version you want to verify

# 2. Install dependencies from lockfile (no package resolution)
npm ci

# 3. Build (typecheck -> bundle -> copy templates)
npm run build

# 4. Compare against the published tarball
npm pack iso27001-mcp@0.8.2
# Extract both archives and diff the dist/ directories
```

**Pinned toolchain:** Node.js version is pinned via `volta.node` in `package.json` (currently `20.11.0`). Install Volta to get the exact same Node version: `curl https://get.volta.sh | bash`.

## CI Security Gates

Every commit to `main` and `develop`, and every pull request to `main`, runs:

| Check | Command | Blocks release if failing |
|-------|---------|--------------------------|
| TypeScript typecheck | `npx tsc --noEmit` | ✅ |
| ESLint (zero warnings) | `npx eslint src/ --max-warnings 0` | ✅ |
| Seed checksum verification | `npm run verify-checksums` | ✅ |
| Full test suite (470 tests) | `npx vitest run` | ✅ |
| npm security audit | `npm audit --audit-level=high` | ✅ |

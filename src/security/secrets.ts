/**
 * iso27001-mcp — Environment variable management
 *
 * requireEnv()    — read a single required env var; throw clearly if absent
 * loadSecrets()   — validate all required env vars at startup; fail fast
 *                   with a consolidated error list if any are missing
 */

// ── Required env vars ─────────────────────────────────────────

const REQUIRED_VARS = ["DB_ENCRYPTION_KEY", "HMAC_SECRET"] as const;

/**
 * Both secrets must be 64 hex chars (32 bytes). This is enforced at startup —
 * not just in `doctor` — so a copied-but-unedited .env.example placeholder
 * (e.g. "replace_with_32_byte_hex") or a trivially short value can never
 * become a live HMAC or database encryption key.
 */
const HEX_64 = /^[0-9a-f]{64}$/i;

// ── Optional env vars with defaults ──────────────────────────

export const ENV_DEFAULTS = {
  DB_PATH:           "./isms.db",
  AUDIT_LOG_PATH:    "./audit.jsonl",
  RATE_LIMIT_RPM:    "500",
  SESSION_TTL_HOURS: "4",
} as const;

// ── requireEnv ────────────────────────────────────────────────

/**
 * Read a required environment variable.
 * Throws a clear, actionable error immediately if the variable is absent.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Copy .env.example to .env and set the required variables.`,
    );
  }
  return value;
}

// ── getEnv ────────────────────────────────────────────────────

/**
 * Read an optional environment variable, returning a default if absent.
 */
export function getEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

// ── loadSecrets ───────────────────────────────────────────────

/**
 * Validate all required environment variables at server startup.
 * Collects ALL missing vars before throwing so the operator sees
 * the complete list in one shot rather than fixing one at a time.
 */
export function loadSecrets(): void {
  const missing: string[] = [];
  const malformed: string[] = [];

  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (!value) {
      missing.push(name);
    } else if (!HEX_64.test(value)) {
      malformed.push(name);
    }
  }

  if (missing.length > 0 || malformed.length > 0) {
    const lines: string[] = [];
    if (missing.length > 0) {
      lines.push(
        "missing required environment variables:",
        ...missing.map((n) => `  • ${n}`),
      );
    }
    if (malformed.length > 0) {
      lines.push(
        "environment variables that must be exactly 64 hex characters (generate with: openssl rand -hex 32):",
        ...malformed.map((n) => `  • ${n}`),
      );
    }
    throw new Error(
      `[secrets] Server cannot start — ${lines.join("\n")}\n\n` +
      `Copy .env.example to .env and set all required variables.`,
    );
  }

  // Warn if any admin key exists without an expiry (security best practice)
  // (checked at runtime in api-key.ts after DB is open — not here)

  console.error("[secrets] Required environment variables verified.");
}

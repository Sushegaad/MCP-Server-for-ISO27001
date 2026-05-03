/**
 * iso27001-mcp — API Key management
 *
 * generateKey()  — creates a prefixed key, stores HMAC hash, prints once
 * validateKey()  — timing-safe HMAC compare against stored hash
 * loadRole()     — look up role, check expiry and revocation status
 * listKeys()     — list all keys (labels + metadata, never hashes)
 * revokeKey()    — mark a key revoked by label
 * warnAdminExpiry() — startup check for admin keys with no expiry
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/connection.js";
import { requireEnv } from "../security/secrets.js";
import {
  authMissing,
  authInvalid,
  authExpired,
  authRevoked,
} from "../types/errors.js";

// ── Types ─────────────────────────────────────────────────────

export type Role = "viewer" | "analyst" | "admin";

export interface ApiKeyRecord {
  id:           string;
  key_hash:     string;
  label:        string;
  role:         Role;
  created_at:   string;
  expires_at:   string | null;
  revoked_at:   string | null;
  last_used_at: string | null;
}

export interface ApiKeyInfo {
  id:           string;
  label:        string;
  role:         Role;
  created_at:   string;
  expires_at:   string | null;
  last_used_at: string | null;
  status:       "active" | "expired" | "revoked";
}

// ── HMAC helper ───────────────────────────────────────────────

function hmacSha256(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

// ── generateKey ───────────────────────────────────────────────

/**
 * Create a new API key, store its HMAC hash, print the raw key once.
 *
 * Key format: "iso27001_" + 24 random bytes encoded as base64url
 * → e.g. "iso27001_a3FgK8mNpQrSxT1uVwY2zA4bCdEfGh" (~41 chars)
 */
export function generateKey(
  label: string,
  role: Role,
  expiresAt?: string | null,
): string {
  const db = getDb();

  // 1. Generate cryptographically random raw key
  const rawKey = "iso27001_" + randomBytes(24).toString("base64url");

  // 2. HMAC-SHA256 — this is what gets stored; raw key is discarded after printing
  const keyHash = hmacSha256(requireEnv("HMAC_SECRET"), rawKey);

  // 3. Insert into api_keys table
  db.prepare(`
    INSERT INTO api_keys (id, key_hash, label, role, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    randomUUID(),
    keyHash,
    label,
    role,
    expiresAt ?? null,
  );

  console.log("=".repeat(60));
  console.log("API Key generated (save now — NOT stored in plaintext):");
  console.log("");
  console.log("  " + rawKey);
  console.log("");
  console.log(`  Label:   ${label}`);
  console.log(`  Role:    ${role}`);
  console.log(`  Expires: ${expiresAt ?? "never"}`);
  console.log("=".repeat(60));

  return rawKey;
}

// ── validateKey ───────────────────────────────────────────────

/**
 * Validate a raw API key using timing-safe comparison.
 * Returns the key_hash on success so the caller can pass it to loadRole().
 * Throws McpError on any auth failure.
 */
export function validateKey(rawKey: string): string {
  if (!rawKey) throw authMissing();

  const secret  = requireEnv("HMAC_SECRET");
  const keyHash = hmacSha256(secret, rawKey);

  const db  = getDb();
  const row = db.prepare(
    "SELECT key_hash FROM api_keys WHERE key_hash = ? LIMIT 1",
  ).get(keyHash) as { key_hash: string } | undefined;

  if (!row) {
    // Use timingSafeEqual even though we found nothing — prevents timing oracle
    // by doing a dummy comparison to avoid early exit
    const dummyA = Buffer.alloc(32, 0);
    const dummyB = Buffer.alloc(32, 1);
    timingSafeEqual(dummyA, dummyB); // always false; just consumes time
    throw authInvalid();
  }

  const storedBuf   = Buffer.from(row.key_hash, "hex");
  const computedBuf = Buffer.from(keyHash,      "hex");

  if (
    storedBuf.length !== computedBuf.length ||
    !timingSafeEqual(storedBuf, computedBuf)
  ) {
    throw authInvalid();
  }

  return keyHash;
}

// ── loadRole ──────────────────────────────────────────────────

/**
 * Look up a key by its HMAC hash and return its role.
 * Also checks expiry and revocation.
 * Updates last_used_at as a side effect.
 */
export function loadRole(keyHash: string): Role {
  const db = getDb();

  const row = db.prepare(`
    SELECT id, role, expires_at, revoked_at FROM api_keys WHERE key_hash = ?
  `).get(keyHash) as Pick<ApiKeyRecord, "id" | "role" | "expires_at" | "revoked_at"> | undefined;

  if (!row) throw authInvalid();

  if (row.revoked_at) throw authRevoked();

  if (row.expires_at) {
    const expiry = new Date(row.expires_at);
    if (expiry < new Date()) throw authExpired();
  }

  // Update last_used_at (fire-and-forget — don't fail auth if this errors)
  try {
    db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
  } catch {
    // non-fatal
  }

  return row.role as Role;
}

// ── listKeys ──────────────────────────────────────────────────

/**
 * List all API keys with their metadata.
 * Never returns key_hash or any sensitive material.
 */
export function listKeys(): ApiKeyInfo[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT id, label, role, created_at, expires_at, revoked_at, last_used_at
    FROM api_keys
    ORDER BY created_at DESC
  `).all() as ApiKeyRecord[];

  const now = new Date();

  return rows.map((r) => {
    let status: ApiKeyInfo["status"] = "active";
    if (r.revoked_at) {
      status = "revoked";
    } else if (r.expires_at && new Date(r.expires_at) < now) {
      status = "expired";
    }
    return {
      id:           r.id,
      label:        r.label,
      role:         r.role,
      created_at:   r.created_at,
      expires_at:   r.expires_at,
      last_used_at: r.last_used_at,
      status,
    };
  });
}

// ── revokeKey ─────────────────────────────────────────────────

/**
 * Revoke an API key by label. Throws if the label is not found.
 */
export function revokeKey(label: string): void {
  const db = getDb();

  const row = db.prepare("SELECT id FROM api_keys WHERE label = ?").get(label) as
    | { id: string }
    | undefined;

  if (!row) {
    throw new Error(`API key with label '${label}' not found.`);
  }

  db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?").run(row.id);
  console.log(`[auth] Key '${label}' revoked.`);
}

// ── warnAdminExpiry ───────────────────────────────────────────

/**
 * Log a security warning for any admin key with no expiry date.
 * Called at server startup after DB is open.
 */
export function warnAdminExpiry(): void {
  const db = getDb();

  const rows = db.prepare(`
    SELECT label FROM api_keys
    WHERE role = 'admin' AND expires_at IS NULL AND revoked_at IS NULL
  `).all() as { label: string }[];

  if (rows.length > 0) {
    const labels = rows.map((r) => r.label).join(", ");
    console.warn(
      `[SECURITY] Admin keys without expiry: ${labels}. ` +
      `Consider setting --expires to limit blast radius.`,
    );
  }
}

// ── parseExpiresFlag ──────────────────────────────────────────

/**
 * Parse an --expires flag value into an ISO date string.
 * Accepts: "90d", "30d", "1y", or an ISO date "2026-12-31".
 */
export function parseExpiresFlag(value: string): string {
  // Plain ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const days = /^(\d+)d$/.exec(value);
  if (days) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(days[1], 10));
    return d.toISOString().split("T")[0];
  }

  const years = /^(\d+)y$/.exec(value);
  if (years) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + parseInt(years[1], 10));
    return d.toISOString().split("T")[0];
  }

  throw new Error(
    `Invalid --expires value: '${value}'. Use '90d', '1y', or 'YYYY-MM-DD'.`,
  );
}

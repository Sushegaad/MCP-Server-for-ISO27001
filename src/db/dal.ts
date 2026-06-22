import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { getDb } from "./connection.js";

// ── UUID ─────────────────────────────────────────────────────

/**
 * Generate a new UUID v4. Used for all entity primary keys.
 * Called in the application layer before every INSERT — never
 * via a SQL DEFAULT clause.
 */
export function newId(): string {
  return randomUUID();
}

// ── JSON helpers ─────────────────────────────────────────────

/** Serialise a value to JSON for TEXT column storage. Null-safe. */
export function toJson<T>(value: T | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

/** Parse a JSON TEXT column value. Returns null if the column is null. */
export function fromJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  return JSON.parse(value) as T;
}

/** Parse a JSON TEXT column that should be an array. Returns [] if null. */
export function fromJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  return JSON.parse(value) as T[];
}

// ── Date helpers ─────────────────────────────────────────────

/** Current UTC datetime as ISO 8601 string for updated_at columns. */
export function now(): string {
  return new Date().toISOString().replace("T", " ").split(".")[0] + "Z";
}

/** Add months to a date and return as YYYY-MM-DD string. */
export function addMonths(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

/** Today as YYYY-MM-DD string. */
export function today(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Evidence status helper ───────────────────────────────────

/** Compute evidence staleness from collected_date and expiry_date. */
export function computeEvidenceStatus(
  _collectedDate: string,
  expiryDate?: string | null,
): "current" | "stale" | "expired" {
  if (!expiryDate) return "current";

  const now = new Date();
  const expiry = new Date(expiryDate);
  const staleThreshold = new Date(expiryDate);
  staleThreshold.setDate(staleThreshold.getDate() - 30); // stale = within 30 days of expiry

  if (now > expiry) return "expired";
  if (now >= staleThreshold) return "stale";
  return "current";
}

// ── Generic query helpers ────────────────────────────────────

type Row = Record<string, unknown>;

/** Run a SELECT and return all rows typed as T. */
export function queryAll<T extends Row>(sql: string, params: unknown[] = []): T[] {
  const db = getDb();
  return db.prepare(sql).all(...params) as T[];
}

/** Run a SELECT and return the first row typed as T, or null. */
export function queryOne<T extends Row>(sql: string, params: unknown[] = []): T | null {
  const db = getDb();
  return (db.prepare(sql).get(...params) as T) ?? null;
}

/** Run an INSERT / UPDATE / DELETE. Returns the statement's RunResult. */
export function execute(
  sql: string,
  params: unknown[] = [],
): BetterSqlite3.RunResult {
  const db = getDb();
  return db.prepare(sql).run(...params);
}

/** Run multiple statements inside an explicit transaction. */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}

// ── SQL fragment constants ────────────────────────────────────

/**
 * ORDER BY fragment that sorts improvement opportunities by priority:
 * critical(0) → high(1) → medium(2) → low/everything else(3).
 * Interpolate into a template literal ORDER BY clause followed by
 * any secondary sort columns.
 */
export const PRIORITY_SORT_SQL =
  "CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";

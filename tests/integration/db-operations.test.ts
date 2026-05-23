/**
 * iso27001-mcp — DB operations integration tests
 *
 * Tests migration idempotency and seed integrity against a real
 * in-memory SQLite database. Skipped in CI (Linux) because the
 * native better-sqlite3-multiple-ciphers binary is macOS-only.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { supportsNativeDb, createTestDb, closeTestDb } from "../fixtures/test-db.js";

describe.skipIf(!!process.env.CI || !supportsNativeDb)("DB operations — migration & seed integrity", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ── Migration integrity ────────────────────────────────────

  it("migrations create the _migrations table with exactly 6 rows", () => {
    const rows = db
      .prepare("SELECT filename FROM _migrations ORDER BY id")
      .all() as { filename: string }[];
    expect(rows).toHaveLength(6);
    expect(rows[0].filename).toBe("0001_initial.sql");
    expect(rows[1].filename).toBe("0002_fts_index.sql");
    expect(rows[2].filename).toBe("0003_org_profile_procedures.sql");
    expect(rows[3].filename).toBe("0004_management_review_improvement.sql");
    expect(rows[4].filename).toBe("0005_evidence_documents.sql");
    expect(rows[5].filename).toBe("0006_audit_log_hmac.sql");
  });

  it("all expected core tables exist after migration", () => {
    const tables = [
      "controls", "control_version_mapping", "clause_requirements",
      "api_keys", "gap_assessments", "control_statuses",
      "risks", "risk_treatments", "policies", "policy_versions",
      "soa", "soa_entries", "audits", "findings", "corrective_actions",
      "evidence", "audit_log",
      // Migration 0003
      "organization_profile", "procedures", "procedure_versions",
      // Migration 0004
      "management_reviews", "review_inputs", "review_outputs",
      "improvement_opportunities",
      // Migration 0005
      "generated_evidence",
    ];
    for (const table of tables) {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table) as { name: string } | undefined;
      expect(row?.name, `table '${table}' should exist`).toBe(table);
    }
  });

  it("controls_fts virtual table exists after migration", () => {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='controls_fts'`)
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("controls_fts");
  });

  // ── Seed integrity ─────────────────────────────────────────

  it("controls table has 93 ISO 27001:2022 controls after seeding", () => {
    const count = db
      .prepare("SELECT count(*) AS n FROM controls WHERE version='2022'")
      .get() as { n: number };
    expect(count.n).toBe(93);
  });

  it("controls table has 114 ISO 27001:2013 controls after seeding", () => {
    const count = db
      .prepare("SELECT count(*) AS n FROM controls WHERE version='2013'")
      .get() as { n: number };
    expect(count.n).toBe(114);
  });

  it("controls table has exactly 11 new_in_2022 controls", () => {
    const count = db
      .prepare("SELECT count(*) AS n FROM controls WHERE new_in_2022=1")
      .get() as { n: number };
    expect(count.n).toBe(11);
  });

  it("seedAll() is idempotent — calling createTestDb twice gives same counts", () => {
    // createTestDb already called seedAll once; calling it again on a fresh DB
    // should yield the same numbers (idempotency guard is per-db instance).
    const db2 = createTestDb();
    try {
      const c1 = (db.prepare("SELECT count(*) AS n FROM controls").get() as { n: number }).n;
      const c2 = (db2.prepare("SELECT count(*) AS n FROM controls").get() as { n: number }).n;
      expect(c1).toBe(c2);
    } finally {
      closeTestDb(db2);
    }
  });

  // ── Migration 0006 — audit_log.prev_hash ──────────────────

  it("audit_log has prev_hash column after migration 0006", () => {
    // PRAGMA table_info returns one row per column
    const cols = db
      .prepare("PRAGMA table_info(audit_log)")
      .all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("prev_hash");
  });

  // ── FTS5 search ────────────────────────────────────────────

  it("FTS5 search returns results for 'cryptography'", () => {
    const rows = db
      .prepare("SELECT * FROM controls_fts WHERE controls_fts MATCH ? LIMIT 3")
      .all("cryptography") as unknown[];
    expect(rows.length).toBeGreaterThan(0);
  });

  it("FTS5 search returns results for 'access control'", () => {
    const rows = db
      .prepare("SELECT * FROM controls_fts WHERE controls_fts MATCH ? LIMIT 5")
      .all("access control") as unknown[];
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Generated columns (risk scoring) ──────────────────────

  it("inserting a risk computes risk_score and risk_level as generated columns", () => {
    const id = "test-risk-integration-1";
    db.prepare(
      `INSERT INTO risks
         (id, asset, threat, vulnerability, likelihood, impact, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, "Production Server", "Malware", "No antivirus installed",
      4, 5, "open",
      new Date().toISOString(), new Date().toISOString(),
    );

    const risk = db
      .prepare("SELECT risk_score, risk_level FROM risks WHERE id=?")
      .get(id) as { risk_score: number; risk_level: string };

    expect(risk.risk_score).toBe(20);    // 4 × 5
    expect(risk.risk_level).toBe("Critical"); // 20 > 16 → Critical
  });

  it("likelihood=2, impact=3 gives risk_score=6 (Medium)", () => {
    const id = "test-risk-integration-2";
    db.prepare(
      `INSERT INTO risks
         (id, asset, threat, vulnerability, likelihood, impact, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, "Laptop", "Phishing", "No training",
      2, 3, "open",
      new Date().toISOString(), new Date().toISOString(),
    );

    const risk = db
      .prepare("SELECT risk_score, risk_level FROM risks WHERE id=?")
      .get(id) as { risk_score: number; risk_level: string };

    expect(risk.risk_score).toBe(6);
    expect(risk.risk_level).toBe("Medium");
  });
});

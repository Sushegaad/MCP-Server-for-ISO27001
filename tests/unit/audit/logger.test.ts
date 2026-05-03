/**
 * Unit tests for src/audit/logger.ts
 *
 * Tests: verifyRowHash, buildParamsJson, writeAuditEvent
 *
 * DB and node:fs are fully mocked — no real SQLite or file I/O.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ── Module mocks (hoisted before any imports of the modules under test) ──

vi.mock("../../../src/db/connection.js", () => ({
  getDb:           () => ({ prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn() })) }),
  getUptimeSeconds: () => 0,
}));

vi.mock("node:fs", () => ({
  appendFileSync: vi.fn(),
}));

// ── Import SUT after mocks are in place ──────────────────────────────────

import {
  verifyRowHash,
  buildParamsJson,
  writeAuditEvent,
  type AuditEvent,
} from "../../../src/audit/logger.js";

// ── Test helpers ─────────────────────────────────────────────────────────

const ts = new Date().toISOString().replace("T", " ").split(".")[0] + "Z";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  const base = {
    id:            "test-id",
    timestamp:     ts,
    tool:          "get_control",
    key_hash:      "abc123",
    role:          "viewer",
    params_json:   "{}",
    outcome:       "success" as const,
    error_message: null,
    duration_ms:   5,
    row_hash:      createHash("sha256")
      .update(`${ts}|get_control|abc123|success`)
      .digest("hex"),
  };
  return { ...base, ...overrides };
}

// ── verifyRowHash ────────────────────────────────────────────────────────

describe("verifyRowHash", () => {
  it("returns true when row_hash matches fresh computation", () => {
    const event = makeEvent();
    expect(verifyRowHash(event)).toBe(true);
  });

  it("returns false when outcome field was tampered", () => {
    // row_hash was computed for outcome="error" but we present outcome="success"
    const tamperedHash = createHash("sha256")
      .update(`${ts}|get_control|abc123|error`)
      .digest("hex");
    const event = makeEvent({ outcome: "success", row_hash: tamperedHash });
    expect(verifyRowHash(event)).toBe(false);
  });

  it("returns false when tool field was tampered", () => {
    // row_hash was computed for tool="other_tool" but event says "get_control"
    const tamperedHash = createHash("sha256")
      .update(`${ts}|other_tool|abc123|success`)
      .digest("hex");
    const event = makeEvent({ tool: "get_control", row_hash: tamperedHash });
    expect(verifyRowHash(event)).toBe(false);
  });
});

// ── buildParamsJson ──────────────────────────────────────────────────────

describe("buildParamsJson", () => {
  it("redacts fields whose names contain 'key'", () => {
    const json   = buildParamsJson({ notes: "hello", key: "secret123" });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed["key"]).toBe("[REDACTED]");
    expect(parsed["notes"]).toBe("hello");
  });

  it("redacts content field when value is longer than 200 chars", () => {
    const json   = buildParamsJson({ content: "x".repeat(201) });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed["content"]).toBe("[CONTENT_REDACTED]");
  });

  it("does not redact short content fields", () => {
    const json   = buildParamsJson({ content: "short" });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed["content"]).toBe("short");
  });

  it("adds _sanitised metadata when sanitisedFields list is provided", () => {
    const json   = buildParamsJson({}, ["notes"]);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed["_sanitised"]).toBe(true);
    expect(parsed["_sanitised_fields"]).toEqual(["notes"]);
  });

  it("does not add _sanitised when sanitisedFields is empty", () => {
    const json   = buildParamsJson({ notes: "clean" }, []);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed["_sanitised"]).toBeUndefined();
  });
});

// ── writeAuditEvent ──────────────────────────────────────────────────────

describe("writeAuditEvent", () => {
  beforeEach(() => {
    process.env["AUDIT_LOG_PATH"] = "/tmp/test-audit.jsonl";
  });

  it("does not throw and returns a complete AuditEvent", () => {
    const input = {
      tool:          "get_control",
      key_hash:      "abc123",
      role:          "viewer",
      params_json:   "{}",
      outcome:       "success" as const,
      error_message: null,
      duration_ms:   10,
    };

    let result: AuditEvent | undefined;
    expect(() => {
      result = writeAuditEvent(input);
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(result!.tool).toBe("get_control");
    expect(result!.id).toBeTruthy();
    expect(result!.row_hash).toBeTruthy();
    expect(result!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/);
  });
});

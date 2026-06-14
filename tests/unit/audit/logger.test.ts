/**
 * Unit tests for src/audit/logger.ts
 *
 * Tests: verifyRowHash, buildParamsJson, writeAuditEvent
 *
 * DB and node:fs are fully mocked — no real SQLite or file I/O.
 * HMAC_SECRET is set to "test-secret" for deterministic hashing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

// ── Set HMAC_SECRET before any module loads ───────────────────────────────
process.env["HMAC_SECRET"] = "test-secret";

// ── Module mocks (hoisted before any imports of the modules under test) ──

const mockGet = vi.fn(() => undefined);  // default: no previous row
const mockRun = vi.fn();

vi.mock("../../../src/db/connection.js", () => ({
  getDb: () => ({
    prepare: vi.fn(() => ({ run: mockRun, get: mockGet })),
  }),
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

const TEST_SECRET = "test-secret";
const ts = new Date().toISOString().replace("T", " ").split(".")[0] + "Z";

/** Build the expected HMAC-SHA256 row_hash over all fields (including provenance). */
function computeHash(fields: {
  id: string;
  timestamp: string;
  tool: string;
  key_hash: string;
  role: string;
  params_json: string;
  outcome: string;
  error_message: string | null;
  duration_ms: number;
  prev_hash: string | null;
  actor_type?: "ai" | "human" | "system";
  model_id?: string | null;
}): string {
  const input = [
    fields.id,
    fields.timestamp,
    fields.tool,
    fields.key_hash,
    fields.role,
    fields.params_json,
    fields.outcome,
    fields.error_message ?? "",
    String(fields.duration_ms),
    fields.prev_hash ?? "GENESIS",
    fields.actor_type ?? "ai",
    fields.model_id   ?? "",
  ].join("|");
  return createHmac("sha256", TEST_SECRET).update(input).digest("hex");
}

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  const base: Omit<AuditEvent, "row_hash"> = {
    id:            "test-id",
    timestamp:     ts,
    tool:          "get_control",
    key_hash:      "abc123",
    role:          "viewer",
    params_json:   "{}",
    outcome:       "success",
    error_message: null,
    duration_ms:   5,
    prev_hash:     null,
    actor_type:    "ai",
    model_id:      null,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    row_hash: overrides.row_hash ?? computeHash(merged),
  };
}

// ── verifyRowHash ────────────────────────────────────────────────────────

describe("verifyRowHash", () => {
  it("returns true when row_hash matches fresh HMAC computation", () => {
    const event = makeEvent();
    expect(verifyRowHash(event)).toBe(true);
  });

  it("returns true when prev_hash is present (mid-chain row)", () => {
    const event = makeEvent({ prev_hash: "deadbeef" });
    expect(verifyRowHash(event)).toBe(true);
  });

  it("returns false when outcome field was tampered", () => {
    // row_hash was computed for outcome="error" but we present outcome="success"
    const tamperedHash = computeHash({
      id: "test-id", timestamp: ts, tool: "get_control",
      key_hash: "abc123", role: "viewer", params_json: "{}",
      outcome: "error",    // different
      error_message: null, duration_ms: 5, prev_hash: null,
    });
    const event = makeEvent({ outcome: "success", row_hash: tamperedHash });
    expect(verifyRowHash(event)).toBe(false);
  });

  it("returns false when tool field was tampered", () => {
    const tamperedHash = computeHash({
      id: "test-id", timestamp: ts, tool: "other_tool",  // different
      key_hash: "abc123", role: "viewer", params_json: "{}",
      outcome: "success", error_message: null, duration_ms: 5, prev_hash: null,
    });
    const event = makeEvent({ tool: "get_control", row_hash: tamperedHash });
    expect(verifyRowHash(event)).toBe(false);
  });

  it("returns false when prev_hash chain link was tampered", () => {
    // row_hash computed with prev_hash=null (GENESIS) but event has prev_hash="something"
    const event = makeEvent({ prev_hash: "some-other-hash" });
    // row_hash in event is correct for prev_hash=null; now we change prev_hash → mismatch
    const tamperedEvent = { ...event, prev_hash: "some-other-hash",
      row_hash: computeHash({ ...event, prev_hash: null }) };
    expect(verifyRowHash(tamperedEvent)).toBe(false);
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
    mockGet.mockReturnValue(undefined);  // no previous row (genesis)
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
    expect(result!.prev_hash).toBeNull();   // genesis row
    expect(result!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/);
  });

  it("sets prev_hash from the previous audit_log row", () => {
    const previousRowHash = "deadbeef1234";
    mockGet.mockReturnValue({ row_hash: previousRowHash });

    const result = writeAuditEvent({
      tool:          "list_controls",
      key_hash:      "abc123",
      role:          "viewer",
      params_json:   "{}",
      outcome:       "success",
      error_message: null,
      duration_ms:   8,
    });

    expect(result.prev_hash).toBe(previousRowHash);
  });

  it("produces a row_hash that passes verifyRowHash", () => {
    const result = writeAuditEvent({
      tool:          "get_control",
      key_hash:      "abc123",
      role:          "viewer",
      params_json:   "{}",
      outcome:       "success",
      error_message: null,
      duration_ms:   10,
    });

    expect(verifyRowHash(result)).toBe(true);
  });

  it("defaults actor_type to 'ai' and model_id to null when not supplied", () => {
    const result = writeAuditEvent({
      tool:          "list_controls",
      key_hash:      "abc123",
      role:          "viewer",
      params_json:   "{}",
      outcome:       "success",
      error_message: null,
      duration_ms:   3,
    });

    expect(result.actor_type).toBe("ai");
    expect(result.model_id).toBeNull();
    expect(verifyRowHash(result)).toBe(true);
  });

  it("records explicit actor_type and model_id and includes them in the hash chain", () => {
    const result = writeAuditEvent({
      tool:          "update_risk",
      key_hash:      "abc123",
      role:          "analyst",
      params_json:   "{}",
      outcome:       "success",
      error_message: null,
      duration_ms:   7,
      actor_type:    "ai",
      model_id:      "claude-sonnet-4-6",
    });

    expect(result.actor_type).toBe("ai");
    expect(result.model_id).toBe("claude-sonnet-4-6");
    // row_hash must reflect both provenance fields
    expect(verifyRowHash(result)).toBe(true);
  });

  it("records actor_type='human' when a human performs an action", () => {
    const result = writeAuditEvent({
      tool:          "complete_management_review",
      key_hash:      "abc123",
      role:          "admin",
      params_json:   "{}",
      outcome:       "success",
      error_message: null,
      duration_ms:   12,
      actor_type:    "human",
      model_id:      null,
    });

    expect(result.actor_type).toBe("human");
    expect(verifyRowHash(result)).toBe(true);
  });
});

// ── verifyRowHash provenance ─────────────────────────────────────────────

describe("verifyRowHash — provenance fields included in hash", () => {
  it("fails when actor_type is tampered after write", () => {
    // Hash was computed for actor_type="ai"; we present actor_type="human"
    const event = makeEvent({ actor_type: "ai", model_id: null });
    const tampered = { ...event, actor_type: "human" as const };
    expect(verifyRowHash(tampered)).toBe(false);
  });

  it("fails when model_id is tampered after write", () => {
    const event = makeEvent({ actor_type: "ai", model_id: "claude-sonnet-4-6" });
    const tampered = { ...event, model_id: "claude-opus-4-6" };
    expect(verifyRowHash(tampered)).toBe(false);
  });

  it("passes for a human actor with no model_id", () => {
    const event = makeEvent({ actor_type: "human", model_id: null });
    expect(verifyRowHash(event)).toBe(true);
  });
});

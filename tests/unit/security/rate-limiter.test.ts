/**
 * Unit tests for src/security/rate-limiter.ts
 *
 * Tests: checkRateLimit, resetRateLimit, clearAllRateLimits, currentWindowCount
 * No DB access required.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  resetRateLimit,
  clearAllRateLimits,
  currentWindowCount,
} from "../../../src/security/rate-limiter.js";
import { McpError } from "../../../src/types/errors.js";

beforeEach(() => {
  process.env["RATE_LIMIT_RPM"] = "5";
});

afterEach(() => {
  clearAllRateLimits();
  delete process.env["RATE_LIMIT_RPM"];
});

describe("checkRateLimit", () => {
  it("allows first 5 calls for a given key hash", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => checkRateLimit("abc")).not.toThrow();
    }
  });

  it("throws McpError with RATE_LIMITED on the 6th call", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("abc");
    }
    expect(() => checkRateLimit("abc")).toThrow(McpError);
    try {
      checkRateLimit("abc");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("RATE_LIMITED");
    }
  });

  it("allows a new call after resetRateLimit is called", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("abc");
    }
    // at limit — next call should fail
    expect(() => checkRateLimit("abc")).toThrow(McpError);

    resetRateLimit("abc");

    // window reset — should succeed
    expect(() => checkRateLimit("abc")).not.toThrow();
  });

  it("different key hashes have independent windows", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("key-one");
    }
    // key-one is at limit, key-two should still be free
    expect(() => checkRateLimit("key-one")).toThrow(McpError);
    expect(() => checkRateLimit("key-two")).not.toThrow();
  });
});

describe("currentWindowCount", () => {
  it("returns the correct count after N calls", () => {
    expect(currentWindowCount("xyz")).toBe(0);

    checkRateLimit("xyz");
    expect(currentWindowCount("xyz")).toBe(1);

    checkRateLimit("xyz");
    checkRateLimit("xyz");
    expect(currentWindowCount("xyz")).toBe(3);
  });
});

// ── getRpm fallback branches ──────────────────────────────────

describe("getRpm fallback to 500", () => {
  it("uses 500 when RATE_LIMIT_RPM is NaN (covers isNaN branch)", () => {
    process.env["RATE_LIMIT_RPM"] = "not-a-number";
    clearAllRateLimits();
    // With rpm=500, 6 calls should not throw (well below the limit)
    for (let i = 0; i < 6; i++) {
      expect(() => checkRateLimit("nan-rpm-key")).not.toThrow();
    }
  });

  it("uses 500 when RATE_LIMIT_RPM is zero (covers val<=0 branch)", () => {
    process.env["RATE_LIMIT_RPM"] = "0";
    clearAllRateLimits();
    // With rpm=500 fallback, 6 calls should not throw
    for (let i = 0; i < 6; i++) {
      expect(() => checkRateLimit("zero-rpm-key")).not.toThrow();
    }
  });
});

// ── Timestamp eviction ────────────────────────────────────────

describe("timestamp eviction after window expires", () => {
  it("evicts stale entries older than 60 s and allows new calls (covers splice branch)", () => {
    vi.useFakeTimers();
    try {
      // Make 3 calls at T=0
      for (let i = 0; i < 3; i++) checkRateLimit("evict-key");
      expect(currentWindowCount("evict-key")).toBe(3);

      // Advance past the 60-second window
      vi.advanceTimersByTime(61_000);

      // The stale entries should be evicted; this call should succeed
      expect(() => checkRateLimit("evict-key")).not.toThrow();
      // Only the one new call should be in the window
      expect(currentWindowCount("evict-key")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

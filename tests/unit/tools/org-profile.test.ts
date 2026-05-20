/**
 * Unit tests for src/tools/org-profile.ts
 *
 * Covers: handleSetOrganizationProfile, handleGetOrganizationProfile,
 *         and loadOrgProfileDefaults.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock stubs ────────────────────────────────────────────────

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => []),
  run: vi.fn(() => ({ changes: 1 })),
};

const mockDb = {
  prepare: vi.fn(() => mockStmt),
  transaction: vi.fn((fn: () => unknown) => fn),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
  getUptimeSeconds: vi.fn(() => 42),
}));

// ── SUT imports (after vi.mock) ───────────────────────────────

import {
  handleSetOrganizationProfile,
  handleGetOrganizationProfile,
  loadOrgProfileDefaults,
} from "../../../src/tools/org-profile.js";

// ── Helpers ───────────────────────────────────────────────────

function parseResult(result: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(result.content[0].text);
}

const BASE_PROFILE_ROW = {
  id:                      "00000000-0000-4000-8000-000000000001",
  legal_entity_name:       "Acme Ltd",
  registered_jurisdiction: "England & Wales",
  regulatory_licences:     '["ISO 9001","SOC 2 Type II"]',
  in_scope_activities:     "Cloud SaaS platform",
  isms_scope_statement:    "All production systems in scope",
  declared_exclusions:     null,
  raci_roles:              '{"ciso":"Alice","dpo":"Bob"}',
  review_cadence_months:   12,
  created_at:              "2025-01-01T00:00:00Z",
  updated_at:              "2025-01-01T00:00:00Z",
};

// ── handleSetOrganizationProfile ──────────────────────────────

describe("handleSetOrganizationProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
    mockStmt.run.mockReturnValue({ changes: 1 });
    // The INSERT OR REPLACE uses a sub-select for created_at — stub get() to return null
    mockStmt.get.mockReturnValue(null);
  });

  it("returns success with the upserted profile fields", () => {
    const result = handleSetOrganizationProfile({
      legal_entity_name:       "Acme Ltd",
      registered_jurisdiction: "England & Wales",
      in_scope_activities:     "Cloud SaaS platform",
      isms_scope_statement:    "All production systems in scope",
      review_cadence_months:   12,
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.legal_entity_name).toBe("Acme Ltd");
    expect(data.registered_jurisdiction).toBe("England & Wales");
    expect(data.review_cadence_months).toBe(12);
    expect(data.id).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("stores raci_roles as an empty object when not provided", () => {
    const result = handleSetOrganizationProfile({
      legal_entity_name:       "Acme Ltd",
      registered_jurisdiction: "England & Wales",
      in_scope_activities:     "Cloud platform",
      isms_scope_statement:    "All systems",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.raci_roles).toEqual({});
  });

  it("includes regulatory_licences array in the response", () => {
    const result = handleSetOrganizationProfile({
      legal_entity_name:       "Acme Ltd",
      registered_jurisdiction: "England & Wales",
      regulatory_licences:     ["SOC 2 Type II", "ISO 27001"],
      in_scope_activities:     "Cloud platform",
      isms_scope_statement:    "All systems",
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.regulatory_licences).toContain("SOC 2 Type II");
    expect(data.regulatory_licences).toContain("ISO 27001");
  });

  it("includes raci_roles object in the response when provided", () => {
    const result = handleSetOrganizationProfile({
      legal_entity_name:       "Acme Ltd",
      registered_jurisdiction: "England & Wales",
      in_scope_activities:     "Cloud platform",
      isms_scope_statement:    "All systems",
      raci_roles: { ciso: "Alice", dpo: "Bob" },
    });

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.raci_roles.ciso).toBe("Alice");
    expect(data.raci_roles.dpo).toBe("Bob");
  });

  it("calls db.prepare and stmt.run exactly once", () => {
    handleSetOrganizationProfile({
      legal_entity_name:       "Acme Ltd",
      registered_jurisdiction: "England & Wales",
      in_scope_activities:     "Cloud platform",
      isms_scope_statement:    "All systems",
    });

    expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    expect(mockStmt.run).toHaveBeenCalledTimes(1);
  });
});

// ── handleGetOrganizationProfile ──────────────────────────────

describe("handleGetOrganizationProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns { profile: null } when no profile exists", () => {
    mockStmt.get.mockReturnValue(undefined);

    const result = handleGetOrganizationProfile({});

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.profile).toBeNull();
  });

  it("returns the profile with parsed JSON fields when a row exists", () => {
    mockStmt.get.mockReturnValue(BASE_PROFILE_ROW);

    const result = handleGetOrganizationProfile({});

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.profile).not.toBeNull();
    expect(data.profile.legal_entity_name).toBe("Acme Ltd");
    expect(Array.isArray(data.profile.regulatory_licences)).toBe(true);
    expect(data.profile.regulatory_licences).toContain("ISO 9001");
    expect(typeof data.profile.raci_roles).toBe("object");
    expect(data.profile.raci_roles.ciso).toBe("Alice");
  });

  it("returns empty array for regulatory_licences when null in DB", () => {
    mockStmt.get.mockReturnValue({ ...BASE_PROFILE_ROW, regulatory_licences: null });

    const result = handleGetOrganizationProfile({});

    expect(result.isError).toBe(false);
    const data = parseResult(result);
    expect(data.profile.regulatory_licences).toEqual([]);
  });

  it("includes all expected profile fields", () => {
    mockStmt.get.mockReturnValue(BASE_PROFILE_ROW);

    const result = handleGetOrganizationProfile({});
    const data = parseResult(result);
    const p = data.profile;

    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("legal_entity_name");
    expect(p).toHaveProperty("registered_jurisdiction");
    expect(p).toHaveProperty("in_scope_activities");
    expect(p).toHaveProperty("isms_scope_statement");
    expect(p).toHaveProperty("review_cadence_months");
    expect(p).toHaveProperty("created_at");
    expect(p).toHaveProperty("updated_at");
  });
});

// ── loadOrgProfileDefaults ────────────────────────────────────

describe("loadOrgProfileDefaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
  });

  it("returns null when no profile row exists", () => {
    mockStmt.get.mockReturnValue(undefined);

    const result = loadOrgProfileDefaults(mockDb as never);

    expect(result).toBeNull();
  });

  it("returns { organisation_name, scope } mapped from the profile row", () => {
    mockStmt.get.mockReturnValue({
      legal_entity_name:    "Acme Ltd",
      isms_scope_statement: "All production systems",
    });

    const result = loadOrgProfileDefaults(mockDb as never);

    expect(result).not.toBeNull();
    expect(result!.organisation_name).toBe("Acme Ltd");
    expect(result!.scope).toBe("All production systems");
  });
});

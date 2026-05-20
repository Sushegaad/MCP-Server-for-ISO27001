/**
 * Unit tests for src/resources/org-profile.ts
 *
 * Covers: registerOrgProfileResource — static URI resource for the
 * singleton org profile. Requires viewer auth.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockStmt = {
  get: vi.fn(),
  all: vi.fn(() => []),
};
const mockDb = { prepare: vi.fn(() => mockStmt) };

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../../../src/db/dal.js", () => ({
  fromJsonArray: vi.fn((raw: string | null) =>
    raw ? (JSON.parse(raw) as unknown[]) : [],
  ),
}));

const mockAssertResourceAuth = vi.fn();
vi.mock("../../../src/resources/resource-auth.js", () => ({
  assertResourceAuth: (...args: unknown[]) => mockAssertResourceAuth(...args),
}));

// Capture server.resource() call — static URI variant (string, not ResourceTemplate)
type ReadFn = (uri: URL, extra: unknown) => Promise<unknown>;
interface Captured { name: string; uri: string; readFn: ReadFn }
const captured: Captured[] = [];

// Mock the MCP SDK (McpServer not directly used here but imported by org-profile)
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {},
}));

const mockServer = {
  resource: vi.fn((name: string, uri: string, _meta: unknown, readFn: ReadFn) => {
    captured.push({ name, uri, readFn });
  }),
};

import { registerOrgProfileResource } from "../../../src/resources/org-profile.ts";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  mockDb.prepare.mockReturnValue(mockStmt);
  mockStmt.get.mockReturnValue(undefined);
  registerOrgProfileResource(mockServer as never);
});

function getResource(name: string): Captured {
  const r = captured.find((c) => c.name === name);
  if (!r) throw new Error(`Resource '${name}' not registered`);
  return r;
}

const MOCK_EXTRA = { _meta: { apiKey: "iso27001_test" } };

const PROFILE_ROW = {
  id: "00000000-0000-4000-8000-000000000001",
  legal_entity_name: "Acme Ltd",
  registered_jurisdiction: "England & Wales",
  regulatory_licences: '["ISO 9001"]',
  in_scope_activities: "Cloud SaaS platform",
  isms_scope_statement: "All production systems",
  declared_exclusions: "Physical premises",
  raci_roles: '{"ciso":"Alice","dpo":"Bob"}',
  review_cadence_months: 12,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// ── Registration ──────────────────────────────────────────────

describe("registerOrgProfileResource", () => {
  it("registers exactly one resource", () => {
    expect(captured).toHaveLength(1);
  });

  it("registers with name iso27001-org-profile", () => {
    expect(getResource("iso27001-org-profile")).toBeDefined();
  });

  it("registers with static URI iso27001://org/profile", () => {
    expect(getResource("iso27001-org-profile").uri).toBe("iso27001://org/profile");
  });
});

// ── Read callback ─────────────────────────────────────────────

describe("iso27001-org-profile read callback", () => {
  it("calls assertResourceAuth", async () => {
    mockStmt.get.mockReturnValue(PROFILE_ROW);
    await getResource("iso27001-org-profile").readFn(
      new URL("iso27001://org/profile"),
      MOCK_EXTRA,
    );
    expect(mockAssertResourceAuth).toHaveBeenCalledWith(MOCK_EXTRA);
  });

  it("returns { profile: null } when no row exists", async () => {
    mockStmt.get.mockReturnValue(undefined);
    const res = await getResource("iso27001-org-profile").readFn(
      new URL("iso27001://org/profile"),
      MOCK_EXTRA,
    ) as { contents: Array<{ mimeType: string; text: string }> };
    expect(res.contents[0].mimeType).toBe("application/json");
    const data = JSON.parse(res.contents[0].text);
    expect(data.profile).toBeNull();
  });

  it("returns profile JSON with parsed raci_roles and regulatory_licences", async () => {
    mockStmt.get.mockReturnValue(PROFILE_ROW);
    const res = await getResource("iso27001-org-profile").readFn(
      new URL("iso27001://org/profile"),
      MOCK_EXTRA,
    ) as { contents: Array<{ text: string }> };
    const data = JSON.parse(res.contents[0].text);
    expect(data.legal_entity_name).toBe("Acme Ltd");
    expect(data.raci_roles).toEqual({ ciso: "Alice", dpo: "Bob" });
    expect(data.regulatory_licences).toEqual(["ISO 9001"]);
    expect(data.review_cadence_months).toBe(12);
  });

  it("returns application/json MIME type", async () => {
    mockStmt.get.mockReturnValue(PROFILE_ROW);
    const res = await getResource("iso27001-org-profile").readFn(
      new URL("iso27001://org/profile"),
      MOCK_EXTRA,
    ) as { contents: Array<{ mimeType: string }> };
    expect(res.contents[0].mimeType).toBe("application/json");
  });

  it("returns the correct URI in the contents", async () => {
    mockStmt.get.mockReturnValue(PROFILE_ROW);
    const res = await getResource("iso27001-org-profile").readFn(
      new URL("iso27001://org/profile"),
      MOCK_EXTRA,
    ) as { contents: Array<{ uri: string }> };
    expect(res.contents[0].uri).toBe("iso27001://org/profile");
  });
});

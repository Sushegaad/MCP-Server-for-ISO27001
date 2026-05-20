/**
 * Unit tests for src/resources/resource-auth.ts
 *
 * Covers: assertResourceAuth — key extraction, validation, and RBAC check.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

// ── Mocks ─────────────────────────────────────────────────────

const mockValidateKey = vi.fn<(raw: string) => string>();
const mockLoadRole    = vi.fn<(hash: string) => string>();
const mockRbacDenied  = vi.fn(() => new McpError(-32001, "rbac denied"));

vi.mock("../../../src/auth/api-key.js", () => ({
  validateKey: (...args: unknown[]) => mockValidateKey(...args as [string]),
  loadRole:    (...args: unknown[]) => mockLoadRole(...args as [string]),
}));

vi.mock("../../../src/types/errors.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/types/errors.js")>();
  return {
    ...actual,
    rbacDenied: (...args: unknown[]) => mockRbacDenied(...args as [string, string]),
  };
});

// SUT import after mocks
import { assertResourceAuth } from "../../../src/resources/resource-auth.js";

// ── Helpers ───────────────────────────────────────────────────

function makeExtra(apiKey?: string): unknown {
  return apiKey !== undefined ? { _meta: { apiKey } } : {};
}

// ── Tests ─────────────────────────────────────────────────────

describe("assertResourceAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["MCP_API_KEY"];
    mockValidateKey.mockReturnValue("hashed_key");
    mockLoadRole.mockReturnValue("viewer");
  });

  it("extracts API key from extra._meta.apiKey", () => {
    assertResourceAuth(makeExtra("iso27001_test") as never);
    expect(mockValidateKey).toHaveBeenCalledWith("iso27001_test");
  });

  it("falls back to MCP_API_KEY env var when _meta is absent", () => {
    process.env["MCP_API_KEY"] = "iso27001_env_key";
    assertResourceAuth(makeExtra() as never);
    expect(mockValidateKey).toHaveBeenCalledWith("iso27001_env_key");
  });

  it("uses empty string when neither source provides a key", () => {
    assertResourceAuth(makeExtra() as never);
    expect(mockValidateKey).toHaveBeenCalledWith("");
  });

  it("passes the hash returned by validateKey to loadRole", () => {
    mockValidateKey.mockReturnValue("abc123hash");
    assertResourceAuth(makeExtra("key") as never);
    expect(mockLoadRole).toHaveBeenCalledWith("abc123hash");
  });

  it("does not throw when caller role meets minRole (viewer default)", () => {
    mockLoadRole.mockReturnValue("viewer");
    expect(() => assertResourceAuth(makeExtra("key") as never)).not.toThrow();
  });

  it("does not throw when caller is admin and minRole is analyst", () => {
    mockLoadRole.mockReturnValue("admin");
    expect(() => assertResourceAuth(makeExtra("key") as never, "analyst")).not.toThrow();
  });

  it("throws when caller role (viewer) is below minRole (analyst)", () => {
    mockLoadRole.mockReturnValue("viewer");
    expect(() => assertResourceAuth(makeExtra("key") as never, "analyst")).toThrow();
    expect(mockRbacDenied).toHaveBeenCalledWith("resource-read", "analyst");
  });

  it("throws when caller role (analyst) is below minRole (admin)", () => {
    mockLoadRole.mockReturnValue("analyst");
    expect(() => assertResourceAuth(makeExtra("key") as never, "admin")).toThrow();
  });

  it("propagates McpError from validateKey when key is invalid", () => {
    mockValidateKey.mockImplementation(() => { throw new McpError(-32001, "invalid key"); });
    expect(() => assertResourceAuth(makeExtra("bad") as never)).toThrow(McpError);
  });
});

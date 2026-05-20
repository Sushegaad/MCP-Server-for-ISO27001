/**
 * Unit tests for src/auth/rbac.ts
 *
 * Tests: checkPermission, assertPermission, toolsForRole, TOTAL_TOOLS
 */

import { describe, it, expect } from "vitest";
import {
  checkPermission,
  assertPermission,
  toolsForRole,
  TOTAL_TOOLS,
} from "../../../src/auth/rbac.js";
import { McpError } from "../../../src/types/errors.js";

describe("checkPermission", () => {
  it("viewer can call get_control (viewer-level tool)", () => {
    expect(checkPermission("viewer", "get_control")).toBe(true);
  });

  it("viewer cannot call update_policy (admin-level tool)", () => {
    expect(checkPermission("viewer", "update_policy")).toBe(false);
  });

  it("analyst cannot call update_policy (admin-level tool)", () => {
    expect(checkPermission("analyst", "update_policy")).toBe(false);
  });

  it("admin can call update_policy", () => {
    expect(checkPermission("admin", "update_policy")).toBe(true);
  });

  it("viewer cannot call query_audit_log (admin-level tool)", () => {
    expect(checkPermission("viewer", "query_audit_log")).toBe(false);
  });

  it("analyst cannot call query_audit_log (admin-level tool)", () => {
    expect(checkPermission("analyst", "query_audit_log")).toBe(false);
  });

  it("admin can call query_audit_log", () => {
    expect(checkPermission("admin", "query_audit_log")).toBe(true);
  });

  it("returns false for unknown tool (fail-safe defaults to admin)", () => {
    expect(checkPermission("viewer", "unknown_tool")).toBe(false);
  });
});

describe("assertPermission", () => {
  it("viewer calling create_risk throws McpError with RBAC_DENIED", () => {
    expect(() => assertPermission("viewer", "create_risk")).toThrow(McpError);
    try {
      assertPermission("viewer", "create_risk");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).error_code).toBe("RBAC_DENIED");
    }
  });

  it("analyst calling create_risk does not throw (analyst-level tool)", () => {
    expect(() => assertPermission("analyst", "create_risk")).not.toThrow();
  });
});

describe("TOTAL_TOOLS", () => {
  it("equals 50", () => {
    expect(TOTAL_TOOLS).toBe(50);
  });
});

describe("toolsForRole", () => {
  it("viewer has access to 25 tools", () => {
    expect(toolsForRole("viewer").length).toBe(25);
  });

  it("analyst has access to 40 tools", () => {
    expect(toolsForRole("analyst").length).toBe(40);
  });

  it("admin has access to 50 tools", () => {
    expect(toolsForRole("admin").length).toBe(50);
  });

  it("viewer tools are a subset of analyst tools", () => {
    const viewerSet  = new Set(toolsForRole("viewer"));
    const analystSet = new Set(toolsForRole("analyst"));
    for (const tool of viewerSet) {
      expect(analystSet.has(tool), `analyst should have viewer tool: ${tool}`).toBe(true);
    }
  });

  it("analyst tools are a subset of admin tools", () => {
    const analystSet = new Set(toolsForRole("analyst"));
    const adminSet   = new Set(toolsForRole("admin"));
    for (const tool of analystSet) {
      expect(adminSet.has(tool), `admin should have analyst tool: ${tool}`).toBe(true);
    }
  });
});

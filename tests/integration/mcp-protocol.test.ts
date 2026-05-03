/**
 * iso27001-mcp — MCP protocol: tool registration tests
 *
 * Verifies that TOOL_SCHEMAS and TOOL_MIN_ROLE registries are consistent
 * and contain exactly 43 entries. Does NOT require native SQLite.
 */

import { describe, it, expect } from "vitest";
import { TOOL_SCHEMAS } from "../../src/security/validate.js";
import { TOTAL_TOOLS, toolsForRole } from "../../src/auth/rbac.js";

describe("MCP protocol — tool registration", () => {
  it("TOOL_SCHEMAS contains exactly 43 entries", () => {
    expect(Object.keys(TOOL_SCHEMAS).length).toBe(43);
  });

  it("TOTAL_TOOLS constant equals 43", () => {
    expect(TOTAL_TOOLS).toBe(43);
  });

  it("toolsForRole('admin') returns exactly 43 tool names", () => {
    expect(toolsForRole("admin").length).toBe(43);
  });

  it("every tool in TOOL_SCHEMAS has a Zod .parse function", () => {
    for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
      expect(
        typeof (schema as { parse?: unknown }).parse,
        `${name}.parse should be a function`,
      ).toBe("function");
    }
  });

  it("every tool in TOOL_SCHEMAS has a Zod .safeParse function", () => {
    for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
      expect(
        typeof (schema as { safeParse?: unknown }).safeParse,
        `${name}.safeParse should be a function`,
      ).toBe("function");
    }
  });

  it("every tool in TOOL_SCHEMAS is callable by an admin role", () => {
    const adminTools = new Set(toolsForRole("admin"));
    for (const toolName of Object.keys(TOOL_SCHEMAS)) {
      expect(
        adminTools.has(toolName),
        `${toolName} should be in the RBAC role map`,
      ).toBe(true);
    }
  });

  it("viewer-accessible tools are a subset of all tools", () => {
    const viewerTools = toolsForRole("viewer");
    const analystTools = toolsForRole("analyst");
    const adminTools = toolsForRole("admin");

    // Hierarchy: viewer ⊆ analyst ⊆ admin
    for (const t of viewerTools) {
      expect(analystTools.includes(t), `viewer tool '${t}' missing from analyst`).toBe(true);
    }
    for (const t of analystTools) {
      expect(adminTools.includes(t), `analyst tool '${t}' missing from admin`).toBe(true);
    }
  });
});

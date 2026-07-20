/**
 * iso27001-mcp — MCP protocol: tool registration tests
 *
 * Verifies that TOOL_SCHEMAS and TOOL_MIN_ROLE registries are consistent
 * and contain exactly 52 entries. Does NOT require native SQLite.
 */

import { describe, it, expect } from "vitest";
import { TOOL_SCHEMAS } from "../../src/tools/registry.js";
import { TOTAL_TOOLS, toolsForRole } from "../../src/auth/rbac.js";

describe("MCP protocol — tool registration", () => {
  it("TOOL_SCHEMAS contains exactly 52 entries", () => {
    expect(Object.keys(TOOL_SCHEMAS).length).toBe(52);
  });

  it("TOTAL_TOOLS constant equals 52", () => {
    expect(TOTAL_TOOLS).toBe(52);
  });

  it("toolsForRole('admin') returns exactly 52 tool names", () => {
    expect(toolsForRole("admin").length).toBe(52);
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

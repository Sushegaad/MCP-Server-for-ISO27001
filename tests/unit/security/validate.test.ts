/**
 * Unit tests for src/security/validate.ts
 *
 * Tests: validateToolInput
 * Exercises success path, unknown tool name, and validation failure.
 */

import { describe, it, expect } from "vitest";
import { validateToolInput } from "../../../src/security/validate.js";
import { McpError } from "../../../src/types/errors.js";

describe("validateToolInput", () => {
  it("returns parsed and defaulted input on success", () => {
    // get_control schema: { control_id: string, version?: "2022"|"2013" }
    const result = validateToolInput<{ control_id: string; version: string }>(
      "get_control",
      { control_id: "5.1", version: "2022" },
    );
    expect(result.control_id).toBe("5.1");
    expect(result.version).toBe("2022");
  });

  it("returns defaults for optional fields when omitted", () => {
    // list_controls schema has include_guidance: boolean — default false
    const result = validateToolInput<{ include_guidance: boolean }>(
      "list_controls",
      {},
    );
    expect(result.include_guidance).toBe(false);
  });

  it("throws McpError VALIDATION_ERROR for an unknown tool name", () => {
    expect(() =>
      validateToolInput("no_such_tool", { foo: "bar" }),
    ).toThrow(McpError);

    try {
      validateToolInput("no_such_tool", {});
    } catch (err) {
      expect((err as McpError).error_code).toBe("VALIDATION_ERROR");
    }
  });

  it("throws McpError VALIDATION_ERROR when required fields are missing", () => {
    // get_control requires control_id
    expect(() =>
      validateToolInput("get_control", {}),
    ).toThrow(McpError);

    try {
      validateToolInput("get_control", {});
    } catch (err) {
      expect((err as McpError).error_code).toBe("VALIDATION_ERROR");
    }
  });

  it("throws McpError VALIDATION_ERROR when a field fails regex validation", () => {
    // update_control_status requires assessment_id to be a UUID
    expect(() =>
      validateToolInput("update_control_status", {
        assessment_id: "not-a-uuid",
        control_id: "5.1",
        status: "partial",
      }),
    ).toThrow(McpError);
  });
});

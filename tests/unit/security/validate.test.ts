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

  // Group 12 — Management Review
  it("validates create_management_review with required fields", () => {
    const result = validateToolInput<{ title: string; review_date: string; reviewers: string[] }>(
      "create_management_review",
      {
        title:       "Q1 Management Review",
        review_date: "2025-03-31",
        reviewers:   ["CISO", "DPO"],
      },
    );
    expect(result.title).toBe("Q1 Management Review");
    expect(result.reviewers).toHaveLength(2);
  });

  it("rejects create_management_review with invalid date format", () => {
    expect(() =>
      validateToolInput("create_management_review", {
        title:       "Q1 Review",
        review_date: "31-03-2025",   // wrong format
        reviewers:   ["CISO"],
      }),
    ).toThrow(McpError);
  });

  it("rejects record_review_input with unknown input_category", () => {
    expect(() =>
      validateToolInput("record_review_input", {
        review_id:      "00000000-0000-0000-0000-000000000001",
        input_category: "board_presentation",   // invalid
        summary:        "Some summary",
      }),
    ).toThrow(McpError);
  });

  it("validates record_review_input with all 7 valid input_category values", () => {
    const categories = [
      "previous_action_status",
      "external_internal_issues",
      "interested_party_needs",
      "isms_performance",
      "interested_party_feedback",
      "risk_assessment_results",
      "improvement_opportunities",
    ];

    for (const cat of categories) {
      expect(() =>
        validateToolInput("record_review_input", {
          review_id:      "00000000-0000-0000-0000-000000000001",
          input_category: cat,
          summary:        "Summary text",
        }),
      ).not.toThrow();
    }
  });

  // Group 13 — Improvement Plan
  it("validates create_improvement_opportunity with defaults", () => {
    const result = validateToolInput<{ priority: string; status?: string }>(
      "create_improvement_opportunity",
      {
        title:       "Automate patch management",
        description: "Manual process is error-prone",
        source:      "audit",
      },
    );
    expect(result.priority).toBe("medium");  // default
  });

  it("rejects create_improvement_opportunity with invalid source", () => {
    expect(() =>
      validateToolInput("create_improvement_opportunity", {
        title:       "Something",
        description: "Something",
        source:      "board_request",   // invalid
      }),
    ).toThrow(McpError);
  });

  it("rejects update_improvement_opportunity with invalid status value", () => {
    expect(() =>
      validateToolInput("update_improvement_opportunity", {
        opportunity_id: "00000000-0000-0000-0000-000000000001",
        status:         "cancelled",   // not in enum
      }),
    ).toThrow(McpError);
  });

  // Group 14 — Evidence Templates
  it("validates generate_evidence_document with required fields and vars default", () => {
    const result = validateToolInput<{ vars: Record<string, string> }>(
      "generate_evidence_document",
      {
        template_type: "access_review_attestation",
        title:         "Q1 Access Review",
        generated_by:  "alice",
      },
    );
    expect(result.vars).toEqual({});   // default
  });

  it("rejects generate_evidence_document with unknown template_type", () => {
    expect(() =>
      validateToolInput("generate_evidence_document", {
        template_type: "board_minutes",   // invalid
        title:         "Meeting",
        generated_by:  "ciso",
      }),
    ).toThrow(McpError);
  });

  it("accepts generate_evidence_document for all 6 valid template types", () => {
    const types = [
      "access_review_attestation",
      "training_acknowledgement",
      "supplier_security_questionnaire",
      "incident_post_mortem",
      "bcp_test_report",
      "risk_treatment_sign_off",
    ];
    for (const t of types) {
      expect(() =>
        validateToolInput("generate_evidence_document", {
          template_type: t,
          title:         "Test",
          generated_by:  "tester",
        }),
      ).not.toThrow();
    }
  });

  it("validates get_evidence_document requires UUID", () => {
    expect(() =>
      validateToolInput("get_evidence_document", { document_id: "not-a-uuid" }),
    ).toThrow(McpError);
  });

  it("validates list_evidence_documents with all optional fields omitted", () => {
    expect(() =>
      validateToolInput("list_evidence_documents", {}),
    ).not.toThrow();
  });

  // normEnum non-string branch (validate.ts line 46)
  // When a non-string is passed to a normEnum field, the preprocess returns
  // the value unchanged (skipping the toLowerCase/find logic), then Zod's
  // enum rejects it with a validation error.
  it("normEnum preprocess passes non-string values through unchanged, triggering enum rejection", () => {
    // list_controls uses normControlType.optional() for control_type.
    // Passing the integer 42 exercises the `if (typeof v !== "string") return v` branch.
    expect(() =>
      validateToolInput("list_controls", { control_type: 42 }),
    ).toThrow(McpError);

    try {
      validateToolInput("list_controls", { control_type: 42 });
    } catch (err) {
      expect((err as McpError).error_code).toBe("VALIDATION_ERROR");
    }
  });

  it("normEnum coerces string enum values case-insensitively (string branch)", () => {
    // "technological" (lowercase) should be normalised to "Technological"
    // and accepted by list_controls — exercises the string path of normEnum.
    expect(() =>
      validateToolInput("list_controls", { cybersecurity_concept: "protect" }),
    ).not.toThrow();
  });
});

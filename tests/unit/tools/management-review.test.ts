/**
 * Unit tests for src/tools/management-review.ts
 *
 * Covers:
 *  - handleCreateManagementReview
 *  - handleRecordReviewInput
 *  - handleRecordReviewOutput
 *  - handleCompleteManagementReview (ISO 27001:2022 §9.3.2 / §9.3.3 business rules)
 *  - handleGetManagementReview
 *  - handleListManagementReviews
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mock stubs ───────────────────────────────────

const mockStmt = {
  get:  vi.fn(),
  all:  vi.fn(() => []),
  run:  vi.fn(() => ({ changes: 1 })),
};

const mockDb = {
  prepare: vi.fn(() => mockStmt),
};

vi.mock("../../../src/db/connection.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

// SUT imports (after vi.mock)
import {
  handleCreateManagementReview,
  handleRecordReviewInput,
  handleRecordReviewOutput,
  handleCompleteManagementReview,
  handleGetManagementReview,
  handleListManagementReviews,
} from "../../../src/tools/management-review.js";
import { McpError } from "../../../src/types/errors.js";

// ── Helpers ───────────────────────────────────────────────────

function parse(r: { content: Array<{ type: string; text: string }>; isError: boolean }) {
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

const REVIEW_ROW = {
  id:           "review-1",
  title:        "Q1 Management Review",
  review_date:  "2025-03-31",
  reviewers:    JSON.stringify(["CISO", "DPO"]),
  scope_notes:  null,
  status:       "planned",
  completed_at: null,
  completed_by: null,
  created_at:   "2025-01-01T00:00:00Z",
  updated_at:   "2025-01-01T00:00:00Z",
};

const REVIEW_ROW_IN_PROGRESS = { ...REVIEW_ROW, status: "in_progress" };
const REVIEW_ROW_COMPLETED   = { ...REVIEW_ROW, status: "completed" };

const ALL_SEVEN_INPUTS = [
  { input_category: "previous_action_status" },
  { input_category: "external_internal_issues" },
  { input_category: "interested_party_needs" },
  { input_category: "isms_performance" },
  { input_category: "interested_party_feedback" },
  { input_category: "risk_assessment_results" },
  { input_category: "improvement_opportunities" },
];

// ── Tests ─────────────────────────────────────────────────────

describe("handleCreateManagementReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a review and returns review_id + required_inputs list", () => {
    const result = handleCreateManagementReview({
      title:       "Q1 Management Review",
      review_date: "2025-03-31",
      reviewers:   ["CISO", "DPO"],
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.status).toBe("planned");
    expect(Array.isArray(data.required_inputs)).toBe(true);
    expect((data.required_inputs as string[]).length).toBe(7);
    expect(mockDb.prepare).toHaveBeenCalled();
    expect(mockStmt.run).toHaveBeenCalled();
  });
});

describe("handleRecordReviewInput", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a new input and returns progress", () => {
    mockStmt.get.mockImplementation((..._args: unknown[]) => {
      // First call: requireReview; Second call: existing input check (not found)
      const calls = mockStmt.get.mock.calls.length;
      if (calls === 1) return REVIEW_ROW_IN_PROGRESS;
      return undefined;
    });
    mockStmt.all.mockReturnValue([{ input_category: "previous_action_status" }]);

    const result = handleRecordReviewInput({
      review_id:      "review-1",
      input_category: "isms_performance",
      summary:        "ISMS performing well",
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.input_category).toBe("isms_performance");
    expect(typeof (data.progress as Record<string, unknown>).remaining).toBe("object");
  });

  it("upserts when category already recorded", () => {
    mockStmt.get.mockImplementation((..._args: unknown[]) => {
      const calls = mockStmt.get.mock.calls.length;
      if (calls === 1) return REVIEW_ROW_IN_PROGRESS;
      return { id: "input-existing" };
    });
    mockStmt.all.mockReturnValue(ALL_SEVEN_INPUTS);

    const result = handleRecordReviewInput({
      review_id:      "review-1",
      input_category: "isms_performance",
      summary:        "Updated summary",
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    // ready_to_complete true when all 7 recorded
    expect((data.progress as Record<string, unknown>).ready_to_complete).toBe(true);
  });

  it("throws BUSINESS_RULE_VIOLATION when review is already completed", () => {
    mockStmt.get.mockReturnValueOnce(REVIEW_ROW_COMPLETED);

    expect(() =>
      handleRecordReviewInput({
        review_id:      "review-1",
        input_category: "isms_performance",
        summary:        "Too late",
      }),
    ).toThrow(McpError);
  });

  it("throws NOT_FOUND for unknown review_id", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() =>
      handleRecordReviewInput({
        review_id:      "nonexistent",
        input_category: "isms_performance",
        summary:        "Ghost",
      }),
    ).toThrow(McpError);
  });
});

describe("handleRecordReviewOutput", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records an output decision and returns output_id", () => {
    mockStmt.get.mockReturnValueOnce(REVIEW_ROW_IN_PROGRESS);

    const result = handleRecordReviewOutput({
      review_id:   "review-1",
      output_type: "improvement_decision",
      decision:    "Invest in security awareness training",
      owner:       "CISO",
      due_date:    "2025-06-30",
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.output_type).toBe("improvement_decision");
    expect(typeof data.output_id).toBe("string");
  });

  it("throws BUSINESS_RULE_VIOLATION when review is already completed", () => {
    mockStmt.get.mockReturnValueOnce(REVIEW_ROW_COMPLETED);

    expect(() =>
      handleRecordReviewOutput({
        review_id:   "review-1",
        output_type: "isms_change_decision",
        decision:    "Expand ISMS scope",
      }),
    ).toThrow(McpError);
  });
});

describe("handleCompleteManagementReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes a review when all 7 inputs and ≥1 output are present", () => {
    mockStmt.get.mockImplementation((..._args: unknown[]) => {
      const calls = mockStmt.get.mock.calls.length;
      if (calls === 1) return REVIEW_ROW_IN_PROGRESS;  // requireReview
      return { c: 1 };                                  // output count
    });
    mockStmt.all.mockReturnValue(ALL_SEVEN_INPUTS);

    const result = handleCompleteManagementReview({
      review_id:    "review-1",
      completed_by: "CISO",
    });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.status).toBe("completed");
    expect(data.completed_by).toBe("CISO");
  });

  it("throws BUSINESS_RULE_VIOLATION when review already completed", () => {
    mockStmt.get.mockReturnValueOnce(REVIEW_ROW_COMPLETED);

    expect(() =>
      handleCompleteManagementReview({ review_id: "review-1", completed_by: "Admin" }),
    ).toThrow(McpError);
  });

  it("throws BUSINESS_RULE_VIOLATION when fewer than 7 inputs recorded (§9.3.2)", () => {
    mockStmt.get.mockReturnValueOnce(REVIEW_ROW_IN_PROGRESS);
    // Only 3 of 7 recorded
    mockStmt.all.mockReturnValue([
      { input_category: "previous_action_status" },
      { input_category: "isms_performance" },
      { input_category: "risk_assessment_results" },
    ]);

    expect(() =>
      handleCompleteManagementReview({ review_id: "review-1", completed_by: "CISO" }),
    ).toThrow(McpError);
  });

  it("throws BUSINESS_RULE_VIOLATION when no output recorded (§9.3.3)", () => {
    mockStmt.get.mockImplementation((..._args: unknown[]) => {
      const calls = mockStmt.get.mock.calls.length;
      if (calls === 1) return REVIEW_ROW_IN_PROGRESS;
      return { c: 0 };   // zero outputs
    });
    mockStmt.all.mockReturnValue(ALL_SEVEN_INPUTS);

    expect(() =>
      handleCompleteManagementReview({ review_id: "review-1", completed_by: "CISO" }),
    ).toThrow(McpError);
  });

  it("throws NOT_FOUND for unknown review_id", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() =>
      handleCompleteManagementReview({ review_id: "ghost", completed_by: "Admin" }),
    ).toThrow(McpError);
  });
});

describe("handleGetManagementReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns review with inputs, outputs, and completion_status", () => {
    mockStmt.get.mockReturnValueOnce(REVIEW_ROW_IN_PROGRESS);
    mockStmt.all
      .mockReturnValueOnce(ALL_SEVEN_INPUTS)   // inputs query
      .mockReturnValueOnce([{ id: "out-1" }]); // outputs query

    const result = handleGetManagementReview({ review_id: "review-1" });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(data.id).toBe("review-1");
    expect(Array.isArray(data.inputs)).toBe(true);
    expect(Array.isArray(data.outputs)).toBe(true);
    expect(typeof data.completion_status).toBe("object");
    const cs = data.completion_status as Record<string, unknown>;
    expect(cs.ready_to_complete).toBe(true);
  });

  it("throws NOT_FOUND for unknown review_id", () => {
    mockStmt.get.mockReturnValue(undefined);

    expect(() => handleGetManagementReview({ review_id: "ghost" })).toThrow(McpError);
  });
});

describe("handleListManagementReviews", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated list with no filter", () => {
    mockStmt.all.mockReturnValue([
      { ...REVIEW_ROW, reviewers: JSON.stringify(["CISO"]) },
    ]);

    const result = handleListManagementReviews({ limit: 10, offset: 0 });

    expect(result.isError).toBe(false);
    const data = parse(result);
    expect(Array.isArray(data.reviews)).toBe(true);
    const reviews = data.reviews as Array<Record<string, unknown>>;
    expect(Array.isArray(reviews[0]?.reviewers)).toBe(true);
  });

  it("passes status filter when provided", () => {
    mockStmt.all.mockReturnValue([]);

    handleListManagementReviews({ status: "completed", limit: 5, offset: 0 });

    const sql = mockDb.prepare.mock.calls[0]?.[0] as string;
    expect(sql).toContain("status = ?");
  });
});

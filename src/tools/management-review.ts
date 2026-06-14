/**
 * iso27001-mcp — Group 12: Management Review handlers (Clause 9.3)
 *
 * create_management_review — schedule a new review
 * record_review_input      — log one of the 7 mandatory 9.3.2 inputs
 * record_review_output     — log a 9.3.3 output decision
 * complete_management_review — close the review; enforces all 7 inputs present
 * get_management_review    — fetch a review with inputs and outputs
 * list_management_reviews  — paginated list with status filter
 */

import { getDb }                from "../db/connection.js";
import { newId, now, toJson, fromJsonArray } from "../db/dal.js";
import { notFound, businessRule } from "../types/errors.js";
import { buildDiffTable, type DiffRow } from "./hitl-utils.js";

// ── Types ─────────────────────────────────────────────────────

interface ReviewRow {
  id:           string;
  title:        string;
  review_date:  string;
  reviewers:    string;   // JSON array
  scope_notes:  string | null;
  status:       string;
  completed_at: string | null;
  completed_by: string | null;
  created_at:   string;
  updated_at:   string;
}

interface ReviewInputRow {
  id:             string;
  review_id:      string;
  input_category: string;
  summary:        string;
  details:        string | null;
  trend:          string | null;
  created_at:     string;
  updated_at:     string;
}

interface ReviewOutputRow {
  id:          string;
  review_id:   string;
  output_type: string;
  decision:    string;
  owner:       string | null;
  due_date:    string | null;
  created_at:  string;
  updated_at:  string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false };
}

// ── ISO 27001:2022 §9.3.2 mandatory input categories ─────────
const REQUIRED_INPUT_CATEGORIES = [
  "previous_action_status",
  "external_internal_issues",
  "interested_party_needs",
  "isms_performance",
  "interested_party_feedback",
  "risk_assessment_results",
  "improvement_opportunities",
] as const;

// ── Helpers ───────────────────────────────────────────────────

function requireReview(id: string): ReviewRow {
  const db  = getDb();
  const row = db.prepare("SELECT * FROM management_reviews WHERE id = ?").get(id) as ReviewRow | undefined;
  if (!row) throw notFound("management_review", id);
  return row;
}

function shapeReview(
  row: ReviewRow,
  inputs: ReviewInputRow[],
  outputs: ReviewOutputRow[],
): object {
  return {
    ...row,
    reviewers: fromJsonArray<string>(row.reviewers),
    inputs,
    outputs,
  };
}

// ── Handlers ──────────────────────────────────────────────────

export function handleCreateManagementReview(args: Record<string, unknown>): ToolResult {
  const { title, review_date, reviewers, scope_notes } = args as {
    title:       string;
    review_date: string;
    reviewers:   string[];
    scope_notes?: string;
  };

  const db = getDb();
  const id = newId();
  const ts = now();

  db.prepare(`
    INSERT INTO management_reviews (id, title, review_date, reviewers, scope_notes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'planned', ?, ?)
  `).run(id, title, review_date, toJson(reviewers), scope_notes ?? null, ts, ts);

  return ok({
    review_id: id,
    title,
    review_date,
    reviewers,
    status:    "planned",
    message:   `Management review scheduled. Record all 7 required 9.3.2 input categories before completing.`,
    required_inputs: REQUIRED_INPUT_CATEGORIES,
    created_at: ts,
  });
}

export function handleRecordReviewInput(args: Record<string, unknown>): ToolResult {
  const { review_id, input_category, summary, details, trend } = args as {
    review_id:      string;
    input_category: string;
    summary:        string;
    details?:       string;
    trend?:         string;
  };

  const review = requireReview(review_id);

  if (review.status === "completed") {
    throw businessRule("review_id", "Cannot add inputs to a completed management review.");
  }

  const db = getDb();

  // UPSERT — allow updating an already-recorded category before completion
  const existing = db.prepare(
    "SELECT id FROM review_inputs WHERE review_id = ? AND input_category = ?",
  ).get(review_id, input_category) as { id: string } | undefined;

  const ts = now();

  if (existing) {
    db.prepare(`
      UPDATE review_inputs
         SET summary = ?, details = ?, trend = ?, updated_at = ?
       WHERE id = ?
    `).run(summary, details ?? null, trend ?? null, ts, existing.id);
  } else {
    const id = newId();
    db.prepare(`
      INSERT INTO review_inputs (id, review_id, input_category, summary, details, trend, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, review_id, input_category, summary, details ?? null, trend ?? null, ts, ts);

    // Advance review to in_progress on first input
    if (review.status === "planned") {
      db.prepare("UPDATE management_reviews SET status = 'in_progress', updated_at = ? WHERE id = ?")
        .run(ts, review_id);
    }
  }

  // Report progress toward the 7-input requirement
  const recorded = db.prepare(
    "SELECT input_category FROM review_inputs WHERE review_id = ?",
  ).all(review_id) as { input_category: string }[];

  const recordedCategories = recorded.map((r) => r.input_category);
  const missing = REQUIRED_INPUT_CATEGORIES.filter((c) => !recordedCategories.includes(c));

  return ok({
    review_id,
    input_category,
    recorded_at: ts,
    progress: {
      recorded_count: recordedCategories.length,
      required_count: REQUIRED_INPUT_CATEGORIES.length,
      remaining:      missing,
      ready_to_complete: missing.length === 0,
    },
  });
}

export function handleRecordReviewOutput(args: Record<string, unknown>): ToolResult {
  const { review_id, output_type, decision, owner, due_date } = args as {
    review_id:   string;
    output_type: string;
    decision:    string;
    owner?:      string;
    due_date?:   string;
  };

  const review = requireReview(review_id);

  if (review.status === "completed") {
    throw businessRule("review_id", "Cannot add outputs to a completed management review.");
  }

  const db = getDb();
  const id = newId();
  const ts = now();

  db.prepare(`
    INSERT INTO review_outputs (id, review_id, output_type, decision, owner, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, review_id, output_type, decision, owner ?? null, due_date ?? null, ts, ts);

  return ok({ output_id: id, review_id, output_type, recorded_at: ts });
}

export function handleCompleteManagementReview(args: Record<string, unknown>): ToolResult {
  const { review_id, completed_by, confirmed = false } = args as {
    review_id:    string;
    completed_by: string;
    confirmed?:   boolean;
  };

  const review = requireReview(review_id);

  if (review.status === "completed") {
    throw businessRule("review_id", "Management review is already completed.");
  }

  const db = getDb();

  // Query inputs — needed for both preview and commit
  const recorded = db.prepare(
    "SELECT input_category FROM review_inputs WHERE review_id = ?",
  ).all(review_id) as { input_category: string }[];

  const recordedCategories = new Set(recorded.map((r) => r.input_category));
  const missing = REQUIRED_INPUT_CATEGORIES.filter((c) => !recordedCategories.has(c));

  // ── HITL preview ──────────────────────────────────────────────
  if (!confirmed) {
    // Query outputCount here (for readiness display in preview)
    const outputCount = (db.prepare(
      "SELECT COUNT(*) AS c FROM review_outputs WHERE review_id = ?",
    ).get(review_id) as { c: number }).c;

    const readinessRows: DiffRow[] = [
      { field: "inputs_recorded",  old: `${recorded.length}/7`, new: missing.length === 0 ? "✓ complete" : `⚠ missing: ${missing.join(", ")}` },
      { field: "outputs_recorded", old: outputCount,             new: outputCount >= 1 ? "✓ sufficient" : "⚠ at least 1 required" },
      { field: "status",           old: review.status,           new: "completed" },
      { field: "completed_by",     old: "(not set)",             new: completed_by },
    ];
    const readyToComplete = missing.length === 0 && outputCount >= 1;
    return ok({
      hitl_proposed:    true,
      status:           "preview",
      review_id,
      title:            review.title,
      ready_to_complete: readyToComplete,
      message:          readyToComplete
        ? "⏸ No data written. Review is ready to complete. Pass \"confirmed\": true to finalise."
        : "⏸ No data written. Review is NOT ready to complete — resolve the issues above first.",
      diff:             buildDiffTable(readinessRows),
    });
  }

  // Enforce ISO 27001:2022 §9.3.2 — all 7 input categories must be recorded
  if (missing.length > 0) {
    throw businessRule(
      "input_category",
      `ISO 27001:2022 §9.3.2 requires all 7 input categories before a review can be completed. ` +
      `Missing: ${missing.join(", ")}`,
    );
  }

  // Query outputCount lazily — only after the input check passes (§9.3.3)
  const outputCount = (db.prepare(
    "SELECT COUNT(*) AS c FROM review_outputs WHERE review_id = ?",
  ).get(review_id) as { c: number }).c;

  if (outputCount === 0) {
    throw businessRule(
      "output_type",
      "ISO 27001:2022 §9.3.3 requires at least one output (improvement_decision or isms_change_decision) before completing a review.",
    );
  }

  const ts = now();
  db.prepare(`
    UPDATE management_reviews
       SET status = 'completed', completed_at = ?, completed_by = ?, updated_at = ?
     WHERE id = ?
  `).run(ts, completed_by, ts, review_id);

  return ok({
    review_id,
    status:        "completed",
    completed_at:  ts,
    completed_by,
    inputs_count:  recorded.length,
    outputs_count: outputCount,
  });
}

export function handleGetManagementReview(args: Record<string, unknown>): ToolResult {
  const { review_id } = args as { review_id: string };

  const db     = getDb();
  const review = requireReview(review_id);

  const inputs = db.prepare(
    "SELECT * FROM review_inputs WHERE review_id = ? ORDER BY input_category ASC",
  ).all(review_id) as ReviewInputRow[];

  const outputs = db.prepare(
    "SELECT * FROM review_outputs WHERE review_id = ? ORDER BY created_at ASC",
  ).all(review_id) as ReviewOutputRow[];

  const recordedCategories = inputs.map((i) => i.input_category);
  const missingInputs = REQUIRED_INPUT_CATEGORIES.filter(
    (c) => !recordedCategories.includes(c),
  );

  return ok({
    ...shapeReview(review, inputs, outputs),
    completion_status: {
      inputs_recorded: recordedCategories.length,
      inputs_required: REQUIRED_INPUT_CATEGORIES.length,
      missing_inputs:  missingInputs,
      outputs_recorded: outputs.length,
      ready_to_complete: missingInputs.length === 0 && outputs.length > 0,
    },
  });
}

export function handleListManagementReviews(args: Record<string, unknown>): ToolResult {
  const { status, limit = 50, offset = 0 } = args as {
    status?: string;
    limit?:  number;
    offset?: number;
  };

  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const sql = `
    SELECT id, title, review_date, reviewers, status, completed_at, completed_by, created_at
      FROM management_reviews
    ${where}
    ORDER BY review_date DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as (ReviewRow & { reviewers: string })[];

  return ok({
    total:  rows.length,
    offset,
    limit,
    reviews: rows.map((r) => ({
      ...r,
      reviewers: fromJsonArray<string>(r.reviewers),
    })),
  });
}

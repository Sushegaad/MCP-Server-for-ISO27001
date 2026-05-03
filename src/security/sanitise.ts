/**
 * iso27001-mcp — Prompt injection sanitisation
 *
 * sanitise(input, fieldName) strips known injection patterns from free-text
 * fields. It never throws — the cleaned value is used and the caller is
 * responsible for recording the _sanitised metadata in the audit log.
 *
 * Fields sanitised: name, scope, notes, description, justification,
 *   objective_evidence, change_summary, query, reason, asset, threat,
 *   vulnerability, label, summary, body
 *
 * Fields NOT sanitised: control_id, assessment_id, risk_id, policy_id,
 *   audit_id, finding_id, treatment_id, evidence_id, soa_id, car_id,
 *   format, type, status, role, version, outcome, jira_key, issue_number
 */

// ── Injection patterns (from §9 of spec) ─────────────────────

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions?/gi,
  /you are now/gi,
  /act as (a |an )?/gi,
  /system prompt/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|im_start\|>/gi,
  /\{\{.*?\}\}/g,   // Template injection (Mustache-style double braces)
];

// ── Length caps (second layer after Zod) ─────────────────────

const LENGTH_CAPS: Record<string, number> = {
  justification:  1000,
  change_summary:  500,
};
const DEFAULT_LENGTH_CAP = 2000;

// ── Result type ───────────────────────────────────────────────

export interface SanitiseResult {
  cleaned:      string;
  wasSanitised: boolean;
  originalLength: number;
  cleanedLength:  number;
}

// ── Free-text field names (sanitised) ────────────────────────

export const FREE_TEXT_FIELDS = new Set([
  "name",
  "scope",
  "notes",
  "description",
  "justification",
  "na_justification",
  "objective_evidence",
  "change_summary",
  "query",
  "reason",
  "asset",
  "threat",
  "vulnerability",
  "label",
  "summary",
  "body",
  "root_cause",
  "exclude_justification",
  "archive_reason",
]);

// ── sanitise ──────────────────────────────────────────────────

/**
 * Strip injection patterns from a free-text string.
 *
 * @param input      The raw string value from the tool call parameters.
 * @param fieldName  The parameter field name — used to look up the length cap.
 * @returns          SanitiseResult with cleaned value and metadata.
 */
export function sanitise(input: string, fieldName: string): SanitiseResult {
  const originalLength = input.length;
  let cleaned = input;

  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Trim and apply length cap
  cleaned = cleaned.trim();
  const cap = LENGTH_CAPS[fieldName] ?? DEFAULT_LENGTH_CAP;
  if (cleaned.length > cap) {
    cleaned = cleaned.slice(0, cap);
  }

  const wasSanitised = cleaned !== input.trim().slice(0, cap);

  return {
    cleaned,
    wasSanitised,
    originalLength,
    cleanedLength: cleaned.length,
  };
}

/**
 * Sanitise all free-text fields in a params object in-place.
 * Returns metadata about which fields were sanitised.
 * Non-free-text fields (IDs, enums, booleans, numbers) are left untouched.
 */
export function sanitiseParams(
  params: Record<string, unknown>,
): { wasSanitised: boolean; sanitisedFields: string[] } {
  const sanitisedFields: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && FREE_TEXT_FIELDS.has(key)) {
      const result = sanitise(value, key);
      params[key] = result.cleaned;
      if (result.wasSanitised) sanitisedFields.push(key);
    }
  }

  return {
    wasSanitised: sanitisedFields.length > 0,
    sanitisedFields,
  };
}

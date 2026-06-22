/**
 * iso27001-mcp — Assessment MCP Resources
 *
 * Registers four resource templates (viewer auth required):
 *
 *   iso27001://assessment/{assessment_id}
 *     Gap assessment record with control-status summary counts.
 *     List callback enumerates all non-archived assessments.
 *
 *   iso27001://soa/{soa_id}
 *     Statement of Applicability with all soa_entries nested.
 *     List callback enumerates all SoA records.
 *
 *   iso27001://audit/{audit_id}
 *     Audit record with all findings and corrective_actions nested.
 *     List callback enumerates all audits ordered by planned_date DESC.
 *
 * All resources return JSON and require at least viewer role.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { getDb } from "../db/connection.js";
import { fromJsonArray } from "../db/dal.js";
import type { AssessmentRow, AuditRow, FindingRow, CorrectiveActionRow } from "../db/types.js";
import { suggestedTypes } from "../tools/evidence-utils.js";
import { assertResourceAuth } from "./resource-auth.js";

interface ControlStatusSummaryRow {
  status: string;
  count:  number;
}

interface SoaRow {
  id:            string;
  assessment_id: string;
  isms_version:  string;
  created_at:    string;
  updated_at:    string;
}

interface SoaEntryRow {
  id:                string;
  soa_id:            string;
  control_id:        string;
  included:          number;  // 0|1
  justification:     string;
  status:            string | null;
  evidence_count:    number;
  responsible_party: string | null;
  created_at:        string;
  updated_at:        string;
}

// ── Serialization ─────────────────────────────────────────────

function serializeAssessment(
  row: AssessmentRow,
  summary: ControlStatusSummaryRow[],
): object {
  const statusCounts: Record<string, number> = {};
  for (const s of summary) {
    statusCounts[s.status] = s.count;
  }
  return {
    ...row,
    themes_in_scope:  fromJsonArray<string>(row.themes_in_scope),
    exclude_controls: fromJsonArray<string>(row.exclude_controls),
    control_status_summary: statusCounts,
  };
}

function serializeSoaEntry(e: SoaEntryRow): object {
  return {
    ...e,
    included: e.included === 1,
  };
}

function serializeSoa(soa: SoaRow, entries: SoaEntryRow[]): object {
  return {
    ...soa,
    entries: entries.map(serializeSoaEntry),
  };
}

function serializeFinding(f: FindingRow, actions: CorrectiveActionRow[]): object {
  return {
    ...f,
    corrective_actions: actions.map((a) => ({
      ...a,
      effectiveness_verified: a.effectiveness_verified === 1,
    })),
  };
}

function serializeAudit(
  audit: AuditRow,
  findings: FindingRow[],
  actionsByFindingId: Map<string, CorrectiveActionRow[]>,
): object {
  return {
    ...audit,
    controls_in_scope: fromJsonArray<string>(audit.controls_in_scope),
    clauses_in_scope:  fromJsonArray<string>(audit.clauses_in_scope),
    findings: findings.map((f) =>
      serializeFinding(f, actionsByFindingId.get(f.id) ?? []),
    ),
  };
}

// ── Registration ──────────────────────────────────────────────

export function registerAssessmentResources(server: McpServer): void {

  // ── iso27001://assessment/{assessment_id} ────────────────────
  server.resource(
    "iso27001-assessment",
    new ResourceTemplate("iso27001://assessment/{assessment_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            `SELECT id, name, isms_version, status, created_at
               FROM gap_assessments
              WHERE status != 'archived'
              ORDER BY created_at DESC`,
          )
          .all() as Pick<AssessmentRow, "id" | "name" | "isms_version" | "status" | "created_at">[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://assessment/${r.id}`,
            name:        r.name,
            description: `ISO ${r.isms_version} gap assessment, status: ${r.status}, created: ${r.created_at}`,
            mimeType:    "application/json",
          })),
        };
      },
    }),
    {
      description: "ISO 27001 gap assessment record with control-status summary counts. Fields: id, name, scope, isms_version, status, themes_in_scope, exclude_controls, control_status_summary (object of status → count).",
      mimeType:    "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { assessment_id } = variables as { assessment_id: string };
      const db = getDb();

      const assessment = db
        .prepare("SELECT * FROM gap_assessments WHERE id = ?")
        .get(assessment_id) as AssessmentRow | undefined;

      if (!assessment) {
        throw new Error(
          `Assessment not found: '${assessment_id}'. Use list_assessments to find valid IDs.`,
        );
      }

      const summary = db
        .prepare(
          `SELECT status, COUNT(*) as count
             FROM control_statuses
            WHERE assessment_id = ?
            GROUP BY status`,
        )
        .all(assessment_id) as ControlStatusSummaryRow[];

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serializeAssessment(assessment, summary), null, 2),
        }],
      };
    },
  );

  // ── iso27001://soa/{soa_id} ──────────────────────────────────
  server.resource(
    "iso27001-soa",
    new ResourceTemplate("iso27001://soa/{soa_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            `SELECT s.id, s.assessment_id, s.isms_version, s.created_at,
                    g.name AS assessment_name
               FROM soa s
               JOIN gap_assessments g ON g.id = s.assessment_id
              ORDER BY s.created_at DESC`,
          )
          .all() as (SoaRow & { assessment_name: string })[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://soa/${r.id}`,
            name:        `SoA (${r.isms_version}) — ${r.assessment_name}`,
            description: `Statement of Applicability for assessment '${r.assessment_name}', created: ${r.created_at}`,
            mimeType:    "application/json",
          })),
        };
      },
    }),
    {
      description: "ISO 27001 Statement of Applicability with all control entries. Fields: id, assessment_id, isms_version, created_at, entries[] (control_id, included, justification, status, evidence_count, responsible_party).",
      mimeType:    "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { soa_id } = variables as { soa_id: string };
      const db = getDb();

      const soa = db
        .prepare("SELECT * FROM soa WHERE id = ?")
        .get(soa_id) as SoaRow | undefined;

      if (!soa) {
        throw new Error(
          `SoA not found: '${soa_id}'. Use get_soa or list_gap_assessments to find valid IDs.`,
        );
      }

      const entries = db
        .prepare(
          "SELECT * FROM soa_entries WHERE soa_id = ? ORDER BY control_id ASC",
        )
        .all(soa_id) as SoaEntryRow[];

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serializeSoa(soa, entries), null, 2),
        }],
      };
    },
  );

  // ── iso27001://audit/{audit_id} ──────────────────────────────
  server.resource(
    "iso27001-audit",
    new ResourceTemplate("iso27001://audit/{audit_id}", {
      list: () => {
        const rows = getDb()
          .prepare(
            `SELECT id, name, auditor, status, planned_date, actual_date
               FROM audits
              ORDER BY planned_date DESC`,
          )
          .all() as Pick<AuditRow, "id" | "name" | "auditor" | "status" | "planned_date" | "actual_date">[];

        return {
          resources: rows.map((r) => ({
            uri:         `iso27001://audit/${r.id}`,
            name:        r.name,
            description: `Auditor: ${r.auditor}, status: ${r.status}, planned: ${r.planned_date}${r.actual_date ? `, actual: ${r.actual_date}` : ""}`,
            mimeType:    "application/json",
          })),
        };
      },
    }),
    {
      description: "ISO 27001 audit record with nested findings and corrective actions. Fields: id, name, scope, auditor, planned_date, actual_date, status, controls_in_scope, clauses_in_scope, findings[] (type, severity, description, objective_evidence, corrective_actions[]).",
      mimeType:    "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { audit_id } = variables as { audit_id: string };
      const db = getDb();

      const audit = db
        .prepare("SELECT * FROM audits WHERE id = ?")
        .get(audit_id) as AuditRow | undefined;

      if (!audit) {
        throw new Error(
          `Audit not found: '${audit_id}'. Use list_audits to find valid IDs.`,
        );
      }

      const findings = db
        .prepare(
          "SELECT * FROM findings WHERE audit_id = ? ORDER BY created_at ASC",
        )
        .all(audit_id) as FindingRow[];

      // Load all corrective actions for these findings in a single query
      const actionsByFindingId = new Map<string, CorrectiveActionRow[]>();
      if (findings.length > 0) {
        const placeholders = findings.map(() => "?").join(", ");
        const actions = db
          .prepare(
            `SELECT * FROM corrective_actions WHERE finding_id IN (${placeholders}) ORDER BY created_at ASC`,
          )
          .all(...findings.map((f) => f.id)) as CorrectiveActionRow[];

        for (const action of actions) {
          const bucket = actionsByFindingId.get(action.finding_id) ?? [];
          bucket.push(action);
          actionsByFindingId.set(action.finding_id, bucket);
        }
      }

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(serializeAudit(audit, findings, actionsByFindingId), null, 2),
        }],
      };
    },
  );

  // ── iso27001://assessment/{assessment_id}/summary ─────────────
  server.resource(
    "iso27001-assessment-summary",
    new ResourceTemplate("iso27001://assessment/{assessment_id}/summary", { list: undefined }),
    {
      description:
        "Compliance summary for a gap assessment: total controls, counts by status " +
        "(implemented/partial/not_implemented/not_applicable/not_started), and compliance_percent. " +
        "Pass assessment_id from iso27001://assessment/{assessment_id}.",
      mimeType: "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { assessment_id } = variables as { assessment_id: string };
      const db = getDb();

      const assessment = db
        .prepare("SELECT * FROM gap_assessments WHERE id = ?")
        .get(assessment_id) as AssessmentRow | undefined;

      if (!assessment) {
        throw new Error(
          `Gap assessment not found: '${assessment_id}'. ` +
          "Use list_gap_assessments to find valid IDs.",
        );
      }

      const version         = assessment.isms_version;
      const excludedIds     = fromJsonArray<string>(assessment.exclude_controls);
      const themesInScope   = fromJsonArray<string>(assessment.themes_in_scope);

      let controlQuery = "SELECT control_id FROM controls WHERE version = ?";
      const controlParams: unknown[] = [version];
      if (themesInScope.length > 0) {
        controlQuery += ` AND theme IN (${themesInScope.map(() => "?").join(",")})`;
        controlParams.push(...themesInScope);
      }
      const allControls = db.prepare(controlQuery).all(...controlParams) as { control_id: string }[];
      const inScopeControls = excludedIds.length > 0
        ? allControls.filter((c) => !excludedIds.includes(c.control_id))
        : allControls;

      const statuses = db.prepare(
        "SELECT control_id, status FROM control_statuses WHERE assessment_id = ?",
      ).all(assessment_id) as { control_id: string; status: string }[];
      const statusMap = new Map(statuses.map((s) => [s.control_id, s.status]));

      const totalControls  = inScopeControls.length;
      const implemented    = inScopeControls.filter((c) => statusMap.get(c.control_id) === "implemented").length;
      const partial        = inScopeControls.filter((c) => statusMap.get(c.control_id) === "partial").length;
      const notImplemented = inScopeControls.filter((c) => statusMap.get(c.control_id) === "not_implemented").length;
      const na             = inScopeControls.filter((c) => statusMap.get(c.control_id) === "na").length;
      const notStarted     = inScopeControls.filter(
        (c) => !statusMap.has(c.control_id) || statusMap.get(c.control_id) === "not_started",
      ).length;
      const compliancePercent = totalControls > 0
        ? Math.round(((implemented + na) / totalControls) * 100)
        : 0;

      const summary = {
        assessment_id,
        assessment_name:    assessment.name,
        isms_version:       version,
        total_controls:     totalControls,
        implemented,
        partial,
        not_implemented:    notImplemented,
        not_applicable:     na,
        not_started:        notStarted,
        compliance_percent: compliancePercent,
      };

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify(summary, null, 2),
        }],
      };
    },
  );

  // ── iso27001://assessment/{assessment_id}/evidence-gaps ────────
  server.resource(
    "iso27001-assessment-evidence-gaps",
    new ResourceTemplate("iso27001://assessment/{assessment_id}/evidence-gaps", { list: undefined }),
    {
      description:
        "Controls within a gap assessment that are marked implemented or partial but have no " +
        "current (non-expired) evidence records. Returns total_gaps and an array of gap objects " +
        "with control_id, name, theme, current_status, and suggested_evidence_types.",
      mimeType: "application/json",
    },
    (uri, variables, extra): ReadResourceResult => {
      assertResourceAuth(extra);

      const { assessment_id } = variables as { assessment_id: string };
      const db = getDb();

      const assessment = db
        .prepare("SELECT id FROM gap_assessments WHERE id = ?")
        .get(assessment_id) as { id: string } | undefined;

      if (!assessment) {
        throw new Error(
          `Gap assessment not found: '${assessment_id}'. ` +
          "Use list_gap_assessments to find valid IDs.",
        );
      }

      // Controls that need evidence (implemented or partial)
      const controlStatuses = db.prepare(`
        SELECT cs.control_id, cs.status
        FROM control_statuses cs
        WHERE cs.assessment_id = ? AND cs.status IN ('implemented', 'partial')
      `).all(assessment_id) as { control_id: string; status: string }[];

      if (controlStatuses.length === 0) {
        return {
          contents: [{
            uri:      uri.toString(),
            mimeType: "application/json",
            text:     JSON.stringify({ assessment_id, total_gaps: 0, gaps: [] }, null, 2),
          }],
        };
      }

      const controlIds   = controlStatuses.map((c) => c.control_id);
      const placeholders = controlIds.map(() => "?").join(",");

      const evidencedControls = db.prepare(`
        SELECT DISTINCT control_id
        FROM evidence
        WHERE control_id IN (${placeholders})
          AND (expiry_date IS NULL OR expiry_date > date('now'))
      `).all(...controlIds) as { control_id: string }[];

      const evidencedSet  = new Set(evidencedControls.map((e) => e.control_id));
      const gapControlIds = controlIds.filter((cid) => !evidencedSet.has(cid));

      if (gapControlIds.length === 0) {
        return {
          contents: [{
            uri:      uri.toString(),
            mimeType: "application/json",
            text:     JSON.stringify({ assessment_id, total_gaps: 0, gaps: [] }, null, 2),
          }],
        };
      }

      const gapPlaceholders = gapControlIds.map(() => "?").join(",");
      const controlDetails  = db.prepare(`
        SELECT control_id, name, theme FROM controls WHERE control_id IN (${gapPlaceholders})
      `).all(...gapControlIds) as { control_id: string; name: string; theme: string }[];

      const detailMap = new Map(controlDetails.map((c) => [c.control_id, c]));

      const gaps = gapControlIds.map((cid) => {
        const detail = detailMap.get(cid);
        const theme  = detail?.theme ?? "";
        return {
          control_id:               cid,
          name:                     detail?.name ?? cid,
          theme,
          current_status:           controlStatuses.find((cs) => cs.control_id === cid)?.status ?? "unknown",
          suggested_evidence_types: suggestedTypes(theme),
        };
      });

      return {
        contents: [{
          uri:      uri.toString(),
          mimeType: "application/json",
          text:     JSON.stringify({ assessment_id, total_gaps: gaps.length, gaps }, null, 2),
        }],
      };
    },
  );
}

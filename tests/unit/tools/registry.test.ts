/**
 * Unit tests for src/tools/registry.ts — the unified tool registry.
 *
 * Locks in:
 *   - no duplicate tool names
 *   - registry size matches TOTAL_TOOLS (derived in rbac.ts)
 *   - every entry is complete (description, minRole, schema, handler)
 *   - derived views (TOOL_MIN_ROLE / TOOL_SCHEMAS / TOOL_DESCRIPTIONS /
 *     TOOL_HANDLERS) have identical key sets to TOOLS
 *   - .refine() cross-field rules are actually enforced by the schemas the
 *     pipeline runs (this was previously dead: the SDK only validated the
 *     extracted raw shape, so refinements never executed)
 */

import { describe, it, expect } from "vitest";
import {
  TOOLS,
  TOOL_MIN_ROLE,
  TOOL_SCHEMAS,
  TOOL_DESCRIPTIONS,
  TOOL_HANDLERS,
} from "../../../src/tools/registry.js";
import { TOTAL_TOOLS } from "../../../src/auth/rbac.js";

const VALID_ROLES = ["viewer", "analyst", "admin"];

describe("TOOLS registry integrity", () => {
  it("has no duplicate tool names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has exactly TOTAL_TOOLS entries", () => {
    expect(TOOLS.length).toBe(TOTAL_TOOLS);
    expect(TOOLS.length).toBe(56);
  });

  it("every entry has a non-empty description", () => {
    for (const t of TOOLS) {
      expect(t.description, `description for ${t.name}`).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it("every entry has a valid minRole", () => {
    for (const t of TOOLS) {
      expect(VALID_ROLES, `minRole for ${t.name}`).toContain(t.minRole);
    }
  });

  it("every entry has a Zod schema with safeParse", () => {
    for (const t of TOOLS) {
      expect(typeof t.schema.safeParse, `schema for ${t.name}`).toBe("function");
    }
  });

  it("every entry has a function handler", () => {
    for (const t of TOOLS) {
      expect(typeof t.handler, `handler for ${t.name}`).toBe("function");
    }
  });
});

describe("MCP tool annotations", () => {
  // The 15 HITL-gated tools (preview/confirm via buildPreviewResponse).
  const HITL_TOOLS = [
    "update_control_status", "update_risk", "update_treatment_status",
    "create_policy", "update_policy", "update_soa_entry",
    "create_audit", "record_finding", "create_corrective_action",
    "update_procedure", "complete_management_review", "register_evidence",
    "verify_evidence", "set_risk_methodology", "record_risk_acceptance",
  ];

  it("every entry has annotations with readOnlyHint defined", () => {
    for (const t of TOOLS) {
      expect(t.annotations, `annotations for ${t.name}`).toBeDefined();
      expect(typeof t.annotations?.readOnlyHint, `readOnlyHint for ${t.name}`).toBe("boolean");
    }
  });

  it("no readOnlyHint:true tool is HITL-gated", () => {
    for (const t of TOOLS) {
      if (t.annotations?.readOnlyHint === true) {
        expect(HITL_TOOLS, `${t.name} is read-only but HITL-gated`).not.toContain(t.name);
      }
    }
  });

  it("every HITL-gated tool exists and is marked as a write", () => {
    const byName = new Map(TOOLS.map((t) => [t.name, t]));
    for (const name of HITL_TOOLS) {
      const t = byName.get(name);
      expect(t, `HITL tool ${name} missing from registry`).toBeDefined();
      expect(t?.annotations?.readOnlyHint, `readOnlyHint for ${name}`).toBe(false);
    }
  });

  it("destructive hints are limited to genuinely destructive operations", () => {
    const destructive = TOOLS
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();
    expect(destructive).toEqual(["archive_gap_assessment", "revoke_api_key"]);
  });
});

describe("derived views stay in lockstep with TOOLS", () => {
  const names = TOOLS.map((t) => t.name).sort();

  it("TOOL_MIN_ROLE has an identical key set", () => {
    expect(Object.keys(TOOL_MIN_ROLE).sort()).toEqual(names);
  });

  it("TOOL_SCHEMAS has an identical key set", () => {
    expect(Object.keys(TOOL_SCHEMAS).sort()).toEqual(names);
  });

  it("TOOL_DESCRIPTIONS has an identical key set", () => {
    expect(Object.keys(TOOL_DESCRIPTIONS).sort()).toEqual(names);
  });

  it("TOOL_HANDLERS has an identical key set", () => {
    expect(Object.keys(TOOL_HANDLERS).sort()).toEqual(names);
  });

  it("derived views reference the exact objects from TOOLS", () => {
    for (const t of TOOLS) {
      expect(TOOL_MIN_ROLE[t.name]).toBe(t.minRole);
      expect(TOOL_SCHEMAS[t.name]).toBe(t.schema);
      expect(TOOL_DESCRIPTIONS[t.name]).toBe(t.description);
      expect(TOOL_HANDLERS[t.name]).toBe(t.handler);
    }
  });
});

describe(".refine() cross-field rules are enforced at runtime", () => {
  it("compare_versions rejects input with neither v2013_id nor v2022_id", () => {
    const result = TOOL_SCHEMAS["compare_versions"].safeParse({});
    expect(result.success).toBe(false);
  });

  it("compare_versions accepts input with one version id", () => {
    expect(TOOL_SCHEMAS["compare_versions"].safeParse({ v2013_id: "A.5.1.1" }).success).toBe(true);
    expect(TOOL_SCHEMAS["compare_versions"].safeParse({ v2022_id: "5.1" }).success).toBe(true);
  });

  it("link_jira_ticket rejects input with neither jira_key nor summary", () => {
    const result = TOOL_SCHEMAS["link_jira_ticket"].safeParse({
      evidence_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(false);
  });

  it("link_jira_ticket accepts jira_key (link) or summary (create)", () => {
    expect(TOOL_SCHEMAS["link_jira_ticket"].safeParse({
      evidence_id: "00000000-0000-0000-0000-000000000001",
      jira_key:    "ISMS-123",
    }).success).toBe(true);
    expect(TOOL_SCHEMAS["link_jira_ticket"].safeParse({
      evidence_id: "00000000-0000-0000-0000-000000000001",
      summary:     "Create a ticket for this evidence",
    }).success).toBe(true);
  });

  it("link_github_issue rejects input with neither issue_number nor title", () => {
    const result = TOOL_SCHEMAS["link_github_issue"].safeParse({
      evidence_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(false);
  });

  it("link_github_issue accepts issue_number (link) or title (create)", () => {
    expect(TOOL_SCHEMAS["link_github_issue"].safeParse({
      evidence_id:  "00000000-0000-0000-0000-000000000001",
      issue_number: 42,
    }).success).toBe(true);
    expect(TOOL_SCHEMAS["link_github_issue"].safeParse({
      evidence_id: "00000000-0000-0000-0000-000000000001",
      title:       "Evidence follow-up",
    }).success).toBe(true);
  });
});

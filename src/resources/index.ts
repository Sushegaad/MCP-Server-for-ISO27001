/**
 * iso27001-mcp — MCP Resource Registration Entry Point
 *
 * Calls all individual register*Resources() functions.
 * Import and call registerAllResources(server) from server.ts
 * after registerAllTools(server).
 *
 * Resource URI scheme: iso27001://
 *
 * Public (no auth):
 *   iso27001://control/{control_id}
 *   iso27001://control/{control_id}/version/{version}
 *   iso27001://clause/{clause_id}
 *   iso27001://server/info
 *
 * Viewer auth required:
 *   iso27001://org/profile
 *   iso27001://risks/summary
 *   iso27001://risk/{risk_id}
 *   iso27001://policy/{policy_id}
 *   iso27001://policy/{policy_id}/version/{version}
 *   iso27001://procedure/{procedure_id}
 *   iso27001://procedure/{procedure_id}/version/{version}
 *   iso27001://assessment/{assessment_id}
 *   iso27001://assessment/{assessment_id}/summary
 *   iso27001://assessment/{assessment_id}/evidence-gaps
 *   iso27001://soa/{soa_id}
 *   iso27001://audit/{audit_id}
 *   iso27001://management-review/{review_id}
 *   iso27001://improvement-plan/{opportunity_id}
 *   iso27001://evidence-document/{document_id}
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerControlResources }           from "./controls.js";
import { registerPolicyResources }            from "./policies.js";
import { registerProcedureResources }         from "./procedures.js";
import { registerRiskResources }              from "./risks.js";
import { registerAssessmentResources }        from "./assessments.js";
import { registerOrgProfileResource }         from "./org-profile.js";
import { registerManagementReviewResources }  from "./management-review.js";
import { registerEvidenceDocumentResources }  from "./evidence-templates.js";
import { registerImprovementPlanResources }   from "./improvement-plan.js";
import { registerServerInfoResource }         from "./server-info.js";

export function registerAllResources(server: McpServer): void {
  // Public reference data (no auth)
  registerControlResources(server);
  registerServerInfoResource(server);

  // Viewer-auth-required ISMS artefacts
  registerOrgProfileResource(server);
  registerRiskResources(server);
  registerPolicyResources(server);
  registerProcedureResources(server);
  registerAssessmentResources(server);
  registerManagementReviewResources(server);
  registerImprovementPlanResources(server);
  registerEvidenceDocumentResources(server);
}

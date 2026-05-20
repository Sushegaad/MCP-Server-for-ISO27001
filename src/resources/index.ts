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
 *
 * Viewer auth required:
 *   iso27001://org/profile
 *   iso27001://policy/{policy_id}
 *   iso27001://policy/{policy_id}/version/{version}
 *   iso27001://procedure/{procedure_id}
 *   iso27001://procedure/{procedure_id}/version/{version}
 *   iso27001://risk/{risk_id}
 *   iso27001://assessment/{assessment_id}
 *   iso27001://soa/{soa_id}
 *   iso27001://audit/{audit_id}
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerControlResources }    from "./controls.js";
import { registerPolicyResources }     from "./policies.js";
import { registerProcedureResources }  from "./procedures.js";
import { registerRiskResources }       from "./risks.js";
import { registerAssessmentResources } from "./assessments.js";
import { registerOrgProfileResource }  from "./org-profile.js";

export function registerAllResources(server: McpServer): void {
  // Public reference data (no auth)
  registerControlResources(server);

  // Viewer-auth-required ISMS artefacts
  registerOrgProfileResource(server);
  registerPolicyResources(server);
  registerProcedureResources(server);
  registerRiskResources(server);
  registerAssessmentResources(server);
}

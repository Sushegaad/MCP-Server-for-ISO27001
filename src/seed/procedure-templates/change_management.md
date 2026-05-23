---
procedure_type: change_management
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["8.32","5.37","8.9"]
---
# Change Management Procedure

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Change Categories
4. Roles and Responsibilities
5. Change Request Process
6. Implementation
7. Post-Implementation Review
8. Security Considerations
9. Record Keeping
10. Document Control

---

## 1. Purpose

This procedure governs the controlled planning, approval, testing, and implementation of changes to information systems, infrastructure, applications, and configurations at {{organisation_name}}, minimising the risk of unplanned disruption and security incidents.

## 2. Scope

{{scope}}

## 3. Change Categories

| Category | Description | Approval Required |
|---|---|---|
| Standard | Pre-approved, low-risk, routine changes | Change Owner only |
| Normal | Planned changes requiring risk assessment | Change Advisory Board (CAB) |
| Emergency | Urgent changes to restore service or address a security risk | Emergency CAB or delegated authority |

## 4. Roles and Responsibilities

- **Change Requestor**: Initiates and documents the change request
- **Change Owner**: Accountable for the change's technical execution
- **Change Advisory Board (CAB)**: Reviews and approves Normal changes
- **Emergency CAB**: Reviews Emergency changes post-implementation or in real-time
- **{{owner}}**: Chairs the CAB and owns this procedure

## 5. Change Request Process

### 5.1 Initiating a Change Request
1. The Change Requestor submits a Change Request (CR) via the ticketing system with:
   - Description of the change and its business justification
   - Systems, services, and data affected
   - Risk assessment (likelihood and impact of change and rollback)
   - Implementation plan with step-by-step actions
   - Test plan and success criteria
   - Rollback plan
   - Proposed implementation window
2. The CR is assigned a unique identifier and logged in the change register.

### 5.2 Risk Assessment
1. The Change Owner rates the change risk as Low, Medium, or High based on:
   - Number of systems affected
   - Potential impact on availability, integrity, or confidentiality
   - Reversibility
2. Risk rating determines the change category (Standard, Normal, or Emergency).

### 5.3 Standard Change Approval
1. Standard changes are pre-approved if they match an entry in the Standard Change Register.
2. The Change Owner confirms the change against the register entry and proceeds.
3. Completed standard changes are reported to the CAB at the next scheduled meeting.

### 5.4 Normal Change Approval
1. The CAB reviews the CR at its regular meeting (minimum weekly).
2. The CAB assesses risk, implementation plan, and rollback plan.
3. Approval, rejection, or deferral is recorded in the CR.
4. Approved changes may proceed only within the approved implementation window.

### 5.5 Emergency Change
1. The Change Requestor notifies the Change Owner and a CAB delegate immediately.
2. Verbal or written approval is obtained from at least one CAB delegate before implementation (unless immediate action is needed to prevent serious harm).
3. The CR is completed retrospectively within 24 hours.
4. Emergency changes are reviewed at the next CAB meeting.

## 6. Implementation

1. Changes are implemented only by authorised personnel within the approved window.
2. The Change Owner monitors the implementation and logs each step with timestamps.
3. Post-implementation testing is performed to confirm success criteria are met.
4. If testing fails, the rollback plan is executed immediately and the CAB is notified.

## 7. Post-Implementation Review

1. The Change Owner updates the CR with the actual outcome, any deviations from the plan, and lessons learned.
2. Failed changes or significant deviations are reviewed by the CAB to identify process improvements.
3. The change register is updated to reflect the final status.

## 8. Security Considerations

1. Changes to security controls, firewall rules, cryptographic configurations, or authentication mechanisms require explicit security review before CAB approval.
2. All production changes must be tested in a non-production environment first, unless technically impossible.
3. Code changes must pass peer review and automated security scanning before deployment.

## 9. Record Keeping

The change register, CRs, approval records, and post-implementation reviews are retained for a minimum of 3 years.


{{> revision_block}}

{{> approver_signature}}

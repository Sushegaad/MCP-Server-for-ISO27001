---
procedure_type: access_provisioning
clause_mappings: ["6.1.2","9.1"]
control_mappings: ["5.15","5.16","5.17","5.18","8.2","8.3"]
---
# Access Provisioning Procedure

**Organisation:** {{organisation_name}}
**Procedure ID:** {{procedure_id}}
**Version:** {{version}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{next_review_date}}
**Owner:** {{owner}}
**Approver:** {{approver}}
**Parent Policy ID:** {{parent_policy_id}}

---

## 1. Purpose

This procedure defines the step-by-step process for granting, modifying, and revoking user access to information systems, applications, and data within {{organisation_name}}, in support of the Access Control Policy.

## 2. Scope

{{scope}}

## 3. Roles and Responsibilities

- **Requestor**: The user or manager initiating the access request
- **Line Manager**: Authorises access requests for their direct reports
- **System Owner**: Approves access to systems under their ownership
- **IT/IAM Team**: Executes provisioning actions and maintains audit trail
- **{{owner}}**: Owns this procedure and ensures it is followed

## 4. Access Request Process

### 4.1 Submitting a Request
1. The requestor submits an access request via the approved ticketing system, specifying:
   - Target system or application
   - Access level required (read, write, admin)
   - Business justification
   - Duration (permanent or temporary with end date)
2. The request is automatically routed to the requestor's line manager for approval.

### 4.2 Manager Approval
1. The line manager reviews the business justification and access level.
2. If approved, the ticket is forwarded to the relevant System Owner.
3. If denied, the requestor is notified with the reason and the ticket is closed.

### 4.3 System Owner Approval
1. The System Owner confirms the requested access is appropriate for the role.
2. The System Owner approves or rejects within 2 business days.
3. Approvals are recorded in the ticketing system before provisioning begins.

## 5. Provisioning Execution

1. Upon dual approval, the IT/IAM team provisions access within the agreed SLA:
   - Standard access: 1 business day
   - Privileged access: 2 business days (additional security review required)
2. Access is provisioned using the principle of least privilege.
3. For privileged accounts, a separate account is created distinct from the user's standard account.
4. The provisioning action is recorded in the audit log with timestamp, operator ID, and ticket reference.
5. The requestor is notified of successful provisioning.

## 6. Temporary Access

1. Temporary access must have a defined expiry date set at provisioning time.
2. The IT/IAM team configures automatic expiry where the system supports it.
3. Where automatic expiry is unavailable, a calendar reminder is set for the expiry date.
4. At expiry, access is revoked and the ticket is closed.

## 7. Access Modification

1. Role changes require a new access request via the same process above.
2. Excess permissions from the previous role are removed at the same time new access is granted.
3. Modifications are recorded with reference to the original and new access levels.

## 8. Access Revocation

1. HR notifies the IT/IAM team within 4 hours of employee termination or contractor end-of-engagement.
2. The IT/IAM team revokes all access within 24 hours of notification.
3. For emergency revocations (security incident), access is revoked immediately by the IT/IAM team or System Owner without waiting for formal request.
4. Revocation is confirmed in the ticketing system with a timestamp.

## 9. Periodic Access Review

1. System Owners conduct access reviews for their systems at least every 12 months.
2. Privileged access is reviewed every 6 months.
3. Reviewers confirm each account is still required and the access level remains appropriate.
4. Orphaned or excessive accounts are revoked within 5 business days of the review.
5. Review outcomes are documented and retained as evidence.

## 10. Record Keeping

All access requests, approvals, provisioning actions, and revocations are retained in the ticketing system for a minimum of 3 years.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*

---
procedure_type: supplier_onboarding
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["5.19","5.20","5.21","5.22","5.23"]
---
# Supplier Onboarding Procedure

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

This procedure defines how {{organisation_name}} assesses, approves, and onboards suppliers that will access, process, or store information assets, ensuring supplier relationships do not introduce unacceptable information security risk.

## 2. Scope

{{scope}}

## 3. Supplier Risk Classification

| Tier | Criteria | Assessment Required |
|---|---|---|
| Tier 1 — Critical | Access to sensitive/personal data; critical service dependency | Full security questionnaire + contract review + annual review |
| Tier 2 — Significant | Access to internal systems; moderate service dependency | Abbreviated questionnaire + contract review + biennial review |
| Tier 3 — Standard | No direct system access; low dependency | Self-attestation + contract clause + triennial review |

## 4. Roles and Responsibilities

- **Business Owner**: Initiates supplier onboarding; accountable for the relationship
- **Procurement / Legal**: Manages contract negotiation and execution
- **IT Security / {{owner}}**: Conducts security assessment; assigns risk tier
- **DPO**: Reviews data processing arrangements for Tier 1 suppliers handling personal data

## 5. Supplier Onboarding Process

### 5.1 Request to Onboard
1. The Business Owner raises a supplier onboarding request via the ticketing system, providing:
   - Supplier name and contact details
   - Description of services to be provided
   - Data and systems the supplier will access
   - Estimated contract value and duration
2. {{owner}} assigns a risk tier based on the criteria in Section 3.

### 5.2 Security Assessment
1. **Tier 1**: IT Security sends the full Information Security Questionnaire to the supplier. The supplier must respond within 10 business days. IT Security reviews responses, requests evidence (certifications, penetration test summaries, audit reports), and produces a risk assessment report.
2. **Tier 2**: IT Security sends the abbreviated questionnaire. Responses are reviewed and a simplified risk summary is produced.
3. **Tier 3**: The supplier completes a self-attestation form confirming compliance with minimum security requirements.
4. For Tier 1 suppliers processing personal data, the DPO reviews the Data Processing Agreement (DPA) and conducts a Transfer Impact Assessment if data is processed outside the EEA.

### 5.3 Risk Assessment Outcome
1. IT Security assigns a risk rating: Approved, Approved with Conditions, or Rejected.
2. "Approved with Conditions" requires the Business Owner to confirm conditions are included in the contract before onboarding proceeds.
3. "Rejected" suppliers may not be onboarded. The Business Owner is notified with the rationale.
4. The risk assessment outcome is recorded in the supplier register.

### 5.4 Contractual Requirements
1. Procurement / Legal ensures the contract includes mandatory information security clauses:
   - Obligation to maintain appropriate technical and organisational security measures
   - Right to audit or receive third-party audit reports
   - Incident notification obligation (within 24 hours of discovery)
   - Data protection and confidentiality obligations
   - Sub-processor/sub-contractor restrictions
   - Requirements for secure data deletion on contract termination
2. For Tier 1 suppliers handling personal data, a signed DPA is required before any data is shared.

### 5.5 Access Provisioning
1. Upon contract execution and security approval, the Business Owner requests system access via the Access Provisioning Procedure.
2. Access is provisioned on a least-privilege basis and time-limited to the contract period.
3. Supplier accounts are clearly labelled in the access management system.

## 6. Ongoing Supplier Monitoring

1. IT Security monitors Tier 1 and Tier 2 suppliers for material security events (breaches, significant incidents) on an ongoing basis.
2. Tier 1 suppliers are reviewed annually; Tier 2 biennially; Tier 3 triennially.
3. Reviews include: re-running the security questionnaire, reviewing any new certifications or audit reports, and confirming contractual obligations remain in place.
4. Suppliers that fail a periodic review are escalated to {{owner}} for a decision on continuing the relationship.

## 7. Supplier Offboarding

1. At contract termination, the Business Owner notifies IT Security and Procurement at least 30 days in advance.
2. All supplier access is revoked on or before the contract end date.
3. The supplier is required to confirm secure deletion of all {{organisation_name}} data within 30 days of contract termination.
4. Confirmation of data deletion is retained as evidence.

## 8. Record Keeping

The supplier register, security assessments, contracts, DPAs, review records, and offboarding confirmations are retained for a minimum of 5 years.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*

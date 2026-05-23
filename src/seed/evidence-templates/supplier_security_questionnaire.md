---
template_type: supplier_security_questionnaire
clause_mappings: ["8.1"]
control_mappings: ["5.19","5.20","5.21","5.22","5.23"]
---
# Supplier Security Questionnaire

{{> org_header}}

---

## 1. Purpose

This questionnaire is used by **{{organisation_name}}** to assess the information security posture of suppliers and third-party service providers, in accordance with ISO 27001:2022 Controls 5.19 (Information security in supplier relationships), 5.20 (Addressing information security within supplier agreements), 5.21 (Managing information security in the ICT supply chain), 5.22 (Monitoring, review and change management of supplier services), and 5.23 (Information security for use of cloud services).

## 2. Supplier Information

| Field | Response |
|---|---|
| Supplier / Vendor Name | {{supplier_name}} |
| Primary Contact Name | {{supplier_contact}} |
| Contact Email | {{supplier_email}} |
| Contact Phone | {{supplier_phone}} |
| Services Provided | {{services_provided}} |
| Data Processed | {{data_processed}} |
| Contract Reference | {{contract_reference}} |
| Assessment Date | {{assessment_date}} |

## 3. Information Security Management

**3.1** Does your organisation hold a current ISO 27001 or equivalent certification?

> **Response:** {{q_iso_certification}}
> **Certification Body / Expiry:** {{q_iso_cert_detail}}

**3.2** Do you have a documented Information Security Policy?

> **Response:** {{q_isms_policy}}

**3.3** Who is responsible for information security within your organisation?

> **Response:** {{q_security_owner}}

## 4. Access Control

**4.1** How is access to systems processing our data controlled and reviewed?

> **Response:** {{q_access_control}}

**4.2** Is multi-factor authentication enforced for privileged access?

> **Response:** {{q_mfa}}

**4.3** How quickly are access rights revoked when personnel leave?

> **Response:** {{q_offboarding}}

## 5. Data Protection and Encryption

**5.1** How is data in transit and at rest encrypted?

> **Response:** {{q_encryption}}

**5.2** In which countries / regions is our data stored or processed?

> **Response:** {{q_data_location}}

**5.3** Do you engage sub-processors? If so, which ones?

> **Response:** {{q_sub_processors}}

## 6. Incident Management

**6.1** Describe your security incident response process.

> **Response:** {{q_incident_response}}

**6.2** How quickly would you notify us of a security incident affecting our data?

> **Response:** {{q_breach_notification}}

**6.3** Have you experienced any security incidents in the past 24 months? If yes, describe.

> **Response:** {{q_past_incidents}}

## 7. Business Continuity

**7.1** Do you have a documented Business Continuity Plan (BCP)?

> **Response:** {{q_bcp}}

**7.2** What is your Recovery Time Objective (RTO) for critical services?

> **Response:** {{q_rto}}

**7.3** How frequently is the BCP tested?

> **Response:** {{q_bcp_test_frequency}}

## 8. Vulnerability Management and Patching

**8.1** Describe your vulnerability management and patching process.

> **Response:** {{q_vulnerability_management}}

**8.2** What is your target patching SLA for critical vulnerabilities?

> **Response:** {{q_patch_sla}}

## 9. Physical Security

**9.1** What physical security controls protect facilities where our data is processed?

> **Response:** {{q_physical_security}}

## 10. Compliance

**10.1** List all relevant compliance certifications held (ISO 27001, SOC 2, PCI-DSS, etc.).

> **Response:** {{q_compliance_certs}}

**10.2** Are you willing to undergo security audits or assessments by {{organisation_name}}?

> **Response:** {{q_audit_rights}}

## 11. Assessment Outcome

| Field | Detail |
|---|---|
| Overall Risk Rating | {{risk_rating}} |
| Assessment Outcome | {{assessment_outcome}} |
| Conditions / Remediation Required | {{remediation_required}} |
| Next Review Date | {{next_review_date}} |
| Assessor | {{assessor_name}} |

## 12. Sign-Off

| Field | Value |
|---|---|
| Assessor | {{assessor_name}} |
| Date | {{assessment_date}} |
| ISMS Manager | {{isms_manager}} |
| CISO | {{ciso}} |


{{> approver_signature}}

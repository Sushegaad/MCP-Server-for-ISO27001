---
policy_type: supplier_security
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["5.19","5.20","5.21","5.22","5.23","6.6"]
---
# Supplier Security Policy

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Supplier Classification
4. Pre-Engagement Assessment
5. Contractual Requirements
6. Cloud Services
7. Ongoing Monitoring
8. Supply Chain Security
9. Document Control

---

## 1. Purpose

This policy establishes requirements for managing information security risks associated with suppliers, vendors, and other third parties that access, process, store, or transmit {{organisation_name}} information or that provide ICT products or services.

## 2. Scope

{{scope}}

This policy applies to all suppliers including cloud service providers, managed service providers, software vendors, professional services firms, and any third party with access to {{organisation_name}} systems or data.

## 3. Supplier Classification

Suppliers shall be classified based on the level of access to information assets:

| Tier | Access Level | Assessment Required |
|------|-------------|---------------------|
| Tier 1 (Critical) | Access to sensitive/restricted data or critical systems | Full security assessment, contractual security requirements, annual review |
| Tier 2 (Significant) | Access to internal data or non-critical systems | Security questionnaire, contractual requirements, bi-annual review |
| Tier 3 (Standard) | No access to {{organisation_name}} data or systems | Standard contractual terms, periodic review |

## 4. Pre-Engagement Assessment

Before engaging a new Tier 1 or Tier 2 supplier, {{organisation_name}} shall:
- Conduct a security risk assessment of the proposed supplier relationship
- Review the supplier's information security policies and certifications (e.g. ISO 27001, SOC 2)
- Identify and document information security requirements for the relationship
- Obtain {{approver}} approval for Tier 1 suppliers

## 5. Contractual Requirements

All supplier agreements involving access to {{organisation_name}} information shall include:
- Confidentiality and non-disclosure requirements
- Applicable information security standards and controls
- Data handling, storage, and deletion requirements
- Incident notification obligations (within 24 hours of discovery)
- Right to audit information security practices
- Subcontracting restrictions and requirements
- Requirements for prompt access revocation on contract termination

## 6. Cloud Services

For cloud services, additional requirements apply:
- Data residency and sovereignty requirements must be met
- The shared responsibility model must be documented
- Data encryption at rest and in transit must be confirmed
- Exit strategies must be defined prior to onboarding
- Cloud security configuration must comply with the Cloud Security Standard

## 7. Ongoing Monitoring

Supplier security performance shall be monitored through:
- Regular review meetings (frequency based on tier)
- Review of security audit reports and certifications
- Monitoring of security incident notifications
- Periodic questionnaire reassessments
- Right-to-audit exercises for Tier 1 suppliers

## 8. Supply Chain Security

For ICT products and services, {{organisation_name}} shall:
- Assess the security of the supply chain for critical components
- Require transparency of significant supply chain components
- Monitor for supply chain security advisories and vulnerabilities


{{> revision_block}}

{{> approver_signature}}

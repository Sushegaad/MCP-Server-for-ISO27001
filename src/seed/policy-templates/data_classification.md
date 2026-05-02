---
policy_type: data_classification
clause_mappings: ["6.1.2"]
control_mappings: ["5.12","5.13","5.14","8.10","8.11"]
---
# Data Classification Policy

**Organisation:** {{organisation_name}}
**Policy ID:** {{policy_id}}
**Version:** {{version}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{next_review_date}}
**Owner:** {{owner}}
**Approver:** {{approver}}

---

## 1. Purpose

This policy defines the classification of information at {{organisation_name}} to ensure that information assets receive an appropriate level of protection commensurate with their sensitivity and business value.

## 2. Scope

{{scope}}

## 3. Classification Scheme

### Public
**Definition**: Information that has been approved for public release or that poses minimal risk if disclosed.

**Examples**: Marketing materials, published reports, press releases, publicly available product documentation

**Handling Requirements**:
- No restrictions on access or distribution
- May be shared externally without restriction
- No special disposal requirements

### Internal
**Definition**: General business information intended for use within {{organisation_name}}. Unauthorised disclosure could cause minor embarrassment or inconvenience.

**Examples**: Internal procedures, general business communications, meeting minutes (non-sensitive), training materials

**Handling Requirements**:
- Accessible to all {{organisation_name}} personnel
- Not for sharing externally without approval
- Dispose of securely (shred physical documents, secure delete electronic files)

### Confidential
**Definition**: Sensitive business information where unauthorised disclosure could cause significant harm to {{organisation_name}} or individuals.

**Examples**: Financial data, customer data, personnel records, contracts, strategic plans, security policies

**Handling Requirements**:
- Accessible only to authorised personnel on a need-to-know basis
- Must be encrypted in transit (TLS) and at rest (AES-256)
- Physical documents must be stored in locked cabinets
- Must be clearly labelled with classification
- External sharing requires authorisation from information owner
- Dispose of securely (cross-cut shred physical, certified deletion for electronic)

### Restricted
**Definition**: The most sensitive information where unauthorised disclosure could cause serious harm, regulatory penalties, or significant financial impact.

**Examples**: Authentication credentials, cryptographic keys, personal health information, payment card data, classified government information

**Handling Requirements**:
- Strictly controlled access; minimum access principle enforced
- Encryption at rest and in transit mandatory
- Access logged and monitored
- Never transmitted via standard email
- Physical documents in locked secure storage with access log
- Requires two-person authorisation for access where practical
- Destruction requires certified data destruction with documentation

## 4. Classification Process

### 4.1 Assigning Classification
- Information owners are responsible for classifying information they create or manage
- Classification should be assigned at creation and reviewed when content changes significantly
- When in doubt, classify at the higher level

### 4.2 Classification Labels
Electronic files: Include classification in document headers, footers, and file names where practical
Emails: State classification in the subject line (e.g. [CONFIDENTIAL])
Physical documents: Mark with classification on the cover page and each page for Confidential and Restricted
Storage media: Attach physical label clearly indicating classification

### 4.3 Reclassification
Information may be reclassified by the information owner when the sensitivity level changes. Reclassification must be documented and access controls updated accordingly.

## 5. Handling Rules Summary

| Requirement | Public | Internal | Confidential | Restricted |
|-------------|--------|----------|--------------|------------|
| Encryption in transit | No | Recommended | Required | Required |
| Encryption at rest | No | Recommended | Required | Required |
| Access control | None | All staff | Need-to-know | Strictly limited |
| External sharing | Open | With approval | Owner approval + NDA | Senior approval only |
| Secure disposal | No | Yes | Yes + documented | Yes + certified |

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*

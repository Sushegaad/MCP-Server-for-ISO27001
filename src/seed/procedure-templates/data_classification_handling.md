---
procedure_type: data_classification_handling
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["5.12","5.13","5.14","7.10","8.10"]
---
# Data Classification and Handling Procedure

{{> org_header}}

## Table of Contents

1. Purpose
2. Scope
3. Classification Levels
4. Roles and Responsibilities
5. Classification Process
6. Handling Requirements
7. Handling Special Category Data
8. Information Transfer
9. Data Retention and Disposal
10. Record Keeping
11. Document Control

---

## 1. Purpose

This procedure defines how information assets at {{organisation_name}} are classified and describes the handling requirements for each classification level, ensuring information is protected commensurate with its sensitivity.

## 2. Scope

{{scope}}

## 3. Classification Levels

| Level | Definition | Examples |
|---|---|---|
| Public | Approved for public release; no harm from disclosure | Marketing materials, published reports |
| Internal | For internal use only; limited harm from disclosure | Internal policies, staff directories, meeting minutes |
| Confidential | Sensitive business information; significant harm from disclosure | Financial data, customer information, contracts |
| Restricted | Highest sensitivity; serious harm from disclosure | Personal data, trade secrets, cryptographic keys, audit findings |

## 4. Roles and Responsibilities

- **Data Owner**: Classifies data assets under their ownership; accountable for handling compliance
- **Data Custodian**: Implements technical controls to protect data per its classification
- **All Staff**: Apply classification labels and follow handling requirements
- **{{owner}}**: Owns this procedure; advises on classification decisions

## 5. Classification Process

### 5.1 Classifying Information
1. The Data Owner assigns a classification level when information is created or collected, based on the definitions in Section 3.
2. Classification is based on the most sensitive element within a document or dataset.
3. Where classification is unclear, the Data Owner consults {{owner}} for guidance.
4. Classification is reviewed when the information's context changes (e.g., public release of previously confidential information).

### 5.2 Labelling
1. Documents must carry a classification label in the header or footer (e.g., "RESTRICTED — {{organisation_name}} Confidential").
2. Email: classification is stated in the subject line or body for Confidential and Restricted emails.
3. Physical documents: classification is marked on each page.
4. Electronic files: classification is included in the filename or document metadata where feasible.

## 6. Handling Requirements

### 6.1 Public
- No special handling required.
- Must be approved for public release by an authorised manager before publication.

### 6.2 Internal
- Accessible to all {{organisation_name}} staff and authorised contractors.
- Not shared externally without manager approval.
- Stored on internal systems; no storage on personal or public cloud services.

### 6.3 Confidential
- Access restricted to individuals with a business need.
- Encrypted at rest and in transit.
- Shared externally only under a signed Non-Disclosure Agreement or Data Processing Agreement.
- Printed copies stored in locked filing cabinets; shredded when no longer needed.
- Must not be left unattended on desks (clean desk policy applies).

### 6.4 Restricted
- Access restricted to specifically named individuals; access list maintained by the Data Owner.
- Encrypted at rest using AES-256 or equivalent.
- Transmitted only over encrypted channels (TLS 1.2+ or equivalent); never via standard email without additional encryption.
- Remote access requires MFA.
- Physical copies stored in a locked safe; destruction requires cross-cut shredding or equivalent.
- Logging of all access events is mandatory.
- Copying or forwarding requires explicit approval from the Data Owner.

## 7. Handling Special Category Data

Personal data (as defined by applicable data protection law) and special category data must be handled in accordance with the data protection obligations of {{organisation_name}}, in addition to the Restricted handling requirements above. The DPO must be consulted before any new collection or processing of special category data is initiated.

## 8. Information Transfer

1. Confidential and Restricted information transferred to third parties requires a signed agreement (NDA or DPA) in place before transfer.
2. Transfer mechanisms: approved encrypted file transfer services, encrypted email, or secure physical courier.
3. Unencrypted removable media (USB drives) is prohibited for Confidential and Restricted data.
4. Transfer activities involving Restricted data are logged.

## 9. Data Retention and Disposal

1. Data is retained only as long as required for its business purpose or as mandated by law.
2. Disposal of Confidential and Restricted data requires secure methods:
   - Electronic: cryptographic erasure or secure wipe (minimum 3-pass)
   - Physical: cross-cut shredding or incineration
3. Disposal is documented in the asset/data register.

## 10. Record Keeping

Classification decisions, access lists for Restricted data, transfer logs, and disposal records are retained for a minimum of 3 years.


{{> revision_block}}

{{> approver_signature}}

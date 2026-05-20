---
procedure_type: asset_onboarding_offboarding
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["5.9","5.10","5.11","7.8","7.14","8.10"]
---
# Asset Onboarding and Offboarding Procedure

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

This procedure defines the process for registering, configuring, and retiring information assets (hardware, software, and data assets) at {{organisation_name}}, ensuring assets are inventoried, protected, and securely disposed of throughout their lifecycle.

## 2. Scope

{{scope}}

## 3. Asset Types

- **Hardware**: Servers, workstations, laptops, mobile devices, network equipment, storage media
- **Software**: Licensed applications, operating systems, cloud service subscriptions, SaaS tools
- **Information Assets**: Databases, data stores, repositories, data classification labels

## 4. Roles and Responsibilities

- **Asset Owner**: Accountable for the asset throughout its lifecycle; assigns classification
- **IT Operations / {{owner}}**: Maintains the asset register; executes onboarding and offboarding steps
- **Procurement**: Notifies IT Operations of new hardware and software purchases
- **HR**: Notifies IT Operations of staff joiners and leavers for device provisioning/retrieval
- **Security**: Reviews high-value asset configurations; validates secure disposal

## 5. Asset Onboarding

### 5.1 Hardware Onboarding
1. Procurement notifies IT Operations upon receipt of new hardware.
2. IT Operations assigns a unique asset tag to each device and records it in the asset register with:
   - Asset tag / serial number
   - Asset type and description
   - Make and model
   - Assigned user or location
   - Asset Owner
   - Acquisition date and cost
   - Warranty expiry
   - Data classification of information processed/stored
3. The device is configured according to the approved hardening baseline before deployment:
   - Operating system and firmware patched to current levels
   - Endpoint security (antivirus, EDR) agent installed and active
   - Disk encryption enabled (BitLocker, FileVault, or equivalent)
   - Remote management agent enrolled
   - Unnecessary services and ports disabled
4. Configuration is recorded in the asset register (hardening checklist reference).
5. The device is assigned to its user or location; assignment is recorded.

### 5.2 Software and SaaS Onboarding
1. New software or SaaS tool requests are reviewed by IT Security before procurement to assess security risk and data handling implications.
2. Upon approval, the software is registered in the asset register with:
   - Software name and vendor
   - Version or subscription tier
   - Licence key or account reference
   - Business Owner / Asset Owner
   - Data classification of data processed
   - Licence expiry or renewal date
3. Software is deployed from official sources only (vendor site, approved package repository).
4. Configuration is hardened per vendor security guidance or applicable baseline.

## 6. Asset Changes

1. Changes to asset assignments (e.g., device transferred between users) are updated in the asset register within 2 business days.
2. Changes to software versions, licence counts, or configurations are recorded.
3. Asset register accuracy is audited quarterly.

## 7. Asset Offboarding

### 7.1 Hardware Offboarding
1. HR notifies IT Operations at least 5 business days before a staff member's departure (or immediately for unplanned terminations).
2. IT Operations retrieves all assigned devices from the departing user on or before their last day.
3. All data is securely erased from the device before redeployment or disposal:
   - Redeployment: Cryptographic erasure or approved secure wipe (minimum 3-pass)
   - Disposal: Physical destruction or certified data destruction by an approved vendor
4. Erasure is documented with: asset tag, method, operator, date, and (for external disposal) vendor certificate.
5. The asset register is updated to reflect the device status (redeployed, disposed).

### 7.2 Software and SaaS Offboarding
1. When a software licence expires or a SaaS subscription is cancelled, IT Operations deactivates the account and revokes all user access.
2. Data exported or migrated from decommissioned SaaS tools is classified and stored in accordance with the Data Classification and Handling Procedure.
3. The vendor is requested to confirm deletion of {{organisation_name}} data upon contract termination (Tier 1 suppliers).
4. The asset register is updated to reflect the decommission date.

## 8. Storage Media Management

1. All storage media containing Confidential or Restricted data must be encrypted at rest.
2. Removable media (USB drives, external hard drives) must be approved and registered before use.
3. Lost or stolen storage media is reported immediately as a security incident.
4. End-of-life storage media is securely disposed of per Section 7.1.

## 9. Record Keeping

The asset register, hardening checklists, assignment records, disposal certificates, and vendor data deletion confirmations are retained for a minimum of 5 years.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*

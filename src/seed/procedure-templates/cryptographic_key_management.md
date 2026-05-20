---
procedure_type: cryptographic_key_management
clause_mappings: ["6.1.2","8.1"]
control_mappings: ["8.24","5.17"]
---
# Cryptographic Key Management Procedure

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

This procedure governs the generation, storage, distribution, use, rotation, and destruction of cryptographic keys used to protect information assets at {{organisation_name}}, ensuring keys are managed securely throughout their lifecycle.

## 2. Scope

{{scope}}

## 3. Approved Cryptographic Algorithms and Key Lengths

| Use Case | Algorithm | Minimum Key Length |
|---|---|---|
| Symmetric encryption (data at rest) | AES | 256-bit |
| Asymmetric encryption / digital signatures | RSA | 4096-bit |
| Asymmetric encryption / digital signatures | ECDSA / ECDH | P-256 or higher |
| Hashing | SHA-2 family | SHA-256 or higher |
| Key derivation | PBKDF2 / Argon2id | Per NIST SP 800-132 |
| TLS | TLS 1.2 minimum, TLS 1.3 preferred | N/A |

Use of deprecated algorithms (MD5, SHA-1, DES, 3DES, RC4, RSA < 2048-bit) is prohibited.

## 4. Roles and Responsibilities

- **Key Custodian**: Individuals authorised to generate and manage specific key sets
- **{{owner}}**: Owns this procedure; approves key generation and destruction
- **IT Security**: Reviews key management practices during internal audits
- **System Owners**: Ensure keys protecting their systems comply with this procedure

## 5. Key Generation

1. Keys must be generated using a cryptographically secure random number generator (CSPRNG).
2. Keys must meet the algorithm and length requirements in Section 3.
3. Key generation is performed in a secure environment (dedicated key management system or HSM where available).
4. Each key generation event is logged with: key identifier, algorithm, purpose, generating system, and Key Custodian identity.
5. Keys must never be generated on systems that are not under {{organisation_name}}'s control.

## 6. Key Storage

1. Private keys and symmetric keys must never be stored in plaintext.
2. Keys at rest must be protected using an approved key management system (KMS) or hardware security module (HSM).
3. Keys must not be stored in source code repositories, configuration files, or shared storage accessible to unauthorised users.
4. Backup copies of critical keys are stored in a separate secure location (e.g., HSM backup module or sealed physical storage with access controls).
5. Access to keys is restricted on a need-to-know basis and controlled via RBAC in the KMS.

## 7. Key Distribution

1. Keys must be transmitted only over encrypted channels (TLS 1.2+ or equivalent).
2. Keys must never be transmitted via email, instant messaging, or other unencrypted channels.
3. When distributing keys to third parties, a separate secure key exchange mechanism (e.g., encrypted key wrapping, in-person exchange) must be used.
4. Distribution events are logged.

## 8. Key Rotation

| Key Type | Rotation Frequency |
|---|---|
| TLS certificates | Annual (or on compromise) |
| Database encryption keys | Annual |
| API signing keys | Every 90 days |
| SSH host keys | On system rebuild or compromise |
| Password hashing salts | On hash algorithm change |

1. Key rotation events are scheduled and tracked in the key register.
2. Before rotation, the new key is generated and tested in a non-production environment.
3. Applications and systems are updated to use the new key, and old key retirement is confirmed before the old key is destroyed.
4. Rotation is logged with old and new key identifiers.

## 9. Key Revocation and Destruction

1. Keys are revoked immediately upon: suspected or confirmed compromise, departure of Key Custodian, end of the key's purpose, or system decommission.
2. Revoked keys are flagged in the key register; any data encrypted with them must be re-encrypted with a new key.
3. Key destruction must render the key unrecoverable (cryptographic erasure, secure wipe of storage media, or physical destruction of HSM).
4. Destruction is logged with: key identifier, destruction method, date, and authorising Key Custodian.
5. TLS certificate revocation is performed via CRL or OCSP and notification is sent to relying parties.

## 10. Key Register

A key register is maintained by {{owner}} recording:
- Key identifier (not the key value itself)
- Algorithm and key length
- Purpose and system(s) protected
- Creation date, rotation schedule, and expiry date
- Key Custodian(s)
- Status (active, rotated, revoked, destroyed)

The register is reviewed quarterly.

## 11. Record Keeping

Key lifecycle events (generation, distribution, rotation, revocation, destruction) are logged and retained for a minimum of 5 years. The key register is retained for the life of the organisation.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*

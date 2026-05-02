---
policy_type: cryptography
clause_mappings: ["6.1.2","6.1.3"]
control_mappings: ["8.24","5.14","8.5"]
---
# Cryptography Policy

**Organisation:** {{organisation_name}}
**Policy ID:** {{policy_id}}
**Version:** {{version}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{next_review_date}}
**Owner:** {{owner}}
**Approver:** {{approver}}

---

## 1. Purpose

This policy establishes requirements for the effective use of cryptographic controls to protect the confidentiality, integrity, and authenticity of information assets at {{organisation_name}}.

## 2. Scope

{{scope}}

## 3. Approved Algorithms

The following cryptographic algorithms are approved for use within {{organisation_name}}:

### Symmetric Encryption
- AES-256 (GCM mode preferred for authenticated encryption)
- AES-128 (acceptable for lower sensitivity data)

### Asymmetric Encryption / Key Exchange
- RSA: minimum 2048 bits (4096 bits recommended for new implementations)
- Elliptic Curve Cryptography (ECC): minimum 256-bit curves (P-256, P-384, X25519)

### Hashing
- SHA-256 or stronger (SHA-2 family, SHA-3 family)
- HMAC-SHA-256 or stronger for message authentication

### TLS
- TLS 1.2 minimum; TLS 1.3 preferred
- Insecure protocols (SSL 2.0/3.0, TLS 1.0/1.1) are prohibited

The following are **prohibited**: MD5 (for security purposes), SHA-1 (for security purposes), DES, 3DES, RC4, export-grade ciphers.

## 4. Use Cases

### 4.1 Data at Rest
Sensitive and restricted data stored on servers, databases, and portable devices must be encrypted using AES-256. Full-disk encryption is required for all laptops and portable devices.

### 4.2 Data in Transit
All sensitive data transmitted over public or untrusted networks must be encrypted using TLS 1.2 or higher. VPN tunnels for remote access must use approved protocols.

### 4.3 Email
Sensitive information transmitted via email must be encrypted. S/MIME or equivalent email encryption shall be used for Confidential or Restricted information.

### 4.4 Code Signing
Software released by {{organisation_name}} shall be digitally signed using approved signing certificates.

## 5. Key Management

### 5.1 Key Generation
Cryptographic keys must be generated using approved random number generators and algorithms. Key length must meet minimum requirements specified in Section 3.

### 5.2 Key Storage
Private keys and symmetric keys must be stored securely, encrypted at rest. Access to key material must be restricted and logged. Approved key management systems or hardware security modules (HSMs) should be used for critical key material.

### 5.3 Key Distribution
Keys must be distributed through secure channels. Public keys shall be distributed via PKI certificates from trusted Certificate Authorities.

### 5.4 Key Rotation
- Symmetric keys: rotate at least annually, or upon suspected compromise
- Asymmetric keys: rotate before expiry; certificates must not be allowed to expire
- Compromised keys must be immediately revoked and replaced

### 5.5 Key Revocation and Destruction
Compromised or retired keys must be revoked immediately. Key destruction must be documented. Certificate revocation lists (CRLs) and OCSP must be checked before trusting certificates.

## 6. Certificate Management

{{organisation_name}} shall maintain an inventory of all certificates in use. Certificate expiry shall be monitored, with renewal initiated at least 30 days before expiry. Self-signed certificates are prohibited in production environments.

---

**Clause Mappings:** {{clause_mappings}}
**Control Mappings:** {{control_mappings}}

*Approved by: {{approver}} | Effective: {{effective_date}} | Next Review: {{next_review_date}}*

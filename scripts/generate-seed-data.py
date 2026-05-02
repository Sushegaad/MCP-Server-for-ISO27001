#!/usr/bin/env python3
"""
Generate ISO 27001 seed data files for the MCP server.
Run with: python3 scripts/generate-seed-data.py
Outputs: src/seed/controls-2022.json, controls-2013.json,
         version-mapping.json, clause-requirements.json, seed-schema.json
"""

import json
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "seed")
os.makedirs(OUT, exist_ok=True)

# ─── ISO 27001:2022 Annex A Controls ────────────────────────────────────────
# 93 controls across 4 themes
# Attributes follow ISO 27001:2022 Annex A attribute taxonomy

CONTROLS_2022 = [
  # ── Organizational (5.1 – 5.37) ─────────────────────────────────────────
  {
    "control_id": "5.1", "version": "2022", "name": "Policies for information security",
    "theme": "Organizational",
    "description": "Information security policy and topic-specific policies shall be defined, approved by management, published, communicated to and acknowledged by relevant personnel and relevant interested parties, and reviewed at planned intervals or if significant changes occur.",
    "guidance": "Policies should address business requirements, relevant legislation and regulations, current and anticipated information security threats, and the specific policy areas defined in Annex A. Policies shall be reviewed at planned intervals or if significant changes occur.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Governance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.2","5.4","5.36","5.37"], "new_in_2022": False, "iso_clause_refs": ["5","6.2"]
  },
  {
    "control_id": "5.2", "version": "2022", "name": "Information security roles and responsibilities",
    "theme": "Organizational",
    "description": "Information security roles and responsibilities shall be defined and allocated according to the organisation's needs.",
    "guidance": "Roles and responsibilities should be defined for all personnel involved in information security. Responsibilities for protecting specific assets and carrying out specific information security processes shall be clearly assigned.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Governance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.1","5.3","5.4","6.2"], "new_in_2022": False, "iso_clause_refs": ["5.3","6.1.1"]
  },
  {
    "control_id": "5.3", "version": "2022", "name": "Segregation of duties",
    "theme": "Organizational",
    "description": "Conflicting duties and conflicting areas of responsibility shall be segregated.",
    "guidance": "Care should be taken that no single person can access, modify or use assets without authorisation or detection. Activities requiring segregation include initiating a request and approving it. Smaller organisations may find segregation difficult, but compensating controls such as monitoring and management oversight should be applied.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.2","8.2"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.4", "version": "2022", "name": "Management responsibilities",
    "theme": "Organizational",
    "description": "Management shall require all personnel to apply information security in accordance with the established information security policy, topic-specific policies and procedures of the organisation.",
    "guidance": "Management shall demonstrate their support for information security policies by communicating expectations to employees, providing feedback on performance, and participating in information security reviews.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Governance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.1","5.2","6.3"], "new_in_2022": False, "iso_clause_refs": ["5.1","5.2"]
  },
  {
    "control_id": "5.5", "version": "2022", "name": "Contact with authorities",
    "theme": "Organizational",
    "description": "The organisation shall establish and maintain contact with relevant authorities.",
    "guidance": "Organisations should maintain contacts with relevant authorities such as law enforcement, regulatory bodies, and emergency services. Contacts should be maintained so that appropriate liaison is available to expedite actions in the event of an information security incident.",
    "control_type": ["Preventive","Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Respond","Recover"], "operational_capabilities": ["Governance"], "security_domains": ["Governance_and_ecosystem","Defence"]},
    "related_controls": ["5.6","5.24","5.26"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.6", "version": "2022", "name": "Contact with special interest groups",
    "theme": "Organizational",
    "description": "The organisation shall establish and maintain contact with special interest groups or other specialist security forums and professional associations.",
    "guidance": "Membership in special interest groups or forums should be considered as a means to improve knowledge about best practices and to stay up-to-date with relevant information security information.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify"], "operational_capabilities": ["Governance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.5","5.7"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.7", "version": "2022", "name": "Threat intelligence",
    "theme": "Organizational",
    "description": "Information relating to information security threats shall be collected and analysed to produce threat intelligence.",
    "guidance": "Threat intelligence should include technical, tactical, operational and strategic levels. Intelligence gathered should be used to update the risk assessment process and contribute to control selection. Sources of threat intelligence include ISAC feeds, vendor advisories, CERT notifications and internal incident data.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Detect"], "operational_capabilities": ["Information_security_event_management","Governance"], "security_domains": ["Governance_and_ecosystem","Defence"]},
    "related_controls": ["5.5","5.6","8.8","8.16"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "5.8", "version": "2022", "name": "Information security in project management",
    "theme": "Organizational",
    "description": "Information security shall be integrated into project management.",
    "guidance": "Information security requirements should be addressed in all types of projects, regardless of the type of project. Project managers should ensure information security risks are identified and addressed as part of project risk management. Security reviews should be conducted at key project milestones.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Governance","System_and_network_security"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.1","5.9","8.25","8.26"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.9", "version": "2022", "name": "Inventory of information and other associated assets",
    "theme": "Organizational",
    "description": "An inventory of information and other associated assets, including owners, shall be developed and maintained.",
    "guidance": "Asset inventories should include information assets, software, physical assets, services, people, and intangibles. Each asset should have an assigned owner responsible for its protection. The inventory should be kept accurate and up to date.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify"], "operational_capabilities": ["Asset_management"], "security_domains": ["Governance_and_ecosystem","Protection"]},
    "related_controls": ["5.10","5.11","5.12"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.10", "version": "2022", "name": "Acceptable use of information and other associated assets",
    "theme": "Organizational",
    "description": "Rules for the acceptable use and procedures for handling information and other associated assets shall be identified, documented and implemented.",
    "guidance": "Acceptable use policies should cover all categories of assets. Users should be made aware of the information security requirements for handling assets. Policies should address personal use of organisational assets.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Asset_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.9","5.12","6.3","8.1"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.11", "version": "2022", "name": "Return of assets",
    "theme": "Organizational",
    "description": "Personnel and other interested parties as appropriate shall return all the organisation's assets in their possession upon change or termination of their employment, contract or agreement.",
    "guidance": "The return of assets process should be formalised and verified. Procedures should address return of equipment, media, documents, and credentials. Where assets are not returned, their loss should be recorded and appropriate action taken.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Asset_management","Human_resource_security"], "security_domains": ["Protection","Governance_and_ecosystem"]},
    "related_controls": ["5.9","6.5","7.9"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.12", "version": "2022", "name": "Classification of information",
    "theme": "Organizational",
    "description": "Information shall be classified according to the information security needs of the organisation based on confidentiality, integrity, availability and relevant interested party requirements.",
    "guidance": "A classification scheme should be consistent with the organisation's business needs. Classification levels should be few enough to be manageable but sufficient to convey the relative sensitivity. Classification should include consideration of legal and regulatory requirements.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Asset_management","Information_protection"], "security_domains": ["Governance_and_ecosystem","Protection"]},
    "related_controls": ["5.9","5.13","5.14"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.13", "version": "2022", "name": "Labelling of information",
    "theme": "Organizational",
    "description": "An appropriate set of procedures for information labelling shall be developed and implemented in accordance with the information classification scheme adopted by the organisation.",
    "guidance": "Labelling procedures should cover all information assets including physical and electronic formats. Labels should be clearly visible and not impede normal use. Automated labelling tools should be used where practical.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Asset_management","Information_protection"], "security_domains": ["Protection"]},
    "related_controls": ["5.12","5.14"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.14", "version": "2022", "name": "Information transfer",
    "theme": "Organizational",
    "description": "Information transfer rules, procedures, or agreements shall be in place for all types of transfer facilities within the organisation and between the organisation and other parties.",
    "guidance": "Transfer policies should address electronic transfers, physical media transfers, and verbal transfers. Agreements with third parties should include security requirements for information transfers. Encryption should be used for sensitive information in transit.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Information_protection","System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["5.12","5.13","8.24"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.15", "version": "2022", "name": "Access control",
    "theme": "Organizational",
    "description": "Rules to control physical and logical access to information and other associated assets shall be established and implemented based on business and information security requirements.",
    "guidance": "Access control policies should be based on the principle of least privilege. Access rights should be regularly reviewed. Policies should address remote access, privileged access, and access by third parties.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.16","5.17","5.18","8.2","8.3"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.16", "version": "2022", "name": "Identity management",
    "theme": "Organizational",
    "description": "The full life cycle of identities shall be managed.",
    "guidance": "Identity management should cover creation, maintenance and deletion of identities. Unique identifiers should be assigned to each person. Shared identities should be discouraged. Processes should ensure identities are promptly deactivated when no longer needed.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.15","5.17","5.18","8.2"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.17", "version": "2022", "name": "Authentication information",
    "theme": "Organizational",
    "description": "Allocation and management of authentication information shall be controlled by a management process, including advising personnel on appropriate handling of authentication information.",
    "guidance": "Authentication information policies should address password complexity, length, change frequency and history. Organisations should implement multi-factor authentication where appropriate. Users should be advised not to share authentication information.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.15","5.16","8.5"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.18", "version": "2022", "name": "Access rights",
    "theme": "Organizational",
    "description": "Access rights to information and other associated assets shall be provisioned, reviewed, modified and removed in accordance with the organisation's topic-specific policy on and rules for access control.",
    "guidance": "Access provisioning should follow a formal request and approval process. Access rights should be reviewed regularly and when roles change. Privileged access rights require more frequent review. Access rights should be removed promptly on termination.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.15","5.16","5.17","6.5","8.2"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.19", "version": "2022", "name": "Information security in supplier relationships",
    "theme": "Organizational",
    "description": "Processes and procedures shall be defined and implemented to manage the information security risks associated with the use of supplier's products or services.",
    "guidance": "Supplier security management should include a supplier security policy, risk assessment prior to engagement, contractual requirements, and ongoing monitoring. The organisation should maintain an inventory of suppliers and their access to information assets.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Supplier_relationships_security"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.20","5.21","5.22"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.20", "version": "2022", "name": "Addressing information security within supplier agreements",
    "theme": "Organizational",
    "description": "Relevant information security requirements shall be established and agreed with each supplier based on the type of supplier relationship.",
    "guidance": "Supplier agreements should include confidentiality requirements, data handling obligations, security standards to be maintained, right to audit, incident notification requirements, and liability provisions. Agreements should address subcontracting arrangements.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Supplier_relationships_security","Legal_and_compliance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.19","5.21","5.22"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.21", "version": "2022", "name": "Managing information security in the ICT supply chain",
    "theme": "Organizational",
    "description": "Processes and procedures shall be defined and implemented to manage the information security risks associated with the ICT products and services supply chain.",
    "guidance": "Supply chain security should address risks from hardware, software and services sourced from third parties. Organisations should assess supplier security practices, require transparency of supply chain components, and implement controls to detect tampered products.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect","Detect"], "operational_capabilities": ["Supplier_relationships_security"], "security_domains": ["Governance_and_ecosystem","Protection"]},
    "related_controls": ["5.19","5.20","5.22"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.22", "version": "2022", "name": "Monitoring, review and change management of supplier services",
    "theme": "Organizational",
    "description": "The organisation shall regularly monitor, review, evaluate and manage change in supplier information security practices and service delivery.",
    "guidance": "Supplier performance should be monitored against agreed service levels and security requirements. Reviews should cover changes to supplier services, security incidents, audit results, and compliance status. Changes to supplier arrangements should be managed through a formal change process.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Detect"], "operational_capabilities": ["Supplier_relationships_security"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.19","5.20","5.21"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.23", "version": "2022", "name": "Information security for use of cloud services",
    "theme": "Organizational",
    "description": "Processes for acquisition, use, management and exit from cloud services shall be established in accordance with the organisation's information security requirements.",
    "guidance": "Cloud security processes should address service model considerations (IaaS/PaaS/SaaS), data residency and sovereignty, shared responsibility models, encryption of data at rest and in transit, access management, and exit strategies to prevent vendor lock-in.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect","Detect"], "operational_capabilities": ["Supplier_relationships_security","System_and_network_security"], "security_domains": ["Governance_and_ecosystem","Protection"]},
    "related_controls": ["5.19","5.20","5.22","8.24"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "5.24", "version": "2022", "name": "Information security incident management planning and preparation",
    "theme": "Organizational",
    "description": "The organisation shall plan and prepare for managing information security incidents by defining, establishing and communicating information security incident management processes, roles and responsibilities.",
    "guidance": "Incident management planning should define what constitutes an incident, establish an incident response team, define escalation procedures, and ensure resources are available. Plans should be tested through exercises and updated based on lessons learned.",
    "control_type": ["Preventive","Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Respond","Recover"], "operational_capabilities": ["Information_security_event_management"], "security_domains": ["Defence"]},
    "related_controls": ["5.25","5.26","5.27","5.28","6.8"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.25", "version": "2022", "name": "Assessment and decision on information security events",
    "theme": "Organizational",
    "description": "The organisation shall assess information security events and decide if they are to be categorised as information security incidents.",
    "guidance": "Assessment criteria should be defined to distinguish events from incidents. Triage processes should be established to prioritise incidents based on severity. Decision records should be maintained for audit purposes.",
    "control_type": ["Detective","Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Detect","Respond"], "operational_capabilities": ["Information_security_event_management"], "security_domains": ["Defence"]},
    "related_controls": ["5.24","5.26","6.8","8.16"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.26", "version": "2022", "name": "Response to information security incidents",
    "theme": "Organizational",
    "description": "Information security incidents shall be responded to in accordance with the documented procedures.",
    "guidance": "Incident response should include containment, eradication and recovery activities. Evidence should be collected and preserved. Communications should be managed including notification to affected parties and regulators where required. Post-incident analysis should be conducted.",
    "control_type": ["Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Respond","Recover"], "operational_capabilities": ["Information_security_event_management"], "security_domains": ["Defence"]},
    "related_controls": ["5.24","5.25","5.27","5.28"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.27", "version": "2022", "name": "Learning from information security incidents",
    "theme": "Organizational",
    "description": "Knowledge gained from information security incidents shall be used to strengthen and improve the information security controls.",
    "guidance": "Post-incident reviews should identify root causes and contributing factors. Lessons learned should be documented and shared. Control improvements identified should be tracked through to implementation. Incident data should be used to update risk assessments.",
    "control_type": ["Preventive","Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Recover"], "operational_capabilities": ["Information_security_event_management","Governance"], "security_domains": ["Defence","Governance_and_ecosystem"]},
    "related_controls": ["5.24","5.25","5.26"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.28", "version": "2022", "name": "Collection of evidence",
    "theme": "Organizational",
    "description": "The organisation shall establish and implement procedures for the identification, collection, acquisition and preservation of evidence related to information security events.",
    "guidance": "Evidence collection procedures should ensure evidence integrity and chain of custody. Digital forensic principles should be applied where evidence may be used in legal proceedings. Evidence should be stored securely and access controlled.",
    "control_type": ["Detective","Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Detect","Respond"], "operational_capabilities": ["Information_security_event_management","Legal_and_compliance"], "security_domains": ["Defence"]},
    "related_controls": ["5.24","5.25","5.26","8.15"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.29", "version": "2022", "name": "Information security during disruption",
    "theme": "Organizational",
    "description": "The organisation shall plan how to maintain information security at an appropriate level during disruption.",
    "guidance": "Business continuity plans should include information security requirements. Recovery time and recovery point objectives should be defined for information systems. Security controls should be maintained or compensating controls applied during disruption.",
    "control_type": ["Preventive","Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Recover"], "operational_capabilities": ["Continuity"], "security_domains": ["Resilience"]},
    "related_controls": ["5.30","8.13","8.14"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.30", "version": "2022", "name": "ICT readiness for business continuity",
    "theme": "Organizational",
    "description": "ICT readiness shall be planned, implemented, maintained and tested based on business continuity objectives and ICT continuity requirements.",
    "guidance": "ICT continuity planning should address backup and recovery of critical systems, alternative processing facilities, resilience of network connectivity, and testing of recovery procedures. Plans should be reviewed and tested at planned intervals.",
    "control_type": ["Preventive","Corrective"],
    "attributes": {"information_security_properties": ["Availability"], "cybersecurity_concepts": ["Protect","Recover"], "operational_capabilities": ["Continuity"], "security_domains": ["Resilience"]},
    "related_controls": ["5.29","8.13","8.14"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "5.31", "version": "2022", "name": "Legal, statutory, regulatory and contractual requirements",
    "theme": "Organizational",
    "description": "Legal, statutory, regulatory and contractual requirements relevant to information security and the organisation's approach to meet these requirements shall be identified, documented and kept up to date.",
    "guidance": "A register of applicable legal and regulatory requirements should be maintained. Requirements should be mapped to information security controls. Changes to applicable legislation and regulations should be monitored and the register updated.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Legal_and_compliance","Governance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.32","5.33","5.34"], "new_in_2022": False, "iso_clause_refs": ["4.2"]
  },
  {
    "control_id": "5.32", "version": "2022", "name": "Intellectual property rights",
    "theme": "Organizational",
    "description": "The organisation shall implement appropriate procedures to protect intellectual property rights.",
    "guidance": "Procedures should address software licensing compliance, copyright protection, and protection of proprietary information. A register of licensed software should be maintained. Staff should be trained on intellectual property obligations.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Legal_and_compliance"], "security_domains": ["Governance_and_ecosystem","Protection"]},
    "related_controls": ["5.31"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.33", "version": "2022", "name": "Protection of records",
    "theme": "Organizational",
    "description": "Records shall be protected from loss, destruction, falsification, unauthorised access and unauthorised release.",
    "guidance": "A records retention schedule should be defined considering legal requirements, business needs and applicable standards. Records should be stored in appropriate formats and media. Procedures should address both physical and electronic records.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Legal_and_compliance","Information_protection"], "security_domains": ["Protection","Governance_and_ecosystem"]},
    "related_controls": ["5.31","5.34","8.10"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.34", "version": "2022", "name": "Privacy and protection of personally identifiable information",
    "theme": "Organizational",
    "description": "The organisation shall identify and meet the requirements regarding the preservation of privacy and protection of PII according to applicable laws and regulations and contractual requirements.",
    "guidance": "Privacy requirements should be addressed in policies and procedures. A privacy impact assessment process should be established. Staff handling PII should receive privacy awareness training. Data subject rights mechanisms should be implemented.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Legal_and_compliance","Information_protection"], "security_domains": ["Protection","Governance_and_ecosystem"]},
    "related_controls": ["5.31","5.33","8.10","8.11"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "5.35", "version": "2022", "name": "Independent review of information security",
    "theme": "Organizational",
    "description": "The organisation's approach to managing information security and its implementation including people, processes and technologies shall be reviewed independently at planned intervals, or when significant changes occur.",
    "guidance": "Independent reviews may be conducted by internal audit, management, or third parties. Review scope should cover policies, risk management processes, controls implementation, and incident management effectiveness. Findings should be reported to management.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify"], "operational_capabilities": ["Governance","Information_security_assurance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.36","5.4"], "new_in_2022": False, "iso_clause_refs": ["9.2","9.3"]
  },
  {
    "control_id": "5.36", "version": "2022", "name": "Compliance with policies, rules and standards for information security",
    "theme": "Organizational",
    "description": "Compliance with the organisation's information security policy, topic-specific policies, rules and standards shall be regularly reviewed.",
    "guidance": "Managers should review compliance with information security policies within their areas of responsibility. Automated tools should be used where available to check technical compliance. Non-compliance findings should be escalated and remediated.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify"], "operational_capabilities": ["Governance","Information_security_assurance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.1","5.35"], "new_in_2022": False, "iso_clause_refs": ["9.1"]
  },
  {
    "control_id": "5.37", "version": "2022", "name": "Documented operating procedures",
    "theme": "Organizational",
    "description": "Operating procedures for information processing facilities shall be documented and made available to personnel who need them.",
    "guidance": "Procedures should be documented for all significant information processing activities. Procedures should include start-up and shut-down, backup, handling errors, and maintenance activities. Procedures should be kept up to date and version controlled.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Governance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["5.1","5.4"], "new_in_2022": False, "iso_clause_refs": []
  },

  # ── People (6.1 – 6.8) ───────────────────────────────────────────────────
  {
    "control_id": "6.1", "version": "2022", "name": "Screening",
    "theme": "People",
    "description": "Background verification checks on all candidates to become personnel shall be carried out prior to joining the organisation and on an ongoing basis taking into consideration applicable laws, regulations and ethics and be proportional to the business requirements, the classification of the information to be accessed and the perceived risks.",
    "guidance": "Screening should be proportional to the sensitivity of the role and applicable legal requirements. Checks may include identity verification, employment history, academic qualifications, criminal record checks, and credit checks. Rescreening should occur for roles with significant changes.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Human_resource_security"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["6.2"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "6.2", "version": "2022", "name": "Terms and conditions of employment",
    "theme": "People",
    "description": "The employment contractual agreements shall state the personnel's and the organisation's responsibilities for information security.",
    "guidance": "Employment contracts should include information security obligations, confidentiality requirements, acceptable use requirements, and consequences of non-compliance. Obligations should continue where appropriate after termination of employment.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Human_resource_security","Legal_and_compliance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["6.1","6.4","6.6"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "6.3", "version": "2022", "name": "Information security awareness, education and training",
    "theme": "People",
    "description": "Personnel of the organisation and relevant interested parties shall receive appropriate information security awareness, education and training and regular updates of the organisation's information security policy, topic-specific policies and procedures, as relevant for their job function.",
    "guidance": "Awareness programmes should cover information security basics, policies, specific threats, and responsibilities. Training should be role-specific for those with security responsibilities. Effectiveness should be measured and training updated regularly.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Human_resource_security"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["6.2","5.4","5.1"], "new_in_2022": False, "iso_clause_refs": ["7.2","7.3"]
  },
  {
    "control_id": "6.4", "version": "2022", "name": "Disciplinary process",
    "theme": "People",
    "description": "A disciplinary process shall be formalised and communicated to take action against personnel and other relevant interested parties who have committed an information security policy violation.",
    "guidance": "The disciplinary process should provide fair and proportionate responses to security policy violations. Procedures should be communicated to all staff. The process should be consistent with applicable employment law.",
    "control_type": ["Preventive","Corrective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Human_resource_security","Legal_and_compliance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["6.2","5.4"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "6.5", "version": "2022", "name": "Responsibilities after termination or change of employment",
    "theme": "People",
    "description": "Information security responsibilities and duties that remain valid after termination or change of employment shall be defined, enforced and communicated to relevant personnel and other interested parties.",
    "guidance": "Responsibilities that survive termination include confidentiality obligations and non-compete clauses. Exit processes should include revoking access rights, returning assets, and conducting exit interviews. Changes in roles should trigger review of access rights.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Human_resource_security","Identity_and_access_management"], "security_domains": ["Governance_and_ecosystem","Protection"]},
    "related_controls": ["5.11","5.18","6.2"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "6.6", "version": "2022", "name": "Confidentiality or non-disclosure agreements",
    "theme": "People",
    "description": "Confidentiality or non-disclosure agreements reflecting the organisation's needs for the protection of information shall be identified, documented, regularly reviewed and signed by personnel and other relevant interested parties.",
    "guidance": "NDAs should clearly define what constitutes confidential information, the obligations of the parties, the duration of the obligations, and the consequences of breach. They should be signed before access to confidential information is granted.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Human_resource_security","Legal_and_compliance"], "security_domains": ["Governance_and_ecosystem"]},
    "related_controls": ["6.2","5.19","5.20"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "6.7", "version": "2022", "name": "Remote working",
    "theme": "People",
    "description": "Security measures shall be implemented when personnel are working remotely to protect information accessed, processed or stored outside the organisation's premises.",
    "guidance": "Remote working policies should address use of personal devices, home network security, physical security in remote locations, secure communication channels, and access control. VPN or equivalent secure connectivity should be required for accessing organisational systems.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Human_resource_security","System_and_network_security","Physical_security"], "security_domains": ["Protection"]},
    "related_controls": ["5.15","7.7","8.1","8.5"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "6.8", "version": "2022", "name": "Information security event reporting",
    "theme": "People",
    "description": "The organisation shall provide a mechanism for personnel to report observed or suspected information security events through appropriate channels in a timely manner.",
    "guidance": "Reporting mechanisms should be easy to use and accessible. Personnel should be trained on what to report and how to report it. There should be no negative consequences for good-faith reporting. Reports should be acknowledged and followed up.",
    "control_type": ["Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Detect"], "operational_capabilities": ["Information_security_event_management","Human_resource_security"], "security_domains": ["Defence"]},
    "related_controls": ["5.24","5.25","5.26"], "new_in_2022": False, "iso_clause_refs": []
  },

  # ── Physical (7.1 – 7.14) ────────────────────────────────────────────────
  {
    "control_id": "7.1", "version": "2022", "name": "Physical security perimeters",
    "theme": "Physical",
    "description": "Security perimeters shall be defined and used to protect areas that contain information and other associated assets.",
    "guidance": "Perimeters should be clearly defined. Walls and doors should be physically sound. Entry points should be controlled. The extent of the security perimeter should be based on the sensitivity of the assets it contains.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security"], "security_domains": ["Protection"]},
    "related_controls": ["7.2","7.3","7.4"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.2", "version": "2022", "name": "Physical entry",
    "theme": "Physical",
    "description": "Secure areas shall be protected by appropriate entry controls and access points.",
    "guidance": "Entry controls should ensure only authorised personnel can access secure areas. Controls may include key cards, biometrics, PINs, or security staff. Visitor access should be controlled and monitored. Access logs should be maintained.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["Physical_security","Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["7.1","7.3","7.4"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.3", "version": "2022", "name": "Securing offices, rooms and facilities",
    "theme": "Physical",
    "description": "Physical security for offices, rooms and facilities shall be designed and implemented.",
    "guidance": "Physical security should be proportionate to the value of assets and assessed risks. Sensitive areas should not be identifiable from outside. Internal directories should not be freely accessible. Procedures for vacant areas should be defined.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security"], "security_domains": ["Protection"]},
    "related_controls": ["7.1","7.2","7.6"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.4", "version": "2022", "name": "Physical security monitoring",
    "theme": "Physical",
    "description": "Premises shall be continuously monitored for unauthorised physical access.",
    "guidance": "Monitoring systems may include CCTV, intrusion detection, security guards, and access logs. Monitoring should cover all entry points and sensitive areas. Alerts should trigger timely investigation. Monitoring data should be retained for an appropriate period.",
    "control_type": ["Detective","Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Detect","Protect"], "operational_capabilities": ["Physical_security"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["7.1","7.2","7.3","8.15","8.16"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "7.5", "version": "2022", "name": "Protecting against physical and environmental threats",
    "theme": "Physical",
    "description": "Protection against physical and environmental threats, such as natural disasters, malicious attacks or accidents shall be designed and implemented.",
    "guidance": "Threats to assess include fire, flood, earthquake, power disruption, and temperature extremes. Controls may include fire suppression, UPS, climate control, and off-site backups. Risk assessments should inform the selection of protective measures.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Availability","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","Continuity"], "security_domains": ["Protection","Resilience"]},
    "related_controls": ["7.8","7.11","8.13","8.14"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.6", "version": "2022", "name": "Working in secure areas",
    "theme": "Physical",
    "description": "Security measures for working in secure areas shall be designed and applied.",
    "guidance": "Procedures for secure areas should address supervision of visitors, restriction of unsupervised access, photography and recording restrictions, and clean desk requirements. Personnel should be aware of the existence of secure areas only on a need-to-know basis.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security"], "security_domains": ["Protection"]},
    "related_controls": ["7.3","7.7"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.7", "version": "2022", "name": "Clear desk and clear screen",
    "theme": "Physical",
    "description": "Clear desk rules for papers and removable storage media and clear screen rules for information processing facilities shall be defined and appropriately enforced.",
    "guidance": "Sensitive information should not be left on desks when unattended. Computer screens should be locked when not in use. Printers, fax machines and copiers should be cleared of sensitive materials. Physical documents should be secured in locked cabinets.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","Information_protection"], "security_domains": ["Protection"]},
    "related_controls": ["7.6","5.10"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.8", "version": "2022", "name": "Equipment siting and protection",
    "theme": "Physical",
    "description": "Equipment shall be sited securely and protected.",
    "guidance": "Equipment should be positioned to minimise unnecessary access and to reduce risks from environmental hazards. Special measures may be needed for equipment requiring special protection. Food and drink should not be permitted near equipment.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","Asset_management"], "security_domains": ["Protection"]},
    "related_controls": ["7.5","7.9","7.11","7.12"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.9", "version": "2022", "name": "Security of assets off-premises",
    "theme": "Physical",
    "description": "Off-site assets shall be protected.",
    "guidance": "Equipment taken off-site should be subject to appropriate security measures. Personnel taking equipment off-site should be authorised and logged. Equipment should not be left unattended in public places. Data on portable equipment should be encrypted.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","Asset_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.11","7.8","8.1"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.10", "version": "2022", "name": "Storage media",
    "theme": "Physical",
    "description": "Storage media shall be managed through their life cycle of acquisition, use, transportation and disposal in accordance with the organisation's classification scheme and handling requirements.",
    "guidance": "Media management should address authorisation for use, storage, transportation, and disposal. Media containing sensitive information should be securely wiped or destroyed before disposal or reuse. A media register should be maintained for sensitive media.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Asset_management","Information_protection"], "security_domains": ["Protection"]},
    "related_controls": ["5.12","7.14","8.10"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.11", "version": "2022", "name": "Supporting utilities",
    "theme": "Physical",
    "description": "Information processing facilities shall be protected from power failures and other disruptions caused by failures in supporting utilities.",
    "guidance": "Supporting utilities include power, water, heating, ventilation and air conditioning. UPS systems should be used for critical systems. Utility capacity should be regularly reviewed. Alternate power sources should be available for critical facilities.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","Continuity"], "security_domains": ["Protection","Resilience"]},
    "related_controls": ["7.5","7.8","8.14"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.12", "version": "2022", "name": "Cabling security",
    "theme": "Physical",
    "description": "Cables carrying power or data or supporting information services shall be protected from interception, interference or damage.",
    "guidance": "Power and communications cabling should be protected from physical damage and interception. Sensitive cable routes should be documented and controlled. Cable termination points and wiring closets should be physically secured.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["7.8","7.11"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.13", "version": "2022", "name": "Equipment maintenance",
    "theme": "Physical",
    "description": "Equipment shall be maintained correctly to ensure availability, integrity and confidentiality of information.",
    "guidance": "Maintenance should follow manufacturer specifications and schedules. Only authorised personnel or contractors should perform maintenance. Records of all maintenance should be kept. Equipment suspected of being compromised should be checked before returning to service.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Availability","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","Asset_management"], "security_domains": ["Protection"]},
    "related_controls": ["7.8","7.14"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "7.14", "version": "2022", "name": "Secure disposal or re-use of equipment",
    "theme": "Physical",
    "description": "Items of equipment containing storage media shall be verified to ensure that any sensitive data and licensed software has been removed or securely overwritten prior to disposal or re-use.",
    "guidance": "All storage media should be securely wiped or destroyed before equipment disposal or reuse. Data destruction should be certified for sensitive equipment. Physical destruction should be used where secure wiping is not possible.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Physical_security","Asset_management","Information_protection"], "security_domains": ["Protection"]},
    "related_controls": ["7.10","7.13","8.10"], "new_in_2022": False, "iso_clause_refs": []
  },

  # ── Technological (8.1 – 8.34) ───────────────────────────────────────────
  {
    "control_id": "8.1", "version": "2022", "name": "User endpoint devices",
    "theme": "Technological",
    "description": "Information stored on, processed by or accessible via user endpoint devices shall be protected.",
    "guidance": "Endpoint protection should include device encryption, antivirus, screen lock, patch management, and remote wipe capability. BYOD policies should address security requirements for personal devices. Mobile device management solutions should be considered.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Asset_management","System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["5.10","6.7","7.7","7.9","8.7"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.2", "version": "2022", "name": "Privileged access rights",
    "theme": "Technological",
    "description": "The allocation and use of privileged access rights shall be restricted and managed.",
    "guidance": "Privileged accounts should be allocated on a need-to-use basis. Privileged activities should use separate privileged accounts from normal work accounts. Privileged access should be time-limited where possible. Privileged actions should be logged.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.15","5.18","8.5","8.18"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.3", "version": "2022", "name": "Information access restriction",
    "theme": "Technological",
    "description": "Access to information and other associated assets shall be restricted in accordance with the established topic-specific policy on access control.",
    "guidance": "Access restrictions should implement the principle of least privilege. Access should be granted based on business need. System and application access should be restricted to authorised functions. Default deny should be applied where feasible.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Identity_and_access_management","Information_protection"], "security_domains": ["Protection"]},
    "related_controls": ["5.15","5.18","8.2","8.4"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.4", "version": "2022", "name": "Access to source code",
    "theme": "Technological",
    "description": "Read and write access to source code, development tools and software libraries shall be appropriately managed.",
    "guidance": "Access to source code repositories should be restricted and logged. Code review processes should include security checks. Library use should be governed by policy. Tools that can modify code should require additional authorisation.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security","Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["8.3","8.25","8.29"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.5", "version": "2022", "name": "Secure authentication",
    "theme": "Technological",
    "description": "Secure authentication technologies and procedures shall be implemented based on information access restrictions and the topic-specific policy on access control.",
    "guidance": "Authentication methods should be proportionate to the sensitivity of the system. Multi-factor authentication should be used for privileged access and remote access. Authentication systems should protect against brute force attacks and credential theft.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.17","8.2","8.3"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.6", "version": "2022", "name": "Capacity management",
    "theme": "Technological",
    "description": "The use of resources shall be monitored and adjusted in line with current and expected capacity requirements.",
    "guidance": "Capacity monitoring should cover storage, processing, memory and network bandwidth. Capacity planning should consider future business growth and seasonal variations. Alerts should be configured to notify when thresholds are approached.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["System_and_network_security","Continuity"], "security_domains": ["Protection","Resilience"]},
    "related_controls": ["8.14","5.29"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.7", "version": "2022", "name": "Protection against malware",
    "theme": "Technological",
    "description": "Protection against malware shall be implemented and supported by appropriate user awareness.",
    "guidance": "Anti-malware controls should include endpoint protection, email scanning, web filtering, and network-based detection. Signatures and detection rules should be kept current. Users should be trained to recognise and report suspicious activity.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["System_and_network_security","Threat_and_vulnerability_management"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["8.1","8.19","8.23"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.8", "version": "2022", "name": "Management of technical vulnerabilities",
    "theme": "Technological",
    "description": "Information about technical vulnerabilities of information systems in use shall be obtained in a timely fashion, the organisation's exposure to such vulnerabilities shall be evaluated and appropriate measures taken.",
    "guidance": "A vulnerability management programme should include asset inventory, regular scanning, severity assessment, and patching timelines. Critical vulnerabilities should be remediated urgently. Vulnerability data should feed into the risk assessment process.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Identify","Protect"], "operational_capabilities": ["Threat_and_vulnerability_management"], "security_domains": ["Defence","Protection"]},
    "related_controls": ["5.7","8.19","8.29"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.9", "version": "2022", "name": "Configuration management",
    "theme": "Technological",
    "description": "Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.",
    "guidance": "Configuration management should establish secure baseline configurations for all system components. Changes from baselines should be tracked and authorised. Configuration drift detection tools should be used. Configurations should be reviewed periodically.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["System_and_network_security","Threat_and_vulnerability_management"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["8.8","8.19","8.32"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "8.10", "version": "2022", "name": "Information deletion",
    "theme": "Technological",
    "description": "Information stored in information systems, devices or in any other storage media shall be deleted when no longer required.",
    "guidance": "Deletion procedures should implement secure erasure standards. Retention periods should be defined and enforced. Deletion should be verifiable. Special consideration is needed for cloud environments where data residency may be uncertain.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Information_protection","Asset_management"], "security_domains": ["Protection"]},
    "related_controls": ["5.33","7.10","7.14"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "8.11", "version": "2022", "name": "Data masking",
    "theme": "Technological",
    "description": "Data masking shall be used in accordance with the organisation's topic-specific policy on access control and other related topic-specific policies, and business requirements, taking applicable legislation into consideration.",
    "guidance": "Data masking techniques include anonymisation, pseudonymisation, tokenisation, and encryption. Masking should be applied to sensitive data in non-production environments. Masking techniques should be validated to prevent re-identification.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Information_protection"], "security_domains": ["Protection"]},
    "related_controls": ["5.34","8.3","8.24"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "8.12", "version": "2022", "name": "Data leakage prevention",
    "theme": "Technological",
    "description": "Data leakage prevention measures shall be applied to systems, networks and any other devices that process, store or transmit sensitive information.",
    "guidance": "DLP controls should cover endpoint activity, email, web traffic, and cloud services. Policies should define sensitive data types and permitted destinations. Incidents detected by DLP tools should be investigated. DLP rules should be regularly tuned.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["Information_protection","System_and_network_security"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["5.12","5.14","8.11"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "8.13", "version": "2022", "name": "Information backup",
    "theme": "Technological",
    "description": "Backup copies of information, software and systems shall be maintained and regularly tested in accordance with the agreed topic-specific policy on backup.",
    "guidance": "Backup policies should define what is backed up, frequency, retention, and recovery time objectives. Backups should be tested by restoration at planned intervals. Off-site backups should be maintained. Backup media should be protected.",
    "control_type": ["Preventive","Corrective"],
    "attributes": {"information_security_properties": ["Availability","Integrity"], "cybersecurity_concepts": ["Protect","Recover"], "operational_capabilities": ["Continuity"], "security_domains": ["Protection","Resilience"]},
    "related_controls": ["5.29","5.30","8.14"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.14", "version": "2022", "name": "Redundancy of information processing facilities",
    "theme": "Technological",
    "description": "Information processing facilities shall be implemented with sufficient redundancy to meet availability requirements.",
    "guidance": "Redundancy requirements should be based on availability objectives. Redundant components should not share single points of failure. Failover mechanisms should be tested regularly. Redundancy architecture should address geographic diversity for critical systems.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Continuity","System_and_network_security"], "security_domains": ["Protection","Resilience"]},
    "related_controls": ["5.29","5.30","8.13"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.15", "version": "2022", "name": "Logging",
    "theme": "Technological",
    "description": "Logs that record activities, exceptions, faults and other relevant events shall be produced, stored, protected and analysed.",
    "guidance": "Logging should capture user activities, system events, errors, and security events. Log integrity should be protected. Sufficient capacity should be allocated for log storage. Logs should be retained for a period appropriate to legal and business requirements.",
    "control_type": ["Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Detect","Identify"], "operational_capabilities": ["Information_security_event_management","Information_security_assurance"], "security_domains": ["Defence"]},
    "related_controls": ["5.25","8.16","8.17"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.16", "version": "2022", "name": "Monitoring activities",
    "theme": "Technological",
    "description": "Networks, systems and applications shall be monitored for anomalous behaviour and appropriate actions taken to evaluate potential information security incidents.",
    "guidance": "Monitoring should cover network traffic, system behaviour, user activities, and application performance. Anomaly detection rules should be defined. Alerts should be triaged and investigated in a timely manner. SIEM solutions can centralise monitoring.",
    "control_type": ["Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Detect"], "operational_capabilities": ["Information_security_event_management","System_and_network_security"], "security_domains": ["Defence"]},
    "related_controls": ["5.25","8.15","8.17"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "8.17", "version": "2022", "name": "Clock synchronisation",
    "theme": "Technological",
    "description": "The clocks of information processing systems used by the organisation shall be synchronised to approved time sources.",
    "guidance": "All systems should synchronise to a reliable time source such as GPS or NTP servers. Time synchronisation is critical for correlating logs across systems and for validity of digital certificates. Multiple time sources should be used for redundancy.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["System_and_network_security","Information_security_event_management"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["8.15","8.16"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.18", "version": "2022", "name": "Use of privileged utility programs",
    "theme": "Technological",
    "description": "The use of utility programs that might be capable of overriding system and application controls shall be restricted and tightly controlled.",
    "guidance": "Privileged utilities should be identified and their use restricted. Access should require authorisation and be logged. Unnecessary privileged utilities should be removed or disabled. The principle of least privilege should apply to utility program access.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["System_and_network_security","Identity_and_access_management"], "security_domains": ["Protection"]},
    "related_controls": ["8.2","8.15"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.19", "version": "2022", "name": "Installation of software on operational systems",
    "theme": "Technological",
    "description": "Procedures and measures shall be implemented to securely manage software installation on operational systems.",
    "guidance": "Only authorised software should be permitted on operational systems. An approved software list should be maintained. Procedures should require testing in non-production environments before deployment. Users should not be permitted to install unapproved software.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["System_and_network_security","Threat_and_vulnerability_management"], "security_domains": ["Protection"]},
    "related_controls": ["8.8","8.32","8.31"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.20", "version": "2022", "name": "Networks security",
    "theme": "Technological",
    "description": "Networks and network devices shall be secured, managed and controlled to protect information in systems and applications.",
    "guidance": "Network security controls include firewalls, intrusion prevention, network segmentation, and secure network management. Network architecture should separate trusted and untrusted zones. Network activity should be monitored for security events.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["System_and_network_security"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["8.21","8.22"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.21", "version": "2022", "name": "Security of network services",
    "theme": "Technological",
    "description": "Security mechanisms, service levels and service requirements of all network services shall be identified, implemented and monitored.",
    "guidance": "Network service agreements should specify security requirements. Services should be reviewed to ensure they meet security requirements. Management access to network devices should be protected. Unused network ports and services should be disabled.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["System_and_network_security","Supplier_relationships_security"], "security_domains": ["Protection"]},
    "related_controls": ["8.20","8.22","5.19"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.22", "version": "2022", "name": "Segregation of networks",
    "theme": "Technological",
    "description": "Groups of information services, users and information systems shall be segregated in the organisation's networks.",
    "guidance": "Network segmentation should separate systems with different security requirements. DMZ architecture should be used for internet-facing services. User segments should be segregated from server segments. Wireless networks should be isolated from wired networks.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["8.20","8.21"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.23", "version": "2022", "name": "Web filtering",
    "theme": "Technological",
    "description": "Access to external websites shall be managed to reduce exposure to malicious content.",
    "guidance": "Web filtering should block access to malicious, inappropriate or non-business-related websites. URL categorisation and reputation-based filtering should be employed. HTTPS inspection should be considered for encrypted traffic. Filtering policies should be kept current.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["System_and_network_security","Threat_and_vulnerability_management"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["8.7","8.20"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "8.24", "version": "2022", "name": "Use of cryptography",
    "theme": "Technological",
    "description": "Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.",
    "guidance": "A cryptography policy should define approved algorithms, key lengths, and key management requirements. Cryptographic keys should be protected and managed through their lifecycle. Expired or compromised keys should be revoked promptly.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Information_protection","System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["5.14","8.5"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.25", "version": "2022", "name": "Secure development life cycle",
    "theme": "Technological",
    "description": "Rules for the secure development of software and systems shall be established and applied.",
    "guidance": "Secure SDLC should integrate security at all phases. Security requirements should be defined at the start of projects. Security testing should be conducted before deployment. Secure coding standards should be established and followed.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security","System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["8.26","8.27","8.28","8.29","8.30"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.26", "version": "2022", "name": "Application security requirements",
    "theme": "Technological",
    "description": "Information security requirements shall be identified, specified and approved when developing or acquiring applications.",
    "guidance": "Security requirements should address authentication, authorisation, input validation, output encoding, encryption, logging, and error handling. Requirements should be derived from risk assessments and applicable standards such as OWASP.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security"], "security_domains": ["Protection"]},
    "related_controls": ["8.25","8.27","8.28","8.29"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.27", "version": "2022", "name": "Secure system architecture and engineering principles",
    "theme": "Technological",
    "description": "Principles for engineering secure systems shall be established, documented, maintained and applied to any information system development or integration activities.",
    "guidance": "Security architecture principles should include security by design, defence in depth, zero trust, least privilege, and fail secure. Principles should be applied at both technical and process levels. Architecture reviews should verify application of principles.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security","System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["8.25","8.26","8.28"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.28", "version": "2022", "name": "Secure coding",
    "theme": "Technological",
    "description": "Secure coding principles shall be applied to software development.",
    "guidance": "Secure coding practices should address OWASP Top 10 and other common vulnerability classes. Code review processes should include security review. Static analysis tools should be used to identify security vulnerabilities. Developers should receive secure coding training.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security"], "security_domains": ["Protection"]},
    "related_controls": ["8.25","8.26","8.27","8.29"], "new_in_2022": True, "iso_clause_refs": []
  },
  {
    "control_id": "8.29", "version": "2022", "name": "Security testing in development and acceptance",
    "theme": "Technological",
    "description": "Security testing practices shall be defined and implemented in the development life cycle.",
    "guidance": "Security testing should include static analysis, dynamic analysis, penetration testing, and vulnerability scanning. Tests should be conducted in environments that mirror production. Test results should be tracked and remediated before deployment.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect","Detect"], "operational_capabilities": ["Application_security","Information_security_assurance"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["8.25","8.26","8.28","8.34"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.30", "version": "2022", "name": "Outsourced development",
    "theme": "Technological",
    "description": "The organisation shall direct, monitor and review the activities related to outsourced system development.",
    "guidance": "Outsourcing agreements should include security requirements, code ownership, rights to audit, and secure coding standards. Security testing of outsourced code should be conducted. Source code should be reviewed before deployment.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security","Supplier_relationships_security"], "security_domains": ["Protection","Governance_and_ecosystem"]},
    "related_controls": ["5.19","5.20","8.25"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.31", "version": "2022", "name": "Separation of development, test and production environments",
    "theme": "Technological",
    "description": "Development, testing and production environments shall be separated and secured.",
    "guidance": "Separation should prevent development activities from impacting production systems. Access controls should differ between environments. Production data should not be used in development or test environments without data masking. Changes should pass through test before production.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security","System_and_network_security"], "security_domains": ["Protection"]},
    "related_controls": ["8.25","8.32","8.33"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.32", "version": "2022", "name": "Change management",
    "theme": "Technological",
    "description": "Changes to information processing facilities and information systems shall be subject to change management procedures.",
    "guidance": "Change management should include change request, impact assessment, testing, authorisation, implementation, and review. Emergency change procedures should be defined. Changes should be documented and reviewed post-implementation. Rollback procedures should be prepared.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["System_and_network_security","Governance"], "security_domains": ["Protection"]},
    "related_controls": ["8.9","8.19","8.31"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.33", "version": "2022", "name": "Test information",
    "theme": "Technological",
    "description": "Test information shall be appropriately selected, protected and managed.",
    "guidance": "Production data should not be used in test environments unless appropriately masked. Test data should be protected with appropriate access controls. Sensitive test data should be removed or anonymised after testing. Test data creation and use should be documented.",
    "control_type": ["Preventive"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Application_security","Information_protection"], "security_domains": ["Protection"]},
    "related_controls": ["8.11","8.31"], "new_in_2022": False, "iso_clause_refs": []
  },
  {
    "control_id": "8.34", "version": "2022", "name": "Protection of information systems during audit testing",
    "theme": "Technological",
    "description": "Audit tests and other assurance activities involving assessment of operational systems shall be planned and agreed between the tester and appropriate management.",
    "guidance": "Audit testing should be planned to minimise impact on production systems. Access for audit should be controlled and monitored. Audit tools should be isolated from production systems after use. Results should be protected and access restricted to authorised personnel.",
    "control_type": ["Preventive","Detective"],
    "attributes": {"information_security_properties": ["Confidentiality","Integrity","Availability"], "cybersecurity_concepts": ["Protect"], "operational_capabilities": ["Information_security_assurance"], "security_domains": ["Protection","Defence"]},
    "related_controls": ["8.29","5.35"], "new_in_2022": False, "iso_clause_refs": []
  },
]

# Write controls-2022.json
with open(os.path.join(OUT, "controls-2022.json"), "w") as f:
    json.dump(CONTROLS_2022, f, indent=2)

print(f"controls-2022.json: {len(CONTROLS_2022)} controls")
new_count = sum(1 for c in CONTROLS_2022 if c["new_in_2022"])
print(f"  new_in_2022=True: {new_count}")
themes = {}
for c in CONTROLS_2022:
    themes[c["theme"]] = themes.get(c["theme"], 0) + 1
for t, n in themes.items():
    print(f"  {t}: {n}")

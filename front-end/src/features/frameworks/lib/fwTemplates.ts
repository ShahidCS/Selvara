/* Add-a-framework templates and the keyword -> control-domain matcher (ported 1:1 from the prototype). */
export interface FwTpl { id: string; short: string; name: string; kind: string; region: string; version: string; text: string }
export const FW_TPL: FwTpl[] = [
 {id:'nis2',short:'NIS2',name:'EU NIS2 Directive',kind:'Regulation',region:'EU',version:'2022/2555',text:'Policies on risk analysis and information system security\nIncident handling\nBusiness continuity, backup management and crisis management\nSupply chain security\nSecurity in acquisition, development and maintenance, including vulnerability handling\nPolicies to assess the effectiveness of cybersecurity measures\nBasic cyber hygiene and cybersecurity training\nPolicies on cryptography and encryption\nHuman resources security and access control\nMulti-factor authentication and secured communications\nEarly warning to the CSIRT within 24 hours'},
 {id:'cisv8',short:'CIS v8.1',name:'CIS Critical Security Controls v8.1',kind:'Framework',region:'Global',version:'8.1',text:'Inventory and control of enterprise assets\nInventory and control of software assets\nData protection\nSecure configuration of assets and software\nAccount management\nAccess control management\nContinuous vulnerability management\nAudit log management\nEmail and web browser protections\nMalware defences\nData recovery\nNetwork infrastructure management\nSecurity awareness and skills training\nService provider management\nApplication software security\nIncident response management\nPenetration testing'},
 {id:'hipaa',short:'HIPAA',name:'HIPAA Security Rule',kind:'Regulation',region:'US',version:'45 CFR 164',text:'Security management process including risk analysis\nAssigned security responsibility\nWorkforce security and information access management\nSecurity awareness and training\nSecurity incident procedures\nContingency plan with data backup and disaster recovery\nBusiness associate contracts\nFacility access controls\nAudit controls\nIntegrity controls for electronic PHI\nTransmission security and encryption'},
 {id:'samacsf',short:'SAMA CSF',name:'SAMA Cyber Security Framework',kind:'Framework',region:'KSA',version:'1.0',text:'Cyber security governance and strategy approved by the board\nCyber security risk management\nCyber security awareness programme\nIdentity and access management\nCryptography standards\nSecurity event management and monitoring\nIncident management\nThreat management and intelligence\nVulnerability management\nThird-party cyber security and outsourcing\nBusiness continuity management\nCompliance with regulatory requirements and periodic audit'}
];
export const FW_DOM: [string, RegExp][] = [
 ['Governance and policy',/governance|policy|policies|leadership|board|management body|strategy|responsib|management review|context/i],
 ['Risk management',/risk (analysis|management|assessment)|impact analysis|risk/i],
 ['Asset management',/asset|inventory/i],
 ['Identity and access',/access|identity|account|authenticat|mfa|multi-factor|privilege/i],
 ['Cryptography',/crypto|encrypt|key management|transmission security/i],
 ['Secure configuration and development',/configur|development|acquisition|application|software security|maintenance/i],
 ['Vulnerability management',/vulnerab|patch|penetration|testing/i],
 ['Logging and monitoring',/log|monitor|detect|anomal|audit controls|event/i],
 ['Incident response',/incident|csirt|report major|early warning/i],
 ['Business continuity',/continuity|backup|recover|contingency|crisis|restor|exercise|disaster/i],
 ['Third-party risk',/third.party|supplier|supply chain|outsourc|service provider|business associate|contract/i],
 ['Awareness and training',/awareness|training|hygiene|skills/i],
 ['Data protection and privacy',/data protection|personal|phi|privacy|integrity/i],
 ['Threat intelligence',/threat|information sharing|malware/i],
 ['Physical security',/facility|physical/i],
 ['Assurance and audit',/audit|compliance with|nonconformity|corrective|effectiveness|performance evaluation/i]
];

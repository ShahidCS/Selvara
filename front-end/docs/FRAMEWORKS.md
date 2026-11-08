# Selvara: standards, regulations and frameworks reference

Researched 2026-11-08. Status shown is as of November 2026.

## 1. What "covered" means

For each of the 25 catalogue entries in `src/data/seed.json` (`frameworks`), Selvara provides:

- a catalogue entry (name, kind, region);
- requirement-level scoring, using the requirement groups and requirements in `src/data/frameworkReqs.json`;
- control mapping, where controls in `seed.json` (`controls[].map[frameworkId]`) are linked to requirements (ISO/IEC 27002 reuses the ISO/IEC 27001 mapping, see `controlsForFw` in `src/lib/data.ts`);
- a gap export.

"Covered" does not mean:

- certification, attestation or a regulator's acceptance;
- legal advice or a compliance determination;
- a substitute for the text of the standard or law.

Requirement titles in the catalogue are paraphrased. Licensed standard text is not reproduced. Control mappings are draft and need review by qualified compliance, legal or risk staff before use. The same applies to anything in this document.

How the figures were produced: counts below come from a throwaway node script over `frameworkReqs.json` (groups `g`, requirements `r`) and `seed.json` (a control counts as mapped when `map[id]` is non-empty). Two cautions:

- The `controls` figure stored on each `frameworks` entry in `seed.json` (for example SAMA 118, DORA 44) is a display number. It is not the requirement count used here.
- Catalogue depth varies widely, from 6 requirements (ISO 22301) to 289 (DORA). The count says how much of a framework is modelled, not how much of it exists.

Verification limits: only web search was reachable from the research environment. Direct fetches of iso.org, nist.gov, eur-lex.europa.eu and pcisecuritystandards.org failed (hosts not in the session network allow-list). Facts below were taken from search-result excerpts of official pages where available and are marked "official page (excerpt)". Facts that rest only on law-firm, consultancy or vendor pages are marked "secondary". Anything not established is marked "not verified". ISO standards are paywalled, so clause-level content was not checked.

## 2. README summary table

Columns: requirements are shown as count (requirement groups). "Mapped controls" is the number of controls with a non-empty mapping.

### International standards

| Name (catalogue) | Type | Issuer and jurisdiction | Edition or version tracked | Requirements (groups) | Mapped controls | Notes |
|---|---|---|---|---|---|---|
| ISO/IEC 27001:2022 | Standard | ISO/IEC, international | 2022 (Amd 1:2024 climate action) | 123 (11) | 23 | 2013 edition transition ended 31 Oct 2025 (secondary). |
| ISO/IEC 27002:2022 | Standard | ISO/IEC, international | 2022 (3rd ed.) | 93 (4) | 23 (uses 27001 mapping) | Guidance, not certifiable on its own. |
| ISO/IEC 27701 (PIMS) | Standard | ISO/IEC, international | Catalogue edition not stated; current edition is 2025 | 8 (3) | 2 | 2025 edition is standalone and replaces 2019. Edition tracked: not verified. |
| ISO/IEC 22301 (BCMS) | Standard | ISO (not ISO/IEC), international | 2019 (Amd 1:2024) | 6 (3) | 2 | Prefix "ISO/IEC" is inaccurate. See section 5. Revision (Edition 3) in progress. |
| ISO/IEC 27005 (Risk) | Standard | ISO/IEC, international | 2022 (4th ed.) | 6 (3) | 5 | Guidance, not certifiable. |
| ISO/IEC 42001 (AI MS) | Standard | ISO/IEC, international | 2023 (1st ed.) | 70 (16) | 5 | Certifiable AI management system standard. |
| ISO/IEC 29100 Privacy framework | Standard (catalogue says Framework) | ISO/IEC, international | Catalogue edition not stated; current edition is 2024 | 24 (2) | 2 | 2011 edition and Amd 1:2018 withdrawn. Not certifiable. |
| ISO/IEC 30107-1 Biometric PAD | Standard | ISO/IEC, international | Catalogue edition not stated; current edition is 2023 | 12 (4) | 2 | Terminology/framework part only. Testing is Part 3. |
| PCI DSS v4.0.1 | Standard (industry) | PCI Security Standards Council, global | v4.0.1 | 10 (6) | 12 | v4.0 retired 31 Dec 2024. Future-dated requirements mandatory since 31 Mar 2025. |

### Security, privacy, AI and resilience regulations (EU)

| Name (catalogue) | Type | Issuer and jurisdiction | Edition or version tracked | Requirements (groups) | Mapped controls | Notes |
|---|---|---|---|---|---|---|
| GDPR | Regulation | European Union | Regulation (EU) 2016/679 | 12 (6) | 6 | Digital Omnibus changes to GDPR proposed, not adopted (secondary). |
| EU AI Act | Regulation | European Union | Regulation (EU) 2024/1689 as amended by (EU) 2026/1744 | 10 (4) | 5 | High-risk dates moved to 2 Dec 2027 and 2 Aug 2028. |
| DORA | Regulation | European Union | Regulation (EU) 2022/2554 | 289 (15) | 8 | Applies since 17 Jan 2025. Financial entities and their ICT providers. |
| NIS2 Directive | Directive (catalogue says Regulation) | European Union, national transposition | Directive (EU) 2022/2555 | 52 (5) | 8 | Transposition deadline 17 Oct 2024. Uneven national status. |

### Regional (UAE, KSA, Pakistan)

| Name (catalogue) | Type | Issuer and jurisdiction | Edition or version tracked | Requirements (groups) | Mapped controls | Notes |
|---|---|---|---|---|---|---|
| UAE PDPL | Regulation | UAE federal government (Emirates Data Office) | Federal Decree-Law No. 45 of 2021 | 8 (4) | 5 | Executive regulations status unclear (secondary, conflicting). |
| DIFC Data Protection Law | Regulation | DIFC Authority and Commissioner of Data Protection, Dubai (DIFC) | DIFC Law No. 5 of 2020, consolidated July 2025 | 7 (4) | 3 | Applies in the DIFC, not UAE mainland. Regulation 10 covers AI/autonomous systems. |
| SAMA Cyber Security Framework | Framework (mandated) | SAMA (Saudi Central Bank), KSA | Version 1.0, May 2017 | 8 (3) | 6 | No later version found. Catalogue depth is far below the full framework. |
| SBP Enterprise Technology Governance & Risk | Regulation (regulatory framework) | State Bank of Pakistan | BPRD Circular No. 05 of 2017 | 60 (6) | 4 | Name is truncated. See section 5. |
| PECA 2016 | Regulation (statute) | Government of Pakistan | Act of 2016, amended by Amendment Act 2025 | 46 (6) | 3 | Cybercrime statute, not a controls framework. |
| UAE IA Standards | Framework | UAE (NESA lineage; TDRA and Cyber Security Council publications) | Version not verified | 188 (66) | 11 | Issuer and version ambiguous. See section 5. |

### US frameworks

| Name (catalogue) | Type | Issuer and jurisdiction | Edition or version tracked | Requirements (groups) | Mapped controls | Notes |
|---|---|---|---|---|---|---|
| SOC 2 Type II | Attestation framework | AICPA, US-origin, used globally | 2017 Trust Services Criteria (revised points of focus 2022) | 11 (3) | 22 | "Type II" is a report type. 2027 criteria in exposure draft. |
| NIST CSF 2.0 | Framework | NIST, US | CSF 2.0 (26 Feb 2024) | 106 (22) | 19 | Voluntary. Six functions incl. Govern. |
| NIST SP 800-207 Zero Trust | Guidance (Special Publication) | NIST, US | Aug 2020 | 35 (4) | 3 | No revision found. |
| NIST SP 800-37 Risk Management Framework | Guidance (Special Publication) | NIST, US | Rev. 2 (Dec 2018) | 47 (8) | 3 | No Revision 3 found. |

### Financial crime

| Name (catalogue) | Type | Issuer and jurisdiction | Edition or version tracked | Requirements (groups) | Mapped controls | Notes |
|---|---|---|---|---|---|---|
| SBP AML/CFT/CPF Reg. 8 | Regulation | State Bank of Pakistan | BPRD Circular No. 05 of 2020, as amended | 7 (1) | 4 | Catalogue models one regulation only. Content of Reg. 8: not verified. |
| AML/CFT & Sanctions | Composite (no single issuer) | Not applicable | Not applicable | 7 (3) | 2 | Closest official reference is the FATF Recommendations (updated June 2026). |

Seed ids, in table order: iso27001, iso27002, iso27701, iso22301, iso27005, iso42001, iso29100, iso30107, pci, gdpr, euaiact, dora, nis2, uaepdpl, difc, sama, sbpetg, peca, uaeia, soc2, nistcsf, nist800207, nist80037, sbp, amlcft.

## 3. Per-framework detail

Each entry lists: official name, issuer, what it governs, who it applies to, status, Selvara model (groups / requirements / mapped controls), sources.

### International standards

**ISO/IEC 27001:2022 (seed `iso27001`)**
- Official name: ISO/IEC 27001:2022, Information security, cybersecurity and privacy protection, Information security management systems, Requirements. Issuer: ISO and IEC.
- Governs the requirements for an information security management system (ISMS), with an Annex A control set aligned to ISO/IEC 27002:2022. Applies to any organisation seeking an auditable ISMS; certification is voluntary.
- Status: current edition is 2022. Amendment 1:2024, "Climate action changes", was published February 2024 (official page, excerpt). The IAF/ISO communiqué says the intent of clauses 4.1 and 4.2 is unchanged. Transition from the 2013 edition ended 31 October 2025 (secondary; the IAF notice itself was not retrieved).
- Selvara: 11 / 123 / 23.
- Sources: https://www.iso.org/standard/27001 ; https://www.iso.org/standard/88435.html

**ISO/IEC 27002:2022 (seed `iso27002`)**
- Official name: ISO/IEC 27002:2022, Information security controls. Issuer: ISO and IEC.
- Governs a reference set of information security controls and implementation guidance. Used by organisations choosing and implementing controls, including ISO/IEC 27001 users. Not a certifiable standard.
- Status: Edition 3, published 2022-02 with a corrected version 2022-03, status published (official page, excerpt). No 2026 revision found.
- Selvara: 4 / 93 / 23 (reuses ISO/IEC 27001 mapping).
- Source: https://www.iso.org/standard/75652.html

**ISO/IEC 27701 (seed `iso27701`)**
- Official name: ISO/IEC 27701:2025, Information security, cybersecurity and privacy protection, Privacy information management systems, Requirements and guidance. Issuer: ISO and IEC.
- Governs a privacy information management system (PIMS) for organisations acting as PII controllers or processors.
- Status: Edition 2, published October 2025, replaces the 2019 edition (official page, excerpt). The 2025 edition is a standalone management system standard, no longer an extension that requires ISO/IEC 27001 certification. A certification-body requirements standard, ISO/IEC 27706:2025, was published. A transition end date for 2019 certificates (one secondary source says 31 October 2028) is not verified.
- Which edition the catalogue paraphrases: not verified. The seed name carries no year.
- Selvara: 3 / 8 / 2.
- Sources: https://www.iso.org/standard/27701 ; https://www.iso.org/standard/27706

**ISO 22301 (seed `iso22301`)**
- Official name: ISO 22301:2019, Security and resilience, Business continuity management systems, Requirements. Issuer: ISO (not a joint ISO/IEC standard).
- Governs a business continuity management system (BCMS). Applies to any organisation.
- Status: 2019 edition with Amd 1:2024, "Climate action changes" (official page, excerpt). A new edition (ISO/CD 22301, Edition 3) is in committee stage; not yet published as of the sources found.
- Selvara: 3 / 6 / 2.
- Sources: https://www.iso.org/standard/75106.html ; https://www.iso.org/standard/88412.html ; https://www.iso.org/standard/93606.html

**ISO/IEC 27005 (seed `iso27005`)**
- Official name: ISO/IEC 27005:2022, Information security, cybersecurity and privacy protection, Guidance on managing information security risks. Issuer: ISO and IEC.
- Governs guidance on identifying, assessing and treating information security risk. Not certifiable.
- Status: Edition 4, published 2022-10, supersedes 2018 (official page, excerpt). No newer edition found.
- Selvara: 3 / 6 / 5.
- Source: https://www.iso.org/standard/80585.html

**ISO/IEC 42001 (seed `iso42001`)**
- Official name: ISO/IEC 42001:2023, Information technology, Artificial intelligence, Management system. Issuer: ISO and IEC.
- Governs requirements for an AI management system (AIMS). Applies to organisations providing or using AI systems. Certification is optional.
- Status: Edition 1, December 2023 (official page, excerpt). No amendment or revision found.
- Selvara: 16 / 70 / 5.
- Source: https://www.iso.org/standard/42001

**ISO/IEC 29100 (seed `iso29100`)**
- Official name: ISO/IEC 29100:2024, Information technology, Security techniques, Privacy framework. Issuer: ISO and IEC.
- Governs common privacy terminology, actors and roles in PII processing, and privacy principles. It is guidance, not a management system or certifiable standard.
- Status: Edition 2, published 2024-02. The 2011 edition and Amd 1:2018 were withdrawn (ISO listing: 2024-02-16) (official page, excerpt).
- Selvara: 2 / 24 / 2.
- Sources: https://www.iso.org/standard/85938.html ; https://www.iso.org/standard/73722.html

**ISO/IEC 30107-1 (seed `iso30107`)**
- Official name: ISO/IEC 30107-1:2023, Information technology, Biometric presentation attack detection, Part 1: Framework. Issuer: ISO and IEC.
- Governs terminology and a framework for presentation attack detection (PAD) at the biometric capture device. Part 1 does not standardise PAD methods; testing and reporting is Part 3 (2023).
- Status: 2023 edition replaced the 2016 edition (official page, excerpt).
- Selvara: 4 / 12 / 2.
- Sources: https://www.iso.org/standard/83828.html ; https://www.iso.org/standard/79520.html

**PCI DSS (seed `pci`)**
- Official name: Payment Card Industry Data Security Standard v4.0.1. Issuer: PCI Security Standards Council (industry body; enforced via card brands and acquirers, not a law).
- Governs security requirements for entities that store, process or transmit cardholder data or could affect its security.
- Status: v4.0.1 is the version in the PCI SSC document library; it is a limited revision with no added or removed requirements. v4.0 was retired 31 December 2024 (official blog, excerpt). Requirements that were future-dated in v4.0 became mandatory 31 March 2025 (secondary; count of such requirements differs by source, so no number is given here). Nothing newer than v4.0.1 was found in the library listing.
- Selvara: 6 / 10 / 12.
- Sources: https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1 ; https://www.pcisecuritystandards.org/document_library/

### EU regulations

**GDPR (seed `gdpr`)**
- Official name: Regulation (EU) 2016/679 (General Data Protection Regulation). Issuer: European Parliament and Council.
- Governs processing of personal data. Applies to controllers and processors in the EU and, with territorial scope, to those targeting or monitoring people in the EU.
- Status: in force and applied since 2018. The Commission's Digital Omnibus (proposed 19 November 2025, procedure 2025/0360(COD)) would amend GDPR; as of the latest sources found (October 2026) the data text was not adopted (secondary). The proposed 72 to 96 hour breach notification change is not law.
- Selvara: 6 / 12 / 6.
- Source: https://eur-lex.europa.eu/eli/reg/2016/679/oj (not fetched; standard ELI link)

**EU AI Act (seed `euaiact`)**
- Official name: Regulation (EU) 2024/1689 laying down harmonised rules on artificial intelligence, as amended by Regulation (EU) 2026/1744 ("Digital Omnibus on AI") of 8 July 2026.
- Governs AI systems by risk tier and general-purpose AI models. Applies to providers, deployers, importers and distributors.
- Status and dates (EUR-Lex and Parliament summary, excerpts):
  - Entered into force 1 August 2024.
  - Prohibited practices and AI literacy: 2 February 2025.
  - General-purpose AI obligations and governance provisions: 2 August 2025.
  - Regulation 2026/1744 was published 24 July 2026 and entered into force 27 July 2026.
  - It postpones Annex III high-risk requirements to 2 December 2027 and Annex I product-embedded high-risk requirements to 2 August 2028.
  - New prohibitions (non-consensual intimate material, child sexual abuse material) apply from 2 December 2026.
  - A Council corrigendum (September 2026) concerns the German text of the safety-component definition.
- Not verified: the exact application date of the Article 50 transparency and watermarking duties after the amendment. Secondary sources conflict (2 August 2026 vs 2 December 2026).
- Selvara: 4 / 10 / 5.
- Sources: https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng ; https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng ; https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai

**DORA (seed `dora`)**
- Official name: Regulation (EU) 2022/2554 on digital operational resilience for the financial sector. Issuer: European Parliament and Council.
- Governs ICT risk management, ICT incident management and reporting, resilience testing, ICT third-party risk and an oversight framework for critical ICT third-party providers. Applies to financial entities (banks, insurers, investment firms and others) and their ICT service providers.
- Status: in force 16 January 2023; applies from 17 January 2025 (ESMA and EUR-Lex, excerpts). Technical standards and delegated acts supplement it; their current list was not checked.
- Selvara: 15 / 289 / 8. The count is large because the catalogue appears to go to article-paragraph level; not verified against the regulation text.
- Sources: https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng ; https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/digital-operational-resilience-act-dora

**NIS2 Directive (seed `nis2`)**
- Official name: Directive (EU) 2022/2555 on measures for a high common level of cybersecurity across the Union. Issuer: European Parliament and Council.
- Governs cybersecurity risk management and incident reporting for essential and important entities in listed sectors. A directive: obligations come from each member state's transposing law.
- Status: transposition deadline was 17 October 2024. Transposition remains uneven (for example Germany enacted in December 2025, secondary). Commission infringement steps are reported; a July 2026 CJEU referral of four states appears on one tracker only and is not verified. The Digital Omnibus proposes technical adjustments and a single incident reporting point; no adoption was found.
- Selvara: 5 / 52 / 8.
- Source: https://eur-lex.europa.eu/eli/dir/2022/2555/oj (not fetched; standard ELI link)

### Regional

**UAE PDPL (seed `uaepdpl`)**
- Official name: Federal Decree-Law No. (45) of 2021 Concerning the Protection of Personal Data. Issuer: UAE federal government; the Emirates Data Office (Decree-Law No. 44 of 2021) is the regulator.
- Governs personal data processing, consent, data subject rights and cross-border transfers. Applies in the UAE outside free zones that have their own data protection law (such as DIFC); sector exclusions exist (details not verified).
- Status: Official Gazette 26 September 2021, effective 2 January 2022 (official portal, excerpt). Executive regulations: sources conflict. Most 2026 secondary sources say they have not been issued; others cite Cabinet decisions. Not verified; rely on local counsel.
- Selvara: 4 / 8 / 5.
- Sources: https://uaelegislation.gov.ae/en/legislations/1972 ; https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws

**DIFC Data Protection Law (seed `difc`)**
- Official name: Data Protection Law, DIFC Law No. 5 of 2020. Issuer: Dubai International Financial Centre Authority, supervised by the DIFC Commissioner of Data Protection.
- Governs personal data processing by entities in the DIFC financial free zone.
- Status: consolidated version dated July 2025 is on the DIFC site. Regulation 10 (autonomous and semi-autonomous systems, including AI) exists under the Data Protection Regulations. A June 2026 consultation paper proposes updating Regulation 10 and adding a Regulation 11; enactment was not confirmed.
- Selvara: 4 / 7 / 3. Regulation 10 and the DIFC Data Protection Regulations are not separate catalogue entries.
- Sources: https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/data-protection-law.pdf ; https://www.difc.com/business/registrars-and-commissioners/commissioner-of-data-protection/document-related-for-commissioner-of-data-protection

**SAMA Cyber Security Framework (seed `sama`)**
- Official name: Cyber Security Framework, Saudi Arabian Monetary Authority, Version 1.0, May 2017. Issuer: SAMA (renamed Saudi Central Bank; SAMA remains the short name).
- Governs cyber security governance, risk, operations and third-party controls, with maturity levels, for SAMA-regulated member organisations (banks, finance companies, payment services, credit bureaus; applied to insurers by a 2022 circular).
- Status: Version 1.0 (circular dated 24/5/2017) is listed as in force on the SAMA rulebook. Related in-force items include Maturity Level 4 Requirements (2019) and Data Cybersecurity Controls (2023). No later framework version was found; not exhaustive.
- Selvara: 3 / 8 / 6. The full framework is considerably larger; the catalogue is a condensed model.
- Sources: https://rulebook.sama.gov.sa/en/cyber-security-framework-2 ; https://www.sama.gov.sa/en-US/RulesInstructions/CyberSecurity/Cyber%20Security%20Framework.pdf

**SBP Enterprise Technology Governance & Risk Management Framework (seed `sbpetg`)**
- Official name: Enterprise Technology Governance & Risk Management Framework for Financial Institutions, BPRD Circular No. 05 of 2017, dated 30 May 2017. Issuer: State Bank of Pakistan.
- Governs technology governance and technology risk management at commercial banks, Islamic banks, DFIs and microfinance banks; digital banks and EMIs must also comply where it applies.
- Status: appears in force with amendments (for example Section 4.4.2 replaced to allow conditional cloud outsourcing). Current consolidated version: not verified. Phased compliance date was 30 June 2018.
- Selvara: 6 / 60 / 4.
- Sources: https://www.sbp.org.pk/bprd/2017/C5-Annex.pdf ; https://www.sbp.org.pk/press/2017/Pr-Ent-Risk-Govr-30-May-17.pdf

**PECA 2016 (seed `peca`)**
- Official name: Prevention of Electronic Crimes Act, 2016 (Pakistan), as amended by the Prevention of Electronic Crimes (Amendment) Act, 2025 (Act No. II of 2025). Issuer: Parliament of Pakistan.
- Governs cyber offences (unauthorised access, data interference, cyber-terrorism, electronic fraud and others) and investigation procedure. It is a criminal statute, not a security controls framework or data protection law. Applies to persons and entities in Pakistan and certain conduct abroad.
- Status: amendment passed January 2025 and gazetted 29 January 2025 (secondary); it drew public criticism. No repeal found. Consolidated text: https://www.sja.gos.pk (secondary host). The official National Assembly text was not retrieved.
- Selvara: 6 / 46 / 3. How a statute yields 46 "requirements" is a catalogue modelling choice; review.
- Sources: https://www.na.gov.pk/uploads/documents/6797176bdf26b_835.pdf ; https://regulations.ai/regulations/RAI-PK-NA-PECA2XX-2025 (secondary)

**UAE IA Standards (seed `uaeia`)**
- Official names found: "UAE Information Assurance Regulation", Version 1.1, March 2020, published by TDRA; and "UAE Information Assurance Standard", published by the UAE Cyber Security Council. The standard originated with the National Electronic Security Authority (NESA) in 2014.
- Governs information assurance controls for UAE government entities and entities designated critical. Others may adopt voluntarily.
- Status: relationship between the TDRA regulation, the Cyber Security Council standard and the older NESA standard is not clear from the pages found. The Council's page shows conflicting dates (published 9/22/25, updated Aug 10, 2024). Which version the catalogue paraphrases: not verified. A consultancy page cites 188 controls; that is not an official figure.
- Selvara: 66 / 188 / 11.
- Sources: https://tdra.gov.ae/-/media/About/regulations-and-ruling/EN/UAE-Information-Assurance-Regulation-v1-1-pdf.ashx ; https://csc.gov.ae/en/w/uae-information-assurance-standard ; https://u.ae/-/media/Documents-2023/National-Information-Assurance-Framework-NIAF.ashx

### US frameworks

**SOC 2 (seed `soc2`)**
- Official basis: AICPA 2017 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality and Privacy (With Revised Points of Focus, 2022). Issuer: AICPA.
- Governs an independent CPA's attestation report on a service organisation's controls. Type I reports design at a point in time; Type II reports operating effectiveness over a period. Used by service organisations worldwide.
- Status: 2017 criteria with 2022 revised points of focus is the current set. The AICPA SOC page lists exposure drafts of proposed 2027 SOC 2 Trust Services Criteria and Description Criteria; details not checked.
- Selvara: 3 / 11 / 22. The 11 requirements are a very condensed model of the criteria.
- Sources: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022 ; https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2/

**NIST CSF 2.0 (seed `nistcsf`)**
- Official name: The NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, dated 26 February 2024. Issuer: NIST, US Department of Commerce.
- Governs cybersecurity outcomes in six functions (Govern, Identify, Protect, Detect, Respond, Recover). Voluntary; usable by any organisation.
- Status: current; no later version found.
- Selvara: 22 / 106 / 19.
- Source: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf

**NIST SP 800-207 (seed `nist800207`)**
- Official name: NIST Special Publication 800-207, Zero Trust Architecture, August 2020.
- Governs zero trust tenets and deployment models. Guidance for enterprises; mandatory for US federal agencies only via separate policy (not checked).
- Status: final, no revision found. SP 800-207A (cloud-native access control) is a companion.
- Selvara: 4 / 35 / 3.
- Source: https://csrc.nist.gov/pubs/sp/800/207/final

**NIST SP 800-37 (seed `nist80037`)**
- Official name: NIST SP 800-37 Revision 2, Risk Management Framework for Information Systems and Organizations: A System Life Cycle Approach for Security and Privacy, December 2018.
- Governs the RMF lifecycle (prepare, categorise, select, implement, assess, authorise, monitor). Required for US federal information systems; used elsewhere as guidance.
- Status: the NIST RMF page still lists Rev. 2 as final; no Revision 3 found.
- Selvara: 8 / 47 / 3.
- Sources: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-37r2.pdf ; https://csrc.nist.gov/projects/risk-management/publications

### Financial crime

**SBP AML/CFT/CPF Regulations (seed `sbp`)**
- Official name: Anti-Money Laundering, Countering Financing of Terrorism & Countering Proliferation Financing (AML/CFT/CPF) Regulations, issued under section 6A(2) of the Anti-Money Laundering Act 2010, BPRD Circular No. 05 of 2020, dated 30 September 2020. Issuer: State Bank of Pakistan.
- Governs AML/CFT/CPF obligations of SBP regulated entities (banks, DFIs and other regulated entities), including customer due diligence and screening.
- Status: amended January 2021 (FATF alignment) and November 2022 (BPRD Circular Letter No. 33, dormancy provisions). BPRD Circular No. 01 of 2025 (25 July 2025) consolidated customer onboarding instructions and refers back to these regulations. A consolidated current text and the content of "Regulation 8": not verified.
- Selvara: 1 / 7 / 4.
- Sources: https://www.sbp.org.pk/circulars/bprd-circular-no-05-of-2020 ; https://www.sbp.org.pk/circulars/bprd-circular-letter-no-33-of-2022 ; https://www.sbp.org.pk/circulars/bprd-circular-no-01-of-2025

**AML/CFT & Sanctions (seed `amlcft`)**
- No single official title; this is a composite catalogue entry. The closest official international reference is the FATF Recommendations (International Standards on Combating Money Laundering and the Financing of Terrorism & Proliferation).
- FATF status: its Recommendations page shows the Standards as updated June 2026 (Recommendation 6, humanitarian carve-outs). Earlier amendments: February 2025 (Recommendation 1 and related notes, financial inclusion) and June 2025 (Recommendation 16, payment transparency). A consolidated PDF is labelled October 2025 (official page, excerpt).
- Which legal instruments the catalogue entry paraphrases (FATF, UN, OFAC, EU or others): not verified.
- Selvara: 3 / 7 / 2.
- Sources: https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html ; https://www.fatf-gafi.org/en/publications/Fatfrecommendations/update-recommendation-6-june-2026.html

### Add-a-framework templates (`src/lib/fwTemplates.ts`)

These are templates only, not catalogue entries. They have short requirement lists and no mapping.

| Template id | Name in app | Version in app | Verified status |
|---|---|---|---|
| nis2 | EU NIS2 Directive | 2022/2555 | Same as the catalogue NIS2 entry above. |
| cisv8 | CIS Critical Security Controls v8.1 | 8.1 | CIS lists v8.1 as the current version (official page, excerpt). Release date and any v8.2 or v9: not verified; v9 was only mentioned as planned. |
| hipaa | HIPAA Security Rule | 45 CFR 164 | The current Security Rule remains in effect. HHS OCR proposed an update (NPRM, 27 Dec 2024; Federal Register 6 Jan 2025). No final rule found as of the sources searched. |
| samacsf | SAMA Cyber Security Framework | 1.0 | Matches the SAMA v1.0 (2017). Its id differs from catalogue `sama`, so a customer could add a duplicate. |

HIPAA sources: https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html ; https://www.federalregister.gov/documents/2025/01/06/2024-30983/hipaa-security-rule-to-strengthen-the-cybersecurity-of-electronic-protected-health-information
CIS source: https://www.cisecurity.org/controls/cis-controls-list

## 4. Cross-cutting status notes

- The AI Act timeline changed in 2026. Anything older than July 2026 that says high-risk obligations apply from 2 August 2026 is outdated.
- ISO/IEC 27701 and ISO/IEC 29100 both have new editions (2025 and 2024) that postdate the editions most documentation refers to.
- ISO 27001:2013 certificates no longer exist as valid certificates after 31 October 2025 (secondary).
- Several items are expected to change soon but are not final: SOC 2 2027 criteria (exposure draft), ISO 22301 Edition 3 (committee draft), DIFC Regulation 10 update (consultation), GDPR and NIS2 Digital Omnibus amendments (proposals), HIPAA Security Rule (proposal).

## 5. Naming accuracy

Findings compare catalogue names in `seed.json` with official titles. Recommendations are wording proposals only; no code or seed files were changed.

| Seed id | Current name | Issue | Recommended wording |
|---|---|---|---|
| iso22301 | ISO/IEC 22301 (BCMS) | Inaccurate. The standard is published by ISO alone; the official designation is "ISO 22301:2019". | ISO 22301:2019 (BCMS) |
| uaeia | UAE IA Standards | Ambiguous and possibly outdated. The documents found are the TDRA "UAE Information Assurance Regulation" v1.1 (2020) and the Cyber Security Council "UAE Information Assurance Standard"; the NESA name is historical. Version unclear. | UAE Information Assurance Standard (issuer and version to be confirmed against the Cyber Security Council and TDRA publications) |
| sbpetg | SBP Enterprise Technology Governance & Risk | Truncated. Official title ends "Risk Management Framework for Financial Institutions". `fwShort.json` already uses "SBP ETGRMF". | SBP Enterprise Technology Governance & Risk Management Framework (BPRD Circular 05 of 2017) |
| sbp | SBP AML/CFT/CPF Reg. 8 | Ambiguous. The official instrument is the whole AML/CFT/CPF Regulations (BPRD Circular 05 of 2020, as amended). "Reg. 8" suggests a single regulation; the content of Regulation 8 was not verified. Seven requirements in one group is a narrow slice. | SBP AML/CFT/CPF Regulations (BPRD Circular 05 of 2020), or keep "Reg. 8" only if the scope note names the topic once verified |
| iso27701 | ISO/IEC 27701 (PIMS) | Outdated risk. Name has no year; the 2025 edition replaced the 2019 edition, changed the title and became standalone. | ISO/IEC 27701:2025 (PIMS), and record which edition the paraphrased requirements follow |
| iso29100 | ISO/IEC 29100 Privacy framework | Edition missing; 2024 edition replaced 2011 and its amendment. Also `kind` is "Framework" although it is an ISO standard. | ISO/IEC 29100:2024 Privacy framework; kind "Standard" |
| iso30107 | ISO/IEC 30107-1 Biometric PAD | Edition missing (2023 replaced 2016). Abbreviation "PAD" is unexplained to customers. | ISO/IEC 30107-1:2023 Biometric presentation attack detection (Part 1: Framework) |
| iso27005 | ISO/IEC 27005 (Risk) | Edition missing; wording vague. | ISO/IEC 27005:2022 Information security risk management guidance |
| iso42001 | ISO/IEC 42001 (AI MS) | Edition missing; "AI MS" is an abbreviation. | ISO/IEC 42001:2023 AI management system |
| nis2 | NIS2 Directive (kind "Regulation") | A directive, not a regulation; obligations come from national transposition laws. Template name is "EU NIS2 Directive" (consistent), but `kind` is inconsistent with reality. | NIS2 Directive (EU) 2022/2555, kind "Directive" (or note "national transposition applies") |
| soc2 | SOC 2 Type II | "Type II" is a report type, not a framework. Criteria basis is not stated. | SOC 2 (AICPA 2017 Trust Services Criteria, Type II reports) |
| sama | SAMA Cyber Security Framework | Accurate but unversioned; issuer now styled Saudi Central Bank. Duplicate id risk with template `samacsf`. | SAMA Cyber Security Framework v1.0 (2017) |
| peca | PECA 2016 | Abbreviation only; 2025 amendment not reflected; a criminal statute presented alongside controls frameworks. | Prevention of Electronic Crimes Act 2016 (as amended 2025) |
| difc | DIFC Data Protection Law | Accurate but without law number; DIFC is a free zone, not UAE-wide. | DIFC Data Protection Law (DIFC Law No. 5 of 2020) |
| uaepdpl | UAE PDPL | Accurate but without law number. | UAE PDPL (Federal Decree-Law No. 45 of 2021) |
| amlcft | AML/CFT & Sanctions | No issuer or instrument; cannot be cited. | State the basis (for example "FATF Recommendations-aligned") once the content source is confirmed |
| nist80037 | NIST SP 800-37 Risk Management Framework | Revision missing. | NIST SP 800-37 Rev. 2 Risk Management Framework |
| nist800207 | NIST SP 800-207 Zero Trust | Acceptable; full title is "Zero Trust Architecture". | NIST SP 800-207 Zero Trust Architecture |

Accurate as named: iso27001 (ISO/IEC 27001:2022), iso27002 (ISO/IEC 27002:2022), nistcsf (NIST CSF 2.0), pci (PCI DSS v4.0.1), gdpr, euaiact (consider adding "Regulation (EU) 2024/1689"), dora.

Other consistency points:

- `kind` values are mixed: ISO/IEC 29100 is "Framework", ISO/IEC 30107-1 is "Standard", SBP ETGRMF is "Regulation" though it is a regulatory framework, and SOC 2 is "Framework". Consider one rule for kind.
- `region` for PCI DSS is "Global", which is correct for scope; the issuer is a private council, not a regulator.

## 6. Not covered yet

Only items whose existence and current version were found in official-page search excerpts are listed. Other items named in the request could not be verified in this session and are listed at the end as such.

| Framework | Current status found | Issuer |
|---|---|---|
| ISO/IEC 27018:2025 (PII in public clouds, processors) | Edition 3, August 2025; replaces 2019 edition; aligned with ISO/IEC 27002:2022 | ISO/IEC |
| ISO/IEC 27017 (cloud security controls) | Exists; edition and status not verified | ISO/IEC |
| CSA Cloud Controls Matrix v4.1 | Released 27 or 28 January 2026 (sources differ by one day); v4.0 and v4.1 both accepted for STAR until December 2027 | Cloud Security Alliance |
| SWIFT Customer Security Controls Framework v2026 | 32 controls (26 mandatory, 6 advisory); attestation July to December 2026 | Swift |
| NCA Essential Cybersecurity Controls (ECC-2:2024) | Published 2024; 4 domains, 28 subdomains, 108 main controls and 92 subcontrols in the English text (Arabic text differs); applies to Saudi government agencies and affiliates | Saudi National Cybersecurity Authority |
| MAS Technology Risk Management Guidelines | Published 18 January 2021; no later version found | Monetary Authority of Singapore |
| HIPAA Security Rule | Template only; NPRM pending (see section 3) | HHS OCR |
| CIS Controls v8.1 | Template only | Center for Internet Security |
| SAMA CSF | Template duplicates catalogue entry `sama` | SAMA |

Not verified in this session (no usable official result): CBUAE information security and operational resilience rules, PRA/FCA operational resilience (including PRA SS1/21), FFIEC guidance, EBA ICT and outsourcing guidelines, and ISO/IEC 27017 edition details. Recommend checking each against the issuer before adding.

## 7. Sources and verification date

Researched 2026-11-08.

Official pages (as search-result excerpts, not fetched in full, unless noted):
- ISO: https://www.iso.org/standard/27001 ; https://www.iso.org/standard/88435.html ; https://www.iso.org/standard/75652.html ; https://www.iso.org/standard/27701 ; https://www.iso.org/standard/27706 ; https://www.iso.org/standard/75106.html ; https://www.iso.org/standard/88412.html ; https://www.iso.org/standard/93606.html ; https://www.iso.org/standard/80585.html ; https://www.iso.org/standard/42001 ; https://www.iso.org/standard/85938.html ; https://www.iso.org/standard/73722.html ; https://www.iso.org/standard/83828.html ; https://www.iso.org/standard/79520.html ; https://www.iso.org/standard/27018
- EU: https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng ; https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng ; https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng ; https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai ; https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/digital-operational-resilience-act-dora
- NIST: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf ; https://csrc.nist.gov/pubs/sp/800/207/final ; https://csrc.nist.gov/projects/risk-management/publications
- PCI SSC: https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1 ; https://www.pcisecuritystandards.org/document_library/
- AICPA: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022
- UAE: https://uaelegislation.gov.ae/en/legislations/1972 ; https://tdra.gov.ae/-/media/About/regulations-and-ruling/EN/UAE-Information-Assurance-Regulation-v1-1-pdf.ashx ; https://csc.gov.ae/en/w/uae-information-assurance-standard
- DIFC: https://assets.difc.com/ (Data Protection Law consolidated July 2025 PDF, Regulation 10 PDF, Consultation Paper No. 3 June 2026)
- SAMA: https://rulebook.sama.gov.sa/en/cyber-security-framework-2
- SBP: https://www.sbp.org.pk/circulars/bprd-circular-no-05-of-2020 ; https://www.sbp.org.pk/bprd/2017/C5-Annex.pdf
- FATF: https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html
- CSA: https://cloudsecurityalliance.org/artifacts/cloud-controls-matrix-v4-1
- Swift: https://www2.swift.com/knowledgecentre/rest/v1/publications/cscf_dd/70.0/CSCF_v2026_202507015.pdf
- NCA: https://nca.gov.sa/en/regulatory-documents/controls-list/ecc/
- MAS: https://www.mas.gov.sg/regulation/guidelines/technology-risk-management-guidelines
- HHS and Federal Register: see section 3 (add-a-framework templates)

Secondary sources (used only where marked "secondary"): certification-body and consultancy pages for the ISO/IEC 27001 transition end date and 27701 transition; law-firm and vendor pages for the GDPR and NIS2 Digital Omnibus status, UAE PDPL executive regulations, PECA 2025 amendment dates and PCI DSS future-dated requirement dates.

Limits: direct fetches of official hosts failed in this environment, so every status above reflects search-result excerpts. Re-check dates and edition numbers against the issuer before external publication, and have qualified compliance or legal staff review this document.

Researched 2026-11-08

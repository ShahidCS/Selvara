# Framework library reconciliation (design brief Part K)

Status: done in PR 4 of the design brief (November 2026), then aligned to the Compliance Sources Register (see the last section). Generated from the two original sources and the app data; no requirement, title
or mapping was written by hand.

## Sources

- **Portal source** (`Assurance-GRC-Portal.html`): the prototype the app was built from. It holds 25 frameworks with their requirements, and 30 controls.
- **Dashboard source** (`GRC_Unified_Compliance_Dashboard.html`, a design board of compressed screens): its first screen holds a separate
  library of 16 frameworks with requirements, 116 further common controls (135 control ids are referenced in all), and every
  requirement-to-control link. PTA CTDISR 2025, NIST SP 800-53 and UAE NIAF exist only there; they were never migrated.

The 13 frameworks that are in both sources have the same groups and requirements (counts and ids match exactly); only their control links were
missing.

## Result

| | Before | After |
|---|---|---|
| Frameworks (All / Standards / Frameworks / Regulations) | 25 / 8 / 8 / 9 | 28 / 8 / 10 / 10 |
| Requirements | 1245 | 1928 |
| Controls | 30 | 141 |
| Requirement-to-control links | 170 | 3146 |

## Framework by framework

| Framework / Regulation / Standard | In portal source | In dashboard source | In app before | What was missing | Action taken | Status after |
|---|---|---|---|---|---|---|
| ISO/IEC 27001:2022 (Standard) | Yes | Yes | Yes | 161 requirement-to-control links (groups and requirements already matched: 11 / 123) | Links reinstated from the dashboard source | Complete: 11 groups, 123 requirements |
| ISO/IEC 27002:2022 (Standard) | Yes | Yes | Yes | 136 requirement-to-control links (groups and requirements already matched: 4 / 93) | Links reinstated from the dashboard source | Complete: 4 groups, 93 requirements |
| SOC 2 Type II (Framework) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 3 groups, 11 requirements |
| ISO/IEC 27701 (PIMS) (Standard) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 3 groups, 8 requirements |
| ISO 22301 (BCMS) (Standard) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 3 groups, 6 requirements |
| ISO/IEC 27005 (Risk) (Standard) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 3 groups, 6 requirements |
| ISO/IEC 42001 (AI MS) (Standard) | Yes | Yes | Yes | 115 requirement-to-control links (groups and requirements already matched: 16 / 70) | Links reinstated from the dashboard source | Complete: 16 groups, 70 requirements |
| NIST CSF 2.0 (Framework) | Yes | Yes | Yes | 163 requirement-to-control links (groups and requirements already matched: 22 / 106) | Links reinstated from the dashboard source | Complete: 22 groups, 106 requirements |
| PCI DSS v4.0.1 (Standard) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 6 groups, 10 requirements |
| GDPR (Regulation) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 6 groups, 12 requirements |
| EU AI Act (Regulation) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 4 groups, 10 requirements |
| DORA (Regulation) | Yes | Yes | Yes | 501 requirement-to-control links (groups and requirements already matched: 15 / 289) | Links reinstated from the dashboard source | Complete: 15 groups, 289 requirements |
| NIS2 Directive (Regulation) | Yes | Yes | Yes | 103 requirement-to-control links (groups and requirements already matched: 5 / 52) | Links reinstated from the dashboard source | Complete: 5 groups, 52 requirements |
| UAE PDPL (Regulation) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 4 groups, 8 requirements |
| DIFC Data Protection Law (Regulation) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 4 groups, 7 requirements |
| SAMA Cyber Security Framework (Framework) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 3 groups, 8 requirements |
| SBP AML/CFT/CPF Regulations (Regulation) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 1 groups, 7 requirements |
| PECA 2016 (Regulation) | Yes | Yes | Yes | 116 requirement-to-control links (groups and requirements already matched: 6 / 46) | Links reinstated from the dashboard source | Complete: 6 groups, 46 requirements |
| UAE IA Standards (Framework) | Yes | Yes | Yes | 278 requirement-to-control links (groups and requirements already matched: 66 / 188) | Links reinstated from the dashboard source | Complete: 66 groups, 188 requirements |
| AML/CFT & Sanctions (Framework) | Yes | No | Yes | Nothing (not in the dashboard source; the portal source is the only origin) | None | Complete: 3 groups, 7 requirements |
| ISO/IEC 29100 Privacy framework (Framework) | Yes | Yes | Yes | 51 requirement-to-control links (groups and requirements already matched: 2 / 24) | Links reinstated from the dashboard source | Complete: 2 groups, 24 requirements |
| ISO/IEC 30107-1 Biometric PAD (Standard) | Yes | Yes | Yes | 21 requirement-to-control links (groups and requirements already matched: 4 / 12) | Links reinstated from the dashboard source | Complete: 4 groups, 12 requirements |
| NIST SP 800-207 Zero Trust (Framework) | Yes | Yes | Yes | 71 requirement-to-control links (groups and requirements already matched: 4 / 35) | Links reinstated from the dashboard source | Complete: 4 groups, 35 requirements |
| SBP Enterprise Technology Governance & Risk Management Framework (Regulation) | Yes | Yes | Yes | 122 requirement-to-control links (groups and requirements already matched: 6 / 60) | Links reinstated from the dashboard source | Complete: 6 groups, 60 requirements |
| NIST SP 800-37 Risk Management Framework (Framework) | Yes | Yes | Yes | 80 requirement-to-control links (groups and requirements already matched: 8 / 47) | Links reinstated from the dashboard source | Complete: 8 groups, 47 requirements |
| NIST SP 800-53 (Framework) | No | Yes | No | Whole framework: 20 groups, 298 requirements, 481 control links | Reinstated from the dashboard source | Complete: 20 groups, 298 requirements |
| UAE National Information Assurance Framework (Framework) | No | Yes | No | Whole framework: 6 groups, 36 requirements, 69 control links | Reinstated from the dashboard source | Complete: 6 groups, 36 requirements |
| PTA Critical Telecom Data and Infrastructure Security Regulations 2025 (Regulation) | No | Yes | No | Whole framework: 13 groups, 349 requirements, 508 control links | Reinstated from the dashboard source | Complete: 13 groups, 349 requirements |

## Decisions and flags (for review)

- **Status of the 111 reinstated controls: "Needs evidence".** The dashboard source gives them no tests or evidence, so none is shown as
  passing. The demonstration's "controls waiting for evidence" figures rise accordingly. A company's real status comes from its own tests and
  evidence in production.
- **Owners of the reinstated controls.** The dashboard source names people of a different demonstration company. Each reinstated control is
  given the app's existing owner for the same control domain (the owner who already holds most controls in that domain), so no new person is invented.
- **UAE NIAF: metadata not carried.** (NIAF has since been removed; see the register section.) Its 36 requirements carry a control type, priority (P1 to P3) and applicability in the
  source. The app's requirement format has no field for these, so they are not shown. Flagged, not dropped silently: they can be added with a
  catalogue field later.
- **Unresolved references already in the app: 78 (72 after the register change removed `sbp` and `amlcft`).** Some original control links use a short reference where the catalogue
  has a longer id (for example `Art.5` where DORA lists `Art.5(1)`). They predate this change, nothing new adds to them, and they are left as
  they are rather than guessed at. By framework: soc2 13, uaeia 11, dora 8, nis2 8, pci 6, iso27005 5, sbp 4, sama 3, iso42001 3, nist80037 3, nist800207 3, gdpr 2, amlcft 2, euaiact 1, iso30107 1, iso27701 1, peca 1, iso29100 1, difc 1, uaepdpl 1. A unit test keeps the number from rising.
- **The requirement-titles disclaimer was removed** from the Frameworks page, as asked. A one-line note on the page still says that requirement-to-control mappings and applicability decisions are drafts. Under the organisation's rules, qualified compliance staff review them before anyone relies on them.
- **Nothing was invented.** Where the sources hold no data, the app holds none either.

## Compliance Sources Register (November 2026)

The library now matches the owner's Compliance Sources Register exactly: 25 entries. Each entry carries the register's short name, full
form (`title`), publisher and latest version in `src/data/seed.json`, and the server library (`src/server/ws/catalogue.ts`) returns the same
fields. The Frameworks list shows them under each name; a framework page shows them in its Source card.

### Removed (not in the register)

| Entry | Why | Effect |
|---|---|---|
| SBP AML/CFT/CPF Regulations (`sbp`) | Not in the register | Entry, 7 requirements and its control links removed; 4 of the unresolved short references went with it |
| AML/CFT & Sanctions (`amlcft`) | Not in the register; a composite with no single official source | Entry, 7 requirements and its control links removed; 2 unresolved references went with it |
| UAE National Information Assurance Framework (`uaeniaf`) | Replaced by register entry 21 (UAE Information Assurance Regulation v1.1) | Entry, 36 requirements and 69 control links removed. Control IR-6 ("Incident cost and impact are estimated and recorded") was mapped only to NIAF; it stays in the control library with no mapping, for a reviewer to map or retire |

The company policy named "AML/CFT & Sanctions Policy" in the demonstration data is a policy, not a framework, and is unchanged.

Totals after the change: 25 frameworks (8 standards, 8 frameworks, 9 regulations), 1878 requirements, 141 controls, 3071
requirement-to-control links, 72 unresolved short references (was 78).

### Requirements that reflect an earlier edition

Relabelling an entry to the register's version does not change its requirement text. Where the modelled requirements predate that version,
the entry carries `reqEdition`, the Frameworks list shows an "Earlier edition" badge and the framework page shows a "Requirements reflect an
earlier edition" note. No requirement text was written to close these gaps: each one needs the official text and a qualified reviewer.

| Entry | Register version | Requirements reflect | Gap for review |
|---|---|---|---|
| ISO/IEC 27001:2022 | Oct 2022 (Amd 1:2024) | 2022 text without the amendment | Amd 1:2024 adds climate change to clauses 4.1 and 4.2; neither the requirements nor their guidance mention it |
| ISO 22301:2019 | Oct 2019 (Amd 1:2024) | 2019 text without the amendment | Same climate action amendment, not reflected |
| ISO/IEC 27701:2025 | Oct 2025 | ISO/IEC 27701:2019 (clauses 5.2 to 7.4) | The 2025 edition is a standalone management system with a new clause structure; the 8 summary requirements follow the 2019 extension structure |
| NIST SP 800-53 Rev. 5 | Sep 2020 (Release 5.2.0, Aug 2025) | Rev. 5 as first published | Controls and enhancements added or changed in later releases up to 5.2.0 are not modelled |
| DIFC Data Protection Law No. 5 of 2020 | Jul 2020 (latest amendments 2025) | The law as enacted | The 2025 amendments are not modelled |
| UAE Information Assurance Regulation v1.1 | Mar 2020 | UAE Information Assurance Standards (NESA, 2014), the dashboard source's document | Differences between the 2014 standards and Regulation v1.1 (control numbering, any added or removed controls) are not checked |

Not flagged, but not verifiable from the sources: the portal source states no edition for SOC 2, ISO/IEC 27005, PCI DSS, GDPR, EU AI Act,
UAE PDPL and SAMA CSF. Their short summary requirements show nothing that predates the register version; a reviewer should still confirm them.
The other entries were built in the dashboard source from the edition the register names (for example ISO/IEC 29100:2024, ISO/IEC
30107-1:2023, NIST CSF 2.0, PECA with its 2025 amendment, CTDISR 2025).

### Recommended additions (not added)

The register recommends these for a GCC-focused library. They are not in the library yet; each needs a sourced requirement list and a
compliance review before it is added: NCA Essential Cybersecurity Controls (ECC-2:2024), Saudi Personal Data Protection Law (PDPL), ADGM
Data Protection Regulations 2021, CIS Controls v8.1 (also available today as an "Add framework" template) and SWIFT CSCF.

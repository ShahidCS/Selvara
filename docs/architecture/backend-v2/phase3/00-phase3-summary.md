# Back-end v2, Phase 3: Self-review summary

| | |
|---|---|
| Status | Draft for the owner's review |
| Date | 2026-11-23 |
| Scope | Structured self-review of the Phase 2 design. Documents only; no implementation. All compliance content is a **draft** pending qualified legal and compliance review. |

## 1. Summary

Three independent read-only reviewers checked the Phase 2 design. They covered completeness across all modules and workstreams, plus the seven consistency checks the brief requires. They raised **112 findings: 18 High, 65 Medium, 29 Low**.

The design authority issued 15 binding rulings (DA-01 to DA-15) on the conflicts that needed a decision. Four revisers then applied the findings, each to a separate set of documents. **263 changes were applied and 41 proposals were not**, each with a reason; most were overridden by a ruling or an owner decision. Every revised item ends with "(rev P3)": 988 marks across the design.

The spine was rewritten as **Spine v2**. The Phase 1 logs were replaced by unified registers: decisions (including 38 still unmade), assumptions (73), risks (67) and open questions (OQ-16 to OQ-25 are new).

## 2. Evidence

| Document | Contents |
|---|---|
| [P3-X1-coverage-data.md](P3-X1-coverage-data.md) | Coverage matrix (78 rows × workstreams A to K); data model vs API; control-plane placement (41 tables checked); classification vs retention and encryption. 48 findings. |
| [P3-X2-api-rbac-threats.md](P3-X2-api-rbac-threats.md) | API vs RBAC; API vs front-end (all 166 screens); threat model vs controls. 36 findings. |
| [P3-X3-nfr-registers.md](P3-X3-nfr-registers.md) | NFRs and growth vs infrastructure and cost; capacity rule CR-1; unified registers; Spine v2 texts; verification checklist. 28 findings. |
| [P3-changes-A.md](P3-changes-A.md) to [P3-changes-D.md](P3-changes-D.md) | What each reviser changed, and what it did not apply, with the reason |

## 3. Coverage matrix result

| Status (before revision) | Cells |
|---|---|
| Covered | 272 |
| Partial | 57 |
| Not applicable | 44 |
| **Missing** | **1**: M24 Help desk had no release in 2K |

The one Missing cell is closed: the help desk is now in release V2-R1 (2K). The 57 Partial cells produced most of the X1 and X2 findings, and the revisions address them. **Phase 4 re-measures the matrix independently**; this review does not mark its own work as closed.

## 4. Consistency checks

| # | Check | Main mismatches found | Resolution |
|---|---|---|---|
| 1 | Data model vs API | Tables with no endpoint; endpoints with no table; name differences | Mapped or marked internal. New `policy_remark` table and `person.device_posture_enc` column (2B) for the endpoints OD-05 kept. Orphan endpoints C-M23-02 and C-M23-03 now mapped. |
| 2 | Control-plane vs tenant placement | **No tenant business data in any of the 41 control-plane tables.** ADR-010 conflicted with R2-01 and R2-03, and with about 30 accepted table additions. | ADR-010, 2A, 2C, 2E and 2H aligned (DA-06). The allowed table list equals the Spine v2 S2 list, and CI fails on anything else. |
| 3 | API vs RBAC | **F1-01 reopened in v2**: auditors had `risk.read` with no object rule. "Privileged role" was defined three ways. An invitation link was returned to platform staff. | DA-07: auditors see only risk snapshots shared with their engagement, with no member list or ids. DA-08: one definition of privileged role, and SCIM may assign only non-privileged roles. DA-09: invitation links go by email only. |
| 4 | API vs front end | OD-05 decisions not carried into 2C | "My remarks" and Risk-classify have endpoints; the dropped screens are labelled "Dropped by owner (OD-05)". All 166 screens are mapped. |
| 5 | Classification vs retention and encryption | Narrative text left in plaintext in 2B; wrapped file keys in tenant tables; an undefined platform key; retention class names differing between 2B and 2G | DA-01: free text is E1. DA-04: file and subject keys live in `ks` only. DA-05: platform keys F-K-30 to F-K-33. 2B classification rewritten with E0, E1 and E2 only, and retention names matched to 2G. |
| 6 | Threat model vs controls | **R-56** described as "fails" in 2F and ADR-002 but "succeeds" in 2J. Audit-log hash input contradicted itself. Threat rows cited sections that don't exist. Four threats missing. | DA-02: the escape succeeds if SQL can be injected. The controls are prevention plus detection, gathered in one block F-ISO-06; the residual risk falls under the owner-accepted C1-01. DA-03: personal fields enter the hash as HMACs. Citations fixed. Threats added: fraudulent DSAR, SSRF through webhooks and integrations, automation abuse, external report distribution (DA-15). |
| 7 | NFRs and growth vs infrastructure and cost | Three different cell thresholds. Control-plane load had no target after R2-01. The `ks` key store could not meet RPO. The cost model understated cost by 17 to 48%. | DA-10: capacity rule CR-1. DA-12: control-plane throughput target and load test. DA-11: `ks` standby in the DR region, plus an 8-day off-site key journal. DA-13: corrected costs of about USD 554, 1,075 and 6,336 a month at 10, 100 and 1,000 tenants (about USD 55, 11 and 6 per tenant). Plan entitlements now include database size, BYOK, SSO and a dedicated cell. |

## 5. Design-authority rulings (binding)

DA-01 to DA-15 are set out in full in the reviser brief and applied across the documents. In short:
- DA-01: free text E1.
- DA-02: R-56 wording and controls.
- DA-03: audit-log hash input.
- DA-04: keys in `ks`.
- DA-05: platform keys.
- DA-06: control-plane access (R2-01, R2-03).
- DA-07: auditor scope.
- DA-08: privileged-role definition.
- DA-09: no invitation links to staff.
- DA-10: capacity rule CR-1.
- DA-11: `ks` resilience.
- DA-12: control-plane load.
- DA-13: cost and entitlements.
- DA-14: OD-05 applied.
- DA-15: coverage gaps and egress.

## 6. Still open

- **Decisions not yet made:** DU-01 to DU-38 in [decisions-log.md](../decisions-log.md), with mandatory-for-MVP flags and owners. Most need a vendor fact, legal advice or an owner value.
- **Unvalidated assumptions:** 55 of 73 are open in [assumptions-log.md](../assumptions-log.md), which lists the high-impact ones. Most are vendor facts (VC-01 to VC-22) or legal positions.
- **Risks:** 67 in [risks.md](../risks.md). 21 residual Medium threats await the owner's acceptance (OQ-16).
- **Owner questions:** OQ-16 to OQ-25 in [open-questions.md](../open-questions.md).

## 7. What I need from you

1. Answers to OQ-16 to OQ-25, or "accept recommendations".
2. Approval to start **Phase 4**: an independent audit against the brief's checklist, with a Findings Register.

# Back-end v2, Phase 2: Design summary

| | |
|---|---|
| Status | **Approved by the owner on 2026-11-23** ("accept recommendations"). Phase 3 (self-review) in progress. |
| Date | 2026-11-23 |
| Scope | Design only. No implementation before the Phase 5 readiness gate and the owner's approval. All compliance content is a **draft** pending qualified legal and compliance review. |

## 1. Summary

Phase 2 designs back-end v2 on the owner's decisions: one schema per tenant (ADR-001), Supabase, TypeScript, and the answers to Q-01 to Q-31 and OQ-01 to OQ-12. All workstreams A to K were written to one binding **design spine** (`00-spine.md`): topology, control-plane contents, request path, table catalogue, roles, API conventions, backups and keys, and jobs. Each workstream records where it deviates from the spine.

Thirteen ADRs are proposed (ADR-002 to ADR-014). The design authority then reconciled the workstreams; section 3 lists what changed. The owner's decisions needed before Phase 3 are in section 4, and the facts still to verify are in section 5.

## 2. Deliverables

| Workstream | Document | Contents |
|---|---|---|
| Spine | `00-spine.md` | Binding cross-workstream decisions |
| A Architecture | `2A-architecture.md` | C4 Level 1 and Level 2; control plane and data plane; routing (fail closed); connections; cells; tenant lifecycle; cross-tenant needs; modules; stack; NFRs |
| B Data model | `2B-data-model.md`, `2B-classification.md` | 27 entity-relationship diagrams; placement; defence-in-depth `tenant_id`; reference content; audit fields; delete, hold and retention; classification and encryption class of every field; migration rules; `ws_records` mapping |
| C API | `2C-api.md` | Endpoint outline for every module with an authorization rule per endpoint; conventions; webhooks; all 166 screens mapped to endpoints |
| D Workflows | `2D-workflows.md` | 14 state machines; one approval engine (35 tenant and 12 platform kinds); jobs D-61 to D-81; worker isolation |
| E Identity and access | `2E-iam.md` | Authentication, sessions, tenant binding, switching between tenants, SSO and SCIM, role matrix E-31, custom tenant and platform roles, API keys, support access, break-glass |
| F Security | `2F-security.md` | STRIDE threat model with abuse cases, isolation test suite F-IT-01 to F-IT-37, key management, control-plane hardening, audit log, uploads, secrets, monitoring, ASVS L2 mapping, secure development |
| G Privacy | `2G-privacy.md` | Data inventory and flows, Selvara's RoPA, platform DPIA, lawful bases, residency, retention, offboarding and deletion certificate, DSAR, DPA outline, subprocessors, ISO 27001 Annex A and ISO 27701 mapping |
| H Infrastructure | `2H-infrastructure.md` | Accounts and regions, network, infrastructure as code, provisioning pipeline, environments, CI/CD, observability, fleet monitoring, backup and DR, email, cost model |
| I Billing | `2I-billing.md` | Billing entity and payment route, provider abstraction, plans and limits, metering, tax checklist, dunning, AI providers |
| J Testing | `2J-testing.md` | Strategy; isolation, authorization, security, migration, restore, crypto-shredding, load and parity suites |
| K Delivery | `2K-delivery.md` | Releases V2-R0 to V2-R6, delivery risks, Definition of Done |
| ADRs | `adr/ADR-002` to `ADR-014` | Context, options, decision, consequences, security and privacy, verification |

## 3. Reconciliation log (design authority)

| ID | Conflict found | Resolution |
|---|---|---|
| R2-01 | 2A named the session table `control.user_sessions` and cached sessions and memberships for 30 s; 2B and 2E used `control.sessions` and no cache. | **`control.sessions`.** Sessions, memberships and tenant status are never cached. Revoking a membership or suspending a tenant revokes the affected sessions in the same transaction, so it takes effect on the next request. Only static routing fields are cached (30 s). 2A edited: A-RT-07, A-LC-04, A-TS-03, A-NFR-12; R-14 closed. |
| R2-02 | 2I made bank transfer the launch billing route, while the owner decided "Stripe now" (OQ-02). Stripe reportedly does not onboard Pakistan-registered businesses (unverified: stripe.com was unreachable). | **Escalated as owner decision OD-01.** The design supports both routes without redesign (ADR-007). |
| R2-03 | 2F proposed amendments to 2A and 2H: the tenant API reaches the control plane only through functions (`cp_tenant_api`; `cp_rw` for the console only), and two Vercel production projects (`app` and `console`). | **Accepted.** They narrow the blast radius. ADR-010 and H-AC-04 are to be updated to match in Phase 3. |
| R2-04 | 2C and 2E propose screen removals (C-DR3) and role changes (E-DR3), which conflict with "no downgrade" unless the owner signs off. | **Escalated as OD-05 and OD-06**, with recommendations. |
| R2-05 | Spine deviations SD-A1 to SD-A4, SD-H1, SD-H2, SD-B01 to SD-B05, SD-C1 to SD-C4, SD-D1 to SD-D3, SD-E1 to SD-E5, SD-F-01 to SD-F-03, and the 2I deviations. | All reviewed. They add tables, roles or precision without weakening isolation, so all are accepted. **Phase 3 will fold them into spine v2.** |
| R2-06 | 2J found that an injected `SET ROLE` inside a routed transaction escapes tenant isolation (R-56). | Held as a **critical design constraint**: only the `router` module may issue `SET ROLE`; queries are parameterised only; lint ban; F-IT tests; pgaudit alert. Phase 3 checks that 2A, 2F and 2J state it the same way. |
| R2-07 | The brief cites 28 frameworks; the seed holds 25 (A-25). | Open, OQ-15. |

## 4. Owner decisions needed

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| OD-01 | **Launch payment route** (OQ-02 against Stripe's country rules). | (a) Form a Stripe-eligible entity (UAE, US or UK) now and use Stripe from day one. (b) Bill by bank transfer from the Pakistan entity at launch; Stripe ready and switched on when the foreign entity exists. (c) A merchant-of-record or local provider once it passes onboarding checks. | **(b) now, moving to (a) when the UAE, US or UK entity exists.** Your "Stripe" decision is kept as the configured target; nothing is redesigned. Verify Stripe's country list first (VC-07). |
| OD-02 | **External cloud account** (for example AWS) for KMS, the scanner container and off-site WORM backup copies. | Accept, or keep Supabase-only. Supabase-only cannot crypto-shred backups, because Vault keys sit in the same backups as the data. | **Accept.** It is needed for BYOK (Q-16) and safe deletion (Q-24, OQ-03). About USD 115 a month at launch (verify). |
| OD-03 | **Approval to add three CI workflows** later (`migrate.yml`, `fleet-ops.yml`, `infra.yml`) and to change `rbac.ts` and `roles.json` for custom roles. These are protected files. | Approve in principle now, with each change reviewed in its release | **Approve in principle.** |
| OD-04 | **Trial provisioning** under one standing four-eyes approval of a trial policy (limits, duration, region), instead of an approval per trial. | Standing policy, or per-trial approval | **Standing policy**, with a daily digest to both approvers. |
| OD-05 | **Screens not carried to v2** (C-DR3) | Keep or drop each one | **Drop:** the demo card form (card data must never touch Selvara: F1-07), platform staff editing tenant users (S-AD-04; conflicts with customer-granted support access), the demo sign-in gallery (S-ST-42), and the demo portal's extra MFA step (S-RK-32; the email one-time code stays). **Keep and build:** "My remarks" (S-AS-02), and fix the AI "Risk-classify" action (S-RK-23) instead of dropping it. |
| OD-06 | **Role changes from v0.2.5** (E-DR3, marked † in 2E E-31) | Approve or adjust | **Approve.** Analysts gain evidence, framework and questionnaire access. Owners gain settings and member read access, privacy approvals and the assistant. Auditors lose policy acknowledgement (your F1-01 decision). |
| OD-07 | **Custom platform role names** (OQ-01) | (a) Names only from the fixed list of nine (2E E-73). (b) The list plus free-text names. | **(a)**: predictable permission ceilings. Your answer is still pending. |
| OD-08 | **Legal reviews to commission** | — | Retention periods (2B, 2G). UAE executive regulations and health-data localisation. Pakistan bill status. Staff access from Pakistan as a restricted transfer of UK and EU data (R-48). DPO and Art. 27 representatives. |
| OD-09 | **Licensing of standards text** (R-24): ISO and other copyrighted texts in the reference content | Licence the texts, or ship paraphrases, ids and titles only | **Ids, titles and Selvara's own paraphrases** unless a licence is bought. Legal to confirm. |
| OD-10 | **Member names kept 7 years for audit attribution, against erasure** (R-23) | — | Keep a pseudonymous id in the audit log; shred the name key on erasure (2B, B-D17). Legal to confirm. |
| OD-11 | **Cost model** (2H): about USD 47 per tenant per month at 10 tenants, 8.3 at 100, and 4.3 at 1,000 (unverified prices) | Accept as the planning basis | Accept for planning; verify prices (VC-08) before pricing the plans. |

## 5. Verification checklist (vendor facts not reachable from the design session)

| ID | Fact to verify | Affects |
|---|---|---|
| VC-01 | Supabase Queues (pgmq) and pg_cron: availability and maturity | ADR-005, 2D |
| VC-02 | Supabase point-in-time restore into a new project | ADR-004 |
| VC-03 | Disabling the Data API (PostgREST), or exposing no schemas, per project | ADR-002, 2F |
| VC-04 | Supabase Storage: prefix-scoped access, whether objects are included in backups, maximum upload size | 2F, ADR-004, Q-10 |
| VC-05 | Postgres version on Supabase (16 or later, for the role-grant `SET` option) | ADR-002 |
| VC-06 | Supabase Auth: plan tier for SAML SSO, custom OIDC providers, passkey support | ADR-006 |
| VC-07 | Stripe supported countries (Pakistan) | OD-01, ADR-007 |
| VC-08 | Supabase, Vercel and KMS prices | 2H cost model, OD-11 |
| VC-09 | pgaudit on Supabase | 2F |
| VC-10 | Vercel OIDC federation to the chosen cloud, and function streaming and time limits | 2F, ADR-005 |
| VC-11 | Merchant-of-record and payment-provider onboarding for a Pakistan entity | OD-01 |
| VC-12 | ISO/IEC 27005:2022 and ISO/IEC 27001:2022 clause wording cited *(verify)* | 2F, 2G |

## 6. Logs

- **ADRs:** ADR-002 to ADR-014 are proposed and indexed in `decisions-log.md`.
- **New assumptions:** A-15 to A-64 and A-K1/A-K2, each in its workstream's closing section.
- **New risks:** R-11 to R-59, R-K1 to R-K3 and R-56, each in its workstream's closing section.
- **Phase 3 consolidates every log** into the single registers, and starts the Findings Register.
- **New open questions:**
  - OQ-13: OD-01 to OD-11 above.
  - OQ-14: confirm Frankfurt as the home region `R1` (the current project's region per `docs/guides/SUPABASE.md`).
  - OQ-15: 28 or 25 frameworks.

## 7. What I need from you

1. Decisions OD-01 to OD-11, or "accept recommendations".
2. Confirmation of Frankfurt as the home region (OQ-14) and the framework count (OQ-15).
3. A reply on OD-07 (fixed role-name list or free text).
4. Approval to start **Phase 3** (self-review: coverage matrix, consistency checks, revisions).

## 8. Owner decisions recorded (2026-11-23)

The owner accepted every recommendation in section 4.

| ID | Recorded decision |
|---|---|
| OD-01 | Launch billing route: **bank transfer from the Pakistan entity**, with the Stripe adapter built and switched on once a Stripe-eligible entity (UAE, US or UK) exists. Stripe stays the configured target, and VC-07 is verified first. |
| OD-02 | An **external cloud account** (AWS or equivalent) for KMS, the scanner container and off-site WORM copies. |
| OD-03 | The protected-file changes are approved **in principle**: the three new workflows, plus `rbac.ts` and `roles.json` for custom roles. Each change is still reviewed in its release. |
| OD-04 | Trials are provisioned under **one standing four-eyes approval of a trial policy**, with a daily digest to both approvers. |
| OD-05 | **Dropped:** demo card form, platform editing of tenant users (S-AD-04), demo sign-in gallery (S-ST-42), demo portal MFA step (S-RK-32). **Kept and built:** "My remarks" (S-AS-02). **Fixed, not dropped:** AI "Risk-classify" (S-RK-23). |
| OD-06 | The † role changes in 2E E-31 are approved. |
| OD-07 | Custom platform role names come **only from the fixed list** (2E E-73). |
| OD-08 | The owner commissions the legal reviews listed; they are owner actions tracked in Phase 5. |
| OD-09 | Reference content ships **ids, titles and Selvara's own paraphrases**, unless a licence is bought. Legal to confirm. |
| OD-10 | The audit log keeps a pseudonymous id; erasure shreds the name key. Legal to confirm. |
| OD-11 | The cost model is the planning basis; prices are verified (VC-08) before plans are priced. |
| OQ-14 | Home region `R1` = **Frankfurt** (the current project's region). |
| OQ-15 | **25 frameworks.** The library, short names and requirement catalogues all hold 25. The figure of 28 in the Phase 1 discovery was the design authority's error, not a data gap. A-25 is closed. |

# Back-end v2, Phase 1: Discovery Summary

| | |
|---|---|
| Status | Draft for the owner's review (Phase 1) |
| Date | 2026-11-23 |
| Scope | Discovery only. No implementation code is written before the Phase 5 readiness gate and the owner's approval. |
| Compliance note | All regulatory and compliance content is a **draft** pending review by qualified compliance and legal staff. Clause references marked *(verify)* need checking. |

## 1. Summary

Selvara is not a browser-only prototype. It has a working multi-tenant back end in production (v0.2.5, released 2026-11-23):
- Next.js API routes on Vercel and Supabase Postgres;
- one shared schema, isolated by row-level security;
- most module data held as JSON documents in one generic table.

Production holds no customer data (Q-01). Back-end v2 is therefore a **new data plane built behind the existing API and screens**, not a data migration.

The owner fixed **ADR-001: one Postgres schema per tenant on Supabase**, and accepted its residual isolation risk (C1-01). Everything else in this summary follows from the owner's answers (Q-01 to Q-31, OQ-01 to OQ-04).

## 2. What exists today (baseline to keep or replace)

| ID | Area | Today | v2 direction |
|---|---|---|---|
| E-01 | Runtime | Next.js 16 API routes on Vercel; one route table | Keep (ADR-005 proposed) |
| E-02 | Database | One Supabase project; control-plane and tenant tables in the same `public` schema | Separate control-plane schema plus one schema per tenant (ADR-001) |
| E-03 | Isolation | Tenant taken from the session; row-level security keyed on `app.tenant_id`; non-bypass role `selvara_app` | A role per tenant plus one routing point, with row-level security kept as defence in depth (ADR-002) |
| E-04 | Data shape | `ws_records(tenant_id, kind, id, data jsonb)` | Typed entity tables (ADR-008) |
| E-05 | Identity | Supabase Auth, TOTP MFA, recovery codes; passkeys for platform super admins; several companies per person; no SSO or SCIM | Keep Supabase Auth; add SAML/OIDC per tenant and a SCIM 2.0 endpoint built in Selvara (ADR-006) |
| E-06 | Authorisation | Role-to-module rules shared by browser and server; four-eyes approvals; delegation | Keep and extend into a permission model (Phase 2E) |
| E-07 | Platform access | Elevated sessions (reason, ticket, 60 minutes); customer-granted support sessions logged in the tenant's own audit log | Keep |
| E-08 | Audit log | Append-only, SHA-256 hash chain per tenant, verifiable by the tenant | Keep; add external anchoring and WORM export |
| E-09 | Files | One private bucket, type and content checks, **no malware scanning** | Tenant-scoped paths, scanning, a quarantine area, signed URLs |
| E-10 | Jobs | None. Expiry is checked when a record is read | Durable queue and scheduler (ADR-005) |
| E-11 | Migrations | Manual SQL plus a fail-closed schema-version check | Orchestrator across tenant schemas (ADR-009) |
| E-12 | Residency | One region | One region at launch, cells later (Q-05) |
| E-13 | Keys | Provider-managed at rest only | Envelope encryption, BYOK and crypto-shredding (ADR-003) |
| E-14 | Third parties | Stripe, Resend or Postmark, Anthropic, and the GitHub, AWS, Okta/Entra and Google integrations | Provider abstractions configurable in the console (Q-18, Q-21, Q-26) |
| E-15 | Pipeline | Gitleaks, CodeQL, OSV, Trivy, ZAP, dependency review, licence and workflow policy, signed tags, build attestation, production gate | Keep; add migration orchestration |

## 3. Owner's answers and resulting decisions

| Q | Answer (summary) | Decision recorded |
|---|---|---|
| Q-01 | No live data in production | Greenfield data plane, no data migration |
| Q-02 | Decide | No dual running: v0.2.5 stays live until one cutover |
| Q-03 | Supabase preferred; schema per tenant | ADR-001, revision 2 |
| Q-04 | All sectors, including banks, telecoms and health | Design for regulated buyers; special-category data possible (health) |
| Q-05 | Default region for now | One cell, one region; risk R-01 |
| Q-06 | Control plane may hold identity data outside the tenant's region | Global control plane (draft, needs legal review) |
| Q-07 | Sector rules later | Out of the MVP; R-01 |
| Q-08, Q-09 | Decide | A schema per tenant from day one, trials included; cell threshold measured by load test (A-07) |
| Q-10 | Maximum file size set by a super admin | Limits per plan and per tenant, capped by a hard platform ceiling |
| Q-11 | Cloud not yet chosen | Nothing beyond Supabase, Vercel and named SaaS providers |
| Q-12 | TypeScript and Node | Kept |
| Q-13 | Explain | Recommendation: Vercel plus Supabase-native jobs plus one scanning container (ADR-005, proposed) |
| Q-14, Q-15 | SSO and SCIM needed; keep Supabase Auth | ADR-006 (proposed) |
| Q-16 | BYOK needed | ADR-003 (proposed) |
| Q-17 | ISO 27001, ISO 27701 and SOC 2 between 6 and 36 months after launch | Evidence collected from day one |
| Q-18 | Pluggable AI providers, including free models | AI provider abstraction with a recorded review per provider (ADR-007) |
| Q-19 | All frameworks | All 28 catalogued frameworks, as versioned reference content |
| Q-20, OQ-02 | Customers worldwide; billing entity in **Pakistan**, later UAE, US and UK | See section 5 |
| Q-21 | Stripe now; other providers configurable | Payment provider abstraction (ADR-007); see section 5 |
| Q-22 | Limits per user, framework, storage and API calls | Metering into the control plane; enforced on the server |
| Q-23 | No team, everything automated | Automation everywhere; human approvals stay where policy requires them (section 4) |
| Q-24 | Back up every change; keep for the client's lifetime; deletion by a super admin with an evidence chain | Change journal plus backups; four-eyes deletion; crypto-shredding (section 6) |
| Q-25 | Four-eyes approval gates | Kept |
| Q-26 | Integrations configurable | Integration registry |
| Q-27 | DSAR, DPIA and the ISO 27005 model end to end | In the MVP, delivered as ordered releases (C-08) |
| Q-28 | Trust Center in the MVP | Yes |
| Q-29 to Q-31 | Front end may change; inventory from this repository; documents in this folder | Yes |
| OQ-04 | Single region accepted | R-01 accepted |

## 4. OQ-01: the minimum people and roles

A company with no team still needs **named people** for three things. Four-eyes approval needs two different people. ISO 27001 needs assigned responsibilities, management review and an internal audit that is independent of the work it checks. Your organisation's policy requires technical, security and management review before deployment.

Recommended minimum: **two people, plus three outsourced services.**

| Role | Duties in Selvara | Holder | Notes |
|---|---|---|---|
| R-A Platform super admin 1, and management (founder) | Requests or approves tenant creation, deletion, elevation, payment and AI provider changes. Signs off releases (management). Chairs management review. | Person 1 | Owns the information security management system (ISMS) |
| R-B Platform super admin 2, and security and privacy reviewer | The second pair of eyes on every four-eyes action. Security sign-off at the release gate. Privacy lead (handles DSARs and DPIAs). | Person 2, who can be part-time (for example a fractional CISO or DPO) | Must never approve their own request; the server enforces this already |
| R-C Break-glass custodian | Holds the sealed emergency access procedure; each use is reviewed afterwards | R-A or R-B, with the other reviewing | Logged, alerting |
| R-D Internal auditor (ISO 27001 clause 9.2) | Audits the ISMS once a year | **Outsourced** | Independence needed *(verify the requirement in ISO 27001:2022 clause 9.2)* |
| R-E UK GDPR Art. 27 representative | Contact point for UK data subjects and the regulator | **Outsourced service** | Needed if there is no UK establishment *(verify)* |
| R-F EU GDPR Art. 27 representative | The same for the EU | **Outsourced service** | Needed if EU data subjects are targeted *(verify)* |
| R-G Data Protection Officer | Formal DPO, if designation is required | R-B or an outsourced DPO | Required by GDPR Art. 37 *(verify)* if core activities involve large-scale processing of special-category data. Health customers make this likely for Selvara **as a processor**. Legal to confirm. |
| R-DEP Deputy approver (rev P5; P4-A3-19) | Acts for R-A **or** R-B in four-eyes actions and in key-store (`ks`) recovery when that person is unavailable, **never for both in the same action**, and never in an action where the person they stand in for has voted or is the requester. May set the RA-01 keep-newest hold on KS-SNAP alone (it only preserves data). | **Contracted**; appointed by the owner (owner action, readiness gate item 5); role defined by the design authority (ADR-015 point 7) | The appointment, its period and the delegation are recorded in SOD_MATRIX before the first external tenant (owner action; protected file). Needs hardware-key MFA and elevation like R-A and R-B. Not to be confused with R-D (internal auditor). |

**Combined-role mode (rev P5, ADR-021):** while the team is small, one person may hold R-A and R-B. Every four-eyes action still needs two different people: the combined holder and R-DEP. The monthly independent review is done by the technical reviewer or R-D.

Separation of duties: R-A and R-B approve each other's requests (in combined-role mode, ADR-021, the combined holder and R-DEP approve each other's requests) (rev P5); neither can approve their own. When appointed, R-DEP counts as one of the two people only, for one capacity per action (rev P5). Automation (provisioning, migrations, scans, reminders, evidence collection) never counts as an approver.

## 5. OQ-02: billing entity in Pakistan (draft, needs legal and tax review)

| ID | Finding | Impact | Recommendation |
|---|---|---|---|
| BL-01 | **To my knowledge, Stripe does not accept businesses registered in Pakistan** *(verify against Stripe's list of supported countries)*. A Pakistan entity probably cannot open a Stripe account to take payments. | Q-21 ("keep Stripe now") may not work for the launch entity. | Phase 2I compares options: (a) a **merchant-of-record** provider that sells on Selvara's behalf, handles sales tax and VAT worldwide, and pays out to a Pakistan entity *(availability to verify per provider)*; (b) a local or regional payment provider; (c) Stripe once the UAE, US or UK entity exists. The payment-provider abstraction (ADR-007) allows (a) or (b) now and Stripe later without redesign. The existing Stripe code stays as one adapter. |
| BL-02 | Selling worldwide brings sales tax and VAT obligations in many countries (for example UK VAT and EU VAT on digital services) | Each country's tax registration and invoice rules | A merchant of record shifts most of this to the provider. Otherwise a tax-calculation service plus registrations per country. |
| BL-03 | Pakistan's own rules on tax for IT-service exports, State Bank of Pakistan rules on bringing foreign earnings home, and provincial sales tax on services *(all to verify with a Pakistan tax adviser)* | Payout route and invoice content | Phase 2I records requirements to verify; this is not a design decision. |
| BL-04 | Future entities in the UAE, US and UK (in 1 to 3 years) | Several billing entities, one product | The control plane records a billing entity per subscription, so a second entity can be added without a schema change. |

## 6. OQ-03: is crypto-shredding legally safe and acceptable?

**Short answer.** It is a widely used and generally accepted way to make data unrecoverable in backups that cannot be edited one record at a time. It is not automatically compliant. It is acceptable if it is done correctly, documented, and paired with an honest retention position. Legal counsel must confirm it for each jurisdiction before you rely on it in contracts.

| Point | Assessment (draft) |
|---|---|
| UK GDPR | The ICO's guidance on erasure accepts that data in backups may not be deletable straight away, provided it is "put beyond use" and erased when the backup is overwritten *(verify the current ICO wording)*. Destroying every copy of the key is a strong way to put data beyond use, and arguably amounts to deletion. Right to erasure: Art. 17. Storage limitation: Art. 5(1)(e). |
| EU GDPR | Same articles. Regulators judge whether the data can still be recovered **by anyone**, so the key must be destroyed everywhere, including key backups. |
| UAE PDPL | Gives a right to erasure *(article number to verify)*. No specific guidance on crypto-shredding is known to me. Treat it as acceptable in principle; legal to confirm. Note that the federal PDPL does not apply in the free zones (DIFC and ADGM have their own laws). |
| Pakistan | To my knowledge Pakistan has **no comprehensive data protection law in force**; the Personal Data Protection Bill has been in draft *(verify current status)*. Contracts and sector rules (State Bank of Pakistan for banking customers) govern instead. |

Conditions under which it is safe:

1. **Granularity matches the obligation.**
   - Per tenant: one key per tenant schema and its files, destroyed at offboarding.
   - Per person: where an erasure request must reach backups, personal fields are encrypted with a key per data subject, or per record holding personal data, which is destroyed on erasure.
   - Phase 2G decides where per-person keys are worth their cost.
2. **Every copy of the key is destroyed:** the key service, any key backups and any cached copies. An HSM- or KMS-backed provider proves this by its own logs. Destruction goes through four-eyes approval and is logged.
3. **Strong algorithm** (AES-256-GCM, or the equivalent) and no plaintext copies anywhere else: logs, search indexes, exports, email or caches. This is the commonest failure, so Phase 2F checks every store.
4. **Evidence.** The deletion certificate records what was deleted, which keys were destroyed, the approvers, timestamps and hashes. It is anchored in the platform audit log (Q-24).
5. **Contract and notices** say how backups and erasure work: the DPA template and the privacy notice (Phase 2G).
6. **Retention.** "Keep backups for the client's whole lifetime" (Q-24) is still in tension with storage limitation for data **within** an active tenant. Crypto-shredding fixes the erasure side. Phase 2G still sets a retention period per category, and legal confirms it.

## 7. Next in Phase 1

- Front-end inventory: `01-frontend-inventory.md` and `inventory/`
- Assumptions Log: `assumptions-log.md`
- Decisions Log (ADR index): `decisions-log.md`
- Risk register (seed): `risks.md`
- Open Questions: `open-questions.md`

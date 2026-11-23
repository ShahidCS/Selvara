# Assumptions log (unified, Phase 3)

| | |
|---|---|
| Status | Unified register, Phase 3 (2026-11-23). Replaces the Phase 1 log and the per-workstream "New assumptions" blocks of 2A to 2K (P3-X3-19). (rev P3) |
| Sources | Phase 1 (P1), Phase 2 workstreams 2A to 2K, Phase 3 review X3 register B, owner decisions (Phase 2 summary §8), design-authority rulings DA-01 to DA-15 |
| Status values | **Validated** (confirmed by the owner or a source), **Closed** (resolved by design or decision, so no longer an assumption), **Open**. "HI" marks high impact. Items whose status changed in Phase 3 end with (rev P3). |
| Compliance note | Legal assumptions (A-05, A-10, A-14, A-33, A-52 to A-54) are **DRAFT** pending qualified legal review. |

| ID | Assumption (short) | Source | Validate by | Status | HI |
|---|---|---|---|---|---|
| A-01 | Greenfield data plane | P1 | Owner Q-01 | Validated | |
| A-02 | Inventory comes from this repo's front end | P1 | Owner Q-30 | Validated | |
| A-03 | Front-end routes and shapes may change | P1 | Owner Q-29 | Validated | |
| A-04 | Stripe, email and AI providers remain subprocessors | P1 | Owner; VC-07 | Open: Stripe not usable by `ENT-PK` (OD-01); MoR to be added if chosen | |
| A-05 | Global control plane may hold identity data outside a tenant's region | P1 | Legal (OD-08) | Open (owner-accepted; legal pending) | HI |
| A-06 | All compliance output is a draft | P1 | Policy | Validated | |
| A-07 | One project holds launch tenants; second cell past a measured threshold | P1 | J-PERF | Open (merged with A-11, A-15, A-60 under CR-1) | HI |
| A-08 | Two people hold R-A and R-B | P1 | OQ-12 | **Validated** (OQ-12 accepted, spine S0; summary §8) (rev P3) | |
| A-09 | Supabase features exist (SAML, PITR, Queues, pg_cron, file ceiling, Vault) | P1 | VC-01, VC-02, VC-04, VC-06 | Open | HI |
| A-10 | Crypto-shredding acceptable for erasure in backups (UK GDPR, EU GDPR, UAE PDPL) | P1 | Legal | Open | HI |
| A-11 | Postgres handles launch schema count | P1 | J-PERF | Open (CR-1) | HI |
| A-12 | A payment route exists for a Pakistan entity | P1 | 2I | **Validated for bank transfer** (OD-01); MoR and PSP open (A-56) (rev P3) | |
| A-13 | Vercel serverless is enough; jobs on Supabase scheduling | P1 | VC-01, VC-10 | Open | HI |
| A-14 | Health customers make Selvara a processor of special-category data | P1 | Legal | Open | HI |
| A-15 | Shared cell holds 300 schemas within NFRs on Large or below | 2A | J-PERF | Open (CR-1 provisional value) | HI |
| A-16 | Cell Postgres ≥ 16 (`INHERIT FALSE, SET TRUE`) | 2A | VC-05 | Open | HI |
| A-17 | Data API can be disabled or expose no schemas | 2A | VC-03 | Open | HI |
| A-18 | Typical tenant under 1 GB database and 20 GB files in year one | 2A | Telemetry | Open | |
| A-19 | External cloud account acceptable for KMS, scanner and off-site copies | 2H | Owner | **Validated** (OD-02) (rev P3) | |
| A-20 | PITR into a new project is possible (restore path B) | 2H | VC-02 | Open | HI |
| A-21 | Off-site footprint about 16 GB per tenant | 2H | Telemetry | Open | |
| A-22 | Management API can change network restrictions per job run | 2H | VC-20 (new) | Open | |
| A-23 | KMS multi-Region replica keys available and covered by shredding | 2H | VC-14 (new); F-K-10 | Open; KEK destruction now covers every replica (P3-X3-25) (rev P3) | HI |
| A-24 | Two people acknowledge an S1 page within 15 min, 24/7 (or business hours accepted) | 2H | Owner (DU-29) | Open | HI |
| A-25 | 28 frameworks; 3 authored new; reference by id and title without a licence | 2B | OQ-15, OD-09 | **Closed** (OQ-15: 25 frameworks; licensing part moves to OD-09 / DU-25) (rev P3) | |
| A-26 | Per-schema owners, forced RLS, FKs to `ref`, `migrator` in thousands of roles all fine | 2B | J-PERF spike | Open | HI |
| A-27 | Seconds of lag between `memberships` and `member_profile` acceptable | 2B | 2A review | Closed (2A A-RT-07: authorisation always reads `cp`) (rev P3) | |
| A-28 | `ks` holds one key per subject at acceptable cost and latency | 2B | J-PERF (DU-28) | Open; keys live only in `ks` (DA-04), so file-key lookups add to the load (X1 U-6) (rev P3) | HI |
| A-29 | Control-plane identity fields encrypted with a platform key | 2B | 2A/2F | Closed: E1 under the platform DEK F-K-31 wrapped by the platform KEK F-K-30 (DA-05) (rev P3) | |
| A-30 | Policy bodies up to 200,000 characters | 2B | Product (DU-33) | Open | |
| A-31 | Changing risk criteria is four-eyes | 2B | 2E | Closed (2D D-K19 `risk.criteria`); SOD_MATRIX update pending | |
| A-32 | Interested parties are organisations or roles | 2B | Product (DU-33) | Open | |
| A-33 | DSR deadlines per jurisdiction as reference data | 2B | Legal | Open | |
| A-34 | No tenant custom fields in the MVP | 2B | Product (DU-33) | Open | |
| A-35 | Vercel serves SCIM and webhooks within IdP timeouts | 2C | J spike; VC-10 | Open | |
| A-36 | HMAC `t=,v1=` format accepted | 2C | Owner (DU-33) | Open | |
| A-37 | pgmq, pg_cron and pg_net available on the plan | 2D | VC-01 | Open (duplicate of A-09 part) | HI |
| A-38 | KMS scheduled deletion with evidence logs | 2D | VC-14 | Open | |
| A-39 | Two super admins respond within approval TTLs (24 to 72 h) | 2D | Owner | Open (A-08 validated; responsiveness not) | |
| A-40 | Supabase MFA: TOTP and phone, no recovery codes, WebAuthn not GA | 2E | VC-06 | Open | |
| A-41 | Supabase SAML on the chosen plan, providers per tenant in number | 2E | VC-06 | Open | HI |
| A-42 | IdPs send an MFA indication often enough | 2E | First customers | Open | |
| A-43 | Two super admins plus custom-role staff meet approval TTLs | 2E | Owner | Open (duplicate of A-39) | |
| A-44 | External roles cannot be customised in this release | 2E | Owner (DU-33) | Open | |
| A-45 | Vercel OIDC federation to the cloud for both projects | 2F | VC-10 | Open | HI |
| A-46 | Data API exposes no schema; GraphQL off; pgaudit and log drains on plan | 2F | VC-03, VC-09 | Open | HI |
| A-47 | Storage objects not in database backups | 2F | VC-04 | Open | HI |
| A-48 | KMS cross-account grants with encryption-context conditions | 2F | VC-21 (new) | Open | HI |
| A-49 | Compliance-mode object lock and RFC 3161 TSA available in `R1` | 2F | VC-22 (new) | Open | |
| A-50 | Field encryption keeps latency within the 2J budget | 2F | J-PERF | Open | |
| A-51 | PITR and daily-backup windows can be set and evidenced per project | 2G | VC-19 (new) | Open | HI (certificate residual window) |
| A-52 | Selvara is a processor (not joint controller), including AI | 2G | Counsel | Open | HI |
| A-53 | Pseudonymising `control.identities` while keeping ids in logs meets erasure | 2G | Counsel (DU-26) | Open | |
| A-54 | A MoR takes the controller role for the sale | 2G | Counsel | Open (only if MoR chosen) | |
| A-55 | Stripe excludes Pakistan; includes UAE, US, UK | 2I | VC-07 | Open | |
| A-56 | A MoR or PSP will onboard `ENT-PK` | 2I | VC-11 | Open | |
| A-57 | B2B only | 2I | Owner (DU-31) | Open | |
| A-58 | 5 minutes of meter lag acceptable | 2I | Owner (DU-32); J H11 | Open | |
| A-59 | External roles are not paid seats | 2I | Owner (DU-15) | Open | |
| A-60 | CI runs the Supabase Postgres image as a service; 500 schemas a safe provisional threshold | 2J | Spike; J-PERF | Open; **threshold clause superseded by CR-1 (300)** (DA-10) (rev P3) | HI |
| A-61 | Staging and perf cells plus test KMS affordable | 2J | Owner (DU-08) | Open | |
| A-62 | J-7.1 tenant and traffic profile representative | 2J | First 20 paying tenants | Open (profile to fix, P3-X3-12) | HI |
| A-63 | Pooler keeps `SET LOCAL` semantics; role-change log available | 2J | VC-09 | Open | HI |
| A-64 | 2E and 2C deliver machine-readable matrix and registry | 2J | DU-11 | Open | |
| A-K1 | AI-assisted engineering delivers V2-R0 in an acceptable time | 2K | Measure after V2-R0 | Open | |
| A-K2 | External pen tester available before V2-R6 | 2K | Owner | Open | |

**High-impact assumptions not yet validated.** These must be cleared before the Phase 5 gate:
- **Supabase platform:** A-09, A-37 (Queues and cron); A-16 (PG16); A-17 and A-46 (Data API off); A-20 (PITR to a new project); A-26 (role and catalog scale); A-51 (backup windows).
- **Capacity:** A-07, A-11, A-15, A-60, A-62 (capacity and profile); A-28 (`ks` sizing).
- **Keys:** A-23 (KMS replicas); A-48 (cross-account KMS); A-47 (Storage outside backups); A-45 (OIDC federation).
- **Identity:** A-41 (SAML tier).
- **Detection:** A-63 (role-change detection).
- **Operations:** A-24 (24/7 paging).
- **Legal:** A-05, A-10, A-14, A-52.


## Phase 3 status changes

| ID | Change | Source |
|---|---|---|
| A-08 | Validated: two people hold R-A and R-B | OQ-12, owner decisions of 2026-11-23 |
| A-19 | Validated: external cloud account accepted | OD-02 |
| A-25 | Closed: 25 frameworks; licensing moves to OD-09 and DU-25 | OQ-15 |
| A-29 | Closed: control-plane fields use the platform key | DA-05 |
| A-60 | Threshold clause superseded by CR-1 | DA-10, P3-X3-01 |
| A-07, A-11, A-15, A-60 | Merged under capacity rule CR-1 (DU-01) | P3-X3-01 |
| A-37, A-43 | Duplicates of A-09 (part) and A-39; kept as aliases | P3-X3-28 |

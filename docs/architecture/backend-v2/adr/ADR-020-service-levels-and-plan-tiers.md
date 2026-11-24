# ADR-020: Service levels and plan tiers: one uniform SLA (SLA-U) and Enterprise-only BYOK, SSO, SCIM and dedicated cell

| | |
|---|---|
| Status | **Accepted** (owner, 2026-11-24, OD-19), **amended by OD-23** (rev P5b): the SLA figure is 99.0%, held as a versioned platform setting rather than in code, and maintenance announced in advance is excluded within a notice rule, a window and a monthly cap. Records owner decisions OQ-23 (uniform SLA) and OQ-20 (Enterprise-only flags). VC-13 result: Supabase and Vercel give contractual SLAs on Enterprise plans only, so the figure is not vendor-backed below Enterprise (R-65). Supersedes DU-35. |
| Date | 2026-11-24 |
| Workstream | 2A (A-NFR-01, A-NFR-02, A-NFR-21), 2I (I-4.2, I-4.6), 2H (H-11.2a, H-VF-08), 2J (J-SLA) |
| Related | OQ-20, OQ-23, DA-13, DU-35, H-DR-I; VC-13; risks R-19, R-63, R-65; findings P4-A3-06 (6, 7), P4-A3-14 |
| Detail | [2A-architecture.md](../phase2/2A-architecture.md) A-NFR-01, A-NFR-21; [2I-billing.md](../phase2/2I-billing.md) I-4.2 and I-4.6 |

## Context

- The underlying platforms (Supabase, Vercel, the KMS provider) carry their own SLAs per plan, which this design session could not verify (VC-13).
- Before Phase 4 the design offered availability as an objective only for the shared tier, and an SLA only for dedicated cells (DU-35). RTOs differ between shared and enterprise tenants, and region loss has a 72 h / 24 h RTO.
- The owner decided one uniform standard SLA for every plan (OQ-23), on the condition that the figure does not exceed what the vendors back.
- Cost drivers that grow with a tenant's use must be entitlement keys so plans can be priced (DA-13). The owner decided that `byok`, `sso`, `scim` and `dedicated_cell` are Enterprise-only (OQ-20).

## Options considered

### Part 1: service level

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Objectives only; no contractual SLA (the DU-35 recommendation) | No penalty exposure before VC-13 | Weak for regulated buyers and tenders; contradicts OQ-23 |
| B | Tiered: contractual SLA for dedicated or Enterprise only; objective for shared plans | Exposure limited to the tenants who pay for it | Two regimes to measure and explain; contradicts OQ-23 |
| C (owner, OQ-23) | **SLA-U:** one SLA for every paid plan; 99.5% monthly availability *(verify, VC-13)*, later set to 99.0% and made configurable by OD-23; service credits only (10% below 99.5%, 25% below 99.0%, re-based by OD-23); exclusions; RPO and RTO are objectives, not contractual | Simple and uniform; credit exposure is bounded and budgeted; region loss and vendor-wide outages excluded | A single figure must fit the weakest plan; credits apply to small plans too (R-65) |

### Part 2: plan tiers for cost-driving features

| Option | Description | Pros | Cons |
|---|---|---|---|
| i | Every feature in every plan | Simple catalogue | BYOK keys, SSO MAU and dedicated cells cannot be priced; small plans run below cost (R-19, R-63) |
| ii | SSO and SCIM from the mid plan; BYOK and dedicated cell Enterprise-only (the OQ-20 recommendation) | SSO available to mid-size buyers | SSO cost in the mid plan; more plan logic |
| iii (owner, OQ-20) | **`byok`, `sso`, `scim` and `dedicated_cell` Enterprise-only;** `pitr_days` per the 2I recommendation | Cost drivers sit in the plan that pays for them | Smaller tenants sign in with password plus MFA or passkeys only |

## Decision

Part 1 option **C** and Part 2 option **iii**.

1. **SLA-U commitment** (A-NFR-01, I-4.6.1; amended by OD-23, rev P5b): **99.0% monthly availability** of the tenant API and web app. Trials carry no SLA. The SLA is not an entitlement key and cannot be changed per subscription. VC-13 (owner result, 2026-11-24): Supabase gives a contractual 99.9% only on Enterprise, and Vercel 99.99% only on Enterprise; Pro and Team plans carry no contractual figure. The 99.0% is therefore **self-backed** below Enterprise vendor plans: the vendor-wide-outage exclusion (decision 4) and the credit cap bound the exposure (R-65).
2. **Measurement** (I-4.6.2, 2J J-SLA): eligible minutes for the calendar month in UTC; a minute is down when two of three external probe locations fail.
3. **Remedy** (I-4.6.3; rev P5b): service credits only, set **relative to the target figure**: 10% of the monthly fee below the target (99.0% today), 25% more than 2.0 points below it (below 97.0% today), capped at 25% of the monthly fee, issued as credit notes under four-eyes `billing.credit`.
4. **Exclusions** (canonical list: 2I I-4.6.4): **planned maintenance** that meets all of: announced at least 72 h ahead on the status page, in-app and by email to tenant admins; inside the published maintenance window; and within the monthly cap of 8 h (excess minutes count as down). **Emergency maintenance** to fix a Critical vulnerability or a vendor-forced change: announced before it starts, capped at 4 h a month, and its exclusion approved four-eyes. Downtime announced after it has started is an incident, not maintenance, and is never excluded (rev P5b, OD-23); vendor-wide region outages of Supabase, Vercel or the KMS provider, including region loss; customer-caused issues (its users, integrations, IdP, BYOK key disabled, exceeded limits); suspension or restriction under 2I I-5; and the Trust Center public pages. Each excluded period is recorded with evidence and approved by the other approver (or the deputy acting for them, ADR-015 point 7).
5. **RPO and RTO** are objectives, not contractual, published only after the matching drills have run in production (A-NFR-21, 2H H-9.4).
6. **Cost:** credits budgeted at 2% of revenue (2H H-C-26); a Supabase plan upgrade (H-C-25, about USD 574 a month) only if VC-13 shows it is needed. If Vercel backs nothing, the SLA figure is lowered rather than a plan upgraded.
7. **Plan tiers:** `byok`, `sso`, `scim` and `dedicated_cell` are Enterprise-only; every per-tenant cost driver is an entitlement key (I-4.5.2).
8. **The figure is configuration, not code** (OD-23, rev P5b). `control.platform_settings` holds a versioned SLA schedule: target percentage, credit bands, maintenance notice, window and caps, each with an effective-from date. The J-SLA calculator, the monthly report, the plan catalogue and the order form read the version in force for each month. A change is a four-eyes platform kind `platform.sla.change`, audited. **A lower figure or a looser exclusion applies to an existing customer only from its next renewal; a higher figure or tighter exclusion may apply at once.** Contracts refer to "the SLA schedule version in force at signature or renewal", and that version is archived with the order form.

## Consequences

- DU-35 is superseded. A-NFR-02 (99.9%) is an internal objective only; keeping the internal objective above the 99.0% commitment gives an operating margin.
- 99.0% allows about 7 h 18 min of unexcluded downtime in a 30-day month; the maintenance cap adds at most 8 h of announced maintenance.
- The terms of service, order form and plan catalogue show the same figure, credits and exclusions (I-4.6.7); the wording is a DRAFT for counsel.
- VC-13 is recorded and H-DR-I is closed by OD-23. The terms-of-service and order-form wording stays a DRAFT for counsel (RA2-04 deferred, OD-24).
- Mid-size tenants that need SSO must buy Enterprise; sales material says so.

## Security and privacy implications

- Excluding region loss keeps the SLA honest: the design does not promise what a single-region launch cannot deliver (R-01, R-17).
- Credit and exclusion decisions are four-eyes and audited, so no single person can grant credits or hide downtime.
- Tenants without SSO rely on Selvara's own authentication (password plus MFA, passkeys, ADR-006). The ASVS L2 controls apply to them in full (2F-asvs-l2).
- BYOK is Enterprise-only, so the cross-account KMS dependency (VC-21) affects only Enterprise tenants.

## Verification

| ID | Check |
|---|---|
| V-020-1 | J-SLA-01 to J-SLA-07: probe method, eligible-minute calculation, credit proposal, and that every exclusion in I-4.6.4 removes minutes (a suspended or restricted tenant gets no credit proposal). |
| V-020-2 | An exclusion or credit recorded and approved by the same person is refused. |
| V-020-3 | A plan without the Enterprise flags cannot enable BYOK, SSO, SCIM or a dedicated cell (entitlement enforcement tests, 2I). |
| V-020-5 | J-SLA maintenance tests: maintenance announced less than 72 h ahead, outside the window, past the 8 h monthly cap, or announced after it started counts as down; emergency maintenance past 4 h counts as down (rev P5b). |
| V-020-4 | The published figure, credit bands and exclusions equal the SLA schedule version in force; the calculator uses the version effective for each month; a lowering change cannot apply to a subscription before its renewal date; `platform.sla.change` by one person is refused (rev P5b). |

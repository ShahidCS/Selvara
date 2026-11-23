# Assumptions Log

| ID | Assumption | Impact if wrong | How to validate | Status |
|---|---|---|---|---|
| A-01 | Greenfield data plane: production has no customer data, so nothing is migrated | A data migration and cutover plan would be needed | Owner (Q-01) | **Validated** |
| A-02 | The Phase 1 inventory comes from this repository's front end | The inventory would be wrong | Owner (Q-30) | **Validated** |
| A-03 | The front-end routes and shapes may change | API design is constrained | Owner (Q-29) | **Validated** |
| A-04 | Stripe, an email provider and AI providers remain subprocessors | Changes to the subprocessor list and transfer analysis | Owner (Q-18, Q-21); see BL-01 | Partly validated: Stripe availability for a Pakistan entity is doubtful |
| A-05 | The control plane is global (one instance) and may hold identity data outside a tenant's region | Residency redesign | Owner (Q-06), plus legal review | Owner-accepted; **legal review pending** |
| A-06 | All compliance output is a draft for qualified review | — | Engagement rule 7, organisation policy | **Validated** |
| A-07 | One Supabase project holds the launch tenants; a second cell opens past a threshold to be measured | Cost and isolation design | Phase 2J load test | Open |
| A-08 | Two people hold R-A and R-B (see the Discovery Summary, section 4) | Every four-eyes gate blocks | Owner | **Open: names not needed, confirmation is** |
| A-09 | The Supabase plan features exist as assumed: SAML SSO, point-in-time restore, Queues, pg_cron, file-size ceiling, Vault | Identity, backup and job design | Check current Supabase documentation in Phase 2 | Open |
| A-10 | Crypto-shredding is acceptable for erasure in backups under UK GDPR, EU GDPR and the UAE PDPL | Backup retention design | Legal review (Discovery Summary, section 6) | Open |
| A-11 | Postgres handles the launch schema count without catalog problems | The cell threshold moves | Phase 2J load test | Open |
| A-12 | A payment route exists for a Pakistan entity (merchant of record or a local provider) | Billing at launch | Phase 2I provider check | Open |
| A-13 | The Vercel serverless model is enough for the API; jobs run on Supabase scheduling | Hosting changes (ADR-005) | Phase 2A spike design | Open |
| A-14 | Health-sector customers make Selvara a processor of special-category data | DPO designation, DPIA depth, encryption scope | Legal review | Open |

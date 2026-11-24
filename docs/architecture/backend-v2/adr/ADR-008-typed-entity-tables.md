# ADR-008: Typed entity tables replace `ws_records`

| | |
|---|---|
| Status | **Accepted** (owner, 2026-11-24, OD-19). |
| Date | 2026-11-23 |
| Workstream | B (Data model) |
| Depends on | ADR-001 (accepted), ADR-002 (isolation), ADR-003 (keys), ADR-009 (migration orchestration) |
| Detail | `p2/2B-data-model.md` sections 1, 3, 6, 9; `p2/2B-classification.md` |

## Context

- v0.2.5 stores most workspace modules as `ws_records(tenant_id, kind, id, data jsonb, version, deleted_ms)` (migration 0008), about 55 kinds, plus `platform_records` (10 billing kinds) and `kv` (about 20 namespaces).
- Inventory findings that follow from the generic shape:
  - No relationships the database can enforce: evidence has no links (AS gap 4); two control mapping stores (AS gap 5); treatment actions addressed by array index (RK gap 2); Trust Center access by document **name** and viewer **email** (F1-02, RK gap 10).
  - Personal data scattered: display names copied next to ids in many records and audit targets (F1-09).
  - No per-field classification, field-level encryption or retention is possible: retention and legal hold exist only in the demo (F1-03); purge is impossible to do precisely.
  - Dates stored as display text (AS gap 8), so jobs cannot drive expiry and reviews (F1-05).
- ADR-001 gives each tenant its own schema; every table is created once per tenant, so the table count and the migration discipline matter (C1-05, C1-06).
- Production holds no customer data (A-01): no data migration is needed.

## Options considered

| ID | Option | Pros | Cons |
|---|---|---|---|
| O1 | Keep a generic `records(kind, id, data jsonb)` table inside each tenant schema | Smallest port of today's server code; one table per tenant keeps the catalog small; schema changes rarely need DDL | No foreign keys, checks or per-field encryption; classification and retention by kind only; every rule stays in application code; JSON paths in queries; does not fix F1-01, F1-02, F1-09 |
| O2 | Hybrid: typed core columns (status, owner, dates, links) plus a `data jsonb` remainder per entity | Fewer columns to design now; faster first port | Two places for each fact; classification and encryption must still look inside JSON; the remainder grows by habit; drift between typed and JSON copies |
| O3 | **One typed table per entity**, `jsonb` only for frozen snapshots, non-secret provider configuration and the approval payload (each with a schema id) | Constraints, foreign keys and exclusive arcs enforce links that grant access; per-column classification, encryption and retention; jobs work on typed dates; erasure touches a known set of columns; query plans are predictable | About 140 tables per tenant schema (R-20); more DDL per feature, so strict expand/contract (ADR-009); larger port effort |
| O4 | A document database outside Postgres for module data | Flexible shapes | Leaves Supabase (Q-03); breaks schema-per-tenant isolation and RLS defence in depth; second backup and key system |

## Decision

**O3.** Every tenant module entity is a typed table in `t_<tkey>` with the standard columns of S4 (plus `created_by_kind`, `updated_by_kind`), named as in the spine catalogue plus the additions listed in 2B SD-B01. In particular:

| ID | Element |
|---|---|
| D8-1 | Typed columns for every field a rule, filter, link, classification or retention depends on; text enumerations with check constraints, never Postgres enum types. |
| D8-2 | People referenced by id only; names and emails only in `member_profile`, `person` and the external-party tables, encrypted with per-subject keys (E2). (rev P3) |
| D8-3 | Closed link sets as exclusive arcs with real foreign keys (`evidence_link`, `issue_link`, `audit_shared_item`, `control_mapping`, `control_link`, `processing_link`). |
| D8-4 | Audit fields and optimistic locking set by triggers from the routed session context; every change journalled in `record_history`. |
| D8-5 | `jsonb` limited to: frozen snapshots and non-secret configuration and provider payloads. JSON documents holding user input (approval payload, risk import rows, AI assessment answers, agent proposals) are stored as encrypted JSON (`bytea`, E1). Each has a `*_schema` column and a size check (2B B-D01). (rev P3) |
| D8-6 | DDL for every tenant table is generated from one schema registry that also emits the RLS policy, tenant check, triggers, grants and the classification entry. |
| D8-7 | Every column carries one encryption class of 2F F-D-12 (E0, E1, E2; DA-01). Narrative and descriptive free text is E1 (tenant DEK); titles, refs, enumerations, dates and scores are E0. Search over E1 text is decrypt-and-filter inside the tenant's own request over bounded pages; no plaintext index exists (2B B-D21). Wrapped keys are never stored in tenant tables, only key ids (DA-04, 2B B-P24). (rev P3) |

## Consequences

| ID | Consequence |
|---|---|
| C8-1 | The server's `WsTx` (`get/list/insert/update/remove(kind, ...)`) is replaced by per-module repositories; the mapping in 2B section 9 is the porting checklist. |
| C8-2 | The tenant schema has about 140 tables; catalog growth per tenant is higher than O1, so Phase 2J must measure the cell threshold with this schema (R-20, A-11). |
| C8-3 | Every feature change that adds a field is a migration across all tenant schemas, under the expand/contract rules (2B section 8) and ADR-009 orchestration. |
| C8-4 | Business rules can be partly enforced in the database (SoD triggers, frozen rows, exclusive arcs) as a second line behind the services (AGENTS.md: services remain the control). |
| C8-5 | Demo-only features (retention, legal holds, automation rules, Team settings, plans) get real tables (OQ-09). |
| C8-6 | SQL full-text search and sorting work on E0 columns only; filtering on descriptions, notes and answers costs a decrypt per candidate row, so list endpoints bound page and scan sizes (2B B-D21; measured in 2J). (rev P3) |

## Security and privacy implications

| ID | Implication |
|---|---|
| S8-1 | Access-granting links (auditor scope, Trust Center grants, NDA per person) become rows with foreign keys, closing F1-01 and F1-02 at the data layer. |
| S8-2 | Field-level encryption and per-subject crypto-shredding become possible because each personal field is a known column (2B-classification): E2 for direct identifiers, E1 for narrative text, so operator access to the database does not expose narrative content (2F R-44). (rev P3) |
| S8-3 | Precise retention and legal hold per table and per column; purge leaves auditable markers. |
| S8-4 | The hash-chained audit log keeps personal data outside the hash input: personal fields enter it only as keyed HMACs (`ip_hmac`, `pd_hmac`, `details_hmac`), so the retention purge and subject-key shredding do not break the chain (B-D17, DA-03). (rev P3) |
| S8-5 | More objects per schema means more places to get RLS or grants wrong; mitigated by generated DDL, the catalog lint (B-V01) and the security drift check (B-M33). |

## Verification

| ID | Check |
|---|---|
| V8-1 | Catalog lint: every tenant table has the standard columns, tenant check, context trigger, forced RLS and policy, audit and history triggers, correct owner (B-V01). |
| V8-2 | Every Phase 1 entity, including "must not lose" entities, maps to a table (B-V10); every `ws_records` kind maps to a table (2B section 9). |
| V8-3 | Every column has a classification entry with an E0/E1/E2 class and a defined retention class; no plaintext of an encrypted field in history, exports or logs; no plaintext index on an E1 column; no wrapped key in a tenant table (B-V11, B-V12, B-V22). (rev P3) |
| V8-4 | Exclusive-arc, SoD and frozen-row triggers reject invalid writes (B-V13, B-V15). |
| V8-5 | No `jsonb` column outside the D8-5 categories (schema registry check). |

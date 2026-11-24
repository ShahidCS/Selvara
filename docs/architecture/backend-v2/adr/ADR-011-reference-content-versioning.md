# ADR-011: Shared reference content: distribution and versioning

| | |
|---|---|
| Status | **Accepted** (owner, 2026-11-24, OD-19). |
| Date | 2026-11-23 |
| Workstream | B (Data model) |
| Depends on | ADR-001, ADR-008, ADR-009 (migration orchestration), ADR-010 (control plane) |
| Detail | `p2/2B-data-model.md` sections 5 and 6 (`ref` diagram, B-E99.x) |

## Context

- Reference content today ships with the code: framework library and requirements (`data/seed.json`, `data/frameworkReqs.json`, 25 frameworks, which is the owner's scope, OQ-15) (rev P3), the control library (30 controls), Annex A rows, vendor question catalogues (`vendorQuestions.json`, `trustSeed.json`), the RoPA template (17 activities), standard contract terms, the report catalogue and risk criteria constants.
- Tenants store their own state against these ids (scope, applicability, mappings, adopted controls). There is no version: a code change silently changes what a tenant's past mapping meant.
- Standards change (new editions, errata). Audit evidence must stay tied to the requirement text in force when it was assessed.
- ADR-001: one schema per tenant per cell; cells may be added later (S1). The spine names a shared read-only schema `ref` per cell (S1).
- Some standards' text is copyrighted; redistribution may need a licence (R-24).

## Options considered

| ID | Option | Pros | Cons |
|---|---|---|---|
| O1 | Keep content in the application bundle (status quo) | No database objects; deploys with code | No foreign keys from tenant rows; no version a tenant can pin; an edit changes every tenant's history at once; content change needs an application release |
| O2 | Copy reference content into each tenant schema at provisioning | Tenant fully self-contained; simple foreign keys | Thousands of copies; every content fix is a data migration across all tenants; storage and catalog growth; drift between copies |
| O3 | **One `ref` schema per cell, immutable versioned releases, tenants pin a release per package and upgrade through a crosswalk** | One copy per cell; real foreign keys from tenant rows to exact versions; history preserved; per-tenant upgrade timing; content published independently of code | Loader and crosswalk authoring effort; old releases kept for ever; cross-schema foreign keys tie tenant migrations to `ref` existence |
| O4 | Central content service in the control plane, read over an API at runtime | Single source; easy publishing | Runtime dependency across projects on every read; no foreign keys; latency; the control plane would serve tenant-request traffic (against S2's minimal role) |

## Decision

**O3**, with these rules:

| ID | Element |
|---|---|
| D11-1 | **Authoring.** Content lives as reviewed source in the repository (one directory per package), with a changelog and, for framework editions, a crosswalk file mapping old to new requirement keys (`same`, `changed`, `split`, `merged`, `removed`, `new`). A pull request needs review by both platform roles (four-eyes; R-A and R-B). |
| D11-2 | **Build.** CI builds a release artefact per package version: normalised rows, `content_sha256`, signature and build attestation (existing pipeline). Semantic versioning: major = edition change needing remap; minor = additions or wording; patch = typo-level fixes with an identity crosswalk. |
| D11-3 | **Distribution.** A `ref` content-loader job runs as `migrator` in every cell: verifies signature and hash, inserts the release rows into `ref` in one transaction, records `control.ref_content_releases(release_id, cell_id, loaded_at, content_sha256)`. A cell opened later receives every release that has live pins anywhere, then all later ones. |
| D11-4 | **Immutability.** `ref` rows are insert-only; only `content_release.status` changes (`published` → `deprecated` → `retired`). Retired releases stay readable; no new pins. A faulty release is retired and superseded, never edited. |
| D11-5 | **Pinning.** Each tenant has one `content_pin` per package. New tenants pin the latest published release. Tenant rows reference version-specific ids (`framework_scope.framework_id`, `requirement_status.ref_requirement_id`, `control.library_control_id`, ...); a trigger checks they belong to the pinned release. |
| D11-6 | **Upgrade.** Per tenant and package: (1) preview computed from the crosswalk against the tenant's `requirement_status`, `control_mapping`, `evidence_link` and `audit_shared_item` (counts and affected rows); (2) tenant admin approves (`content.upgrade`; four-eyes when the framework is in an active audit, which otherwise blocks the upgrade, B-RF16); (3) one tenant transaction remaps rows, keeps `removed` targets as `orphaned`, adds `new` requirements as `not_assessed`, moves the pin, writes `content_upgrade` and audit entries. Patch releases may auto-apply when the tenant opted in (`auto_minor`) and the crosswalk is identity. Interfaces (DA-15): preview and request endpoints 2C C-M02-08 and C-M02-09; permission `frameworks.upgrade` (2E E-30.10, admin); approval kinds `content.upgrade` (2D D-K36) and `content.upgrade.in_audit` (D-K37, four-eyes); apply and auto-minor job 2D D-82. (rev P3) |
| D11-7 | **Deprecation.** A release can be retired when no tenant pins it, or after a notice period set per package *(product decision)* after which the remaining tenants are upgraded by the same procedure with an automatic approval recorded as `system`, except tenants in an active audit (skipped and reported by job 2D D-82). (rev P3) |
| D11-8 | **Product catalogues** (permissions, approval kinds, retention floors, privacy taxonomy, report catalogue, standard terms) are not pinned: text-keyed, additive, changed only by the `ref` migration chain in step with application releases (B-RF17). |
| D11-9 | **Custom content** stays in the tenant schema (`custom_framework`, `custom_requirement`, custom controls, templates, catalogue items) with lineage to the `ref` row it was forked from; it is never written to `ref`. |
| D11-10 | **Licensing.** `ref` stores identifiers, titles and Selvara-authored guidance; full standard text only under a recorded licence (`content_package.licence_note`). |

## Consequences

| ID | Consequence |
|---|---|
| C11-1 | Requirement ids in tenant rows are version-specific; reports join through the pinned release. |
| C11-2 | `ref` grows with every release and is never pruned; size is small (text rows), but the loader must be idempotent and fast across cells. |
| C11-3 | Tenant migrations that add foreign keys to `ref` require the referenced release to be loaded in the cell first (ADR-009 orders the `ref` chain before the `tenant` chain). |
| C11-4 | Content can be published without an application deploy, but product catalogues still move with the application. |
| C11-5 | The 25-framework scope (OQ-15) needs a licence review per framework (R-24, OD-09). (rev P3) |

## Security and privacy implications

| ID | Implication |
|---|---|
| S11-1 | `ref` contains no tenant data and no personal data; tenant roles have `SELECT` only; a compromise of one tenant role cannot change content seen by another tenant. |
| S11-2 | Signed, hashed, four-eyes-reviewed releases protect integrity of what tenants rely on for compliance decisions; the loader refuses an unsigned or mismatched artefact. |
| S11-3 | Immutable versions keep audit evidence defensible: an auditor can see the exact requirement version assessed. |
| S11-4 | Upgrades change compliance status computations; they are approved, audited and reversible by data (old rows and pins remain). |
| S11-5 | Licensing exposure (R-24) is controlled by D11-10. |

## Verification

| ID | Check |
|---|---|
| V11-1 | `ref` tables refuse `UPDATE` (except release status) and `DELETE` for every role; tenant roles have only `SELECT` (B-E99.1, B-E99.2). |
| V11-2 | Loader rejects a tampered artefact (hash or signature mismatch) in CI. |
| V11-3 | Every `cell` has every release with a live pin (`control.ref_content_releases` versus pins; drift report). |
| V11-4 | Pin trigger rejects a tenant row pointing to a release other than the pinned one. |
| V11-5 | Upgrade dry run on canary tenants: preview equals the applied remap; no evidence link is lost; orphaned rows counted (B-V16). |
| V11-7 | Authorization tests: C-M02-09 refused without `frameworks.upgrade` and step-up; a framework in an audit in fieldwork or reporting needs a `content.upgrade.in_audit` approval with two approvers, none the requester (2J). (rev P3) |
| V11-6 | No `ref` row contains an email, a person's name or a tenant id (content lint). |

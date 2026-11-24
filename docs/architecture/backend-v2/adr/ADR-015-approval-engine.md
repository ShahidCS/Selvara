# ADR-015: One approval engine with a kind registry and two stores (tenant and control plane)

| | |
|---|---|
| Status | **Proposed** (rev P5, 2026-11-24). Records a decision already designed in 2D (D-20 to D-29) and recommended in DU-19. Owner acceptance pending, together with DU-37. |
| Date | 2026-11-24 |
| Workstream | 2D (owner of the detail); 2E (permissions, platform roles), 2B (tables), 2J (verification) |
| Related | DU-19, 2D D-DR1; ADR-002 (isolation), ADR-010 (control plane), ADR-014 (custom roles); `docs/security/SOD_MATRIX.md`; risks R-03, R-38; finding P4-A3-06 (1), P4-A3-19 |
| Detail | [2D-workflows.md](../phase2/2D-workflows.md) §2 (D-20 to D-34) and the kind tables D-K and D-P |

## Context

- v0.2.5 has two approval implementations: one in the browser and one on the server, and they disagree in places (F1-04). Separation of duties is enforced per action in code, not from one registry.
- The v2 design has 47 approval kinds. Some belong to a tenant (policy approval, risk acceptance, role change); others belong to the platform (tenant deletion, provider activation, `ks` restore, trial policy) and need elevation and, for some, the two platform roles together (dual role).
- Tenant approvals carry tenant business data in their payload (for example a risk acceptance or a policy version). Under ADR-001 and ADR-002 that data must stay in the tenant schema and be encrypted with the tenant DEK, so that isolation and crypto-shredding reach it.
- Platform approvals must sit in the control plane, where the two approvers act with elevation and where the platform audit log and WORM anchoring apply (ADR-013).
- The organisation rule "never self-approve" (SOD_MATRIX) must hold for every kind, for every principal type, and for every store.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Two engines (status quo): one for tenant approvals, one for platform approvals | No shared code to design; each plane evolves alone | Duplicated rules drift (the F1-04 defect today); two places to prove "never self-approve"; two sets of tests |
| B | One engine and **one store** in the control plane for every approval | One table to query; one audit trail | Tenant business data (payloads) would sit in `cp`, against ADR-010's allowed catalogue and ADR-002 isolation; tenant shredding would not reach it; `cp` load grows with tenant activity (R-62) |
| C (recommended) | **One engine, two stores:** one library and one code-defined kind registry evaluate every approval; tenant kinds are stored in `t_<tkey>.approval`, `approval_vote` and `delegation`; platform kinds in `control.platform_approvals` and `platform_approval_votes` | One rule set and one test generator for both planes; tenant payloads stay in the tenant schema under the tenant DEK; platform approvals stay with elevation and the platform audit log | The library must be store-agnostic; cross-plane reporting needs two queries; the registry becomes a critical artefact that needs review |
| D | An external workflow or BPM service | Rich features (routing, escalation, UI) | A new subprocessor holding tenant payloads; isolation and shredding outside Selvara's control; heavy for a two-person company; SoD rules split between the vendor and Selvara |

## Decision

Option **C**.

1. **Registry.** Every kind is a code entry (D-21): plane, module, subject type, initiator and approver permissions, `needs` (1 or 2), the forbid set, named approver, delegable (tenant named kinds only), TTL, step-up, elevation and dual role (platform), `recheck` and an idempotent `apply`. A kind not in the registry cannot be requested.
2. **Eligibility at vote time** (D-22): authenticated human; holds the approver permission now; not the requester; not in the forbid set computed from the subject at vote time; one vote per person (D-24).
3. **Apply in the same transaction as the final vote**, after `recheck` (subject version, state, legal hold, plan limit, SoD). A failed recheck supersedes the approval and applies nothing (D-25).
4. **Platform votes** need `platform.approvals.decide`, the kind's approver permission and a live elevation. Dual-role kinds need one `management_approver` and one `ciso` among the requester (if eligible) and the voters. Platform votes are never delegated (D-26).
5. **Non-human principals** (jobs, agents, API keys, SCIM clients, automation rules) may request registered kinds but never vote (D-29).
6. **Expiry** is applied only by job D-66; reads compute an effective status (D-28).
7. **Deputy approver (R-DEP, rev P5; P4-A3-19).** When the owner appoints a deputy (owner action), the deputy is a separate staff identity, not a delegation of someone else's vote. For the period recorded in the appointment, the deputy may hold the `management_approver` or the `ciso` capacity for dual-role kinds and for `ks` recovery, and casts votes in their own name. The engine counts a deputy for **one** capacity per approval only, never for both, and never in an approval where the person they stand in for has already voted or is the requester. The SOD_MATRIX change is an owner action (the file is protected).

## Consequences

- One generated test set covers every kind on both planes (J-AUTHZ), so a new kind cannot ship without its SoD tests.
- SOD_MATRIX is derived from the registry; the two must not diverge (DU-11 makes the registry machine-readable).
- Tenant approvals inherit tenant isolation, backup, restore and shredding. Platform approvals inherit the control-plane controls of ADR-010 and anchoring of ADR-013.
- Operating load: every platform kind with `needs = 2` stops if one approver is unavailable for longer than its TTL. The deputy (point 7) is the treatment; until the owner appoints one, R-03 and the re-rated P4-A3-19 stay open.
- Replaces the two engines of v0.2.5 (closes F1-04 once implemented).

## Security and privacy implications

- "Never self-approve" is enforced in one place, server-side, at vote time and again at apply. UI gating is never the control.
- Tenant approval payloads may hold personal data; confidential fields are encrypted with the tenant DEK (D-27), and they are shredded with the tenant.
- Platform approvals hold no tenant business data, only references and summaries, consistent with ADR-010.
- Collusion between the two platform approvers (R-38) is not prevented by any engine. It is treated by the external anchor (ADR-013), alerts and the outsourced internal auditor (R-D). The deputy adds a third person, which widens the set of possible colluders; the "one capacity per approval" rule keeps every dual-role action at two distinct people.

## Verification

| ID | Check |
|---|---|
| V-015-1 | For every registered kind: a requester vote is refused; a voter in the forbid set is refused; a voter without the approver permission at vote time is refused (J-AUTHZ, generated from the registry). |
| V-015-2 | A tenant approval payload is readable only inside the tenant's routed transaction, and no approval payload column exists in `control` (ADR-010 V-010-01). |
| V-015-3 | A dual-role platform kind does not apply with two votes from the same capacity, or with a deputy counted for both capacities. |
| V-015-4 | A failed `recheck` at apply supersedes the approval and applies nothing (idempotency and rollback test). |
| V-015-5 | A non-human principal cannot vote on any kind. |
| V-015-6 | A request for a kind not in the registry is refused (deny by default). |

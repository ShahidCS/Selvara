# ADR-018: Trial provisioning under one standing four-eyes trial policy

| | |
|---|---|
| Status | **Proposed** (rev P5, 2026-11-24). Records owner decision OD-04 (standing policy instead of per-trial approval) and the policy values of OQ-21 (DU-30). Owner acceptance of the ADR pending, together with DU-37. |
| Date | 2026-11-24 |
| Workstream | 2D (workflow D-11a, kind D-P14), 2I (limits I-4.4.3), 2H (provisioning H-PV, cost H-C-22), 2E (permissions) |
| Related | OD-04, OQ-21, DU-30; ADR-015 (approval engine), ADR-017 (CR-1); `docs/security/SOD_MATRIX.md`; risk R-64; finding P4-A3-06 (4), P4-A3-16 |
| Detail | [2I-billing.md](../phase2/2I-billing.md) I-4.4.3 (the single source for trial limits); [2D-workflows.md](../phase2/2D-workflows.md) D-11a, D-P14, D-80 |

## Context

- Tenant creation is a platform four-eyes action (H-PV-01): a schema, a role, a KEK and its DR copy, backups and monitoring are created for each tenant.
- Trials are a sales need. Under per-tenant four-eyes, each trial waits for both approvers, which with two people (R-03) makes trials slow and adds to the operating load (P4-A3-19).
- Trials hold customer data from the first minute, so they need the same isolation, keys and backups as paid tenants, and they consume cell capacity and KMS keys (R-64).
- Replacing per-trial approval with a standing approval changes the separation-of-duties model: one staff member then provisions a tenant alone, within pre-approved bounds.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Per-trial four-eyes approval (the general tenant rule) | Strongest SoD: two people see every tenant | Slow sales; heavy load on two people; approvals become rubber stamps |
| B (recommended, OD-04) | **Standing trial policy** approved four-eyes (`platform.trial.policy`, D-P14): staff provision trials alone within its limits; a daily digest to both approvers | Trials are fast; SoD moves to the policy and to after-the-fact review; caps bound the damage | A single staff member can create trials within the caps; misuse is detected the next day, not prevented |
| C | Self-service sign-up with automatic provisioning and no approval | Fastest; no staff time | Anyone can create tenants, keys and schemas; abuse and capacity risk; B2B-only rule (DU-31) hard to enforce |
| D | No trials; sales-led demos on synthetic data only | No capacity or data risk | Weaker sales motion; customers cannot try with their own data |

## Decision

Option **B**.

1. **Policy values (OQ-21, owner 2026-11-23):** 5 seats; 500 MB storage; 14 days; region `R1`; AI off; no BYOK, SSO, SCIM or dedicated cell; a daily provisioning cap; concurrent trials per cell at most 10% of the CR-1 threshold (ADR-017). Feature flags follow the trialled plan within those caps. 2I I-4.4.3 is the single source of these values.
2. **The policy** is stored in `control.trial_policies` and changed only through four-eyes `platform.trial.policy` (D-P14, TTL 72 h). A change never widens a running trial retroactively.
3. **Provisioning** is staff-only (`platform.tenants.provision`), checked against the active policy in the control-plane transaction; anything outside the policy needs the general four-eyes tenant creation (H-PV-01).
4. **Review:** every trial appears in the daily digest to both approvers (D-80), who can end a trial with a normal platform action.
5. **First admin:** the invitation goes by email to the invitee only; no link or token is returned to staff (DA-09, C-PL-05).
6. **End of trial:** without a payment route the subscription becomes `restricted` (I-5), then follows the 2I and 2G offboarding path.

## Consequences

- Trials no longer need two people at the moment of creation, which lowers the operating load.
- The SoD model has a documented exception: SoD for trials is "two people approve the bounds, one person acts within them, both review daily". SOD_MATRIX must record it (owner action; protected file).
- Text to align: 2D D-11a and D-P14 still say "≤30 days"; the owner value is 14 days (open design-authority item, P4-A3-16).
- Trials count toward CR-1 and the KMS key count, so the caps are capacity controls as well as SoD controls.

## Security and privacy implications

- Trials are customer data: they get the same isolation (ADR-002), keys (ADR-003), backups and PITR (ADR-004, DU-02) and offboarding (ADR-019) as paid tenants.
- The residual is a single staff member creating tenants within the caps. Controls: staff-only permission with elevation, the caps, the daily digest, platform audit entries anchored externally (ADR-013), and the first-admin invitation sent only to the invitee.
- AI is off and BYOK, SSO and dedicated cells are unavailable in trials, so no new subprocessor or key arrangement is created without paid-tenant approval.

## Verification

| ID | Check |
|---|---|
| V-018-1 | A trial request outside any policy value (seats, storage, days, region, features, daily cap, concurrent cap) is refused. |
| V-018-2 | A change to the trial policy needs a second, different approver; self-approval is refused. |
| V-018-3 | Every trial created in a day appears in the next daily digest to both approvers. |
| V-018-4 | No response to staff carries the first-admin invitation link or token. |
| V-018-5 | At trial end the subscription moves to `restricted` and then follows the offboarding path. |

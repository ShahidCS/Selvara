# ADR-021: Flexible platform roles (one person may hold several super-admin roles)

| | |
|---|---|
| Status | **Proposed** (rev P5). Raised by the owner's instruction of 2026-11-24: "For company super admin, make it flexible as at this stage not every role can be filled." Accepted once the owner accepts this ADR. |
| Closes | RA2-01 (Critical) by design, on acceptance. Amends discovery §4, A-08, 2D D-22/D-26/D-58, 2E E-71/E-72, 2F F-K-48, 2H H-KS-12 and ADR-014. |
| Scope | Selvara's own platform roles: `management_approver` (R-A), `ciso` (R-B), `support` and custom platform roles (ADR-014). Tenant roles are out of scope. |

## Context

The design assumed two different people hold R-A and R-B (A-08). The approval engine, deletion approvals (D-58), dual-role platform kinds and key-store recovery (F-K-48, H-KS-12) were built on that assumption. The owner signed the Phase 5 table with one person in both rows. At this stage the company cannot fill every role, so the design must work with fewer people **without** letting one person act alone.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| A. Keep A-08: two different people must hold R-A and R-B | Strongest separation of duties | Not achievable now; blocks the gate indefinitely |
| B. One person may hold both roles; four-eyes counted by roles | No new person needed | One person could approve their own requests by "voting as both roles": four-eyes collapses. **Rejected.** |
| **C. Roles are assignments; one person may hold several; four-eyes counted by distinct people; the deputy (R-DEP) is the mandatory second person while roles are combined** | Works with one principal plus the contracted deputy; keeps the invariant "two different people" | Depends on the deputy being available; concentration of authority in one person, which needs compensating controls |

## Decision (recommended): option C

1. **Roles are assignments, not people.** `control.platform_staff` may give one person several platform roles: `management_approver`, `ciso`, `support` and custom roles. Holding several roles is called **combined-role mode** and is recorded in `control.platform_settings.combined_role_mode` together with the people concerned.
2. **The invariant does not change.** Every four-eyes action needs **two different people**. The engine counts distinct persons, not roles (D-22, D-24). A person holding R-A and R-B counts once. No self-approval (E-72a) and no voting twice (D-24) still apply.
3. **Dual-role kinds** (kinds that need both an R-A and an R-B approval) are satisfied by two different people, one covering each role. In combined-role mode the combined holder covers one role and **R-DEP covers the other**. The combined holder never covers both.
4. **R-DEP is mandatory in combined-role mode.** The deputy must be appointed, active and recorded (delegation in `SOD_MATRIX.md`). If no active deputy exists, every platform four-eyes action fails closed: it waits, and nothing proceeds on one approval. Key-store recovery (F-K-48, H-KS-12) therefore needs the combined holder and R-DEP.
5. **Compensating controls while combined-role mode is on:**
   - Every approval made in combined-role mode is flagged in the platform audit log (`combined_mode = true`).
   - Every super-admin elevation alerts R-DEP.
   - **Monthly independent review:** the technical reviewer or the outsourced internal auditor (R-D) reviews the platform audit log, the elevations and the approvals of the month and records a signed review. A missed review is itself an alert to the owner.
   - Break-glass access needs R-DEP as the second person, and is reviewed afterwards by the internal auditor (R-D).
   - Turning combined-role mode **on or off**, or changing who holds which role, is a four-eyes platform kind (`platform.roles.change`) between the combined holder and R-DEP.
6. **Flexibility beyond R-A and R-B.** The same rules apply to custom platform roles (ADR-014): any role can be held by any staff person, within the role ceilings, provided four-eyes always involves two different people.
7. **Exit.** Combined-role mode ends when a second person is appointed to R-A or R-B. It is reviewed at every release gate (2K K-4). **Recommendation:** end it before cutover (V2-R6), or record a renewed owner acceptance of R-66 at that gate.

## Consequences

- The design works with **one principal + one contracted deputy** (two people), instead of three people. The deputy becomes operationally essential; their availability is a dependency (R-03, P4-A3-19).
- A-08 changes from "two people hold R-A and R-B" to A-08b: "two different people take part in every platform four-eyes action; R-A and R-B may be held by one person in combined-role mode, with R-DEP as the second person".
- New risk R-66: concentration of authority in one person. Owner R-A; treatment: the controls in decision 5; acceptance needed.
- The Phase 5 sign-off can show the same person in the security and management rows, provided the ADR is accepted and the deputy row is signed by a different person.

## Security and privacy implications

- Separation of duties is preserved at the level that matters (two different people for every sensitive action), not at the level of two distinct senior roles. Independence between "security" and "management" judgement is reduced. The monthly independent review and the external audit-log anchor (ADR-013) are the compensating evidence.
- Collusion between the combined holder and the deputy is the residual threat (R-38, now including R-DEP). It is treated by the anchor, alerts, the monthly review and the internal auditor.

## Verification

- **V-021-01:** an engine test where one person holding R-A and R-B tries to approve their own request, and to cast both votes on a dual-role kind: refused.
- **V-021-02:** with no active R-DEP and combined-role mode on, every platform four-eyes kind waits (fails closed).
- **V-021-03:** every approval made in combined-role mode carries `combined_mode = true` in the platform audit log.
- **V-021-04:** the monthly review is recorded each month; a missed review raises the alert.
- **V-021-05:** the key-store restore drill runs with the combined holder and R-DEP.

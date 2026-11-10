# People & Devices (Phase 2)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| 4 KPIs (Workforce, Device compliant n/N, MFA enrolled n/N, Unmanaged) | 2984-2985 | `features/people/PeopleModule.tsx` | Done | |
| Tabs "People & devices" / "Access grants" (`PPL`) | 2983, 2986 | `PeopleModule.tsx` | Done | `useModState("people.view", "People")`; unknown values fall back to People |
| People table (device chip mapping OK / Needs evidence / Open, MFA chip, clickable row) | 2987 | `PeopleModule.tsx` | Done | Row uses `activate()` (keyboard); action cell stops click/key propagation like `event.stopPropagation()` |
| Per-row "Reset MFA" (disabled when not enrolled) | 2987, 4272-4273 | `PeopleModule.tsx`, `people/actions.ts`, `services/people.ts` | Done | Toast copy kept; view switches to People; added `aria-label` |
| Access grants tab (same table as Access inventory) | 2988 | `access/GrantsTable.tsx` (shared) | Done | |
| "Add contractor" button + modal (validation "Name is required.", defaults Role "Contractor", Dept "External", device Unmanaged, mfa false) | 2986, 4289-4290 | `people/ContractorForm.tsx`, `services/people.ts` | Done | wsLog `contractor.added`, toast "Contractor added" |
| `pplInit` (posture, accounts by user/surname, employment) | 4274 | `services/people.ts` (`initPerson`) | Done | Ported verbatim |
| Person drawer (MFA chip, employment tag, device posture rows, accounts table / "No linked accounts.", foot Reset MFA + Offboard) | 4275-4281 | `people/PersonDrawer.tsx` | Done | Body re-renders on DATA changes (see Open questions 3). Unknown id: toast / "Person not found" state |
| Offboard modal (checklist text, 2 checkboxes, transfer-to field, danger button) | 4282-4287 | `people/PersonDrawer.tsx` (`OffboardForm`) | Done | Confirmation modal kept; default transfer target "J. Avery" (anonymised) |
| Offboard action (remove person, wsLog `person.offboarded`, toast) | 4288 | `OffboardForm`, `services/people.ts` | Done | Log text `name, items → target` (falls back to "owner") |

## Open questions
1. Reset MFA has **no `wsLog`** in the source (the lead brief assumed it did). Ported as-is (no audit entry). Strongly recommend adding `wsLog("person.mfa.reset", name, "Access")` once product agrees.
2. Offboarding does not touch `DATA.access` or the device: the "Revoke N account(s)" / "Reclaim device and wipe" checkboxes are cosmetic in the source (never read) and the grants stay listed. Ported as-is.
3. In the source the drawer was static: after "Reset MFA" the drawer kept showing "MFA enrolled" and an enabled button. Here the drawer re-renders (chip flips to "No MFA", button disables). Intentional, minimal divergence.
4. Offboarding is only reachable from the drawer; the source drawer stays open after Reset MFA (kept).
5. Contractor id was `"PP-"+(length+1)`, which collides after an offboarding (duplicate ids would make Reset MFA / Offboard act on the wrong person). Now picks the next unused `PP-n`; identical output when there is no collision.
6. Accounts-owned matching in `pplInit` is by exact name or last-word surname (e.g. two different "Hart" would share accounts). Ported as-is. Accounts are snapshotted once and never refreshed.
7. "Offboard" is styled `btn-primary` in the drawer foot (destructive, but the source did that); the modal button is `btn-danger`.
8. Empty workforce (everyone offboarded) renders an empty table with no empty state, as in the source.

## Security notes
**Enforced in the UI (not a trust boundary):** module access via `ROLE_MODS` (people: super, admin, owner). Additionally `canManagePeople(role)` (deny by default, same rule) hides Add contractor / Reset MFA / Offboard and leaves the drawer read-only; currently identical to module access because the source had no finer gate. Destructive offboarding keeps its confirmation modal. Inputs go through `clampText` (name/role/dept 100, transfer target 80, `maxLength` on inputs); all text is rendered as React text; unknown ids render "not found"; no HTML from strings.

**Must be enforced by the real API:**
- Authorization for every mutation (`/people/:id/mfa-reset`, `/people/:id/offboard`, `/people/contractors`), server-side, never from the client role.
- Step-up authentication (re-auth / fresh MFA) and four-eyes approval for MFA reset and offboarding; MFA reset is a classic account-takeover vector (help-desk social engineering). Notify the affected user out of band.
- Offboarding must actually revoke the accounts, devices and sessions server-side and transfer ownership atomically; do not rely on the checkbox state.
- Server-side audit entries (actor, target, reason) for MFA reset, offboarding and contractor creation; the client `wsLog` is a demo.
- Validate/normalise contractor fields and enforce uniqueness of ids on the server.

**Insecure source behaviour and handling:** (1) MFA reset has no audit log and no confirmation: ported as-is, flagged (Open question 1). (2) No role gate beyond module access: kept; a policy hook (`canManagePeople`) is in place for a one-line change. (3) Offboarding leaves access grants in place: kept, flagged. (4) Id collision on contractors: fixed without visible change. (5) Transfer target is free text, not a validated user: kept, length-capped only.

---
## Hardening vs prototype (SOD_MATRIX) - supersedes the Open questions above where they conflict
**What changed**
- **Reset MFA** (table and drawer): opens the request form (3 identity checks, ticket, reason enum+text, named approver, effects text). Needs requester `admin`, approver a different `admin`/`owner` (not requester, not subject); **2 approvers** when the member is privileged (Admin/Super admin grant or admin/owner role). Self-service reset is refused (button disabled with the reason). Effects (MFA cleared, sessions revoked, re-enrolment forced, recovery codes invalidated) happen only on final approval; request expires after 24 h (audited). Audit entries `person.mfa.reset.requested|reset|approved...` added (resolves old Open question 1).
- **Offboard**: transfer-to is a select of known people (service validates against `DATA.people`, not the subject). A person with privileged access (grants with Admin/Super admin level, or an admin/owner role) needs a second approver != requester via the approvals engine (`kind "offboard"`, 72 h expiry). On completion the service **revokes every `DATA.access` row of that person** (status set to Revoked, row removed, `access.revoked` audit per grant), denies their pending access requests and logs `person.offboarded` with the count. The revoke/reclaim checkboxes are now fixed-on (they were cosmetic). Cannot offboard yourself; the last remaining Company Admin cannot be offboarded.
- `addContractor` now requires admin/owner. A `PendingApprovals` list appears above the table.

**Security notes (additions)**: all rules are in `services/people.ts` and repeated by the UI; the API must too (second approver, revocation in the identity provider/source systems, device wipe, session kill). Revocation here only touches the demo inventory.

**Conflicts resolved by owner decision**: old Open questions 1 (no audit on MFA reset), 2 (offboard leaves grants) and the "no role gate" notes are replaced by the rules above.

**Open questions**: (1) Owner subjects (e.g. Owen Hart) are privileged, so an MFA reset needs two approvers; with the three workspace personas only one eligible person exists, so the request is refused ("needs 2 eligible approvers"). (2) Seed people carry job titles, not workspace roles; privilege is derived from grants plus `lib/teamRoles.ts` (demo mapping). (3) Pending offboarding keeps the person listed until approved.

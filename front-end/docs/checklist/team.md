# Team & Settings (Phase 3)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Seeds (`TEAM_SETTINGS`, `USER_ROLES`) | 3673, 1012 | `src/data/teamSeed.json`, `src/data/userRoles.json`, `services/team.ts` | Done | Approver "S. [name]" anonymised to "J. Avery" |
| Views members / settings / gates / perms | 3672-3679 | `TeamModule.tsx` | Done | `useModState("team.view")`; unknown -> members |
| Members table (first 8 people, MFA chip, Open -> person drawer) | 3681 | `TeamModule.tsx`, `people/PersonDrawer.tsx` | Done | Reuses `openPersonDrawer` |
| Invite member modal, "Enter a valid email address.", wsLog `member.invited`, toast | 3676, 3694-3695 | `team/TeamForms.tsx` (`InviteForm`) | Done | No member is created (source) |
| Review cycles & SLAs: two selects (toast on change), two text inputs (apply on change), Save settings (wsLog `team.settings.saved`) | 3682-3688 | `team/SettingsTab.tsx` | Done | Inputs commit on blur/Enter (native `change`); `maxLength` 40 |
| Approvers table + Remove, Add approver modal ("Name is required."), wsLog `procurement.approver.added` | 3689, 3696-3697 | `TeamModule.tsx`, `TeamForms.tsx` (`ApproverForm`) | Done | |
| Security baseline list | 3690 | `TeamModule.tsx` | Done | |
| Permissions matrix (roles x spaces, All chip / "n modules" / "—", Platform tenant) | 3691-3692 | `TeamModule.tsx` | Done | Added `scope="col"` |
| "Reset demo data" confirm modal + `resetDemo` | 4269-4270, 757 | `team/ResetDemo.tsx` (`openConfirmReset`) | Done | Exported for the Audit Logs module (Phase 4); the source shows the button only there (line 4175). Not wired into Team. Uses `resetPersisted()` then full reload at `/ws/overview` |

## Open questions
1. The source has no role gate inside Team; `teamCanManage` (= module access, deny by default) was added and makes settings read-only / hides Invite, Add approver, Remove, Save for others. Currently identical in effect.
2. Removing an approver had no wsLog in the source; `procurement.approver.removed` was added (audit gap).
3. SLA fields are free text with no validation (e.g. empty is accepted); only length-capped.
4. Remove approver has no confirmation; baseline list is read-only.
5. Invitation logs the invitee's email (PII) in the audit log, as in the source.
6. Members tab always lists the first 8 people, labelled "Active" regardless of status.
7. `resetDemo` does not reset the in-memory audit log other than by reloading the page; role/theme/collapsed are the only persisted prefs.

## Security notes
UI gate only: the API must authorize settings changes, approver changes and invitations (tenant admin), generate single-use expiring invitation tokens, validate the invited role server-side (never trust the client-chosen role) and write audit entries. The permission matrix is informational (the source labels it "server-side permission model" but it is enforced by the client route guard only). Reset uses a constant in-app path and clears only the UI-preference key; no user value is reflected into the URL.

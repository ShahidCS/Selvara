# Third Parties (Vendors) module checklist

> **Wave B update.** The vendor drawer is now a page: `/ws/vendors/:id`. Add vendor (`/ws/vendors/new`), reassess (`/ws/vendors/:id/reassess`) and request waiver (`/ws/vendors/:id/waiver`) are form pages. Wherever this checklist says "drawer", read "the vendor page". Add certificate, flag finding and change tier remain dialogs. Leaving a form with typed work asks first.

Source: `Assurance-GRC-Portal.html` lines 3246-3325 (`REND.vendors`, `vInit`, `vendorDrawer`, `vReq*`, `vendor*` helpers). React: `src/features/vendors/VendorsModule.tsx`,
`vendors/{VendorDrawer,VendorModals}.tsx`, `src/features/vendors/lib/vendors.ts`, `src/features/vendors/services/vendors.ts`. Reused: `VENDOR_REQS` in `src/lib/requests.ts` and the "Request a new vendor" form in `work/RequestModals.tsx` (source lines 3260-3269, not duplicated).
Exported hook for other modules: `useVendorDrawer()` (from `VendorsModule`), opens the vendor drawer by id (`"V-ARBO"`); unknown id opens a "not found" drawer.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| Tier KPI tiles (count, "N overdue" / "On schedule", click toggles the tier filter) | 3276-3278 | VendorsModule | done | tiles are keyboard operable (`activate`); filter persisted (`useModState("vendors.tier")`) |
| "New vendor requests" card (only when requests exist AND `vendorCanManage`) | 3276 | VendorsModule | done | processes-our-data flag, requester, date |
| Add to inventory (`vReqApprove`: gate, new vendor score 70 "Needs evidence", `ai` flag) | 3270-3272 | `svc.approveRequest` | done | wsLog `vendor.request.approved`; toast `<name> added to the vendor inventory` |
| Dismiss request (`vReqDismiss`) | 3273 | `svc.dismissRequest` | done | wsLog `vendor.request.dismissed` |
| `vendorCanManage` (super, admin, owner, analyst) | 3274 | features/vendors/lib/vendors.ts | done | |
| Third parties table (score colour, overdue red, tier chip Critical shown as High, chevron), "Clear filter", title `· <tier> tier` | 3279-3281 | VendorsModule | done | rows keyboard operable |
| Add vendor modal ("Vendor name is required.", score 0-100) | 3318-3325 | VendorModals `VendorCreateForm`, `svc.createVendor` | done | wsLog `vendor.added` |
| Drawer shell (title, sub `cat, tier tier`, 4 tabs with counts, foot buttons) | 3284-3297 | VendorDrawer | done | tab persisted (`useModState("vendors.tab")`) |
| Overview (ring, meta grid, DPA, procurement gate chip, discovered apps, reassessment history newest first) | 3286-3288 | VendorDrawer | done | |
| Procurement approval gate Approve / Block | 3288, 3298 | VendorDrawer, `svc.setGate` | done | wsLog `vendor.gate.approved` / `.blocked`; returns to Overview tab |
| Certificates tab + empty state + Add certificate modal ("Type is required.") | 3289, 3299-3300 | VendorDrawer, VendorModals `CertForm`, `svc.addCert` | done | status always "Valid"; expiry free text, default "TBD" |
| Findings tab + empty state + Flag finding modal ("Finding description is required.") + Close | 3290, 3301-3303 | VendorDrawer, VendorModals `FindingForm`, `svc.addFinding/closeFinding` | done | wsLog `vendor.finding.flagged` / `.closed` |
| Monitoring tab (Review/Info chips, empty note) | 3291 | VendorDrawer | done | |
| Send questionnaire | 3304 | VendorDrawer foot, `svc.sendQuestionnaire` | done | only sets status "In review" (nothing is sent); wsLog `vendor.questionnaire.sent` |
| Reassess modal ("Enter a score between 0 and 100.", outcome, assessor, due from tier window) | 3305-3315 | VendorModals `ReassessForm`, `svc.reassess` | done | wsLog `vendor.reassessed`; "Escalate" -> In review else Active |
| Change tier modal (due reset to tier window; log only when changed) | 3316-3317 | VendorModals `TierForm`, `svc.changeTier` | done | wsLog `vendor.tier.changed` |
| `vInit` lazy defaults, `TIER_CADENCE`, `TIER_WINDOW` | 3247-3256 | features/vendors/lib/vendors.ts | done | id collisions now get a numeric suffix |

## Open questions
1. **Only request approval is role-gated in the source.** The procurement gate (Approve/Block), Reassess, Change tier, Add vendor, Add certificate, Flag/Close finding and Send questionnaire are open to any role that can open the module (today super, admin, owner, all of which pass `vendorCanManage`). Ported as-is, not invented. Decide whether these should use `vendorCanManage` and show a read-only drawer otherwise; `vendorCanManage` also lists `analyst`, who cannot open the module.
2. **Add vendor: `parseInt(score) || 75`** turns an entered 0 into 75 (source). Out-of-range values are clamped. A blank score also gives 75.
3. **Reassess uses `parseInt`**, so `7.9` is stored as 7 and `12abc` as 12 (source).
4. `vInit` ids come from the first 4 letters/digits of the name (`V-ARBO`); the source could produce duplicates (second vendor unreachable). Duplicates now get a suffix; a name with no letters/digits gives `V-`, `V-2`, ...
5. Send questionnaire does not change the Overview chip in the source drawer until it is reopened; React re-renders in place, so the status chip updates at once.
6. Reassessment `due` is reset to the tier window text ("Due in 12 months"), which replaces calendar dates like "14 Feb 2027" and is not parsed anywhere (overdue is only detected by `/Overdue/`).
7. A vendor request with an unknown criticality is stored as Medium on approval (source copied the value, producing a blank cadence).
8. Blocking the gate sets status "In review"; approving sets "Active" only from "Needs evidence" (source). Reassess sets "Active" unless the outcome starts with "Escalate".
9. The vendor requests card is hidden for roles that fail `vendorCanManage`, so those roles do not see pending requests at all (source).
10. The vendor portal (`vendorPortal`, line 3460+, role "vendor") is outside this range and not part of this module.

## Security notes
**UI-enforced only (the real API must enforce):** who may approve/dismiss vendor requests (`vendorCanManage`); every procurement-gate decision, reassessment score, tier change, finding open/close and vendor creation (the prototype did not gate these at all). The API must record the deciding actor from the session and write the audit entry itself.
**Third-party data handling:** the "processes our customer or personal data" flag from the request (`v.ai`) is stored but not acted on; seed vendor data is synthetic; certificates and findings are free text only. If real evidence upload or questionnaire sending is added, uploads must go through `validateUpload` + `safeFileName` and the questionnaire must be sent server-side. There are no uploads, external links or CSV exports in the source range, so `validateUpload`, `safeHref` and `csvCell` are not used here.
**Handled without changing visible behaviour:**
- All text (vendor names, categories, requester, finding titles, certificate types) renders as React text; the source used `esc()` + `innerHTML` and `onclick="vendorDrawer('${v.id}')"` strings. Vendors are looked up by id; unknown ids render "Vendor not found" and never reach the DOM as markup.
- Free text clamped with `clampText` (name 120, category 80, type 120, expiry 40, finding 300, assessor 80) plus `maxLength`; tier, severity, outcome, gate decision and score range are checked against allow-lists/ranges in the service.
- Requests are removed by `splice` on the shared `VENDOR_REQS` array (the source reassigned the variable).
- Every mutation goes through `src/features/vendors/services/vendors.ts` (`viaApi`) inside try/catch with a generic toast. Every source `wsLog` call is kept (actor from `getMe()`).
- Finding ids are demo values (`Math.random`), not tokens.

## Hardening (docs/security/SOD_MATRIX.md, owner decision 2026-11)
Services throw `SodError` (the UI shows only its message); every step still calls `wsLog`; the four-eyes steps go through `lib/approvals.ts` via `lib/approvalKit.ts` (handler applies the change only after the last approver) and the `ApprovalsPanel` card ("Vendor approvals").

**What changed vs the prototype**
| Area | Prototype | Now |
|---|---|---|
| Who may decide | request approval gated by `vendorCanManage` (super, admin, owner, analyst); drawer actions open to everyone with the module | every vendor decision and mutation needs admin/owner (`assertRole` in each service); drawer buttons disabled with the reason / read-only for others |
| `vendorCanManage` | listed `analyst` (and `super`) who cannot open the module (ROLE_MODS) | admin, owner only (analyst has no `vendors` module; super has no workspace) |
| Approve a vendor request | any manager, incl. the requester | approver != requester (`personOnly` strips the team suffix of seed names like "P. Nair, Support"); Critical tier opens a 2-approver request (roles admin/owner, requester forbidden, 72 h) and the vendor is added only when both have approved |
| Onboarding gate Approve | any manager | approver != whoever requested or added the vendor; Critical tier needs 2 approvers; Block stays immediate (safe direction) |
| Tier change | immediate | request + approval by a different admin/owner (not the initiator, not the vendor's requester/adder); applied on approval |
| Certificate waiver | did not exist | new "Request waiver": reason (>= 10), expiry (future, <= 12 months), approver != initiator; the cert shows "Waived" with approval id and named approver |
| Add vendor score | `parseInt(..)||75` turned 0 into 75, out-of-range clamped | blank defaults to 75; otherwise 0-100 with up to 2 decimals or "Enter a score between 0 and 100." (inline error) |
| Reassess score | `parseInt` ("7.9" -> 7, "12abc" -> 12) | same strict decimal parser; recorder (`recordedBy`) is always the signed-in person |

**Resolved open questions (owner decision):** OQ 1 (gate other actions with `vendorCanManage`, drawer read-only otherwise: done; analyst removed), OQ 2 and OQ 3 (score parsing: fixed). Still open: OQ 4-10 unchanged.

**Security notes (additions)**
* Four-eyes is enforced in the service layer from the signed-in persona; the real API must repeat it from the session identity (requester/adder ids, not names), count distinct approvers server-side and write its own audit entry.
* Names are compared with `isSamePerson`; seed vendors have no `requestedBy`/`addedBy`, so only the engine's "not the initiator" rule applies to them.
* The initiator of a Critical request/gate cannot also be one of the two approvers (engine rule: requester never approves), so Critical onboarding takes three people (initiator + two). Decide whether the initiator should count as the first approver.
* `VendorRequestForm` (Work) is not edited: it stores `requester` as the full persona name; `pendingApproval` is added to the request object by this module.

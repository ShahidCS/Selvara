# Spec boards vs portal: gap, conflict and port analysis

Status: analysis only (Phase 5 input). No source code was changed. Generated content needs product, security and compliance review before any decision is acted on.

Decision recorded by the owner: **keep the portal's visual design; port only what the portal lacks; list every rule where a board and the portal disagree so the owner can decide.** Visual differences (Geist font, 24px rounded cards, pill buttons, teal accent) are therefore out of scope and not listed as conflicts.

Scope of evidence: the 10 boards (`template.html` copy and `script1.js` logic, read in full) against `src/`, `docs/guides/CHECKLIST.md`, `docs/guides/checklist/*.md`, `docs/security/SECURITY.md`. Board content is untrusted sample data. Where a board is silent or ambiguous this is stated; nothing is invented. People in the boards are real-looking names and are deliberately **not** reproduced here; roles are used instead, and portal personas use the repo's synthetic names.

Effort key (front-end only, mock services as elsewhere in this repo): **S** = up to 1 day, **M** = 2-5 days, **L** = more than 1 week.

## 0. How to read this document

| Section | Content |
|---|---|
| 1-10 | One section per board: purpose and existing coverage, gaps, conflicts, security-relevant conflicts, recommendation |
| 11 | Cross-board conflicts that repeat in several boards (roles, password policy, timeouts, bands) |
| 12 | Sample-data differences |
| 13 | Prioritised summary (one page) |
| 14 | Questions for the owner |

Findings that matter for the whole project and are not obvious from the boards:

* `/auth` is described in `docs/guides/checklist/auth.md` as a "standalone screen", but `src/pages/_app.tsx` wraps **every** page in `AppShell`, so `/auth` currently renders inside the sidebar/topbar frame (`AppShell.tsx` only skips the RBAC redirect for `space === "auth"`). A truly standalone screen (vendor portal, sign-in) needs a shell bypass in `_app.tsx`. This is the single enabling change for two of the four "new" screens.
* The portal has **no authentication, session, lockout, CSRF or server-side RBAC** (see `docs/security/SECURITY.md` "Known limitations"). Every board rule about sessions, rate limits and enumeration can only be ported as UI states and copy; enforcement is a backend requirement.
* Several boards contradict each other (listed in section 11). The "board rule" is therefore not always a single rule.

---

## 1. `company-admin-overview` (Compliance overview)

### 1.1 Purpose and existing coverage

Executive overview for a company admin: compliance score trend with forecast, "built vs proven" scatter, 16-area control coverage heat map, risks above appetite, next-120-days regulatory calendar, third-party and policy summary cards, plus an "Add regulation, standard or guideline" wizard and a "Frameworks in scope" configuration panel.

| Board area | Portal coverage |
|---|---|
| Overview page, KPI tiles, board pack export | `/ws/overview`, `src/features/overview/OverviewModule.tsx`, `src/features/overview/lib/boardPack.ts`; `docs/guides/checklist/overview.md` |
| Framework x category heat map | `OverviewModule.tsx` `CoverageHeatmap`, `src/features/overview/lib/boardPack.ts` (`COV_CATS`, `covCell`) |
| Readiness trend | `/ws/reports` (`ReportsModule.tsx`, `docs/guides/checklist/reports.md`); Overview shows an open-risks trend instead |
| Add regulation wizard (templates, keyword mapping, confidence) | `/ws/frameworks`: `frameworks/FwAdd.tsx`, `src/features/frameworks/lib/fwTemplates.ts`; `docs/guides/checklist/frameworks.md` ("Add a framework", keyword matcher preview) |
| In-scope toggle, owner per framework | `FrameworksModule.tsx` (In scope toggle, admin only) |
| Risks above appetite | count only: `OverviewModule.tsx` "N above appetite"; list in `/ws/risk` |
| Third-party / policy summaries | no cards; data in `/ws/vendors`, `/ws/policies` |

### 1.2 Gaps (present in board, absent in React)

| # | Gap | Effort |
|---|---|---|
| 1.G1 | **Compliance score trend with forecast and plan line.** Six actual points, "Pace, 3 months +N a month", forecast line, plan line 69% to 85%, target line "Target 85%", hit-month label, summary "Up 9 points since May and ahead of plan...". Line coloured by status band. Portal Overview trends open risks; the delta strings on its KPIs are static text. | M |
| 1.G2 | **"Frameworks: built vs proven" scatter** (x = implemented %, y = evidence-current %, "Assured zone" at or above the on-track threshold on both axes, dot colour by threshold, selected-framework card with owner and next milestone, text summary "N of M frameworks are below 65% implemented..."). Needs an "evidence current %" metric per framework; the board **fabricates** it (`pct + ((i*17)%15) - 4`), so it is not a defined rule. | M |
| 1.G3 | **16 control-area heat map** with "n/a" (not required) cells, cells under 50% outlined, selected-cell detail ("Controls open", "Owner"), "weakest areas" sentence. Portal map is framework x 7 categories with tooltips only and no drill-in. | M |
| 1.G4 | **Top-5 "Risks above appetite" panel** ("Residual score out of 25, highest first. Committee decision needed from 15.") with treatment-due/overdue text and link "Open full register". | S |
| 1.G5 | **"Next 120 days" regulatory calendar** (day/month tile, obligation, framework, owner, status chip Submitted / In progress / On track / At risk). No obligation data model in the portal (nearest: Audits, Commitments). | M |
| 1.G6 | **Third parties card** ("One critical vendor has an expired certificate and an overdue reassessment.", tiles Vendors in scope / Residual risk high / Certificates expired / Reassessments overdue) and **Policies card** ("12 of 24 required policies are in place...", tiles Awaiting approval / Annual review due / Review overdue / Remarks overdue). Depend on gaps 3.G* and 4.G*. | S (after dependencies) |
| 1.G7 | **Category filter** (All / Security / Privacy / Financial crime / AI governance) driving every chart, and "In scope N" chip. | S |
| 1.G8 | **Wizard extras**: paste or upload CSV/TXT of requirements ("One requirement per line. Put the clause reference first... Art.21(2)(j), Use multi-factor authentication"), live "N requirements found", auto-map to the 16 control areas with High/Medium/Low confidence and per-row override, "Already covered, estimate %" and "Most overlap with ..." summary, "Need a new control" count, include/exclude per row, 5 bundled templates (DORA, NIS2, CIS v8.1, SAMA CSF, HIPAA Security Rule). Portal wizard has 4 templates and a keyword matcher preview but no requirement upload, no per-row override, no overlap estimate. | M |
| 1.G9 | **"Frameworks in scope" panel**: in/out of scope switch ("Out-of-scope items leave the charts, the coverage grid and the score"), owner field, Remove for custom frameworks. Portal has scope toggle and owner elsewhere; not wired to charts. | S |
| 1.G10 | Export board pack toast "recorded in the audit log" (portal already logs `overview.boardpack.exported`). | none |

### 1.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Compliance status bands | 5 bands: Compliant 85%+, Largely 75-84, Partially 65-74, Non-compliant 50-64, Critically non-compliant under 50 | `fwBand` (`src/lib/frameworks.ts`): green at 80+, amber 65+, orange 50+, red below | none | Owner decides one set. Board is finer; portal's 80 matches the board's own scatter "on-track 80". |
| Target / on-track thresholds | target 85; scatter on-track 80, watch 65 (board props `onTrack` 80, `watch` 65) | no explicit target | none | Board is internally inconsistent (85 vs 80). Ask owner. |
| Risk appetite (overview copy) | "Committee decision needed from 15" | `RISK_APPETITE = 11` (`src/lib/risk.ts`); "High and Extreme residual risks require a dated treatment plan" | acceptance authority (see 8.3) | Owner decision (see 8). |
| Panel "Risks above appetite" content | lists scores 16, 15, 15, 15 **and 12** under a "from 15" rule | counts residual at or above 11 | none | Board ambiguous (the 12 is below its own appetite). Do not copy the list rule verbatim. |
| Trend metric | compliance score | open-risk count on Overview | none | Add compliance score trend to Overview or keep it on Reports (fold, see 1.4). |
| Framework count / control-area model | 12 frameworks x 16 control areas (hard-coded 12-char maps) | 25 frameworks, 7 control categories | none | Do not import the board's matrix; derive from portal `DATA`. |

Security-relevant conflicts: none in this board.

### 1.4 Recommendation

**Fold into existing modules; do not add a route.**

* 1.G1, 1.G4, 1.G6, 1.G7: extend `src/features/overview/OverviewModule.tsx` (+ small `overview/` sub-folder if it grows). Reuse `TrendChart`, `Kpi`, `Chip`. Data: `src/lib/metrics.ts` (already exposes `aboveAppetite`), `DATA.risks`, `DATA.vendors`, `DATA.policies`.
* 1.G2, 1.G3: new components `overview/BuiltVsProven.tsx`, `overview/ControlAreaMap.tsx`. Prerequisite decision: how "evidence current %" is computed from `/ws/evidence` (freshness) rather than the board's synthetic offset.
* 1.G8, 1.G9: extend `frameworks/FwAdd.tsx` and `features/frameworks/lib/fwTemplates.ts` (CSV/TXT upload through `validateUpload`, rows through `clampText`, confidence label per row).
* 1.G5: skip until an obligations data model exists; or fold into `/ws/commitments` / `/ws/audits`. Ask owner.

---

## 2. `policy-library` (Policy library and review workflow)

### 2.1 Purpose and existing coverage

Full policy lifecycle: register with outstanding-action filters, detail with 5-step progress, remarks with review-by dates, collaborators (per policy and organisation-wide), versioned change log, append-only audit trail, mandatory-policy guidance library (25 policies), upload, review settings, owner reassignment, and a role preview (company admin / policy owner / member).

Existing coverage: `/ws/policies`, `PoliciesModule.tsx`, `policies/PolicyLayers.tsx`, `src/features/policies/services/policies.ts`, `docs/guides/checklist/policies.md`. The portal implements the prototype's simple drawer: statuses Draft / In review / Active, "Approvers & reviewers" list (never enforced), acceptance ring with random demo numbers, mapped controls, version history, no role gates.

### 2.2 Gaps

| # | Gap (board control / copy) | Effort |
|---|---|---|
| 2.G1 | **Edit rule**: "Only the policy's creator can change its content. A company admin can reassign ownership to a role successor; every change is versioned and logged." Buttons disabled with reason "Only the creator (...) can do this"; lock note "Content is locked: only the creator, ..., can edit." | M |
| 2.G2 | **Five-state workflow with distinct approver**: Draft, In review, Awaiting approval, Approved, Annual review (Review due / Overdue). Buttons Submit for review, Send for approval, Approve and publish, Request changes, Start annual review, Edit document; approval only by the named approver (a person or "Board Risk Committee", the latter approvable by company admin). Approve sets next review = today + cycle months. Portal has 3 states and no approver. | M |
| 2.G3 | **Remarks / change requests**: section/clause, text, "Review by" (default today + review-days setting, owner may change), statuses Open / Overdue / Resolved, "Mark resolved" owner only, "No remarks yet.", non-collaborators see "You are not a collaborator on this policy, so you can read it but not add remarks. Ask the owner or an admin to add you." | L |
| 2.G4 | **Collaborators**: roles Reviewer (comment), Contributor (suggest edits), Approver, Viewer; scope "This policy only" / "All policies (admin only)"; team member or external email ("invitation sent"); "Add and notify". | M |
| 2.G5 | **Change log** (version, summary, date, by, "approved by X" / "not yet approved"), "Earlier versions can be compared side by side and restored by the owner only" (compare/restore is copy only; the board has no diff UI). | S |
| 2.G6 | **Per-policy audit trail**: "Append-only. Also streamed to the company and platform audit logs." | S |
| 2.G7 | **Outstanding-actions filter cards**: All, Drafts, In review, Awaiting approval, Annual review due ("Within 30 days"), Review overdue, Remarks overdue. Register columns Open remarks (with "(N overdue)"), People. | S |
| 2.G8 | **Mandatory policy guidance library**: 25 required policies each with framework references ("ISO 27001 A.5.15-5.18 - SOC 2 CC6 - PCI DSS 7-8"), "Should cover: ...", status Missing/Draft/Approved, "N / 25 in place, M missing", "Upload policy" / "Use template" per card. | M |
| 2.G9 | **Upload policy dialog**: title, "Satisfies mandatory policy" select, approver, document (.docx/.pdf), "You (...) will be recorded as the creator and the only person who can edit this policy. Uploaded files are malware-scanned and stored encrypted; the policy starts as Draft v0.1." | S |
| 2.G10 | **Review settings dialog** (applies to every policy, logged): default remark review period (days, 1-90), annual review cycle (6/12/24 months), remind owners before due (days), escalate overdue items to (Company admin / Policy approver / Risk committee). | S |
| 2.G11 | **Reassign owner dialog**: successor, reason (Role change / Leaver / Restructure), "Open remarks and pending approvals transfer with the policy. Recorded in the change log and audit log." | S |
| 2.G12 | **Staff attestation** ("Staff attestation window after publish (days)" in Team settings; "Approved and published to all staff for attestation") and the Member view acknowledgement (see 4). Portal's acceptance numbers are random. | M (with 4) |

### 2.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Who may edit a policy | creator only; company admin cannot edit | any role that can open the module (no gate; `docs/guides/checklist/policies.md` OQ 1) | **segregation of duties** | See security-relevant table. |
| Who may approve | named approver only; self-approval impossible only if approver differs from owner (board does not forbid owner = approver; sample data always differs) | any user, including the submitter (OQ 2) | SoD | Adopt named-approver rule; add owner != approver check (board silent, **ambiguous**). |
| Status vocabulary | Draft / In review / Awaiting approval / Approved / Review due / Overdue | Draft / In review / Active | none | Owner decides; mapping "Active" = "Approved" needs a data migration of `seed.json`. |
| Version numbering | `bumpMinor` ("2.1" to "2.2") when editing an approved policy; "0.1" on upload | "N.0" on publish, "+0.1 draft" strings (`parseFloat`, OQ 3) | none | Adopt board's explicit minor-bump; fixes the `NaN draft` open question. |
| Review cycle default | 12 months | free text "Not started" / date strings | none | Adopt numeric setting (2.G10). |
| Remark review window | default 10 days (company setting) | not modelled | none | Adopt as setting. |
| Reminder lead | 14 days | "Remind outstanding" toast only | none | Adopt as setting. |
| Policy creation id | `P-NNN` from count | `P-(20+count)` with collision bump | none | Keep portal. |

**Security-relevant conflicts (board stricter than portal)**

| Rule | Board | Portal | Why it matters |
|---|---|---|---|
| Edit restricted to creator; admin cannot edit | yes, with owner reassignment as the only handover | open to all module users | SoD; ASVS V4 function-level access (the UI hint is not a control, API must enforce) |
| Approval restricted to named approver; request changes likewise | yes | no | Dual control on published policy |
| Org-wide collaborator grants admin only | yes ("Only a company admin can add organisation-wide collaborators") | n/a | Least privilege |
| Uploads: .docx/.pdf only, malware-scanned, encrypted at rest | yes (copy) | `UPLOAD_DEFAULT` allows pdf, png, jpg, jpeg, txt, csv, docx, xlsx, json, md, 10 MB; scan is back-end | Tighter allow-list; scanning is server work |
| Reassignment moves open remarks and pending approvals; previous owner loses rights immediately | yes | n/a | Offboarding safety |
| All actions written to an append-only policy audit trail | yes | `wsLog` only | Evidence for auditors |

### 2.4 Recommendation

**Fold into `/ws/policies` (rework), no new route.** This is the largest fold-in (L overall).

Minimal files: `src/features/policies/PoliciesModule.tsx` (filter cards, columns), `policies/PolicyLayers.tsx` (split into `PolicyDrawer.tsx`, `RemarksTab.tsx`, `CollaboratorsTab.tsx`, `ChangeLogTab.tsx`, `PolicyAudit.tsx`, `UploadPolicy.tsx`, `ReviewSettings.tsx`, `ReassignOwner.tsx`), `src/features/policies/services/policies.ts` (state machine and role checks, deny by default), `src/data/seed.json` (policy fields: `approver`, `comments`, `collabs`, `changes`, `audit`, `lib`), new `src/data/policyLibrary.json` (the 25-policy catalogue; reference strings are generic standards citations, safe to reuse), `src/lib/rbac.ts` (`policyCanEdit(role, policy)`), `docs/guides/checklist/policies.md` (update). Role model dependency: the board needs "policy owner" per policy, which the portal does not model per user (see 11.1).

---

## 3. `company-admin-team-settings-log` (Team, settings and audit log)

### 3.1 Purpose and existing coverage

Company admin console with three tabs: Team management (invite, role change, reset link, reset MFA, offboard with ownership transfer), Company settings (policy workflow, sign-in security, invitations and SSO), Company audit log (category filter, CSV export). Header shows "MFA: passkey - session expires in 28 min".

Existing coverage: `/ws/team` (`TeamModule.tsx`, `team/SettingsTab.tsx`, `team/TeamForms.tsx`; `docs/guides/checklist/team.md`), `/ws/auditlog` (`AuditLogModule.tsx`; `docs/guides/checklist/auditlog.md`), `/ws/people` offboarding and MFA reset (`people/PersonDrawer.tsx`; `docs/guides/checklist/people.md`), `/ws/billingws`.

### 3.2 Gaps

| # | Gap | Effort |
|---|---|---|
| 3.G1 | **Team table actions**: Role selector per member (Company admin / Policy owner / Member / Auditor read-only), statuses Active / Invited / Suspended / Offboarded, MFA chip incl. "Re-enrolment required", last sign-in, "Policies owned", Resend invite, Revoke, Send password reset link (single use, 30 min), Reset MFA, Offboard. Portal Team lists the first 8 people read-only with an Open drawer. | M |
| 3.G2 | **Invite dialog rules**: name required ("Enter the member's name."), valid email, personal/webmail/disposable rejected live after 500 ms ("Personal / webmail addresses (Gmail, Yahoo, Outlook, Hotmail, iCloud and similar) cannot be invited. Use a company email address."), allowed-domain list check ("Domain @x is not on the allowed list. Add it in settings or invite as Auditor (read-only)."), duplicate check ("This person already has an account or invitation."), explanatory copy ("single-use link valid for N. On first sign-in they must set a password that meets the platform rules and enrol MFA before they can see any data."). Portal only validates email format. | S |
| 3.G3 | **Offboard dialog**: "X owns N policies. Choose who takes them over before the account is closed."; successor list excludes auditors and the person; four consequences listed (sessions and API tokens revoked, account disabled and reset blocked, removed from collaborations with history kept, owned policies/remarks/approvals transferred). Portal offboard (People drawer) has two cosmetic checkboxes and a free "transfer-to" text. | S |
| 3.G4 | **KPI strip**: Active members n/25 seats, Pending invitations ("Expire after N h"), MFA enrolled %, Failed sign-ins (24 h) with locked count, Policies needing action. | S |
| 3.G5 | **Policy workflow settings** (review days, review cycle 6/12/24, reminder days, staff attestation window days). | S (shared with 2.G10) |
| 3.G6 | **Sign-in security settings**: MFA "Enforced - set by the platform; it cannot be turned off", allowed methods (passkey, TOTP; SMS "not offered (SIM-swap risk)"), "At least one MFA method must stay enabled", "Require passkey for company admins", minimum password length 12/14/16 ("platform minimum 12"), idle session timeout 15/30/60 min, read-only list of rules that cannot be relaxed. | M |
| 3.G7 | **Invitations and access**: allowed email domains (comma separated), invitation link expiry 24 h / 72 h / 7 days, SSO SAML 2.0 / OIDC "Enterprise plan. MFA still applies." with Configure. | S |
| 3.G8 | **Company audit log fields**: Category (Authentication, User management, Policy, Settings, Data export), Source (IP and browser/OS), Result (Success / Failed / Blocked), actor "unknown (email)" for failed sign-ins, "Append-only and hash-chained. Retained 12 months online, then archived. Visible to company admins and auditors.", Export CSV that is itself logged ("download link valid 15 minutes; export itself logged"). Portal log has #, time, category, actor, action, target, RoPA, hash and no result or source. | M |
| 3.G9 | "Your own MFA can only be reset by platform support after identity verification." for the admin's own row. | S |

### 3.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Role names | Company admin, Policy owner, Member, Auditor (read-only) | Company Admin, Control/Policy/Risk Owner, Employee, External Auditor, plus Risk Analyst, Vendor Contact, Trust Center Visitor (`roles.json`, `userRoles.json`) | scope of "owner" | See 11.1. |
| Time zone | audit log "Time (PKT)" | `nowStamp` local; admin log UTC | none | Pick UTC with tenant display zone. |
| Audit retention | 12 months online then archived | not stated | none | Adopt copy once backend defines it. |
| Invite expiry | selectable 24 h / 72 h / 7 d (default 72 h) | not modelled | none | Adopt; the appsec board says "72-hour expiry" fixed (see 5). |
| Min password length | tenant setting 12/14/16 | fixed 12 in `/auth` | stronger if raised | Adopt as setting, keep floor 12. |
| Idle timeout | tenant setting 15/30/60 min (default 30) | none (no session) | session | See security table. |
| Member-level "Reset MFA" | company admin may reset MFA for own-company members, **no second approver shown** | `/ws/people` Reset MFA (no log until later fix), `/admin/mfa` four-eyes for tenant admins | board is weaker here | **Inconsistency inside the boards**: appsec matrix says own-company members only and platform "two approvers"; Team board has a one-click Reset MFA. Ask owner (section 14). |

**Security-relevant conflicts (board stricter than portal)**

| Rule | Board | Portal |
|---|---|---|
| Company-domain-only sign-up/invites; free webmail and disposable blocked client and server | yes | no |
| Admins never see or set passwords; reset is a single-use link to the member's verified email | yes | no such flow (reset jumps to "set new password", `auth.md` OQ 2) |
| MFA cannot be disabled; SMS not offered; passkey required for admins (setting) | yes | `/auth` offers "SMS backup code" (`AuthPanels.tsx` `METHODS`) |
| Offboarding revokes sessions and API tokens, blocks reset, transfers ownership atomically | yes | cosmetic checkboxes (`people.md` OQ 2) |
| Audit entries carry source and result; export is itself logged and the link expires | yes | export logs only `auditlog.exported`; no result or source |
| Idle timeout and "session expires in N min" shown to the admin | yes | none |
| Admin's own MFA reset only by platform support | yes | not modelled |

### 3.4 Recommendation

**Fold into `/ws/team`, `/ws/auditlog`, `/ws/people`; no new route.**

* Replace the Team "Members" tab with the board's table (3.G1) and add tabs "Sign-in and access" (3.G6, 3.G7). Files: `TeamModule.tsx`, `team/SettingsTab.tsx` (rename sections), `team/TeamForms.tsx` (`InviteForm`, new `OffboardForm`), `src/services/team.ts`, `src/data/teamSeed.json`, `src/data/tenantUsers.json` (extend with `status`), `src/lib/security.ts` (new `emailDomainClass(email)` with the free/disposable lists, shared with vendor portal and `/auth`).
* Audit log: add `src` and `result` to `lib/audit.ts` `WsEntry`, columns in `AuditLogModule.tsx`, filter chips `AUDIT_CATS` in `features/auditlog/services/auditlog.ts`.
* Skip: SSO configure (Enterprise stub only).

---

## 4. `member-workspace` (Member workspace)

### 4.1 Purpose and existing coverage

A reduced, role-specific home for a plain member: "My workspace", "Published policies", "My account security". Header: "Good morning, {name}. You have N open tasks, M policies to acknowledge." Banner: "Member access. You can read published policies, add remarks on policies you are invited to, and acknowledge policies. Only a policy's creator can edit it; settings and team management are for company admins."

Existing coverage: none dedicated. The `employee` role (Priya Nair, `roles.json`) gets the normal shell with `overview`, `work`, `policies`, `access`, `questionnaires` (`ROLE_MODS`), i.e. company-level Overview and an editable policy register. `/ws/work` shows issues and static approvals (`WorkModule.tsx`).

### 4.2 Gaps

| # | Gap | Effort |
|---|---|---|
| 4.G1 | **My tasks** list with kinds Review, Acknowledge, Training, Reply; per-task title, detail, due, overdue in red, action button, "Completed" state. Examples (generic): review invite, owner reply to a remark, acknowledge a standard "within 14 days", annual security and privacy awareness training "35 minutes, includes phishing module". | M |
| 4.G2 | **My remarks** (policy, section, text, "Owner to review by", status Open / Overdue). | S |
| 4.G3 | **Published policies, read only, approved versions**: version, owner, approval date, status "Acknowledged <date>" / "Not acknowledged", button "Read and acknowledge" then "Done". Toast "Acknowledged X, recorded with timestamp in the audit log". | M |
| 4.G4 | **My account security**: Password (changed date, Change password), MFA (method, "enforced", Add a passkey), **Recovery codes** ("8 of 10 unused", "Regenerating invalidates old codes"), **Active sessions** (device, place, time, "Current"/"Active"/"Signed out"), "Sign out other sessions". Portal has no account-security surface; `/auth` is a gallery. | M |
| 4.G5 | **Training task type** (no training concept exists in the portal). Board only shows a launch toast; the content/completion model is **not specified**. | S as stub; L if real |
| 4.G6 | Role-scoped navigation: left nav shows only the three sections. | S |

### 4.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| What a member sees | policies read-only, remarks only where invited, no settings/team | employee has Overview, Work, Policies (full register incl. New policy and Edit buttons, no gate), Access, Questionnaires | over-exposure of company data and edit rights | See below. |
| Acknowledgement | per-user, timestamped, logged | random counts (`polInit`), "Remind outstanding" toast | evidence integrity | Adopt per-user record. |
| Role name | "Member" | "Employee" | none | 11.1. |

**Security-relevant conflicts (board stricter)**

| Rule | Board | Portal |
|---|---|---|
| Members cannot edit policies; settings and team management hidden | yes | employee can open Policies and use New policy / Edit / Approve (no gate) |
| Member sessions visible and revocable by the member; recovery-code count shown | yes | none |
| Remarks limited to invited policies | yes | n/a |

### 4.4 Recommendation

**New screen, wholly new: yes** (4.G1-4.G4). It also removes the over-exposure above for the `employee` role.

Build plan:

* Route: `/ws/me` (module key `me`), added to `src/data/nav.json`, `TITLE`, `ROLE_MODS.employee.ws = ["me", ...]`; make `me` the landing page for `employee` in `landingPath` (`src/lib/rbac.ts`). Layout: **inside the shell** (sidebar reduced to My workspace / Published policies / My account security via role-filtered nav), because members live in the product daily and need the global toast/theme/palette. Standalone is not needed.
* Components under `src/features/me/`: `MyTasks.tsx`, `MyRemarks.tsx`, `PublishedPolicies.tsx` (read-only list + acknowledge), `AccountSecurity.tsx` (password row, MFA row, recovery codes row, sessions list). Registry entry `MeModule.tsx`.
* Data: tasks derived from policies (reviewer collaborators, acknowledgement due = approval date + attestation window), remarks, a new per-user `acks` array on policies, mock session list in `src/data/meSeed.json` (device and place strings, synthetic; **no IP addresses needed**). Services: `src/services/me.ts` (`acknowledge`, `signOutOthers`, `regenerateCodes` as stubs through `viaApi`).
* Role gates: visible to `employee` (and optionally admin/owner as "My workspace"); acknowledgement writes `wsLog("policy.acknowledged", ...)`. Edit and approve controls must be hidden for `employee` in `/ws/policies` (depends on 2.G1).
* Out of scope until backend: real recovery-code generation (show codes once, hashed storage), real session revocation.

---

## 5. `signin-password-mfa` (Sign-in, password and MFA)

### 5.1 Purpose and existing coverage

Sign-up (company email only), set password (live rules, strength meter), MFA enrolment (passkey or TOTP, recovery codes), sign-in (bot check, lockout, MFA step, passkey), forgot password, plus a "what DevTools shows" panel with generated request/response pairs for every step.

Existing coverage: `/auth`, `AuthModule.tsx`, `auth/AuthPanels.tsx`, `auth/authLogic.ts`, `auth/AuthFields.tsx`; `docs/guides/checklist/auth.md`; `docs/security/SECURITY.md` ("Auth gallery").

### 5.2 Gaps

| # | Gap | Effort |
|---|---|---|
| 5.G1 | **Company-email gate on sign-up** with a 4-step "Background email checks" list (valid format, not personal/webmail, not disposable, domain receives mail via MX) and generic confirmation "Thanks. If this address can be registered, a verification link is on its way (valid 30 minutes)." Portal has no sign-up screen (Create is an invite-accept stub with a fixed email). | S |
| 5.G2 | **11-rule live password checker**: length "12-128 characters (n)", upper, lower, number, special, "Not a common or breached password", "No name, email or company name", "No sequences like abcd, 1234, qwer", "No character repeated 3+ times in a row", "No control or invisible characters", "Not one of your last 5 passwords"; NFKC normalisation; look-alike (leetspeak) normalisation; five-level strength (Weak / Fair / Strong / Very strong) from entropy bits (<60, <80, <100) with hard-fail forcing Weak. Portal has 5 rules + match and a 5-step bar. | M |
| 5.G3 | **Recovery codes** on MFA enrolment: 10 codes of format `XXXX-XXXX` from a 32-character unambiguous alphabet, each single use, "shown only now", gate "I have stored my recovery codes" before "Continue to dashboard". Portal has a "backup code" toast only. | S |
| 5.G4 | **Sign-in failure ladder**: generic "Incorrect email or password."; bot check from the 3rd failure ("Complete the bot check to continue."); after the 5th "Too many attempts. Please wait 15 minutes and try again, or reset your password." and the button disabled; MFA step 5 wrong codes cancels the pending sign-in; "Lost your device? Use a recovery code, or ask your company admin to reset MFA."; "Signed in. New-device alert sent to your email." | S |
| 5.G5 | **Forgot password**: always-the-same confirmation "If an account exists for that address, a reset link is on its way. It works once and expires in 30 minutes... After resetting you will still need your MFA method." Portal jumps straight to set-new-password. | S |
| 5.G6 | **"What DevTools shows" panel** (request/response per step with notes: no user ID, role or tenant returned; `__Host-mfa_pending` 300 s cookie; 202 for sign-up/forgot; 401/429 shape). Documentation value only; useful as the contract for the backend team. | M (optional) |
| 5.G7 | Passkey sign-in button exists in portal (toast only); registration flow with "Passkey registered on this device." state is missing. | S |
| 5.G8 | Method order: Passkey marked "recommended"; TOTP; **SMS not offered** ("because of SIM-swap risk"). | S |

### 5.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Min length | 12 (tenant may raise via `minLength` prop; 12-128) | 12 minimum, `PW_MAX` 128 (added) | none | Aligned. |
| Allowed characters | everything printable incl. `' < > ; --` and Unicode; control, null and invisible rejected; NFKC | ASCII allow-list `[A-Za-z0-9 !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]` rejects Unicode | board meets ASVS 2.1.11 (accept Unicode); portal does not | Adopt board (security-relevant). |
| Composition rules | upper + lower + number + special required "per company policy" | same | **both** deviate from ASVS 2.1.9 / NIST 800-63B (no composition rules) | Owner decision; board text states it knowingly. |
| History | last 5 may not be reused | none | ASVS 2.1.10 discourages history/rotation requirements; board also says "no forced periodic expiry" | Owner decision (see 14). |
| Breached/common check | implemented as a local list + normalisation, copy says "k-anonymity range lookup" in the super-admin board | copy only ("We also check it against breach lists") | claim without control | Keep copy honest until a server check exists. |
| Context words | blocks name, email, company, product incl. look-alikes | none | stronger | Adopt (but see over-blocking note below). |
| Over-blocking | the board's `common` list includes substrings such as "spring", "summer", "company", "test", "access", "master", "login" matched after leetspeak folding, so a long random passphrase containing "test" is rejected | n/a | usability and weak-entropy-by-exclusion; NIST says blocklist should be of known-compromised values | Keep exact/breached-list match only; drop dictionary-substring rule (owner decision). |
| MFA methods | passkey (recommended), TOTP, **no SMS** | passkey, TOTP, **SMS backup code** | SIM-swap | See security table. |
| Lockout | 5 failures then 15-minute pause; bot check from the 3rd | none | brute force | See security table. |
| TOTP window | "single use, 30-second window, 5 attempts per sign-in" (appsec) | UI accepts any 6 digits | none (UI) | Backend rule. |
| Reset link | 256-bit, hashed, single use, **30 min**, any email/user id in request ignored | no token | takeover | Backend rule. |
| Invitation link validity | 72 h (appsec, super admin onboarding) vs 24 h/72 h/7 d (Team setting) vs "30 minutes" sign-up verification | not modelled | none | Board-internal inconsistency; ask owner. |
| Session after MFA | new session ID, `__Host-session` cookie, rotated | none | fixation | Backend rule. |
| Bot check | "Verify you are human [BOT CHECK - e.g. Turnstile / hCaptcha]" placeholder | none | credential stuffing | Vendor choice not made in the board. |

**Security-relevant conflicts (board stricter or more compliant than portal)**

| Rule | Board | Portal | Reference |
|---|---|---|---|
| Accept Unicode and all printable characters; reject control/invisible; NFKC | yes | no (ASCII only) | ASVS 2.1.11, 2.1.1, 2.1.2 |
| 12-128 length, never truncated | yes | 12 min, 128 max (input cap only) | ASVS 2.1.1, 2.1.2 |
| Breached-password check blocks, with known-bad list + look-alike folding | yes (client demo list) | copy only | ASVS 2.1.7 |
| No SMS | yes | SMS offered | NIST 800-63B restricted authenticator; ASVS 2.7 |
| Lockout + growing delay + bot check + generic error | yes | none | ASVS 2.2.1, 2.2.2 |
| MFA mandatory for all, cannot be disabled, recovery codes hashed single use | yes | MFA "required" in copy only, no codes | ASVS 2.8, 2.5.x |
| Enumeration-safe sign-up/forgot (same response and timing, dummy hash) | yes (spec) | none | ASVS 2.2.x, 2.5.x |
| New-device alert; all sessions revoked on reset | yes | none | ASVS 3.3, 2.5.x |

### 5.4 Recommendation

**Fold into `/auth`, and make `/auth` truly standalone.** Not a new route.

Minimal files: `src/features/auth/authLogic.ts` (replace `AUTH_ALLOWED`, add `pwRules(pw, ctx)` with NFKC, common list moved to `src/data/passwordBlocklist.json`), `auth/AuthPanels.tsx` (`SignUp` panel using `emailDomainClass` from `lib/security.ts`, recovery codes step, failure ladder state, remove SMS from `METHODS`), `auth/AuthFields.tsx`, `src/pages/_app.tsx` + `AppShell.tsx` (bypass shell for `/auth`), `docs/guides/checklist/auth.md`, `docs/security/SECURITY.md`. Skip 5.G6 unless the backend team wants it as a contract appendix.

---

## 6. `third-party-risk` (Third-party risk management)

### 6.1 Purpose and existing coverage

Vendor register with tiering, questionnaire-based assessment (41 weighted questions, 9 critical, CAIQ v4 and SIG mapping), document and certificate tracking with auto dates, vendor-portal response review (locked snapshot, accept / accept with finding / reject / clarify), recommendation engine, and an expiry-and-review tracker covering own and vendor documents.

Existing coverage: `/ws/vendors` (`VendorsModule.tsx`, `vendors/VendorDrawer.tsx`, `vendors/VendorModals.tsx`, `src/features/vendors/lib/vendors.ts`, `src/features/vendors/services/vendors.ts`; `docs/guides/checklist/vendors.md`), `/ws/questionnaires` (`QuestionnairesModule.tsx`, `questionnaires/VendorPortal.tsx`; `docs/guides/checklist/questionnaires.md`), vendor request form in `work/RequestModals.tsx`.

The portal vendor drawer has tier, score 0-100 (typed in by hand), procurement gate Approve/Block, free-text certificates ("expiry free text, default TBD"), findings, monitoring, reassess and change-tier modals.

### 6.2 Gaps

| # | Gap | Effort |
|---|---|---|
| 6.G1 | **Pre-screening on Add vendor**: 5 questions (data accessed, criticality, access to systems, regulated/material outsourcing, processing outside country) with option weights, "Inherent risk score N" mapped to tier (7+ Critical, 4-6 High, 2-3 Medium, else Low), reassessment cycle, "questionnaire: full 41 questions" vs "short form (certifications and contract only)" for Low (the short-form content is **not specified**). Validation: "Add the vendor name and business owner."; "Answer all five pre-screening questions." | M |
| 6.G2 | **Weighted questionnaire** (11 domains, weights 1-3, critical flag, evidence expected per question, CAIQ v4 domain and SIG domain per question) with scoring: Yes = full, Partial = half, No = zero, N/A excluded; "A No on a question marked Critical creates a mandatory condition." | L |
| 6.G3 | **Residual risk and recommendation engine**: residual = tier weight (Critical 4, High 3, Medium 2, Low 1) x (100 - score)/25; High at 6+, Medium at 3+; any critical "No" on Critical/High tier forces High. Recommendation text: "Do not approve until critical gaps are closed" / "Approve with conditions" / "Approve". "Final decision by the business owner and CISO. Residual High needs documented risk acceptance by the risk committee." | M |
| 6.G4 | **Import vendor's CAIQ v4 / SIG Lite / SIG Core** (.xlsx/.csv): matching answers prefill unanswered questions, flagged "PREFILLED FROM X - VERIFY", "Mark N prefilled answers verified". Mapping "is indicative; confirm against your licensed SIG version". The board's import is simulated (answers are generated from file-name length). Portal Questionnaires has an import modal that creates a row only. | M |
| 6.G5 | **Policies and certificates tracking**: types Certificate (by expiry), Policy (by last change), Other (stored, not date-tracked); auto date rules (certificate with no expiry = issue + 12 months, flagged "Confirm expiry"; policy review = last change + 12 months); statuses Valid / Expiring / Expired / Confirm expiry / Current / Review due / Review overdue / Stored; "How the date was set" column; **ISO annual surveillance audit tracking** (next = last passed + 12 months, only while earlier than expiry minus 60 days; "Confirm passed" action; "no evidence of annual surveillance audit since X; request the surveillance report or certificate status from the certification body"). | L |
| 6.G6 | **Vendor compliance label**: "Non-compliant - certificate expired", "Unverified - surveillance overdue", "Gap - no certification" (Critical/High), "Policy review overdue", "Renewal due soon", "Compliant". | S (after 6.G5) |
| 6.G7 | **Vendor response review** ("Vendor response" tab): locked versioned snapshot with per-file hash and "scan clean", per-answer validation Accept / Accept with finding (Yes counts as Partial) / Reject (counts as No) / Request clarification, "In score" effect text, "Accepted without evidence" block for a critical Yes ("a Yes on a critical control cannot be accepted without evidence. Request clarification or reject."), counters, "Send N clarification requests to vendor", "Apply validated answers to assessment" enabled only when every answer is reviewed and none pending, "Only validated answers feed the control score." | L |
| 6.G8 | **Four-eyes**: "The approval decision must be made by someone other than the reviewer." (copy only; not enforced in the board). | S |
| 6.G9 | **Expiry and review tracker** (own and vendor documents; tabs Needs action / Expired-overdue / Certificates / Policies / All; days column with "(overdue)"; reminders at "90, 60, 30" days). | M |
| 6.G10 | **Review settings**: reassessment cycle by tier in months (6/12/24/36), policy review months, default certificate validity months, reminder days. | S |
| 6.G11 | **Register columns**: Questionnaire progress bar, Control score, Residual risk, Compliance, Next review (auto), "Questionnaires incomplete" KPI (excludes Low tier), Vendor policies due review KPI. | S |
| 6.G12 | "Auto-tracking scope: Policies and certificates only. Contracts, DPAs and other files are stored but not date-tracked." | S |
| 6.G13 | "Preview vendor portal" and "Send questionnaire to vendor" buttons linking to the external portal (section 10). Portal "Send questionnaire" only sets status. | S (with 10) |

### 6.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Tiers | Critical / High / Medium / Low (4) | Critical / Medium / Low (3; "Critical shown as High" in table, `vendors.md`) | none | Add High tier, or confirm the portal's 3-tier intent. |
| Reassessment cadence | Critical 6 months, High 12, Medium 24, Low 36; configurable | Critical 12 ("Annual review + continuous monitoring"), Medium 24, Low 36 (`TIER_WINDOW`) | Critical vendors reviewed half as often in portal | Owner decision; board is stricter for Critical. |
| Score | computed from questionnaire | manually typed 0-100 (blank/0 becomes 75; `vendors.md` OQ 2) | manual score is easy to game | Adopt computed score. |
| Procurement gate | recommendation + decision by business owner and CISO; High residual needs risk-committee acceptance | Approve/Block button, any role that opens module (OQ 1) | SoD | See security table. |
| Decision vocabulary | Approved / Approved with conditions / Under review / Onboarding / Not approved | Active / Needs evidence / In review (+ gate Pending/Approved/Blocked) | none | Map. |
| Certificate expiry | date with auto default and surveillance | free text ("TBD", "Valid") | stale certificates unnoticed | Adopt dates. |
| Scope of tracking | policies and certificates only | n/a | none | Adopt. |
| Question set size | 41 questions in TPRM; the vendor portal (board 10) shows only **12** | 6 hard-coded vendor questions free text (`VENDOR_Q`) | none | Board-internal mismatch; ask owner which set the vendor sees. |

**Security-relevant conflicts (board stricter)**

| Rule | Board | Portal |
|---|---|---|
| Critical "No" blocks approval for Critical/High tier unless remediation plan or committee acceptance | yes | no |
| Critical "Yes" cannot be accepted without evidence | yes | no evidence concept |
| Vendor answers immutable after submission; each clarification is a new version, old kept | yes | answers global and editable in memory (`questionnaires.md` OQ 4) |
| Evidence files hashed (SHA-256 per board label; board hash is a 32-bit toy) and scan state shown | yes (UI) | n/a |
| Reviewer != approver | copy only | none |
| Prefilled answers must be verified before they count | yes | n/a |
| ISO surveillance evidence overdue makes vendor "Unverified" | yes | no |

### 6.4 Recommendation

**Fold into `/ws/vendors` (rework, L) and `/ws/questionnaires`.** No new top-level route for the internal side; the external side is section 10.

Minimal files: `src/features/vendors/lib/vendors.ts` (tiers, cycles, `docState`, `survState`, `score`, `residual`, `recommend`), `src/features/vendorportal/data/vendorQuestions.json` (the 41-question catalogue incl. CAIQ/SIG mapping; generic control wording, safe to reuse), `src/features/vendors/services/vendors.ts`, `VendorsModule.tsx` (register columns, KPIs, tracker tab), `vendors/VendorDrawer.tsx` (tabs Overview, Vendor response, Questionnaire, Policies and certificates, Activity), `vendors/VendorModals.tsx` (pre-screening, document upload via `validateUpload`, settings), new `vendors/ResponseReview.tsx`, `vendors/DocTracker.tsx`, `src/features/vendorportal/lib/vendorSubmission.ts` (shared with section 10). Update `docs/guides/checklist/vendors.md`.

---

## 7. `risk-register` (Risk register)

### 7.1 Purpose and existing coverage

Active-register view with residual/inherent heat map, treatment progress bars, overdue treatment actions, register table with filters and sort, detail drawer (inherent and residual scoring, existing controls, treatment actions, acceptance authority, history, close), add-risk dialog, and a 3-step Excel/CSV import.

Existing coverage: `/ws/risk` fully (`RiskModule.tsx`, `risk/RiskDash.tsx`, `RiskRegister.tsx`, `RiskDetail.tsx`, `RiskForms.tsx`, `RiskCrit.tsx`, `RiskGov.tsx`, `RiskParties.tsx`, `risk/import/*`, `src/lib/risk.ts`, `src/features/risk/services/risks.ts`, `riskImport.ts`; `docs/guides/checklist/risk.md`, `risk-import.md`). The portal version is **more complete** than the board (3-point scoring, approval workflow, snapshots, interested parties, criteria, hardened import with 5,000-row cap).

### 7.2 Gaps

| # | Gap | Effort |
|---|---|---|
| 7.G1 | Risk appetite as a **configurable number** shown in the header ("Residual score N or above needs a risk committee decision. Acceptance lasts 12 months at most.") and used by "Above appetite" chips in the register. Portal constant `RISK_APPETITE = 11` is not editable (Team has a separate textual "Risk appetite: Moderate"). | S |
| 7.G2 | **Close rule**: "N treatment action(s) still open; finish or remove them before closing." Close disabled until all actions are done. Portal closes with an optional reason. | S |
| 7.G3 | **Validation on Add risk**: title of at least 8 characters ("Write a risk title of at least a few words."), owner required ("Every risk needs an accountable owner."), "Residual score cannot be higher than inherent. Check the scores." (blocking); live note "Above appetite: needs a committee decision." / "Within appetite." Portal accepts any scores; import only warns "residual above inherent". | S |
| 7.G4 | **Treatment option change away from "Accept" reopens an accepted risk** (status to Open, acceptance cleared). Portal forces Mitigate on reopen only. | S |
| 7.G5 | **Acceptance requires a future date** ("Choose a future date.", "Acceptance can last 12 months at most. Choose an earlier date."); portal defaults `until` to 12 months if blank and does not require future. | S |
| 7.G6 | Overdue treatment actions card ("No overdue actions.", "N days late"), 5 shown. Portal Dashboard has an overdue chip in the treatment table. | S |
| 7.G7 | Heat map toggle Residual / Inherent (portal has Inherent / Current / Residual - superset). | none |
| 7.G8 | Category list (10 values: Information security, Privacy, Financial crime, AI governance, Third party, Operational resilience, Compliance, People, Strategic, Financial) vs portal 7 (Technology, People, Third party, AI, Operational, Compliance, AML). | S (owner choice) |
| 7.G9 | Import extras: "Update existing (same ID)" vs "Add as a new risk with a new ID" - portal has this; board's `Try with a sample register` includes a `=HYPERLINK(...)` payload to show neutralisation - portal has the same. | none |

### 7.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Appetite threshold | **15** (prop `appetite`, default 15) | **11** (`RISK_APPETITE`, start of "High") | acceptance authority threshold differs | Owner decision (14). |
| Rating bands (5x5) | Critical 20-25, Very high 15-19, High 10-14, Moderate 5-9, Low 1-4 | Low 1-5, Medium 6-10, High 11-19, Extreme 20-25 (ISO 27005 note in `risk.ts`) | none directly; changes "above appetite" counts | Owner decision. Board has 5 bands, portal 4. |
| Priority mapping | none | Extreme P1, High P2, Medium P3, Low P4 | none | Keep portal. |
| Impact scale labels | Minimal / Minor / Moderate / Major / Severe | Insignificant / Minor / Moderate / Major / Severe | none | Cosmetic. |
| Acceptance authority | within appetite: "Chief Risk Officer or above"; at or above appetite: "risk committee or board" only; options Chief Risk Officer / Risk committee / Board | ladder by residual band: Low = Risk owner, Medium = Department head, High = CISO, Extreme = Board/CEO (`riskRef.json`) | board is stricter: for residual 15-19 board needs committee/board, portal lets CISO accept | See security table. |
| Acceptance record | by, until | by, rationale (required), compensating controls, until | board has no rationale | Keep portal (richer). |
| Statuses | Open / In treatment / Monitoring / Accepted / Closed | Open / In review / Accepted / Closed + review states (Draft, Submitted, Approved) | none | Add "In treatment / Monitoring" only if owner wants it. |
| Approval workflow | none (no submit/approve) | Submit / Approve / Request changes by `riskCanApprove` | board lacks a control the portal has | Keep portal. |
| Risk id | `R-NNN` (3-digit, next max+1) | `RK-NN` (`seed.json`, `RK-<count+1>` with collision loop) | none | Keep portal. |
| Row cap on import | 2,000 rows, 10 MB, `.xlsx`/`.csv` | 5,000 rows, 5 MB, zip-bomb caps, `.xls` rejected with message | portal safer | Keep portal. |
| Import "formula" handling | strips leading `= + - @`, flags warning | prefix apostrophe (`neutral()`); keeps text | both mitigate CSV injection | Keep portal. |
| Auto-cleaning | strips characters under code 32 | `convert.ts` equivalent | none | Keep portal. |

**Security-relevant conflicts (board stricter)**

| Rule | Board | Portal |
|---|---|---|
| At or above appetite only the risk committee/board may accept; below appetite at least CRO | yes (threshold 15) | CISO may accept up to residual 19 (High band) |
| Cannot close with open actions | yes | no |
| Residual may not exceed inherent | blocking | warning on import only |
| Acceptance must have a future end date, at most 12 months | yes | optional, defaults to 12 months |
| Changing treatment away from Accept clears the acceptance | yes | no |

Neither board nor portal enforces that the actor holds the authority they select (the board checks only the selected label); both depend on the API (`docs/guides/checklist/risk.md` Security notes).

### 7.4 Recommendation

**Skip as a screen; fold the S-sized rules into `/ws/risk`.** Files: `src/lib/risk.ts` (appetite source of truth, optionally read from Team settings), `src/features/risk/services/risks.ts` (`closeRisk` open-action check, `createRisk` validations, `acceptRisk` future-date check, treatment-change handler), `risk/RiskForms.tsx` (live note), `risk/RiskDetail.tsx` (hint "N treatment action(s) still open..."), `risk/RiskDash.tsx` (overdue card), `docs/guides/checklist/risk.md`.

---

## 8. `super-admin-console` (Super admin console)

### 8.1 Purpose and existing coverage

Provider console for the SaaS operator with five sections: Customers (table, search, reset admin MFA, send admin reset link, suspend/reactivate), Onboard customer (5-step wizard), Billing and payments (provider adapters, signed webhook events, dunning timeline), Platform audit log, Platform security (password baseline, authentication and session rules, privileged-access rules). Header: "Elevated session: Hardware key - allow-listed network - just-in-time role expires in 52 min." Banner: "Super admins manage tenants and billing; they cannot read customer policy content without a time-boxed support grant approved by the customer."

Existing coverage: `/admin/customers` (`CustomersModule.tsx`, `customers/*`; `docs/guides/checklist/customers.md`), `/admin/billing[/id]` (`billing/*`; `billing.md`), `/admin/rates`, `/admin/mfa` (`MfaModule.tsx`, `mfa/ResetRequestForm.tsx`, `src/services/mfa.ts`; `mfa.md`), `/admin/adminlog` (`AdminLogModule.tsx`, `adminlog/AdminViews.tsx`; `adminlog.md`), `src/lib/adminAudit.ts`, `src/lib/platform.ts`.

### 8.2 Gaps

| # | Gap | Effort |
|---|---|---|
| 8.G1 | **Elevated session model**: just-in-time elevation (60 min max, reason recorded), hardware-key requirement, allow-listed network, visible countdown, auto-drop to a non-privileged state. Portal has a role switcher and no elevation. | L (UI shell) + backend |
| 8.G2 | **No standing access to customer content**: platform roles see tenant management only; "time-boxed support grant approved by the customer" (e.g. 4 h, read-only) as the only way in; grant events in the audit log. | L |
| 8.G3 | **5-step onboarding wizard**: Company profile (legal name, trading name, registration number, country, industry/licence type, employees, website, address), Contacts (primary admin name, work email, **phone for MFA reset call-back**, billing contact, **security contact email "Receives MFA reset and incident notices"**, DPO email, tax id), Plan and payment (plan, cycle, seats, currency, payment method), Compliance and data (data residency region, MSA reference, 4 mandatory checks: MSA signed, DPA signed incl. sub-processor list, sanctions/adverse-media screening clear, security contact verified by call-back), Review. Portal onboarding is one modal (name, region, plan, currency, billing method, cycle, admin name/email, modules). | M |
| 8.G4 | **Contact email validation on onboarding**: personal/webmail and disposable rejected per field ("Primary admin email: personal / webmail addresses ... are not accepted. Use a company domain."). | S |
| 8.G5 | **MFA reset checklist** in the request dialog: three required identity checks ("Call-back to the phone number on file in the customer record (not one given in the request)", "Request came from the customer's registered security contact on a verified domain", "Government-ID or video check completed through the support identity process"), support ticket reference, **named second approver chosen in the dialog**, effect text "existing factors removed, all sessions revoked, re-enrolment forced at next sign-in, and the customer's security contact notified by email". | S |
| 8.G6 | **Payments**: provider adapters (hosted checkout provider, bank-transfer invoice, alternative adapter) with states, signed webhook event list ("Signatures verified with the endpoint secret from the vault; events are idempotent and replay-protected (5-minute tolerance)"), dunning rules ("Retry failed payments on days 3, 5 and 7", "Day 14 past due: tenant becomes read-only; data is kept", "Day 45: suspension notice", "Data deleted only under the contract's exit clause, with a certificate of deletion"), PCI scope statement "smallest PCI DSS scope (SAQ A)". | M (static content) |
| 8.G7 | **Platform security tab**: three read-only rule lists (password baseline, authentication and sessions, privileged access), link to live password check and to the AppSec spec. | S |
| 8.G8 | **Customer table fields**: data residency region, billing state ("Past due 46 days", "Awaiting payment method", "Trial - 9 days left"), admin MFA state ("Reset pending", "Pending enrolment"), Suspend ("users signed out, data retained") and Reactivate. Portal customers have most of this except dunning-aware billing text and suspend/reactivate (check `customers.md`: no suspend of tenant, only user suspend). | S |
| 8.G9 | KPI "Blocked attacks (24 h)" and "MFA coverage 100% Enforced at sign-in". | S |
| 8.G10 | Audit log **Result** column with Success / Warning / Pending / Blocked, and security events (credential-stuffing pattern, rate limited). Portal admin log has tenant, lawful basis, categories, hash, no result column. | S |

### 8.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Super admin reach | cannot read customer policy content; tenant/billing only; support grant required | `ROLE_MODS.super = { ws: "*", admin: "*" }`; Super Admin has `spaces: ["admin","ws"]` and opens every workspace module | **platform operator can read all tenant data** | See security table. |
| Role count | Super admin + support staff implied (second approvers "Security Ops lead", "Support manager") | `super` and `support` roles | none | Keep portal's two roles. |
| MFA reset approval | two approvers, three identity checks, ticket, customer security contact notified | requester != approver, reason + method select, one confirm checkbox; requester may Reject own request (`mfa.md` OQ 2); name-based comparison | account takeover vector | See security table. |
| Who can approve | second approver from a named pool (security ops lead, support manager) | both Super and Support may request and approve | SoD | Adopt named-approver pool or restrict approve to super. Owner decision (`mfa.md` OQ 5 already asks). |
| Time zone | UTC | UTC (`adminLog`) | none | Aligned. |
| Tenant ids | `TN-1001` | `cust-101` | none | Keep portal. |
| Onboarding fields | 5 steps, 4 mandatory checks | modal | none | Adopt wizard (M). |
| Region options | UK (London), EU (Frankfurt), UAE (Dubai), KSA (Riyadh), US (Virginia) | `ONBOARD_REGIONS` (see `customers.ts`) | residency | Reconcile lists. |
| Admin audit export | SIEM stream, write-once | FNV-1a demo chain, JSON/CSV export (`adminlog.md`) | integrity | Board states the production requirement (see security table). |

**Security-relevant conflicts (board stricter)**

| Rule | Board | Portal |
|---|---|---|
| No standing access to customer content for platform staff | yes (customer-approved, time-boxed, read-only grant) | Super Admin has wildcard workspace access |
| Hardware security key for super admins; allow-listed networks | yes | none |
| Just-in-time elevation, 60 min max, reason recorded | yes | none (role switcher) |
| MFA reset: 3 identity checks + ticket + named second approver + notification + sessions revoked + forced re-enrolment | yes | 1 checkbox + method; requester can reject own request; name-based four-eyes |
| Platform audit: write-once, hash-chained, streamed to SIEM, weekly review | yes | FNV-1a demo chain, in-memory |
| Payment details never enter the app (hosted page, provider references only, secrets in vault) | yes | no card data anywhere (aligned) |
| Webhooks signed, idempotent, replay-protected 5 min | yes | n/a (billing is mock) |
| Tenants cannot disable MFA | yes | n/a |

### 8.4 Recommendation

**New screen: partly.** The customer/billing/MFA/log modules exist; what is new is the elevated session and "no standing access" model (8.G1, 8.G2) plus the onboarding wizard (8.G3) and the Platform security page (8.G7).

Build plan:

* Route: `/admin/elevation` (session banner and request flow) and `/admin/security` (read-only Platform security rules). Both in the **shell** (admin space), because they gate the rest of the admin space. Add to `nav.json` admin group, `ROLE_MODS.super.admin` (the wildcard already covers it) and `support` (read-only security page).
* Components under `src/components/kit/admin/` (new folder): `ElevationBanner.tsx` (countdown from a store value, "Elevated session: hardware key - allow-listed network - just-in-time role expires in N min"), `RequestElevation.tsx` (reason required, 60 min max, simulated hardware-key prompt), `SupportGrants.tsx` (list of customer-approved grants with expiry), `PlatformSecurity.tsx` (three rule lists, copy from the board), `OnboardWizard.tsx` replacing `customers/Onboard.tsx` (reuse `isEmail`, add `emailDomainClass` from section 3).
* State: `elevation: { until, reason } | null` in `src/lib/store.ts`; write `adminLog("admin.elevated", ...)` at start and expiry; when not elevated, mutation buttons in `/admin/*` are disabled with the text "Elevate to make changes" (read-only browsing stays).
* Role gates: elevation applies to `super` only; `support` limited to `customers`, `mfa` per `ROLE_MODS`; remove `ws: "*"` for `super` (or limit to a grant list). **This is a breaking change to the role demo** and needs owner sign-off.
* Backend dependency: real hardware-key and network allow-list checks are server-side; the UI can only show the state.
* Extend `mfa/ResetRequestForm.tsx` and `src/services/mfa.ts` with the three identity checks, ticket, approver select, notified/sessions-revoked effect text.

---

## 9. `appsec-controls-spec` (Application security controls build spec)

### 9.1 Purpose and existing coverage

A read-only engineering specification mapped to OWASP ASVS 4.0.3 Level 2 and the OWASP API Security Top 10 (2023): "Core rule: the browser is untrusted", a bad vs good login response, nine control groups, rate-limit table, server-side permission matrix, and an 8-item release gate.

Existing coverage: none as a page. Closest: `docs/security/SECURITY.md` (front-end controls and known limitations), per-module "Security notes" in `docs/guides/checklist/*.md`.

### 9.2 Gaps (what the board contains that the portal lacks)

| # | Gap | Effort |
|---|---|---|
| 9.G1 | **A user-facing read-only page** with: core rule, "What a response may contain" (8 never-send items, bad and good response examples with `Cache-Control: no-store` and `__Host-mfa_pending` cookie), 9 groups (identity and authorisation; account discovery; brute force and credential stuffing; password reset and recovery; sessions, tokens and request forgery; data minimisation; input handling; errors, headers and transport; logging, monitoring and alerting), each with threat, controls, "Maps to" and "Test". | M |
| 9.G2 | **Rate-limit table** (7 endpoints): login 5 failures per 15 min then 15-min pause, bot check from the 3rd, IP 20/min and more than 50 distinct emails per hour blocks the IP; MFA verify 5 wrong codes per pending sign-in, 30/min; forgot 3/hour per email and 10/hour per IP, dropped quietly with 202; reset 5 attempts per token; sign-up 3/hour per email, 5/hour per IP, bot check always; invite link single use 72 h; authenticated API 600/min per session, 1,200/min per IP, exports 10/hour. | S |
| 9.G3 | **Server-side permission matrix** (13 actions x 5 roles: Super admin, Company admin, Policy owner, Member, Auditor), values Yes / No / Own / Cond ("If named approver", "Own + invited", "Own company members", "Yes (two approvers)", "No (customer-approved grant only)", "Platform log only"). | S |
| 9.G4 | **Release gate** (8 evidence items: independent penetration test with critical/high fixed and retested; ASVS L2 self-assessment signed off by the CISO; automated cross-tenant IDOR suite in CI; enumeration timing test; rate limits and alerts demonstrated; response schema review; header/TLS/cookie scan; secrets in a vault). | S |
| 9.G5 | Interactive: tabs "Sign-in demo / Super admin / Company view" link out to the other boards (prototype navigation only). | skip |

### 9.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Referrer-Policy | `strict-origin` | `strict-origin-when-cross-origin` (`next.config.js`) | marginally weaker referrer leakage | Adopt board value if no cross-origin analytics need exists. |
| CSP | "Content-Security-Policy against XSS" | `script-src 'unsafe-inline'` (known limitation 3 in `SECURITY.md`) | XSS defence-in-depth gap | Nonce CSP (already planned). |
| Session cookie | `__Host-` prefix, Secure, HttpOnly, SameSite=Strict, no tokens in browser storage | no session; `apiFetch` uses `credentials: "include"` (`SECURITY.md`) | session theft/CSRF | Backend. |
| CSRF | token per state-changing request plus Origin/Referer checks | none | CSRF | Backend. |
| Permission matrix - super admin | no policy view (grant only), cannot read other tenant data | wildcard workspace access | see 8.3 | Adopt matrix as the target RBAC. |
| Permission matrix - policy edit | creator only for Company admin and Policy owner | open | see 2.3 | Adopt. |
| Permission matrix - Auditor | views company policies and audit log, nothing else | `auditor` role: overview, audits, controls, evidence, policies, frameworks (`ROLE_MODS`); no audit-log module | board lets auditor read the **company audit log**; portal blocks `/ws/auditlog` for auditor | Align (owner decision). |
| Permission matrix - Member | views policies; remarks if invited | employee: Overview, Work, Policies, Access, Questionnaires | over-exposure | See 4.3. |
| Permission matrix - add remarks | Company admin Yes, Policy owner own+invited, Member if invited, Auditor No | not modelled | none | With 2.G3. |
| Invite link | single use, 72-hour expiry (fixed) | n/a | none | vs Team setting 24 h/72 h/7 d: board-internal inconsistency. |
| Idle/absolute timeouts | stated, no numbers | none | session | Needs numbers (14). |
| Password reset admin rule | "Admins can only send a reset link to the member's verified email; they never see or set passwords" | n/a | takeover | Backend. |
| MFA reset | "identity check plus second approver; audited" | four-eyes name-based | takeover | See 8. |

**Security-relevant conflicts:** every control in this board is stricter than the portal, because the portal has no server. The portal-relevant ones are: Referrer-Policy value, nonce CSP, auditor access to the company audit log, super-admin reach, creator-only edit. All other rows are **backend build requirements** and must be tracked as such, not as front-end gaps.

### 9.4 Recommendation

**New screen: yes, as a read-only reference page** (no logic): `/ws/security-spec` (or `/admin/security-spec`, see questions). Also **reuse as source of truth** for the backend ticket list and for `docs/security/SECURITY.md`.

Build plan:

* Layout: inside the shell (reference content, benefits from search and theme); single scrolling page with anchored sections.
* Components under `src/features/appsec/`: `AppSecModule.tsx`, `ControlGroup.tsx` (collapsible card: threat, bullets, "Maps to", "Test"), `ResponseCompare.tsx` (two `<pre>` blocks, text only), `RateLimitTable.tsx`, `PermissionMatrix.tsx` (uses `Table` and `Chip`), `ReleaseGate.tsx` (checklist; **display-only**, do not persist ticks as evidence without an owner decision).
* Data: `src/features/appsec/data/appsecSpec.json` (the groups, limits, matrix, gate arrays copied as generic specification text; they contain no customer data; remove the example response's sample identities and keep neutral values).
* Role gates: `admin`, `owner`, `super`, `auditor` read; hidden for `employee`, `vendor`, `viewer`.
* Cross-link: from `/auth`, `/admin/customers` security panel and `docs/security/SECURITY.md`.

---

## 10. `vendor-assessment-portal` (External vendor assessment portal)

### 10.1 Purpose and existing coverage

Standalone page for an **external vendor contact** who received a security questionnaire request: confirm invited work email, email one-time code, enrol a second factor, answer a 12-question questionnaire with evidence upload and CAIQ/SIG prefill, submit (locked, versioned), and later answer **only** the questions the reviewer reopened. Header: "Signed in as g•••@... - session ends after 15 min idle".

Existing coverage: `QuestionnairesModule.tsx` renders `questionnaires/VendorPortal.tsx` when the active role is `vendor` ("Vendor Contact", `roles.json`; modules `questionnaires`, `trust`). It is a **free-text form inside the main shell**: 6 hard-coded questions (`VENDOR_Q` in `lib/trustData.ts`), no identity check, no upload, no per-question answer choice, no locking, no versions (`docs/guides/checklist/questionnaires.md` OQ 4).

### 10.2 Gaps

| # | Gap | Effort |
|---|---|---|
| 10.G1 | **Entry gate** "Security assessment request: ... This link works once and expires on <date>." with step "Confirm the work email this request was sent to": invalid format "Enter a valid email address.", personal "Personal email addresses cannot be used. Use your company email.", temporary "Temporary email addresses cannot be used.", mismatch "We couldn't verify this request. Check the address, or ask your contact to resend it." (same text as an invalid link), **3 mismatches voids the link**. | S |
| 10.G2 | **Email one-time code**: "We sent a 6-digit code to a•••@domain. It expires in 10 minutes."; "Enter the 6-digit code."; "That code did not work."; **5 wrong codes void the link**. | S |
| 10.G3 | **Second factor enrolment** before any data: passkey/security key (recommended) or authenticator app; "You will use it each time you return." | S |
| 10.G4 | **Dead-link state**: "This link can't be used. Ask your contact at <customer> to send a new request." | S |
| 10.G5 | **Questionnaire**: domain grouping, question id, "EVIDENCE REQUIRED" tag for critical, answer choice Yes / Partially / No / Not applicable, optional comment (2,000 chars), progress "N of M answered, saved automatically", per-question evidence upload with "Suggested: <evidence>" and file states "scanning for malware...", "scanned, uploaded", "file type not allowed", "larger than 25 MB" (allow-list `.pdf .docx .xlsx .png .jpg`). | M |
| 10.G6 | **Prefill from CAIQ/SIG upload**: "Already completed a CAIQ v4 or SIG? Upload it and matching answers will be filled in for you to review." Prefilled answers carry "Prefilled from your upload, please check" and **block submit** until the vendor changes or re-selects each one. | M |
| 10.G7 | **Submit rules**: all questions answered; every "Yes" on a critical item needs a clean evidence file; no unverified prefill; notes "N questions still need an answer." / "N 'Yes' answers on required items still need evidence attached." / "N prefilled answers still need checking."; on submit reference `VQ-2026-NNNNNN` version 1, answers become read-only. | S |
| 10.G8 | **Clarification round**: "Clarification requested on N answers. Response <ref> version N. Only these answers can be changed; all other answers stay locked. Please reply by <date>. Your previous version is kept on record."; per-answer reviewer note; new clarification text required and **different from the previous one**; new evidence required for any "Yes" and must be a different file name; ready note "Ready to send. This creates version N+1; version N is kept." | M |
| 10.G9 | **Confirmation**: "Thank you, your response has been submitted ... ACME reviews each answer against its evidence and may ask for clarification through this portal." | S |
| 10.G10 | **"What you can see"** panel: "Only this questionnaire and the files you upload. You cannot see <customer>'s data, other vendors or your organisation's risk rating. Once submitted, your answers can't be changed without a new request." | S |
| 10.G11 | **"Portal security controls"** list (11 items, e.g. "Single-use link with a random token; expires in 14 days and after submission", "Session cookie HttpOnly, Secure, SameSite=Strict; 15-minute idle timeout", "Portal included in the annual penetration test scope"). | S |
| 10.G12 | Idle sign-out ("session ends after 15 min idle"), Sign out, toast "Signed out. Your answers were saved." | S |

### 10.3 Conflicts

| Topic | Board says | Portal does | Security impact | Recommendation |
|---|---|---|---|---|
| Container | standalone external page, no customer navigation | inside AppShell with sidebar/topbar and role switcher | vendor sees customer navigation chrome | Standalone layout (bypass shell). |
| Access control | single-use link + email match + email OTP + MFA before any data | selected via role switcher, no identity | impersonation | See security table. |
| Answer model | structured choice + comment + evidence | free text | weak assurance data | Adopt. |
| Link lifetime | "expires 09 Nov 2026" (demo date) vs controls list "expires in 14 days" vs appsec "72-hour invite" | n/a | link exposure window | Board-internal inconsistency; ask owner (default 14 days per this board). |
| Idle timeout | 15 min | none | session | Adopt. |
| Max upload | 25 MB, allow-list pdf/docx/xlsx/png/jpg | 10 MB default, broader allow-list (`UPLOAD_DEFAULT`), no vendor use | larger attack surface for uploads | Use a vendor-specific `UploadRule` (see 10.4). |
| Question count | 12 in portal, 41 in TPRM board | 6 hard-coded | none | Ask owner which set (see 6.3). |
| Required evidence | critical "Yes" only | none | evidence quality | Adopt. |
| Requested-by name | `ACME [CUSTOMER] Ltd` | hard-coded "ACME Ltd" | none | Parameterise (no real-looking names). |

**Security-relevant conflicts (board stricter)**

| Rule | Board | Portal |
|---|---|---|
| Single-use random-token link; mismatched email gets the same message as an invalid link; 3 mismatches kill the link | yes | none |
| Email one-time code (10 min, 5 attempts void link) plus passkey/TOTP before any data | yes | none |
| Personal and temporary email domains rejected | yes | none |
| Vendor can read only their own questionnaire; server-side check per request | yes | n/a (any role with the module; answers global) |
| Uploads: content-type check, malware scan, stored encrypted outside web root | yes (copy; scan state simulated) | extension and size check only |
| Comments plain text, length-limited, encoded | yes | React text, `clampText` (aligned) |
| Session 15-minute idle, HttpOnly/Secure/SameSite=Strict | yes | none |
| Every view, answer, upload and submission written to audit log | yes | `vendor.questionnaire.submitted` only |
| Submitted answers immutable; clarification creates new version, older kept | yes | editable until reload |

### 10.4 Recommendation

**New screen, wholly new: yes.**

Build plan:

* Route: `/vendor-portal` (page `src/pages/vendor-portal.tsx`). A real deployment needs a token route such as `/vendor-portal/<token>`; for the demo, a fixed mock token is enough. **Standalone layout**: bypass `AppShell` for this path (`_app.tsx` checks `router.pathname`), minimal header (product name, "requested by <customer>", masked email, Sign out), no sidebar, no role switcher, no palette. Keep `portal.css` tokens (design stays portal).
* Components under `src/features/vendorportal/`: `VendorPortalPage.tsx` (step machine `verify | otp | mfa | portal | clarify | done | dead`), `VerifyEmail.tsx`, `OtpStep.tsx`, `MfaStep.tsx`, `Questionnaire.tsx` (grouped, progress), `QuestionCard.tsx` (choice, comment, evidence), `EvidenceUpload.tsx` (uses `validateUpload` with `{ maxBytes: 25*1024*1024, exts: ["pdf","docx","xlsx","png","jpg"] }` and `safeFileName`; states scanning/clean/blocked simulated), `ImportPrefill.tsx` (CAIQ/SIG file through the existing risk-import parsers in `risk/import/parse.ts`, 5 MB cap, rows as text), `ClarifyRound.tsx`, `SubmittedPanel.tsx`, `PortalControls.tsx`.
* Data needed: `src/features/vendorportal/data/vendorQuestions.json` (same catalogue as 6.4, so internal and external sides share ids), mock invite `{ token, invitedEmail, customerName, expiresAt }` in `src/features/vendorportal/data/vendorInviteSeed.json` (synthetic domain such as `vendor.example`), submission model in `src/features/vendorportal/lib/vendorSubmission.ts` (`{ ref, ver, items{answer, comment, file{name, hash}}, status }`) shared with the internal review UI (6.G7).
* Role gates: no workspace role; access only by token + verification. Remove or redirect the `vendor` role's `questionnaires` module to the portal, and drop the in-shell `VendorPortal.tsx` after migration.
* Services: `src/features/vendorportal/services/vendorPortal.ts` (`verifyEmail`, `verifyCode`, `enrolSecondFactor`, `saveDraft`, `submit`, `submitClarification`, `recordView`), each stubbed through `viaApi`; counters (3 email attempts, 5 code attempts) implemented client-side for demo state only.
* Security hygiene for the demo: never log the entered email or code (`wsLog` actions only with reference ids); mask email in the header; no tokens in query string beyond the demo path; `Cache-Control: no-store` must be set at the real server.
* Open ambiguity: the board generates "prefill" answers deterministically from the file-name length; the real mapping (CAIQ/SIG to question ids) is **not defined** in the board (only an indicative domain map in the TPRM board). Treat prefill as a stub until a mapping table is supplied.

---

## 11. Cross-board conflicts

### 11.1 Role model

| Concept | Boards | Portal |
|---|---|---|
| Company roles | Company admin, Policy owner (per policy, creator), Member, Auditor (read-only) | Company Admin, Control/Policy/Risk Owner (module-level), Employee, External Auditor, Risk Analyst, Vendor Contact, Trust Center Visitor |
| Platform roles | Super admin (+ support staff as approvers) | Platform Super Admin, Platform Support |
| Ownership | per-record: creator is the only editor | per-module: role can use the whole module |

Recommendation: keep portal role ids; add a **record-level owner check** (policy) and map board names to them in one table in `docs/guides/checklist/shell.md`. Do not rename roles without owner approval.

### 11.2 Timeouts, windows and limits that the boards state (and where they disagree)

| Item | Values in boards | Note |
|---|---|---|
| Idle session | Team setting 15/30/60 min (default 30); vendor portal 15 min fixed; super admin JIT 60 min max; appsec "idle and absolute timeouts" (no numbers) | no absolute timeout figure anywhere |
| Pending-MFA cookie | 300 s (signin board) | |
| MFA code | 30-second window, single use, 5 attempts | |
| Sign-in lockout | 5 failures, 15 minutes, bot check from 3rd | consistent across signin, appsec, team text |
| Email verification link (sign-up) | 30 minutes | |
| Reset link | 30 minutes, single use | consistent |
| Invitation link | 72 h (appsec, super admin), 24 h/72 h/7 d (Team), vendor 14 days (vendor controls) | inconsistent |
| Email OTP (vendor) | 10 minutes | |
| Acceptance duration | 12 months max | consistent with portal |
| Attestation window | 14 days | |
| Remarks review window | 10 days | |
| Policy review cycle | 12 months (6/12/24) | |
| Vendor reassessment | 6/12/24/36 months by tier | portal 12/24/36 |
| Reminders | 90/60/30 days (TPRM), 14 days (policies) | |
| Dunning | retry 3/5/7; read-only day 14; notice day 45 | |
| Log retention | 12 months online | |

### 11.3 Bands and thresholds

| Item | Board(s) | Portal |
|---|---|---|
| Risk rating bands | 1-4 / 5-9 / 10-14 / 15-19 / 20-25 (5 bands) | 1-5 / 6-10 / 11-19 / 20-25 (4 bands) |
| Risk appetite | 15 | 11 |
| Compliance status bands | 85 / 75 / 65 / 50 (overview) | 80 / 65 / 50 (`fwBand`) |
| Control coverage cell bands | under 50, 50-59, 60-74, 75-89, 90+ | continuous colour mix |
| Vendor residual | High at 6, Medium at 3 (formula) | not computed |

### 11.4 Duplicated rule: email domain classification

Free webmail list (about 40 domains) and disposable list (14) appear identically in sign-up, Team invite, super admin onboarding and vendor portal boards. Implement once in `src/lib/security.ts` (`emailDomainClass`) and reuse from `/auth`, Team, Onboard, vendor portal. The lists in the boards are an example, not exhaustive; a maintained blocklist is a server concern.

---

## 12. Sample-data differences

Do not import board data. Portal synthetic data stays; the boards' company "ACME [Customer] Ltd" is a placeholder and the boards contain real-looking staff names that must not enter the repo.

| Item | Boards | Portal (keep) |
|---|---|---|
| Tenant | ACME [Customer] Ltd, Professional plan, UK and UAE entities, 25 seats, id `TN-1001`, "Q4 2026 review. Sample data." | Northwind Payments (`cust-101`, Enterprise, UAE) in `src/data/platform.json`; other tenants Contoso Exchange, Najm Pay, Tailspin Remit, Liffey Remit |
| Other tenants | Northwind Payments, Contoso Exchange, Fabrikam Bank, Tailspin Remit, Wide World Lending, Adventure Works Insurance (`TN-1002`-`TN-1007`) | different ids and plans; Northwind and Contoso names overlap but with different plans |
| People | 10 named staff and a "[External auditor]" placeholder, ids `u1`-`u10` | synthetic personas in `roles.json` and `tenantUsers.json` (e.g. Jordan Avery, Owen Hart, Priya Nair, Sam Hayes, Morgan Blake) |
| Emails | `@acme.example`, `@[vendor].example` | `@northwind.example` etc. |
| Frameworks | 12 (ISO 27001 93 controls, ISO 27701, SOC 2, NIST CSF, PCI DSS, GDPR, UAE PDPL, DIFC DPL, PK Reg, AML/CFT, VARA, ISO 42001) | 25 in `seed.json`, 30 controls |
| Risks | `R-001`..`R-042`, 13 seeded; overview says "37 risks" | `RK-01`..`RK-12` |
| Policies | `P-001`..`P-012` (12), 25-policy mandatory library | `P-001`.. 9 policies, statuses Active / In review / Draft |
| Vendors | `V-001`..`V-008`, bracketed placeholder names | 10 vendors, ids derived `V-ARBO` style, names Arbor Identity, Meridian Cloud, etc. |
| Dates | "today" 26 Oct 2026, acknowledgement 26 Oct 2026 | runtime clock (`nowStamp`) |
| Time zone | PKT (company log), UTC (platform log) | local / UTC |
| IP addresses | documentation ranges (198.51.100.x, 203.0.113.x, 192.0.2.x) | documentation range 198.51.100.x (`adminLog`) |
| Vendor requester | "ACME [CUSTOMER] Ltd" | hard-coded "ACME Ltd" in `VendorPortal.tsx` and `wsLog` text |
| Quantities | 1,312 active users, 214 blocked attacks, 212 failed sign-ins from 3 IPs | derived or none |

---

## 13. Prioritised summary (one page)

**Decision basis:** portal design kept; port only what is missing; board vs portal differences listed above for owner decision.

| Pri | Item | Board | Type | Effort | Why |
|---|---|---|---|---|---|
| P0 | Remove SMS MFA option; add recovery codes; lockout/bot-check/generic-error ladder; Unicode-accepting password rules; sign-up domain gate | signin | fold into `/auth` | M | Security-relevant, small, copy and state only (backend must enforce) |
| P0 | Make `/auth` (and vendor portal) truly standalone (shell bypass) | signin, vendor | `_app.tsx`/`AppShell.tsx` | S | Enabler; today the sign-in screen shows the sidebar |
| P0 | Decide risk appetite (11 vs 15), bands and acceptance authority | risk, overview | owner decision, then S | S | Changes who may accept risk |
| P0 | Policy edit by creator only; named approver; owner != approver | policy | fold into `/ws/policies` | M | Segregation of duties; also removes employee over-exposure |
| P1 | External Vendor assessment portal | vendor-assessment | **new route** `/vendor-portal`, standalone | L | Wholly new, security-sensitive external surface |
| P1 | Member workspace `/ws/me` | member | **new route**, in shell | M | Wholly new; fixes employee role scope |
| P1 | Super admin elevated session + "no standing access" + MFA-reset checks | super admin | **new** `/admin/elevation`, `/admin/security` + extend `/admin/mfa` | L | Largest security delta in the platform space; needs removal of `ws:"*"` for `super` |
| P1 | AppSec controls page (read-only) | appsec | **new** page, shell | M | Spec for backend team; low risk |
| P2 | Policy library rework (remarks, collaborators, change log, mandatory library, settings) | policy | fold | L | Largest functional gap |
| P2 | TPRM: pre-screening, weighted questionnaire, residual and recommendation, document tracker, response review | third-party-risk | fold into `/ws/vendors` | L | Large; shares data with vendor portal |
| P2 | Team: invite rules, offboard transfer, sign-in settings, audit log source/result | team-log | fold | M | |
| P3 | Overview: compliance trend + forecast, built-vs-proven, risks-above-appetite panel, calendar | overview | fold | M | Needs metric definitions (evidence current %) |
| P3 | Risk S-rules (close with open actions, residual <= inherent, future acceptance date) | risk | fold | S | |
| Skip | Board navigation tabs, "DevTools" panel (optional), SSO configure, simulated imports | various | skip | n/a | Prototype scaffolding |

Dependencies: P0 `_app` bypass blocks `/vendor-portal` and standalone `/auth`; policy rework blocks Member acknowledgements and Overview policy card; vendor question catalogue is shared by TPRM and vendor portal (build once); `emailDomainClass` shared by four screens.

---

## 14. Questions for the owner (genuine decisions)

1. **Risk appetite and bands:** adopt the board (appetite 15, five bands) or keep the portal (11, four bands)? This moves who may accept a High residual risk (CISO today, risk committee/board in the board).
2. **Acceptance authorities:** keep the portal ladder (Risk owner, Department head, CISO, Board/CEO) or the board's (Chief Risk Officer, Risk committee, Board)? A "Chief Risk Officer" role does not exist in the portal.
3. **Super admin reach:** may Platform Super Admin keep read access to tenant workspaces (today `ws: "*"`), or move to the board's "no standing access, customer-approved time-boxed grant"? This changes the role demo.
4. **MFA reset:** one rule for both places? Board Team console allows a company admin to reset a member's MFA with no second approver, while the appsec board and the platform console require two approvers and identity checks. Which applies to company admins?
5. **Password policy:** keep composition rules (upper/lower/number/special) and the "last 5" history rule, which both boards and the portal use but ASVS 2.1.9/2.1.10 and NIST 800-63B discourage, or switch to length plus breached-password blocklist only? Also: drop the dictionary-substring blocklist (rejects passphrases containing words like "test")?
6. **SMS:** confirm removal of the SMS backup option from `/auth` (board: not offered).
7. **Timeouts:** what are the figures for the absolute session timeout and the invitation link expiry (boards give 24 h, 72 h, 7 d and 14 days in different places)?
8. **Vendor tiers and cadence:** add the High tier and the 6/12/24/36-month cadence, or keep 3 tiers and 12/24/36?
9. **Vendor question set and Low-tier short form:** which questions does the external vendor see (board shows 12 externally, 41 internally) and what is in the "short form (certifications and contract only)"?
10. **Policy status vocabulary:** migrate Active to Approved and add Awaiting approval and Annual review states?
11. **Member role:** rename "Employee" to "Member", or keep the portal name and only add the workspace?
12. **Auditor:** should External Auditor see the company audit log (board matrix: yes; portal: no)?
13. **Training:** is a training task type in scope for the Member workspace (board shows only a launch toast)?
14. **Evidence current %:** how is it defined for the "built vs proven" scatter (the board invents values)?
15. **AppSec spec location:** `/ws/security-spec` (company roles) or `/admin/security-spec` (platform only)? Should the release-gate checklist be persisted as evidence or stay display-only?
16. **Referrer-Policy:** adopt `strict-origin` (board) in `next.config.js`?

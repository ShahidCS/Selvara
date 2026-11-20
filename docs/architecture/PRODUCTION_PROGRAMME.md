# Production programme: every module on the server

Status: **decisions recorded on 2026-11-20 by the owner** (answers to the questions asked before the work started). Draft for security and compliance review. This file is the plan of record for moving the remaining modules from the demonstration build (data in the browser) to the server (Supabase Postgres behind the API, row level security per company), after the backend foundation and Admin Console slices 1 to 3b ([BACKEND_FOUNDATION.md](BACKEND_FOUNDATION.md)).

## 1. Owner decisions

| Topic | Decision |
|---|---|
| Delivery | One pull request per module group, each with its own migration, merged when its checks are green; the next group starts at once. |
| Releases | **Once at the end**: the owner runs the new migrations in order and pushes one signed tag when every group is merged. |
| Protected files | Pre-approved for this programme: adding modules to `SERVER_READY` in `src/lib/rbac.ts`, and refactoring `src/lib/sod.ts`, `src/lib/approvals.ts` and `src/lib/elevation.ts` so the server and the browser share the same rules (as slice 2c did). Each change is listed in its PR. Still **not** approved without asking again: `src/data/roles.json`, `.github/`, `next.config.js`, `vercel.json` (security headers, CSP), `.gitleaks.toml`, `.zap/`, dependency versions outside a reviewed need. |
| Starting data | A new company starts with **no records**, but with the **reference catalogues** loaded (frameworks and their requirements, the control library, policy and questionnaire templates), plus **in-product tips** on empty screens and first visits that guide people through each module. No synthetic people, vendors or risks in production. |
| Evidence files | **Real storage**: Supabase Storage, private bucket, per-company paths, type and size limits, malware-safe handling (no inline rendering of active content), short-lived signed links. |
| AI assistant and agents | **Real** (Claude API, key added to Vercel by the owner). **Off per company until a company admin turns it on (four-eyes)**. Only the records the user is looking at are sent. A **PII blocker** checks every request: by default it **blocks and explains** (what kind of data, where), audited; a company admin may choose "mask then send" instead. Nothing is used for training. Agents still only suggest until a person approves, as in the demonstration. |
| Integrations | **Real, read-only**: GitHub (GitHub App), AWS (cross-account IAM role with external ID), Okta and Microsoft Entra ID, Google Workspace. Credentials are added by the owner (Vercel variables or per-company secrets stored encrypted); never handled by the agent. Other connectors stay labelled as simulated. |
| Billing | **Internal ledger** (plans, usage, invoices, credits, refunds, write-offs with elevation and four-eyes, as in the demonstration) **plus a pluggable payment provider** interface, Stripe first, enabled only when its keys are configured. |
| Email | **Built, off until configured**: sending through an SMTP or email API provider the owner configures later. Until then email options say "not configured" and in-app notices are used; invitation and reset links are shown to the admin as today. |
| Verification | Each module's demonstration functionality is inventoried first (every screen, action, rule, four-eyes path, audit action), and the server build is **cross-checked against that inventory twice** (once while building, once independently after) before its PR is opened. |

## 2. Order of work

| Group | Modules |
|---|---|
| 1 | Frameworks, Controls, Evidence (with real file storage) |
| 2 | Policies, People, Access |
| 3 | Risk, Issues, Work and Overview, Reports |
| 4 | Vendors, Vendor portal, Questionnaires, Trust Center, Commitments |
| 5 | Audits, auditor access, Audit logs, AppSec |
| 6 | AI governance, Assistant and agents (Claude API, opt-in, PII blocker), API keys and webhooks |
| 7 | Integrations: GitHub, AWS, Okta and Entra ID, Google Workspace |
| 8 | Admin Console: Billing (ledger and payment provider), Rates and tax, MFA reset requests, Platform security; email delivery |

## 3. Architecture (decision D7, technical)

The demonstration's screens are rich and already route every change through a service function (`viaApi(mock, real)`), whose real branch calls `/api/...`. The screens read the in-memory dataset (`DATA`, `src/lib/data.ts`). To keep every screen and its behaviour exactly as in the demonstration:

- **Storage.** Per-company records live in `ws_records` (`tenant_id`, `kind`, `id`, `data jsonb`, `version`, `updated_ms`, `updated_by`), one row per record, under row level security on `app_tenant()` like every company table. Reference catalogues (frameworks, requirements, control library, templates) live in shared read-only tables. Records keep the demonstration's shapes, so one validation layer serves both builds.
- **Reads.** In API mode a module loads its collections from the server (`GET /api/ws/records?kinds=…`, scoped to the session's company and filtered by role) into the same in-memory shape, so the screens render unchanged.
- **Writes.** The real branch of each service function calls a server command. The server loads the record, applies the rule (the same reason functions the browser uses to disable buttons, shared through `src/lib`), checks the person by **user id** (never by display name), writes the change with an optimistic version check, records the audit entry in the company's hash-chained log and, where four-eyes applies, uses the server's approvals engine, all in one transaction. The browser then reloads the affected collections.
- **Identity.** In API mode the acting person is the session's person and company role; the demonstration's personas are never used. Owners and assignees are stored as member ids with a display name.

## 4. Rules every group follows

- Data lives in Postgres tables with `tenant_id` and row level security on `app_tenant()`; reference catalogues are shared, read-only tables. The server enforces every rule (roles from memberships, four-eyes through the approvals engine, reasons, expiry, audit entries in the company's hash-chained log); the browser only explains.
- Rules shared between the server and the demonstration live in `src/lib/rules.ts` or the shared rule modules, so the two cannot drift.
- Each group adds its modules to `SERVER_READY`; the demonstration build keeps working unchanged.
- Each group ships unit tests (in-memory), database tests (real Postgres: isolation, four-eyes guards, read-only paths) and, where a screen changes, an API-mode visual check.
- Synthetic data only, everywhere: no real customer, employee or organisational data, no secrets in the repository.

## 5. Progress

| Group | State | Migration | PR |
|---|---|---|---|
| 1 | Merged | `0008` | ShahidCS/Selvara#74 |
| 2 | Merged | none (uses `0008`) | ShahidCS/Selvara#75 |
| 3 | Merged | none (uses `0008`) | ShahidCS/Selvara#76 |
| 4 | Built, in review | none (uses `0008`) | group 4 PR |

### Group 3 decisions (Risk, Issues, My Work, Overview, Reports)

Where the inventory (`inventory/group3-risk-issues-work-overview-reports.md`, section 7) found a gap, production does the following. The demonstration is unchanged unless stated.

- **Identity.** Risk owners, action owners and issue owners are members of the company, chosen from a list and compared by user id. "Only mine" and My Work use the signed-in person. The demonstration's fixed name is gone in production.
- **Risk workflow.** Approve and request changes apply only to a submitted risk. Requesting changes returns the risk to Open and tells the submitter. Submit works only from a draft or after changes were requested. Close works only on an open risk, and reopen only on an accepted one. Reopening keeps the old acceptance as history and takes an optional reason. Re-scoring does not reset an approved review (kept from the demonstration).
- **Who accepts and closes (SOD_MATRIX §3).** Recording a ladder acceptance needs a role at least as senior as the residual band: analysts up to Medium, owners and admins up to High; above 15 only an admin, with Board evidence. Closing a risk is for owners and admins. Neither can happen while the risk awaits approval.
- **Acceptance expiry.** When an acceptance passes its date, the system records it once, notes it in the risk's history and tells the owner. My Work then asks the owner to review the risk. The risk stays Accepted until someone reopens it.
- **Import.** The browser reads and converts the file as before. The server checks every row again: 5,000 rows at most, 1 MB, lengths, categories, scores of 1 to 5, real dates, the id format, and spreadsheet formula characters. An import never sets a status. A new row is always an open draft. An update keeps the risk's status and notes in the history what the file asked for. Owners are matched to members by exact name. Withdrawing a staged import is recorded in the risk log.
- **Snapshots.** A snapshot keeps the frozen register and a SHA-256 seal. Admins can download it. It is not shared with auditors until Audits are on the server (group 5).
- **Parties.** Interested parties have ids and are kept per company. A party links only to risks that exist. Two parties cannot have the same name.
- **Enterprise risks.** Production starts with none and has no editor for them yet.
- **Above appetite.** One definition everywhere: an open risk whose current score is 11 or more. This also changes the demonstration's Overview caption and board pack summary.
- **Issues.** An open High or Critical issue keeps its severity until a different person verifies the fix, so lowering it cannot bypass the verification. Owners of issues, risks and actions are members whose role can open the module or My Work (never vendor or viewer accounts). The due date is a real date. Every screen still reads "Overdue 3d" or "Due 5d", worked out each day. Links must point at controls and risks that exist. Every action is in the audit log, including tasks, root cause and links. A deleted issue stays in storage for the audit trail. The owner is told when an issue is assigned to them or its closure is decided.
- **Reports.** Generate builds the real pack (CSV or text) from the company's records, marked as a draft. The pack name and frequency are checked. The company's email domains come from its members' addresses, and public mail providers never count as one. Replacing or removing a schedule that sends outside the company needs a reason. Schedules show "Not sent until email is set up" until email exists (group 8). The month-on-month trend appears once history is recorded.
- **Overview and the board pack.** Every Overview role sees the posture figures. A role sees the detail only of the modules it may open. For the others the server sends scores and statuses without titles, owners or text, and the board pack shows totals only. The static month-on-month texts are not shown in production. Exporting the board pack is recorded under System. For frameworks a role cannot open, the server sends only what readiness needs (no reasons, names or requirement text).
- **My Work.** My Work lists the issues and risk actions the person owns, and the decisions waiting for them: risk approvals, Board evidence, imports, issue closures, external report distribution, policies they must approve, and access requests. A vendor request is stored on the server with length limits for the Vendors module (group 4).
- **Landing page.** Every company role lands on the Overview in production, as in the demonstration.

### Group 4 decisions (Vendors, the Vendor role, Questionnaires, Trust Center, Commitments)

Where the inventory (`inventory/group4-vendors-portal-questionnaires-trust-commitments.md`, section 8) found a gap, production does the following.

- **Nothing invented.** A vendor starts with no certificates, findings, monitoring signals or applications. The DPA line is not shown until it can be recorded. The Trust Center's public page is built from the company's own records:
  - its name;
  - verified library answers (the FAQ);
  - approved vendors that process customer data (sub-processors);
  - published documents (updates);
  - control status by domain.
- **Dates.** A vendor's next review is a real date (12, 24 or 36 months by tier), and overdue is worked out each day. Certificates carry a real expiry date and become Expiring (60 days) or Expired by themselves. A waiver ends on its date. Questionnaire due dates are real dates.
- **Critical vendors.** The admin or owner who starts the approval is the first approver, and a second, different person completes it. SOD_MATRIX asks for "a second approver"; the demonstration needed three people.
- **Reasons and outcomes.**
  - Recorded with the change: blocking the gate, dismissing a request (the requester is told), closing a finding, revoking Trust Center access, unblocking a domain and closing an incident.
  - Kept: a decided vendor request is kept with its outcome.
- **The vendor's questionnaire.** "Send questionnaire" sends the company's vendor questionnaire to the vendor's contact: a member invited with the Vendor role. They answer it in their own workspace and see only what was sent to them. Submitting needs every required answer and locks it. An admin or owner can reopen it with a note.
- **Standalone vendor portal.** The `/vendor-portal` page sends one-time codes by email, so it opens with email in group 8. In production it says so.
- **Questionnaires.**
  - A questionnaire becomes Complete (sent) only through the review, never by answering. It can be submitted only when every question is answered.
  - Editing a library answer unpublishes it from the chatbot until someone verifies it again.
  - Knowledge-base documents are real files.
- **Trust Center access.**
  - Documents are real files served through 60-second links. Public documents are open to everyone who sees the page. The others are open only to viewers of an active account whose NDA is accepted and whose access covers the document.
  - Approving access never marks the NDA as signed.
  - Neither the requester nor the person who unblocked the requester's domain can approve.
- **Trust Center requests.**
  - Requests use the member's own email: 3 an hour.
  - Chatbot questions: 20 an hour.
  - A new public document is listed "On request, NDA" until its publication is approved. Names are unique.
- **Anonymous public page.** The public Trust Center page for visitors without an account comes with email in group 8, because visitors must verify their address first.
- **Commitments.**
  - The contract analysis compares each commitment's figures (hours, days, percentages) with the matching standard term and says whether it is stricter, the same or looser. It is a draft for legal review.
  - A commitment is marked reviewed by an admin or owner other than its importer.
  - The incident clock belongs to the company: summary, server start time, customer-notice deadline (48 hours), close with an outcome, and history. It is recorded in the company's audit log, not the platform's.
- **Four-eyes route.** The group 4 approvals (`vendor.*`, `trust.publish`, `q.send`) go through one route (`server/ws/foureyes.ts`). The change happens in the same unit of work as the final approval, once. These approvals can also be decided from the bell.
- **Cross-check fixes.**
  - Blocking a vendor's gate withdraws a pending Critical gate approval, and an approval never overrides a block.
  - Changing a public Trust document's file returns it to "On request, NDA" until its publication is approved again. Files cannot change while publication waits.
  - The person who unblocked any matching domain, including a parent domain, cannot approve its requests.
  - Revoking an account clears its document access.
  - A refused approval for a blocked domain is still recorded.
  - Visitors receive only document names and access.
  - Nobody who ever edited a library answer can verify it.
  - The Trust Center's activity and change history are recorded and shown.

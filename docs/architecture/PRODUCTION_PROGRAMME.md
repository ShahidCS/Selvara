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
| 4 | Merged | none (uses `0008`) | ShahidCS/Selvara#77 |
| 5 | Merged | `0009` | ShahidCS/Selvara#78 |
| 6 | Merged | none (uses `0008`) | ShahidCS/Selvara#79 |
| 7 | Built, in review | none (uses `0008`) | group 7 PR |

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

### Group 5 decisions (Audits, auditor access, Audit log, AppSec)

Where the inventory (`inventory/group5-audits-auditor-auditlog-appsec.md`, section 7) found a gap, production does the following.

- **Auditor access.**
  - Access names one person and a period: a member invited with the Auditor role, up to 180 days. It ends by itself on its last day; the system records the end and tells the auditor.
  - It cannot be granted on a completed engagement.
  - An auditor sees only the engagements assigned to them while access is live. They never see another firm's engagements.
  - Granting access moves a planned engagement into Fieldwork.
- **What the auditor can open.** The Auditor role still opens Controls, Evidence, Policies and Frameworks read-only at all times, as listed in `roles.json`. Tying those reads to a live engagement would change `roles.json`, which needs the owner's approval.
- **Completion.**
  - Every path to Complete applies the same rules. No drafted finding may wait for a decision, and no information request may be still open; an answered request closes with the engagement.
  - A reason is required when findings or requests remain open.
  - Management can close an answered request.
  - A completed engagement is locked: no new requests, freezes or findings.
- **Findings.** Accepting a finding creates a real issue in the same unit of work. The issue has an owner, a real due date (14 days) and a link back to the finding, and the auditor is told. Declining a finding needs a reason, and the auditor is told.
- **Populations.** Freezing populations records who froze them and when. Nothing else is locked: evidence keeps its version history, so changes after the freeze stay visible.
- **Risk snapshots.** A risk register snapshot taken while an auditor's access is live is marked shared. That engagement's auditor can download it from the engagement.
- **Audit log.**
  - The Audit log is the company's real server log, sealed by the database in a SHA-256 chain.
  - Company admins read the newest 500 entries, verify the chain (migration `0009`), export the log (JSON or CSV, newest 5,000) and build an evidence package with a SHA-256 manifest.
  - Every export is recorded, at most 10 an hour.
  - "Export selected" is removed in production.
  - The category tabs include the server's categories.
- **RoPA.** The RoPA tab is presented as a reference register for the company to adapt. Its export is recorded in the company's own log, not the platform's.
- **The report.** The engagement report is a draft. It is recorded in the company's own log only.
- **AppSec.** It stays a read-only specification page; there is nothing to store. Real application security findings and scans would be new scope, for example with the vulnerability-scanner integration in group 7.
- **Cross-check fixes.**
  - An end date for auditor access must be a real calendar day, so access always ends.
  - The audit log is verified only when someone asks, because verifying recomputes the whole chain. The last result, with its time and who ran it, is shown.
  - The 10-exports-an-hour limit is taken under a lock.
  - No unaudited bulk reading route exists.
  - An auditor receives names, never the company's internal user ids. A request to another firm's engagement reveals nothing.
  - Snapshots are shared from the minute access was granted.
  - The screens no longer claim that completing revokes the auditor's role-based reads, or that freezing locks evidence.
  - Overview rows for audits the role cannot open show a count only.

### Group 6 decisions (AI governance, AI Assistant and agents, API keys and webhooks)

Where the inventory (`inventory/group6-ai-assistant-api.md`, sections 4 and 7) found a gap, production does the following. The AI decision of section 1 has no demonstration behaviour to keep, so it is built new.

- **AI use is a company setting.**
  - AI is off until a company admin asks to turn it on and a second admin approves (`ai.enable`). Turning it off is immediate.
  - The key (`ANTHROPIC_API_KEY`) is set in Vercel by the owner and read only on the server. Without it the screens say AI is not set up.
  - When AI is turned on, the AI Assistant registers itself in the AI register. The register governs it: if it is archived, its guardrail is Blocked, or it is confirmed Prohibited, every request stops.
- **What is sent.** Only the records the person attaches to a question, read from the server's copy, without people fields (owners, authors, approvers, leads, auditors). Agents send only their trigger's records. The person sees the list before sending, and a record they were viewing is offered when they open the Assistant from it.
- **PII blocker.**
  - It checks the question, the earlier turns and every record field before anything leaves: email addresses, phone numbers, payment cards (Luhn), IBANs (checksum), national identity numbers (CNIC, Emirates ID, SSN, UK NI), passport numbers, dates of birth, IP addresses, secrets and the names of the company's members and contractors.
  - By default it blocks and explains what kind of data was found and where, for example "your question: email address". The audit entry has the kind and place, never the value. Each block also adds a signal on the Assistant's register entry.
  - A company admin may choose "mask then send" (four-eyes, `ai.mask`): values become placeholders such as [EMAIL]. Values are masked one by one, then the final request is checked again; anything still found blocks the request whatever the setting. Going back to blocking is immediate.
  - It finds data by pattern, so it cannot catch every way of describing a person. The screens say so.
- **The model.** Claude through the Messages API (`claude-opus-5-5` unless `SELVARA_AI_MODEL` names another), low effort, with server-side fallback on a declined request. A plain HTTPS call is used because adding the SDK changes dependencies. API requests are not used for training under the provider's commercial terms. Questions and answers are not stored; the audit log records who asked, the records sent, the model and token counts. Limits: 30 questions an hour a person (blocked ones count), 20 agent runs an hour a company.
- **Prompt injection.** Records are data inside a `<records>` block that a record cannot close; the instructions tell the model to ignore instructions inside records. Answers are drafts for review.
- **Agents.** The autonomy ladder of the demonstration is kept. Agents start at "Suggests only", where someone other than the person who ran them approves each change. They are raised to "Acts (logged)" only with a track record (3, 2 or Off, set by an admin in the Assistant's Settings) and a second person's approval (two for a service account). They are recertified every 90 days and lowered at once.
  - A run reads its trigger's records (failing controls, high open risks, evidence waiting for review or rejected, open questionnaires, or weekly figures). The model drafts a note for the records' owners, and the note is sent as an in-app notice once approved.
  - Two governed MCP grants replace the demonstration's labels: "Selvara workspace (read)" (no run without it) and "Selvara notices" (nothing is sent without it). Each is granted with four-eyes and revoked at once.
  - Deleting or lowering an agent withdraws its pending requests. A run's change cannot be approved after its agent was deleted or AI was turned off.
  - Agents run on Run now. Scheduled triggers need a scheduler (a Vercel cron in `vercel.json`, which needs the owner's approval).
- **AI governance.** Everything is in the company's own log, not the platform's.
  - A draft EU AI Act classification is a proposal beside the class in force. Only an admin or owner other than the drafter and the system owner confirms it, and only the draft they saw.
  - Confirming may tighten the guardrail, never loosen it. A guardrail must match the class: Prohibited needs Blocked, high-risk needs Restricted or above.
  - Completing a review needs a confirmed class, an approved impact assessment for a high-risk system and no failing bias test. A new review of an approved system needs a reason. Archived systems are read-only.
  - Returning an assessment needs a reason. Approving keeps the recorded status.
  - Evidence is a link to a real evidence record. Obligations are judged from what is recorded.
  - Signals become real risks and issues (with `risk.created` and `issue.created`, the system owner, a due date). Dismissing one needs a reason. Discovered (shadow) AI starts empty until a discovery source is connected (group 7).
  - The analyst cannot open the module (`roles.json`), so production registration is admin and owner only.
- **API keys.**
  - Keys are `sel_<company code>_<key id>_<secret>`, generated on the server and stored only as an HMAC. They are shown once and expire after 30, 90 or 365 days.
  - A key acts for the admin who created it and stops when that person is no longer an active admin.
  - A read key is issued at once. A read/write key needs a second admin and is generated only when the requester opens it, within 60 minutes of the approval. If it is not opened in time it expires unissued (audited).
  - Keys are accepted by the company API: `GET /api/v1/{controls,risks,issues,policies,vendors,evidence,ai-systems}` and, for read/write keys, `POST /api/v1/events`. The API is limited to 600 calls an hour per key and never uses the session cookie.
- **Webhooks.**
  - Signed (HMAC-SHA256 over timestamp and body) with a per-endpoint secret, stored encrypted and shown once to the requester after a second admin approves.
  - Delivery is https on port 443 only. Every resolved address must be public, and the connection is pinned to the checked address. Redirects are never followed, the timeout is 3 seconds, and network errors and 5xx responses get one retry. Every delivery is logged and failures are audited.
  - Events are raised from the company's audit entries after the change commits: `control.failed`, `audit.completed`, `risk.updated`, `evidence.updated`, `policy.published`, `access.revoked`, `issue.created`. A delivery carries the event, the action and the record ids, never the audit text.
  - A paused webhook delivers nothing, tests included. Deleting a pending webhook withdraws its approval.
- **Custom tests.** A test reads the events pushed for its target: the newest event's status gives Pass, Fail or No data. "On push" tests run as events arrive; the others when due, the next time the page is opened.
- **Open decisions for the owner.**
  - Owners cannot open the Assistant (`roles.json`). A service-account agent's raise or recertification needs two approvers besides the requester and creator, so a company needs at least three or four admins for it.
  - Agent schedules need a Vercel cron (`vercel.json`).
  - The company API returns records as the admin sees them, owner names included. Minimising them is a product choice.

### Group 7 decisions (Integrations)

Where the inventory (`inventory/group7-integrations.md`, sections 4, 5 and 7) left a choice, production does the following.

- **Connectors.** Only the five read-only connectors the owner chose exist in production: GitHub (a GitHub App), AWS (a role in the company's account, assumed with an external id), Okta (a service app), Microsoft Entra ID (Selvara's multi-tenant app) and Google Workspace (Selvara's service account with domain-wide delegation). The demonstration's seven sample connectors are not shown.
- **Credentials.**
  - Platform credentials are set once by the owner as Vercel variables (`SUPABASE.md` section 4f). A connector whose credentials are missing says so and cannot be set up.
  - A company admin never enters a password or token. They enter identifiers only: the installation id, role ARN and region, Okta domain and client id, Entra tenant id, or Google admin account.
  - Selvara generates the per-company values: the AWS external id (confused-deputy protection) and, for Okta, a key pair whose private key is sealed (AES-256-GCM) and never shown.
  - Okta domains must be Okta-hosted, and every other host is fixed, so no company value can point the server at another address. Redirects are not followed.
- **Connecting.** One small read tests the connection. A second admin then approves it (`integration.connect`, 24 h), because it brings employee data in. A failed test is audited and nothing is requested.
- **Syncs.**
  - A sync reads only what its checks need, outside any database transaction. It runs on demand (one sync per connection every 5 minutes), and automatically once a day when an admin opens Integrations. There is no scheduler without a Vercel cron (`vercel.json`, needs the owner's approval).
  - Results are automated tests in Controls (`AT-…`), recorded by System in the same way a person records one. Linked controls follow them, and `control.failed` webhooks fire.
  - A failed sync, or a check the provider no longer answers, turns the test to Needs data, never a stale Pass. A refused credential shows as "Credential refused" and admins are told.
  - An admin links a check to the controls it evidences.
- **What is checked.**
  - GitHub: organisation 2FA required, members with 2FA off, default branch protection (first 60 repositories), critical and high Dependabot alerts older than 30 days, open secret-scanning alerts.
  - AWS (SecurityAudit): root MFA, password policy length, IAM console users without MFA, access keys older than 90 days, a multi-region CloudTrail trail, account-level S3 Block Public Access.
  - Okta, Entra ID and Google: MFA for active accounts and administrators, accounts unused for 90 days (not Entra: sign-in activity needs more access), an Entra Conditional Access policy requiring MFA.
  - Identity providers also flag accounts of people removed in Selvara that are still active in the provider.
- **Personal data.**
  - Stored per account: name, email, status, MFA yes or no, admin yes or no, last sign-in day. Accounts are matched to members by email.
  - The account list is visible to admins only. Check items name at most 20 accounts as evidence.
  - Disconnecting needs a reason, erases the account list and the sealed key, and turns the tests to Needs data. The admin is told to remove Selvara's access on the provider side.
- **Discovery.** AI applications people use (Okta and Entra apps, Google apps people authorised, GitHub Apps on the organisation) become Discovered AI in AI governance. Applications whose name matches a vendor appear in that vendor's "Discovered applications".
- **Not built (decisions for the owner).**
  - Access-review populations and People device posture from connectors.
  - A ticketing or training connector (not among the four).
  - GitHub repository content scanning (it would need read access to source code).
  - Scheduled syncs (needs a Vercel cron).
  - The provider permission lists are written from documentation known at build time and must be verified with each provider before use.

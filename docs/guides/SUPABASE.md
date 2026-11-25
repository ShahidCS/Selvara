# Supabase setup (production authentication)

Selvara's production sign-in runs in its own server routes (`front-end/src/pages/api`, code in `front-end/src/server`). Supabase provides two things behind them:

- **Supabase Auth** holds identities, password hashes and authenticator (TOTP) factors.
- **Supabase Postgres** holds Selvara's own controls: profiles and approvals, sessions, alerts, recovery codes, passkeys, lockout and network-blocking counters, and the append-only audit log.

The browser never talks to Supabase. It talks to `/api` with a Secure, HttpOnly, SameSite=Strict session cookie. The rules and the API contract are in [CONTROLS.md](../security/CONTROLS.md).

Decisions so far (2026-11):
- Supabase Auth sits behind our API.
- Region: Frankfurt (eu-central-1).
- Two projects, staging and production, on the Free plan.
- Supabase's built-in email for now.

> **Never paste keys into chat, issues or the repository.** The service-role key bypasses every database rule. It belongs only in Vercel's encrypted environment variables.

## 1. Create the projects (you)

1. In the Supabase dashboard, create two projects: `selvara-staging` and `selvara-production`.
   - Region: **Central EU (Frankfurt)**.
   - Use a strong database password and keep it in your password manager.
2. For each project, note these values under Project Settings → API:
   - **Project URL** (not secret)
   - **anon public key** (not secret, but keep it to Vercel)
   - **service_role key** (SECRET)

## 2. Create the tables (you, or `supabase db push`)

In **each** project (staging and production separately), open SQL Editor → New query and run these files in order, each as a whole:

1. [`supabase/migrations/0001_selvara_auth.sql`](../../supabase/migrations/0001_selvara_auth.sql): the tables and their rules.
2. [`supabase/migrations/0002_service_role_grants.sql`](../../supabase/migrations/0002_service_role_grants.sql): table access for the server's role only. Some projects do not grant it automatically, and every request then fails.
3. [`supabase/migrations/0003_tenancy_foundation.sql`](../../supabase/migrations/0003_tenancy_foundation.sql): companies, memberships, approvals, elevation, the hash-chained audit log, and the `selvara_app` database role bound by row level security ([design](../architecture/BACKEND_FOUNDATION.md)).
4. [`supabase/migrations/0004_company_sessions.sql`](../../supabase/migrations/0004_company_sessions.sql): per-company sign-in settings, joining a company by its code, platform staff, and the `bootstrap_company` function for the first company (section 5b).
5. [`supabase/migrations/0005_team_changes.sql`](../../supabase/migrations/0005_team_changes.sql) (from v0.1.10): invitations, the `add_company_admin` function (section 5c), and it **drops the old `profiles.role` column** (roles come from memberships and platform staff since 0004). Run it just before you deploy v0.1.10: v0.1.10 refuses a database without it, and v0.1.9 cannot add new people once the column is gone.

6. [`supabase/migrations/0006_platform_console.sql`](../../supabase/migrations/0006_platform_console.sql) (from v0.1.11): the Admin Console. Company creation, suspension and reactivation through a second platform super admin's approval, one elevation at a time, and the platform audit log check. The database itself refuses these changes unless the caller is an active platform super admin with a live elevation. Run it just before you deploy v0.1.11 (v0.1.11 refuses a database without it; v0.1.10 keeps working with it).

7. [`supabase/migrations/0007_support_access.sql`](../../supabase/migrations/0007_support_access.sql) (from v0.1.12): support access. A company admin gives Selvara support a read-only grant (8 hours at most, revocable) in Team & Rules, Support access; platform staff then open a support session in that company (reason, ticket, 60 minutes at most) from Customers & Usage, Support access. The database shows a company to platform staff only during such a session, refuses every platform write to company data, and writes the session and each view to the company's own audit log. Run it just before you deploy v0.1.12 (v0.1.12 refuses a database without it; v0.1.11 keeps working with it).

8. [`supabase/migrations/0008_workspace_records.sql`](../../supabase/migrations/0008_workspace_records.sql) (production programme, group 1, from v0.2.0): the workspace modules' records (Frameworks, Controls and Tests, Evidence; later groups add theirs), one row per record, walled off per company by row level security, never deleted (a removed record keeps its row), read-only to platform staff. Evidence **files** are not stored in the database but in Supabase Storage (section 4d). Run it with the release that needs schema version 8.
9. [`supabase/migrations/0009_company_audit_verify.sql`](../../supabase/migrations/0009_company_audit_verify.sql) (production programme, group 5, from v0.2.0): lets a company admin verify their own company's audit chain from the workspace Audit log. Run it with the release that needs schema version 9.
10. [`supabase/migrations/0010_platform_records.sql`](../../supabase/migrations/0010_platform_records.sql) (production programme, group 8a, from v0.2.0): the platform's own records for the Admin Console billing ledger, exchange rates and tax, and invoice numbers. Only an elevated platform super admin (or the verified payment webhook, for payments) may write them; a company reads only its own billing rows. Schema version 10.
11. [`supabase/migrations/0011_help_questions.sql`](../../supabase/migrations/0011_help_questions.sql) (reference review R4, from v0.2.5): questions to Selvara support from the Help centre. A company member reads only their own questions; platform staff read and answer every question in the Admin Console (Customers, Support questions). Nothing is deleted, and messages are never changed. Run it just before you deploy v0.2.5 (v0.2.5 refuses a database without it). Schema version 11.

All are safe to run again. **Run them in the project whose reference matches `SUPABASE_URL` in Vercel** (the reference is in the dashboard address, `supabase.com/dashboard/project/<ref>`): running them in the other project is the most common setup mistake. To check, `select max(version) from public.schema_version;` returns `11` (v0.2.5).

Supabase may warn that a script contains destructive operations: the `drop ... if exists` lines only remove the script's own triggers and policies to recreate them. No data is deleted.

The script:
- creates the tables;
- turns row level security on with no policies, so only the service key can read or write;
- makes the audit log append-only.

## 3. Auth settings (you, per project)

| Where | Setting |
|---|---|
| Authentication → Sign In / Providers → Email | Email provider **on**; **Confirm email on** (unconfirmed users cannot sign in: Selvara confirms a person when a company admin approves the request to join); **Allow new users to sign up off** (Selvara creates users itself) |
| Authentication → Multi-Factor | **TOTP (App Authenticator) enabled**. Leave phone off (no SMS factors). |
| Authentication → URL Configuration | Site URL: your Vercel URL for that environment. Redirect URLs: add `<site>/login`. |
| Authentication → Policies (passwords) | Minimum length **12**. Leaked-password protection is **Pro only**; until then Selvara's own common-password check applies. |
| Authentication → Emails | Built-in email for now. **Limits:** it delivers only to members of your Supabase organisation, at 2 emails per hour. So password-reset emails to real users will not arrive. This is fine for staging; production needs your own SMTP provider (Authentication → SMTP Settings). |

## 4. Vercel environment variables (you)

Set these in Vercel → Project → Settings → Environment Variables. Use the **staging** project's values for Preview and the **production** project's values for Production.

| Name | Value | Secret |
|---|---|---|
| `SUPABASE_URL` | Project URL | no |
| `SUPABASE_ANON_KEY` | anon public key | treat as private |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **yes** |
| `SITE_URL` | the deployment's address, for example `https://selvara.example.com` (its origin is checked on every write, and it is the passkey relying party) | no |
| `SERVER_SECRET` | 48 random bytes, for example from `openssl rand -base64 48` (encrypts sign-in tickets) | **yes** |

Without all five, and from v0.1.8 also `DATABASE_URL` and `DATABASE_CA_CERT` (section 4b), `/api` answers 503 and the public demonstration is unaffected.

Also set Vercel → Settings → Functions → **Function Region** to **Frankfurt (fra1)**, next to the database (EU processing, low latency). Check: the `x-vercel-id` response header contains `fra1`.

### 4b. Database connection (you, per project; required from v0.1.8)

From v0.1.8 the API needs this too: a person's company and role come from their membership, which the server reads as `selvara_app`, a role that row level security binds to the signed-in person's company. Without `DATABASE_URL` the whole API answers 503.

1. **Give the role a login.** Create a long random password on your own machine with `openssl rand -hex 32` (hex, because `+`, `/` and `=` from base64 break the connection string). In SQL Editor → New query, run `alter role selvara_app with login password 'PASTE-YOUR-HEX-PASSWORD-HERE';` with your password between the quotes (no angle brackets), then clear the query (replace it with `select 1;` and run that) and delete it if it was saved, so the password is not kept there.
2. **Connection string.** Supabase → **Connect** → **Transaction pooler** (port 6543). Copy it exactly as shown (the host looks like `aws-0-eu-central-1.pooler.supabase.com`), then change two things and nothing else: the user from `postgres.<ref>` to **`selvara_app.<ref>`** (keep the dot and your ref), and `[YOUR-PASSWORD]` to your password, without the brackets. Do not add `sslmode`; the server always verifies TLS. Never use the `postgres` user here: it bypasses row level security.
3. **CA certificate.** Project Settings → **Database** → **SSL Configuration** → **Download certificate**. Open the file and copy its whole text (from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`).
4. In Vercel, for the matching environment:

| Name | Value | Secret |
|---|---|---|
| `DATABASE_URL` | the connection string from step 2 | **yes** |
| `DATABASE_CA_CERT` | the certificate text from step 3 (public, but keep it with the URL) | no |

5. Deploy (re-run the Production job), then check: `curl https://<site>/api/system/ready` answers `{"ready":true}`.

### 4c. Switch the app to live data (API mode; you, per environment, from v0.1.9)

The site is built by GitHub Actions, not by Vercel, so a `NEXT_PUBLIC_API_MODE` variable in Vercel has **no effect**. The switch is a GitHub environment variable:

1. Check first: 4b works (`/api/system/ready` answers `{"ready":true}`), your company exists (5b), and you can sign in through the API.
2. GitHub → **Settings** → **Environments** → `production` → **Environment variables** → **Add variable**: name `API_MODE`, value `http`.
3. Deploy: push the next release tag, or re-run the **Production** job of the latest release (the build runs again with the new value).

What changes: the sign-in page uses your real account (no demo accounts), and only modules with a server API are shown (decision D4). Since v0.2.0 every workspace module has one, so each role sees all the modules its role allows, as in the demonstration; **Your account** is there for everyone. Platform staff get the Admin Console (Customers & Usage, Billing, Elevated Access for super admins, and the Admin Audit Log). To go back to the demonstration, set `API_MODE` to `mock` (or delete it) and deploy again.

### 4d. File storage: the `evidence` bucket (you, per project; required from v0.2.0)

One **private** Supabase Storage bucket holds every file Selvara stores: evidence attachments, Trust Center documents, questionnaire knowledge-base documents and files that vendors upload in the vendor portal. Only the server reaches it, with the service key it already has. Nothing in it is public: a download is a signed link valid for 60 seconds, served as an attachment, and each download is recorded in the company's audit log.

**Step 1. Open Storage in the right project.** Sign in to the Supabase dashboard and open the project whose reference matches `SUPABASE_URL` in Vercel for this environment (the reference is in the address, `supabase.com/dashboard/project/<ref>`). In the left menu choose **Storage**.

**Step 2. Create the bucket.** Choose **New bucket** and fill in:

| Field | Value |
|---|---|
| Name | `evidence` (lower case; you can choose another name, but then use the same name in step 4) |
| Public bucket | **Off**. Never turn it on: a public bucket serves every company's files to anyone with the path |
| Restrict file size (under additional configuration) | On, `4` MB. Selvara refuses larger files first; this is a second check |
| Allowed MIME types (under additional configuration) | On, and paste the list below |

```text
application/pdf, image/png, image/jpeg, text/plain, text/csv, text/markdown, application/json, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

This is the list Selvara itself accepts (`.pdf`, `.png`, `.jpg`/`.jpeg`, `.txt`, `.csv`, `.md`, `.json`, `.docx`, `.xlsx`). Selvara also checks that each file's content matches its extension before storing it. Choose **Save** (or **Create bucket**).

**Step 3. Leave the policies empty.** In Storage, **Policies**, the `evidence` bucket must have **no** policies for the `anon` or `authenticated` roles. The browser never talks to Storage directly; the server uses the service role, which does not need a policy. If the dashboard offers a policy template, decline it.

**Step 4. Tell Selvara the bucket's name.** In Vercel, open the project, then **Settings**, **Environment Variables**, **Add**:

| Name | Value | Environments | Sensitive |
|---|---|---|---|
| `EVIDENCE_BUCKET` | `evidence` | Production (and Preview with the staging project's own bucket) | no, it is not a secret |

**Step 5. Redeploy.** Variables apply to new deployments only. In GitHub, **Actions**, open the latest **Release** run and choose **Re-run jobs**, then **Re-run all jobs** (the Production job waits for its reviewer if the environment has one). You can set several variables first and redeploy once.

**Step 6. Check it.** Sign in as a company admin or an employee who can add evidence. In **Evidence**, open an item, attach a small PDF, then download it.
- The file appears with its name and size, and the download starts.
- In Supabase Storage the `evidence` bucket shows a folder named after the company's id, and inside it a folder named after the evidence item.
- In the workspace **Audit log** you see the upload and the download.

**If it does not work**

| What you see | Fix |
|---|---|
| "File storage is not configured yet" | `EVIDENCE_BUCKET` is not set for this environment, or the deployment predates it: set it and redeploy |
| 500, and the Vercel log line `api.error` with step `storage.upload` and "Bucket not found" | The bucket name differs from `EVIDENCE_BUCKET` (names are case-sensitive), or the bucket is in the other project |
| `storage.upload` with "mime type ... is not supported" or "exceeded the maximum allowed size" | The bucket's allowed MIME types or size limit are narrower than the list above: correct them in the bucket's settings |
| `storage.upload` with 403 or "new row violates row-level security policy" | `SUPABASE_SERVICE_ROLE_KEY` holds the publishable key instead of the secret one |
| `storage.sign` when downloading | The file was removed from the bucket by hand. Do not delete files in the dashboard; delete evidence in Selvara (it needs a second admin's approval) |

**Where files are kept.** Each path starts with the company's id, so one company's files never share a folder with another's:
- `<company>/<evidence id>/<random id>.<ext>`: evidence attachments;
- `<company>/TRUST/<random id>.<ext>`: Trust Center documents;
- `<company>/KB/<random id>.<ext>`: questionnaire knowledge-base documents;
- `<company>/vendor-q/<questionnaire>/<question>-<random>.<ext>`: vendor portal uploads.

Deleting evidence (after the second admin's approval) deletes its files and keeps a tombstone with each file's name and SHA-256. Until the bucket is set up, everything else in Selvara works; only attaching files says it is not configured.

### 4e. AI (you, per project; production programme group 6; optional)

The AI Assistant and agents call Claude from the server. Without a key, every company's AI stays unavailable and the screens say so; nothing else changes.

1. Create an API key in the Anthropic Console for your organisation (a workspace for Selvara is a good idea, with a spend limit).
2. Vercel → the project → **Settings** → **Environment Variables**: name `ANTHROPIC_API_KEY`, the key as the value, **Sensitive**, for the environment of this project. Never put it in the repository or a browser variable (`NEXT_PUBLIC_...`).
3. Optional: `SELVARA_AI_MODEL` to use another Claude model than `claude-opus-5-5`.
4. Redeploy. AI stays off for each company until one of its admins asks to turn it on and a second admin approves (AI Assistant → Settings).

Anthropic does not train models on API requests under its commercial terms. Check that your agreement with Anthropic and your own privacy notice cover sending company records to it before turning AI on for real customers.

### 4f. Integrations (you, per project; production programme group 7; optional, per provider)

Each connector needs credentials that Selvara's operator creates once in the provider and stores as **Sensitive** Vercel variables. A connector without them says "not set up" in Integrations; the others work. Companies never enter passwords or tokens: they install, consent or create a role on their side and enter identifiers.

| Connector | Create (in the provider) | Vercel variables |
|---|---|---|
| GitHub | A public GitHub App (installable by other organisations). Permissions, all read-only: Administration, Metadata, Dependabot alerts, Secret scanning alerts (repository); Administration, Members (organisation). No webhook. Callback URL `<SITE_URL>/ws/integrations/callback`. Generate a private key and a client secret. | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (the PEM, newlines as `\n`), `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` |
| AWS | In Selvara's own AWS account, a principal whose only permission is `sts:AssumeRole` on `arn:aws:iam::*:role/*` with the condition that the role trusts it. Companies create a role trusting it with the external id Selvara shows, and attach `SecurityAudit`. | `AWS_INTEGRATION_ACCESS_KEY_ID`, `AWS_INTEGRATION_SECRET_ACCESS_KEY`, `AWS_INTEGRATION_PRINCIPAL_ARN` |
| Microsoft Entra ID | A multi-tenant app registration with application permissions `User.Read.All`, `AuditLog.Read.All`, `RoleManagement.Read.Directory`, `Application.Read.All`, `Policy.Read.All`, a client secret, and the web redirect URI `<SITE_URL>/ws/integrations/callback` (for the sign-in that proves a tenant, and after admin consent). Client secrets expire: renew before they do. | `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` |
| Google Workspace | A service account in a Google Cloud project (Admin SDK API enabled), with a key. Companies authorise its client id for domain-wide delegation with the two read-only scopes Selvara shows. Also an OAuth client (web application, scopes `openid email`, redirect URI `<SITE_URL>/ws/integrations/callback`) for the sign-in that proves the domain. | `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_SA_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| Okta | Nothing: each company creates a service app in its own Okta with the public key Selvara generates for it. | none |

GitHub, Entra ID and Google trust one Selvara app for every customer, so a company proves its organisation with a sign-in by one of its people: Selvara takes the installation, tenant or domain from the provider's answer, and one provider tenant can be connected to one Selvara company at a time. Verify each permission list against the provider's current documentation before use. Rotating `SERVER_SECRET` makes sealed values unreadable (Okta keys, webhook secrets): reconnect Okta and re-add webhooks after a rotation.

### 4g. Card payments with Stripe (you, per project; production programme group 8a; optional)

Without these, billing works as an internal ledger and invoices are paid by bank transfer (a super admin marks them paid). With them, company admins can pay open invoices on Stripe's hosted page, and super admins can create payment links. No card data reaches Selvara.

1. In the Stripe dashboard (test mode first, in the staging project), create a **restricted key** with write access to Checkout Sessions and Refunds only (or use the secret key). Add it to Vercel as `STRIPE_SECRET_KEY` (**Sensitive**). A `_test_` key gives test mode; a `_live_` key, live mode.
2. Developers, Webhooks, **Add endpoint**: URL `<SITE_URL>/api/billing/stripe/webhook`, events `checkout.session.completed`. Copy its signing secret into Vercel as `STRIPE_WEBHOOK_SECRET` (**Sensitive**).
3. Redeploy. The Admin Console's Billing shows "Card payments: Test mode" (or Live), and the method "Card (Stripe)" can be chosen for an account.

Payments are recorded only from the webhook: its signature is checked on the raw body, each event is processed once, an event from the other mode (test or live) is refused, and a payment whose currency does not match the invoice is logged and not counted. Keep test and live keys in separate projects.

### 4h. Email (you, per project; production programme group 8b; optional)

Without these, Selvara sends no email. Links are shown to the person who creates them, the vendor portal stays closed, and the public Trust Center is read-only. With them, invitations, join outcomes, MFA reset notices, invoices, vendor questionnaires and Trust Center decisions and updates are emailed.

1. Choose **Resend** or **Postmark**. Verify a sending domain there with its SPF, DKIM and DMARC records, for example `mail.<your domain>`.
2. Add these to Vercel:
   - `MAIL_PROVIDER`: `resend` or `postmark`.
   - `MAIL_API_KEY`: the provider's API key, or the Postmark server token. Mark it **Sensitive**.
   - `MAIL_FROM`: for example `Selvara <no-reply@mail.<your domain>>`.
3. Redeploy. Invite a test person in Team & Rules: the screen says "Invitation emailed".
4. Password reset emails are sent by Supabase Auth, not by Selvara. In Supabase, Authentication, SMTP settings, enter the same provider's SMTP details so reset emails reach real users.

The provider becomes a sub-processor (record it in RoPA PA-16). Messages carry a title and a link only.

Optional, from v0.2.5: `SUPPORT_INBOX_EMAIL` (not a secret) is the address told when a company asks Selvara support a question in the Help centre. The email names the company, the question's reference and subject, and links to the Admin Console support inbox; the question itself is not included. Without it, staff see new questions in the inbox only. The person who asked is told by email when support answers, whenever email is set up.

### 4h-R. Email with Resend: the chosen set-up (owner, pending)

**Status (2026-11-25):** Resend is the chosen provider (owner decision). **Blocked until the company domain is bought**; nothing below is configured yet. Until it is, Selvara sends no email (section 4h). Do the steps in order.

**1. Resend: sending domain**
1. Resend → Domains → Add Domain. Use a subdomain such as `mail.<your-domain>` (keeps Selvara's sending reputation apart from normal company mail). Pick the region nearest the users.
2. At the DNS provider, add the records Resend shows: MX and TXT (SPF) on `send.mail.<your-domain>`, TXT (DKIM) on `resend._domainkey.mail.<your-domain>`. If the domain has no DMARC record yet, add TXT on `_dmarc.<your-domain>`: `v=DMARC1; p=none; rua=mailto:<a mailbox you read>`; move to `p=quarantine` once mail flows cleanly.
3. Verify DNS Records; wait for **Verified**.

**2. Resend: three API keys**, each with permission **Sending access** restricted to that one domain, so each can be revoked alone:

| Key name | Used by |
|---|---|
| `selvara-production` | Vercel `MAIL_API_KEY`, Production |
| `selvara-staging` | Vercel `MAIL_API_KEY`, Preview (staging) |
| `selvara-supabase-smtp` | Supabase custom SMTP, both projects |

A key is shown once: paste it straight into Vercel or Supabase, never into chat, a commit, an issue or a file.

**3. Vercel → Project → Settings → Environment Variables**

| Name | Value | Environments | Sensitive |
|---|---|---|---|
| `MAIL_PROVIDER` | `resend` | Production, Preview | no |
| `MAIL_API_KEY` | `selvara-production` key | Production only | **yes** |
| `MAIL_API_KEY` | `selvara-staging` key | Preview only | **yes** |
| `MAIL_FROM` | `Selvara <no-reply@mail.<your-domain>>` (must be on the verified domain) | Production, Preview | no |
| `SUPPORT_INBOX_EMAIL` (optional) | address told about new Help centre questions | Production | no |

**4. Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP** (production project and `selvara-staging`). Password-reset emails come from Supabase, not from Selvara's API.
Host `smtp.resend.com`, port `465`, username `resend`, password the `selvara-supabase-smtp` key, sender `no-reply@mail.<your-domain>`, sender name `Selvara`.

**5. Take effect and test.** Vercel variables apply to new deployments only; do not use Vercel's Redeploy button (it deploys outside the gates).
1. Staging first: move `staging` forward or run Deploy staging (Actions). On the live preview, invite a test person in Team & Rules with a mailbox you own: the screen says "Invitation emailed" and the mail arrives from the `MAIL_FROM` address. Try "Forgot password" for the Supabase path.
2. Production picks the variables up with the next signed release tag.

**6. Records.** Resend becomes a sub-processor: replace the placeholder "email delivery provider" recipient in RoPA PA-16 (`front-end/src/data/platform.json`) with Resend, its region and transfer basis, for review by the compliance or privacy lead. Note which key is used where (names only, never values).

### 4i. Live staging preview (you, once; optional)

The `staging` branch deploys a **demo** preview always, and a **live** preview (the production build on the real server) once this is set up. The live preview uses the **staging** Supabase project from section 1, never production, and holds synthetic data only.

1. Run sections 2, 3, 4b, 4d (and 4h for email, in sandbox or test mode) against the `selvara-staging` project.
2. Vercel → Project → Settings → Environment Variables: give every variable from sections 4 and 4b to 4h the **staging** project's values, with only **Preview** ticked. Set `SITE_URL` to the live preview's address, `https://` plus `STAGING_ALIAS`; that origin is checked on every write and is the passkey relying party. Preview values reach every preview deployment, the demo one too, which does not use them.
3. GitHub → Settings → Environments → `staging` → Variables: `STAGING_ALIAS` (the hostname, assigned to the Vercel project as a domain). Then GitHub → Settings → Secrets and variables → Actions → **Variables** tab → **Repository variables**: `STAGING_LIVE_ENABLED` = `true`. It must be a repository variable: the live job checks it before entering the `staging` environment, so a value stored on the environment is never seen and the job stays skipped.
4. Move the staging branch (docs/security/PIPELINE.md, "Staging branch and previews") and open the live preview: sign in with a staging account from section 5.

Run each new migration on staging **before** production, then test the release on the live preview before tagging it.

## 5. First accounts (you, per project)

Requests to join need a company admin to approve them, so create the first admin by hand (5a), then their company (5b).

**In every SQL statement in this guide, replace the example values with your own, keep the single quotes, and type no angle brackets `< >`.** Whatever is between the quotes is stored exactly as typed: a name typed as `<Sam>` is shown as `<Sam>`. (From v0.1.10 the join form refuses names with `<`, `>`, braces or double quotes.)

1. In Authentication → Users → Add user, add the person with **Auto Confirm** on and a strong temporary password.
2. Copy their user id (it looks like `3f2c9a1e-…`), then in SQL Editor run, with your own values:

```sql
insert into public.profiles (id, email, person, status, requested_ms)
values ('3f2c9a1e-0000-4000-8000-000000000000', 'sam.admin@yourcompany.example', 'Sam Admin', 'Active', (extract(epoch from now()) * 1000)::bigint);
```

Type the email exactly as Supabase shows it under Authentication → Users, in lower case: sign-in needs the profile's email to match the login's email. (Before 0005 the profile also had a `role` column; it is not used any more and 0005 removes it.)

**A platform super admin** is a separate account from any company admin, with its own email address (platform staff can never be a member of a company). Create it as above, then also run, with the same user id:

```sql
insert into public.platform_staff (user_id, role, created_ms)
values ('3f2c9a1e-0000-4000-8000-000000000000', 'super', (extract(epoch from now()) * 1000)::bigint);
```

Their first sign-in asks them to add a passkey. Everyone else adds an authenticator app at their first sign-in. From v0.1.11 a platform super admin lands on the Admin Console (Customers & Usage, Elevated Access, Admin Audit Log). Creating, suspending or reactivating a company needs a **second** platform super admin to approve, so create two (each with their own email, passkey and `platform_staff` row). Until then, create companies with `bootstrap_company` (5b). A `support` row instead of `super` gives a read-only Admin Console account.

**To correct a name** that was stored wrongly: `update public.profiles set person = 'Sam Admin' where email = 'sam.admin@yourcompany.example';` and reload the page.

### 5b. The first company (you, once per company, from v0.1.8)

From v0.1.8 a person works inside a company, with the role their membership there gives them, and someone with no active membership cannot sign in. Create the company and make its first admin in one step (it fails safely if the code is taken, the email has no active profile, or the person is platform staff):

```sql
select public.bootstrap_company('acme-eu', 'Acme Europe Ltd', 'sam.admin@yourcompany.example');
```

- **Company code**: 3 to 40 lower-case letters, digits and hyphens, for example `acme-eu`. People type it when they ask to join, so the admin shares it with their colleagues. It is not a secret, but the join form answers the same whether or not a code exists.
- **Admin email**: the email of an active profile from 5a.

Check: `select t.ref, t.name, m.role, m.status from public.memberships m join public.tenants t on t.id = m.tenant_id;` shows the admin as `admin`, `Active`. Do this **before** deploying v0.1.8 to that environment, or the admin cannot sign in.

### 5c. A second company admin (you, once, from v0.1.10)

Granting or inviting an admin or owner needs a second admin's approval, so a company with one admin cannot add a second one through the app. Once that person is an active member (they joined, or accepted an invitation, as an Employee), make them an admin in SQL Editor:

```sql
select public.add_company_admin('acme-eu', 'second.admin@yourcompany.example');
```

It refuses a person who is not an active member of that company and platform staff, and writes `member.role.changed` to the company's audit log as "Platform owner". From then on the two admins approve each other's privileged changes in Team & Rules → Requests.

## Troubleshooting

Check the API with `curl -i -X POST https://<site>/api/auth/challenge -H "Origin: https://<site>" -H "Content-Type: application/json" -d '{}'` (the origin must equal `SITE_URL`). A 200 with a `seed` means the server reaches Supabase.

| Answer | Meaning |
|---|---|
| 503 | A variable from section 4 is missing for this environment, or the deployment predates it (variables apply to new deployments only). |
| 403 "Cross-site request refused." | The `Origin` differs from `SITE_URL`. |
| 500 | Supabase refused or failed. Open Vercel → Project → **Logs**, filter for `api.error`. Each line names the route, the failing `step` (for example `db.kv` or `auth.create-user`), Supabase's `code` and `status`, and the `requestId` that matches the response's `x-vercel-id` header. It never contains keys, tokens, request bodies or email addresses. |

Common codes in that line:

| Code or message | Fix |
|---|---|
| `42P01` relation does not exist, or `PGRST205` table not in the schema cache | Run the migrations in this project (section 2). If they already ran, run `notify pgrst, 'reload schema';`. |
| `42501` permission denied | Run `0002_service_role_grants.sql`; check that `SUPABASE_SERVICE_ROLE_KEY` holds the secret key, not the publishable one. |
| status 401, "Invalid API key" | A key is from the other project, truncated, or swapped between the two variables. |
| "fetch failed" with no code | `SUPABASE_URL` is wrong (it must be `https://<ref>.supabase.co`), or the project is paused. |

Database connection (`GET /api/system/ready`):

| Answer | Meaning |
|---|---|
| 503 "The server is not configured." | From v0.1.8: `DATABASE_URL` is missing, or `DATABASE_CA_CERT` is missing for a remote database |
| 503 "The database is not ready." | See the `api.error` line and the table below |

| `api.error` step and code | Fix |
|---|---|
| `db.connect` · `EINVAL` or `ENOTFOUND` | The host in `DATABASE_URL` is wrong: copy it exactly from **Connect** → **Transaction pooler** |
| `db.connect` · `28P01` for user `"postgres"` | The user part is still `postgres.<ref>`: change it to `selvara_app.<ref>` |
| `db.connect` · `28P01` for user `"selvara_app"` | The password differs from the one set with `alter role selvara_app ... password`: set it again |
| `db.connect` · `XX000` "Tenant or user not found" | The user is not `selvara_app.<ref>` with this project's ref |
| `db.connect` · `SELF_SIGNED_CERT_IN_CHAIN` or `UNABLE_TO_GET_ISSUER_CERT` | `DATABASE_CA_CERT` is not this project's full certificate text |
| `db.schema` · `SCHEMA_OUTDATED` | Run the missing migrations in this project |

Sign-in answers 409 "not an active member of any company": run section 5b for this person's company, or approve their request to join.

## 6. Before real customer data

| Item | Why |
|---|---|
| **Pro plan for production** | The Free plan has no backups, pauses after 7 days without activity, and has no leaked-password protection. A regulated customer will ask about backups and availability. |
| **Your own SMTP** (Resend, Postmark, Amazon SES or Microsoft 365) | Built-in email reaches only your Supabase team, at 2 emails per hour. |
| **Data processing agreement and security report** | Sign Supabase's DPA. Supabase's SOC 2 report is offered on higher plans, so check which plan you need for your vendor-risk file. |
| **File storage, email and a production reviewer** | The `evidence` bucket (4d) holds every uploaded file; email (4h) is needed for password resets to reach real users; a required reviewer on the GitHub `production` environment makes each production deploy wait for approval. |
| **Human security review** | Review `front-end/src/server` and the migrations before go-live: all generated code, configuration and security controls need technical, security and management review. |

## What I need from you

You don't need to send anything secret. Tell me when you have:

1. created both projects and run the SQL;
2. set the variables from sections 4 and 4b in Vercel for Preview (staging);
3. created one company admin in staging.

I can then help you test the staging `/api` end to end (sign-in, authenticator, reset, join approval) without using any keys myself.

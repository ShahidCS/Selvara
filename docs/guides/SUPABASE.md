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

7. [`supabase/migrations/0007_support_access.sql`](../../supabase/migrations/0007_support_access.sql) (from v0.1.12): support access. A company admin gives Selvara support a read-only grant (8 hours at most, revocable) in Team & Settings, Support access; platform staff then open a support session in that company (reason, ticket, 60 minutes at most) from Customers & Usage, Support access. The database shows a company to platform staff only during such a session, refuses every platform write to company data, and writes the session and each view to the company's own audit log. Run it just before you deploy v0.1.12 (v0.1.12 refuses a database without it; v0.1.11 keeps working with it).

8. [`supabase/migrations/0008_workspace_records.sql`](../../supabase/migrations/0008_workspace_records.sql) (production programme, group 1): the workspace modules' records (Frameworks, Controls and Tests, Evidence; later groups add theirs), one row per record, walled off per company by row level security, never deleted (a removed record keeps its row), read-only to platform staff. Evidence **files** are not stored in the database but in Supabase Storage (section 4d). Run it with the release that needs schema version 8.
9. [`supabase/migrations/0009_company_audit_verify.sql`](../../supabase/migrations/0009_company_audit_verify.sql) (production programme, group 5): lets a company admin verify their own company's audit chain from the workspace Audit log. Run it with the release that needs schema version 9.

All are safe to run again. **Run them in the project whose reference matches `SUPABASE_URL` in Vercel** (the reference is in the dashboard address, `supabase.com/dashboard/project/<ref>`): running them in the other project is the most common setup mistake. To check, `select max(version) from public.schema_version;` returns `8`.

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

What changes: the sign-in page uses your real account (no demo accounts), and only modules with a server API are shown (decision D4). Today that is **Team & Settings** for company admins (members and their roles, invitations, requests to join, the second-admin requests, account lockout), **Frameworks**, **Controls & Tests**, **Evidence**, **Policies**, **People**, **Access** and **My workspace** for the roles that have them (production programme groups 1 and 2), and **Your account** for everyone; roles with none of these land on Your account. Each further module appears when its server slice ships. From v0.1.11 platform staff get the Admin Console: Customers & Usage, Elevated Access (super admins only) and the Admin Audit Log. To go back to the demonstration, set `API_MODE` to `mock` (or delete it) and deploy again.

### 4d. Evidence file storage (you, per project; production programme group 1)

Evidence files are kept in a **private** Supabase Storage bucket that only the server reaches (with the service key it already has). Nothing is public: downloads are links valid for 60 seconds, sent as a download, and each download is recorded in the company's audit log.

1. Supabase → **Storage** → **New bucket**: name `evidence`, **Public bucket: off**. Optional limits on the bucket: file size limit `4 MB`; allowed MIME types `application/pdf, image/png, image/jpeg, text/plain, text/csv, text/markdown, application/json, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Selvara checks the same list, and the file's content, before storing it).
2. Do **not** add storage policies for the `anon` or `authenticated` roles: the browser never talks to Storage directly.
3. Vercel → the project → **Settings** → **Environment Variables**: name `EVIDENCE_BUCKET`, value `evidence` (not a secret), for the environment of this project. Redeploy.

Until this is done, attaching a file says "File storage is not configured yet"; everything else in Evidence works. Files are stored under the company's id (`<company>/<evidence id>/<random id>.<ext>`); deleting evidence (after the second admin's approval) deletes its files and keeps a tombstone with each file's name and SHA-256.

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

It refuses a person who is not an active member of that company and platform staff, and writes `member.role.changed` to the company's audit log as "Platform owner". From then on the two admins approve each other's privileged changes in Team & Settings → Requests.

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
| **The remaining module APIs** | Authentication, companies, join requests, lockout settings and the member list are on the server; the other modules are not yet. |
| **Human security review** | Review `front-end/src/server` before go-live. |

## What I need from you

You don't need to send anything secret. Tell me when you have:

1. created both projects and run the SQL;
2. set the variables from sections 4 and 4b in Vercel for Preview (staging);
3. created one company admin in staging.

I can then help you test the staging `/api` end to end (sign-in, authenticator, reset, join approval) without using any keys myself.

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

Open SQL Editor → New query, paste [`supabase/migrations/0001_selvara_auth.sql`](../../supabase/migrations/0001_selvara_auth.sql) and run it. Do this once per project.

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

Without all five, `/api` answers 503 and the public demonstration is unaffected.

**Do not set `NEXT_PUBLIC_API_MODE=http` yet.** That switch moves the whole app to the API, and only authentication exists on the server so far. The other modules (controls, risks, policies and so on) still need their APIs. Until then, keep the demonstration mode and test `/api` directly against staging.

## 5. First accounts (you, per project)

Requests to join need a company admin to approve them, so create the first admins by hand.

1. In Authentication → Users → Add user, add the person with **Auto Confirm** on and a strong temporary password.
2. Copy their user id, then in SQL Editor run:

```sql
insert into public.profiles (id, email, person, role, status, requested_ms)
values ('<user id>', '<email>', '<Full Name>', 'admin', 'Active', (extract(epoch from now()) * 1000)::bigint);
```

Use `'super'` instead of `'admin'` for a platform super admin. Their first sign-in asks them to add a passkey. Everyone else adds an authenticator app at their first sign-in.

## 6. Before real customer data

| Item | Why |
|---|---|
| **Pro plan for production** | The Free plan has no backups, pauses after 7 days without activity, and has no leaked-password protection. A regulated customer will ask about backups and availability. |
| **Your own SMTP** (Resend, Postmark, Amazon SES or Microsoft 365) | Built-in email reaches only your Supabase team, at 2 emails per hour. |
| **Data processing agreement and security report** | Sign Supabase's DPA. Supabase's SOC 2 report is offered on higher plans, so check which plan you need for your vendor-risk file. |
| **The remaining module APIs** | Only authentication is on the server today. |
| **Human security review** | Review `front-end/src/server` before go-live. |

## What I need from you

You don't need to send anything secret. Tell me when you have:

1. created both projects and run the SQL;
2. set the five variables in Vercel for Preview (staging);
3. created one company admin in staging.

I can then help you test the staging `/api` end to end (sign-in, authenticator, reset, join approval) without using any keys myself.

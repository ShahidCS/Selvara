-- Selvara authentication controls on Supabase (Postgres). Identities, passwords and TOTP factors live in Supabase Auth (auth.users, auth.mfa_*);
-- these tables hold Selvara's own controls. Only the server reaches them, with the service key: row level security is ON with no policies, so the
-- public (anon) key and signed-in browsers can read or write nothing here. Times are milliseconds since the epoch (bigint).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  person text not null,
  role text not null default 'employee' check (role in ('super','super2','support','admin','admin2','owner','owner2','employee','auditor','analyst','vendor','viewer')),
  status text not null check (status in ('Pending','Active','Rejected')),
  requested_ms bigint not null,
  decided_by text,
  reason text
);
create table if not exists public.kv (ns text not null, key text not null, value jsonb not null, expires_ms bigint, primary key (ns, key));
create index if not exists kv_expires on public.kv (expires_ms) where expires_ms is not null;
create table if not exists public.sessions (
  id_hash text primary key,          -- SHA-256 of the cookie value; the cookie itself is never stored
  user_id uuid not null references public.profiles (id) on delete cascade,
  device text not null, ip text not null,
  created_ms bigint not null, last_seen_ms bigint not null, expires_ms bigint not null,
  revoked_ms bigint, revoked_why text
);
create index if not exists sessions_user on public.sessions (user_id);
create table if not exists public.notices (id text primary key, user_id uuid not null references public.profiles (id) on delete cascade, at_ms bigint not null, text text not null);
create index if not exists notices_user on public.notices (user_id, at_ms desc);
create table if not exists public.passkeys (id text primary key, user_id uuid not null references public.profiles (id) on delete cascade, public_key text not null, sign_count bigint not null default 0, created_ms bigint not null, label text not null);
create table if not exists public.recovery_codes (user_id uuid not null references public.profiles (id) on delete cascade, salt text not null, hash text not null, used_ms bigint, primary key (user_id, hash));
create table if not exists public.audit_log (
  seq bigserial primary key, at_ms bigint not null, actor text not null, action text not null, target text not null, cat text not null,
  space text not null check (space in ('ws','admin')), ip text not null
);

-- The audit log is append-only: no update or delete, for anyone (retention purges run as a separate, reviewed job with its own role).
create or replace function public.audit_log_append_only() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change before update or delete on public.audit_log for each row execute function public.audit_log_append_only();

alter table public.profiles enable row level security;
alter table public.kv enable row level security;
alter table public.sessions enable row level security;
alter table public.notices enable row level security;
alter table public.passkeys enable row level security;
alter table public.recovery_codes enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles, public.kv, public.sessions, public.notices, public.passkeys, public.recovery_codes, public.audit_log from anon, authenticated;

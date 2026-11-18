-- Backend foundation, slice 1 (design: docs/architecture/BACKEND_FOUNDATION.md). Companies (tenants), memberships, platform staff, elevation,
-- the four-eyes approvals engine, delegations, a per-tenant hash-chained audit log, and a database role for the application server that is
-- bound by row level security. Run after 0001 and 0002, in each project. Safe to run more than once.
--
-- After running it, the owner gives the application role a login (never stored in the repository):
--   alter role selvara_app with login password '<a long random password>';
-- and sets DATABASE_URL in Vercel (docs/guides/SUPABASE.md).

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Schema version: the server refuses to run against an older database (fails closed with a clear log line).
create table if not exists public.schema_version (version int primary key, name text not null, applied_ms bigint not null);
insert into public.schema_version (version, name, applied_ms) values
  (1, '0001_selvara_auth', (extract(epoch from now()) * 1000)::bigint),
  (2, '0002_service_role_grants', (extract(epoch from now()) * 1000)::bigint),
  (3, '0003_tenancy_foundation', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The application server's role. NOBYPASSRLS: every row it touches passes the policies below. NOINHERIT and no login until the owner sets
-- a password. It cannot create objects and has only the grants listed at the end of this file.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'selvara_app') then create role selvara_app nologin noinherit nobypassrls nocreatedb nocreaterole; end if;
end $$;

-- Request context, set by the server at the start of every transaction with set_config(..., true) (transaction-local). Unset means: no tenant,
-- no user, not platform, so the policies return nothing.
create or replace function public.app_tenant() returns uuid language sql stable as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
create or replace function public.app_user() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
create or replace function public.app_platform() returns boolean language sql stable as $$ select coalesce(current_setting('app.platform', true), '') = 'on' $$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Companies, people and roles. Times are milliseconds since the epoch (bigint), as in 0001.
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                                   -- the id people see, e.g. cust-101
  name text not null,
  region text not null default 'EU',
  status text not null default 'Active' check (status in ('Active','Suspended','Closed')),
  plan text,
  created_ms bigint not null
);
create table if not exists public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin','owner','analyst','employee','auditor','vendor','viewer')),
  status text not null check (status in ('Pending','Active','Suspended','Removed')),
  invited_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  reason text,
  created_ms bigint not null,
  decided_ms bigint,
  primary key (tenant_id, user_id)
);
create index if not exists memberships_user on public.memberships (user_id);
create table if not exists public.platform_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('super','support')),
  status text not null default 'Active' check (status in ('Active','Suspended')),
  created_ms bigint not null
);
-- Elevated sessions for platform staff: reason, ticket, 60 minutes at most. A tenant id means access to that company's workspace.
create table if not exists public.elevations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  tenant_id uuid references public.tenants (id),
  reason text not null check (length(reason) >= 15),
  ticket text not null check (length(ticket) >= 3),
  started_ms bigint not null,
  expires_ms bigint not null,
  ended_ms bigint,
  check (expires_ms > started_ms and expires_ms - started_ms <= 3600000)
);
create index if not exists elevations_user on public.elevations (user_id, expires_ms desc);

-- Sessions (0001) are bound to one active company.
alter table public.sessions add column if not exists tenant_id uuid references public.tenants (id) on delete set null;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Four-eyes approvals (docs/security/SOD_MATRIX.md). Workspace approvals belong to a tenant; platform approvals (domain 'admin') to none.
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id),
  kind text not null,
  title text not null,
  subject_ref text,
  payload jsonb not null default '{}'::jsonb,
  needs smallint not null default 1 check (needs in (1, 2)),
  approver_roles text[] not null check (cardinality(approver_roles) > 0),
  forbid uuid[] not null default '{}',
  requested_by uuid not null references public.profiles (id),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Withdrawn','Expired')),
  created_ms bigint not null,
  expires_ms bigint not null,
  decided_reason text,
  ticket text,
  domain text not null check (domain in ('ws','admin')),
  check ((domain = 'ws' and tenant_id is not null) or (domain = 'admin' and tenant_id is null)),
  check (expires_ms > created_ms)
);
create index if not exists approvals_tenant_status on public.approvals (tenant_id, status, created_ms desc);
create table if not exists public.approval_votes (
  approval_id uuid not null references public.approvals (id) on delete cascade,
  by_user uuid not null references public.profiles (id),
  acting_for uuid references public.profiles (id),           -- delegation: the named approver this vote stands in for
  at_ms bigint not null,
  reason text not null check (length(btrim(reason)) >= 10),
  primary key (approval_id, by_user)                          -- one vote per person: the same person can never count twice
);
-- The requester can never vote on their own request, whatever the server does.
create or replace function public.approval_vote_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.approvals a where a.id = new.approval_id and (a.requested_by = new.by_user or new.by_user = any (a.forbid))) then
    raise exception 'segregation of duties: this person cannot approve this request' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists approval_vote_guard on public.approval_votes;
create trigger approval_vote_guard before insert on public.approval_votes for each row execute function public.approval_vote_guard();
create table if not exists public.delegations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  starts_ms bigint not null,
  ends_ms bigint not null,
  reason text not null check (length(btrim(reason)) >= 10),
  ended_ms bigint,
  check (from_user <> to_user),
  check (ends_ms > starts_ms and ends_ms - starts_ms <= 14 * 86400000)
);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Audit log (0001) gains the tenant, the actor's id, the request id, the lawful basis (platform log) and a SHA-256 hash chain per tenant
-- (scope 'platform' for entries without a tenant). The chain head lives in audit_chain and is locked per scope, so concurrent writers are
-- serialised and the chain order (chain_n) never has gaps or forks. The append-only trigger from 0001 still refuses update and delete.
alter table public.audit_log add column if not exists tenant_id uuid references public.tenants (id);
alter table public.audit_log add column if not exists actor_id uuid;
alter table public.audit_log add column if not exists request_id text;
alter table public.audit_log add column if not exists basis text;
alter table public.audit_log add column if not exists chain_n bigint;
alter table public.audit_log add column if not exists prev_hash text;
alter table public.audit_log add column if not exists hash text;
create unique index if not exists audit_log_chain on public.audit_log ((coalesce(tenant_id::text, 'platform')), chain_n) where chain_n is not null;
create index if not exists audit_log_tenant on public.audit_log (tenant_id, seq desc);
create table if not exists public.audit_chain (scope text primary key, n bigint not null, last_hash text not null);
alter table public.audit_chain enable row level security;

create or replace function public.audit_log_chain() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare s text := coalesce(new.tenant_id::text, 'platform'); cur bigint; prev text;
begin
  insert into public.audit_chain (scope, n, last_hash) values (s, 0, repeat('0', 64)) on conflict (scope) do nothing;
  select n, last_hash into cur, prev from public.audit_chain where scope = s for update;
  new.chain_n := cur + 1;
  new.prev_hash := prev;
  new.hash := encode(sha256(convert_to(concat_ws(chr(31), s, new.chain_n::text, new.prev_hash, new.at_ms::text, coalesce(new.actor_id::text, ''),
    new.actor, new.action, new.target, new.cat, new.space, new.ip, coalesce(new.request_id, ''), coalesce(new.basis, '')), 'UTF8')), 'hex');
  update public.audit_chain set n = new.chain_n, last_hash = new.hash where scope = s;
  return new;
end $$;
drop trigger if exists audit_log_chain on public.audit_log;
create trigger audit_log_chain before insert on public.audit_log for each row execute function public.audit_log_chain();
revoke all on function public.audit_log_chain() from public;

-- Recomputes a scope's chain; returns the first chain_n that does not verify, or null when every entry does.
create or replace function public.audit_verify(scope_name text) returns bigint language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r record; prev text := repeat('0', 64); h text;
begin
  for r in select * from public.audit_log where chain_n is not null and coalesce(tenant_id::text, 'platform') = scope_name order by chain_n loop
    h := encode(sha256(convert_to(concat_ws(chr(31), scope_name, r.chain_n::text, prev, r.at_ms::text, coalesce(r.actor_id::text, ''),
      r.actor, r.action, r.target, r.cat, r.space, r.ip, coalesce(r.request_id, ''), coalesce(r.basis, '')), 'UTF8')), 'hex');
    if r.prev_hash is distinct from prev or r.hash is distinct from h then return r.chain_n; end if;
    prev := r.hash;
  end loop;
  return null;
end $$;
revoke all on function public.audit_verify(text) from public;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Row level security. Policies apply only to selvara_app; the public roles have no grants and no policies (nothing), and the service role
-- used by the sign-in server keeps its access from 0002.
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_staff enable row level security;
alter table public.elevations enable row level security;
alter table public.approvals enable row level security;
alter table public.approval_votes enable row level security;
alter table public.delegations enable row level security;
alter table public.schema_version enable row level security;

drop policy if exists app_tenants on public.tenants;
create policy app_tenants on public.tenants to selvara_app using (id = public.app_tenant() or public.app_platform()) with check (public.app_platform());
drop policy if exists app_memberships on public.memberships;
create policy app_memberships on public.memberships to selvara_app using (tenant_id = public.app_tenant()) with check (tenant_id = public.app_tenant());
drop policy if exists app_memberships_own on public.memberships;
create policy app_memberships_own on public.memberships for select to selvara_app using (user_id = public.app_user());
drop policy if exists app_platform_staff on public.platform_staff;
create policy app_platform_staff on public.platform_staff to selvara_app using (public.app_platform() or user_id = public.app_user()) with check (public.app_platform());
drop policy if exists app_elevations on public.elevations;
create policy app_elevations on public.elevations to selvara_app using (user_id = public.app_user() or public.app_platform()) with check (user_id = public.app_user());
drop policy if exists app_approvals on public.approvals;
create policy app_approvals on public.approvals to selvara_app
  using ((tenant_id = public.app_tenant()) or (tenant_id is null and public.app_platform()))
  with check ((tenant_id = public.app_tenant()) or (tenant_id is null and public.app_platform()));
drop policy if exists app_approval_votes on public.approval_votes;
create policy app_approval_votes on public.approval_votes to selvara_app
  using (exists (select 1 from public.approvals a where a.id = approval_id)) with check (exists (select 1 from public.approvals a where a.id = approval_id) and by_user = public.app_user());
drop policy if exists app_delegations on public.delegations;
create policy app_delegations on public.delegations to selvara_app using (tenant_id = public.app_tenant()) with check (tenant_id = public.app_tenant());
drop policy if exists app_audit on public.audit_log;
create policy app_audit on public.audit_log to selvara_app
  using ((tenant_id = public.app_tenant()) or (tenant_id is null and public.app_platform()))
  with check ((tenant_id = public.app_tenant()) or (tenant_id is null and public.app_platform()));
drop policy if exists app_profiles on public.profiles;
create policy app_profiles on public.profiles for select to selvara_app using (
  id = public.app_user() or public.app_platform()
  or exists (select 1 from public.memberships m where m.user_id = profiles.id and m.tenant_id = public.app_tenant()));
drop policy if exists app_schema_version on public.schema_version;
create policy app_schema_version on public.schema_version for select to selvara_app using (true);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Grants. Deny by default: no delete anywhere (memberships, delegations and elevations end by status or time, the audit log never changes).
revoke all on public.tenants, public.memberships, public.platform_staff, public.elevations, public.approvals, public.approval_votes,
  public.delegations, public.audit_chain, public.schema_version from anon, authenticated;
grant usage on schema public to selvara_app;
grant select on public.schema_version, public.profiles to selvara_app;
grant select, insert, update on public.tenants, public.memberships, public.platform_staff, public.elevations, public.approvals, public.delegations to selvara_app;
grant select, insert on public.approval_votes, public.audit_log to selvara_app;
grant usage, select on sequence public.audit_log_seq_seq to selvara_app;
grant execute on function public.app_tenant(), public.app_user(), public.app_platform() to selvara_app;
-- The sign-in server (service role) reads memberships and staff to know a person's company and role.
grant select, insert, update on public.tenants, public.memberships, public.platform_staff, public.elevations, public.approvals, public.delegations to service_role;
grant select, insert on public.approval_votes to service_role;
grant select on public.schema_version to service_role;

notify pgrst, 'reload schema';

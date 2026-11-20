-- Admin Console, slice 3b (design: docs/architecture/BACKEND_FOUNDATION.md). Platform staff reach a company's workspace only through a
-- support grant that the company's own admin gives (read-only, 8 hours at most, revocable at any time), and only inside a support session
-- that names the company (reason, ticket, 60 minutes at most, never beyond the grant). The start and end of every session, and each thing
-- viewed, are written to that company's own audit log, so the customer sees them. Run after 0006, in each project, together with the release
-- that needs schema version 7. Safe to run more than once.
--
-- The database enforces it, whatever the server does: with the platform flag set, app_tenant() returns the company only while such a session
-- and its grant are live (so row level security shows nothing otherwise), and restrictive policies refuse every platform write to company data.

insert into public.schema_version (version, name, applied_ms) values (7, '0007_support_access', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Support grants: given and revoked by the company's admins (row level security: their company only).
create table if not exists public.support_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reason text not null check (length(btrim(reason)) >= 10 and length(reason) <= 300),
  granted_by uuid not null references public.profiles (id),
  created_ms bigint not null,
  expires_ms bigint not null,
  revoked_ms bigint,
  revoked_by uuid references public.profiles (id),
  check (expires_ms > created_ms and expires_ms - created_ms <= 8 * 3600000),
  check ((revoked_ms is null) = (revoked_by is null))
);
create index if not exists support_grants_tenant on public.support_grants (tenant_id, created_ms desc);
alter table public.support_grants enable row level security;
drop policy if exists app_support_grants on public.support_grants;
create policy app_support_grants on public.support_grants to selvara_app using (tenant_id = public.app_tenant()) with check (tenant_id = public.app_tenant());

-- A support session is an elevation that names a company and the grant behind it.
alter table public.elevations add column if not exists grant_id uuid references public.support_grants (id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'elevations_grant_with_tenant') then
    alter table public.elevations add constraint elevations_grant_with_tenant check ((grant_id is null) = (tenant_id is null));
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- True when the caller (platform staff) holds a live support session on a live grant of this active company. Runs as the table owner.
create or replace function public.app_support_live(company uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select company is not null and exists (
    select 1 from public.elevations e
      join public.support_grants g on g.id = e.grant_id and g.tenant_id = company
      join public.tenants c on c.id = company and c.status = 'Active'
      join public.platform_staff s on s.user_id = e.user_id and s.status = 'Active'
    where e.user_id = public.app_user() and e.tenant_id = company and e.ended_ms is null and e.expires_ms > public.app_now_ms()
      and g.revoked_ms is null and g.expires_ms > public.app_now_ms())
$$;
-- The request's company. For company members it is the session's company, as before. For platform staff it is the named company only while
-- they hold a live support session on a live grant of an active company; otherwise null, so every company policy shows them nothing.
-- A plain expression, so Postgres inlines it into every policy as before; the lookup above runs only for platform requests.
create or replace function public.app_tenant() returns uuid language sql stable as $$
  select case
    when not public.app_platform() then nullif(current_setting('app.tenant_id', true), '')::uuid
    when public.app_support_live(nullif(current_setting('app.tenant_id', true), '')::uuid) then nullif(current_setting('app.tenant_id', true), '')::uuid
  end
$$;

-- Read-only: platform staff never write company data directly (the functions below run as the table owner and write only the audit entries).
-- Restrictive policies are combined with AND, so they narrow the permissive ones above and in 0003 to 0005.
do $$
declare t text;
begin
  foreach t in array array['memberships', 'tenant_settings', 'invitations', 'delegations', 'support_grants'] loop
    execute format('drop policy if exists app_platform_read_only_ins on public.%I', t);
    execute format('create policy app_platform_read_only_ins on public.%I as restrictive for insert to selvara_app with check (not public.app_platform())', t);
    execute format('drop policy if exists app_platform_read_only_upd on public.%I', t);
    execute format('create policy app_platform_read_only_upd on public.%I as restrictive for update to selvara_app using (not public.app_platform())', t);
  end loop;
  foreach t in array array['approvals', 'audit_log'] loop
    execute format('drop policy if exists app_platform_read_only_ins on public.%I', t);
    execute format('create policy app_platform_read_only_ins on public.%I as restrictive for insert to selvara_app with check (tenant_id is null or not public.app_platform())', t);
    execute format('drop policy if exists app_platform_read_only_upd on public.%I', t);
    execute format('create policy app_platform_read_only_upd on public.%I as restrictive for update to selvara_app using (tenant_id is null or not public.app_platform())', t);
  end loop;
end $$;
drop policy if exists app_platform_read_only_ins on public.approval_votes;
create policy app_platform_read_only_ins on public.approval_votes as restrictive for insert to selvara_app with check (
  not public.app_platform() or exists (select 1 from public.approvals a where a.id = approval_id and a.tenant_id is null));

-- Revoking a grant ends the sessions on it at once (app_tenant() already refuses them; this closes the records too).
create or replace function public.support_grant_revoked() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.revoked_ms is not null and old.revoked_ms is null then
    update public.elevations set ended_ms = least(new.revoked_ms, expires_ms) where grant_id = new.id and ended_ms is null;
  end if;
  return new;
end $$;
drop trigger if exists support_grant_revoked on public.support_grants;
create trigger support_grant_revoked after update of revoked_ms on public.support_grants for each row execute function public.support_grant_revoked();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Live grants as platform staff see them: the company, who gave it, why, and until when.
create or replace function public.platform_support_grants()
returns table (id uuid, tenant_id uuid, ref text, name text, reason text, granted_by text, created_ms bigint, expires_ms bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if public.app_platform_role() is null then raise exception 'platform staff only' using errcode = '42501'; end if;
  return query
    select g.id, g.tenant_id, c.ref, c.name, g.reason, p.person, g.created_ms, g.expires_ms
    from public.support_grants g join public.tenants c on c.id = g.tenant_id join public.profiles p on p.id = g.granted_by
    where g.revoked_ms is null and g.expires_ms > public.app_now_ms() and c.status = 'Active'
    order by g.expires_ms limit 200;
end $$;

-- Starts a support session in a company: platform staff (super or support), a live grant, a reason, a ticket and at most 60 minutes, ending
-- no later than the grant. One live elevation of any kind per person (0006's index). Written to the company's log.
create or replace function public.platform_open_workspace(company uuid, why text, tkt text, minutes int, from_ip text)
returns table (id uuid, started_ms bigint, expires_ms bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare ms bigint := public.app_now_ms(); gid uuid; gends bigint; who text; ends bigint; eid uuid;
begin
  if public.app_platform_role() is null then raise exception 'platform staff only' using errcode = '42501'; end if;
  if length(btrim(why)) < 15 or length(why) > 300 then raise exception 'reason: 15 to 300 characters' using errcode = '22023'; end if;
  if tkt !~ '^[A-Z]{2,6}-[0-9]{1,6}$' then raise exception 'ticket: a reference such as SEC-1234' using errcode = '22023'; end if;
  if minutes is null or minutes < 1 or minutes > 60 then raise exception 'duration: 1 to 60 minutes' using errcode = '22023'; end if;
  select s.id, s.expires_ms into gid, gends from public.support_grants s join public.tenants c on c.id = s.tenant_id
    where s.tenant_id = company and s.revoked_ms is null and s.expires_ms > ms and c.status = 'Active' order by s.expires_ms desc limit 1;
  if gid is null then raise exception 'no live support grant from this company' using errcode = 'P0002'; end if;
  update public.elevations set ended_ms = expires_ms where user_id = public.app_user() and ended_ms is null and expires_ms <= ms; -- ran out: close it
  ends := least(ms + minutes * 60000, gends);
  insert into public.elevations (user_id, tenant_id, grant_id, reason, ticket, started_ms, expires_ms) values (public.app_user(), company, gid, btrim(why), tkt, ms, ends)
    returning elevations.id into eid; -- a live elevation already: unique violation (23505)
  select person into who from public.profiles where profiles.id = public.app_user();
  insert into public.audit_log (at_ms, actor, actor_id, action, target, cat, space, ip, tenant_id) values (ms, coalesce(who, 'Platform staff') || ' (Selvara platform)',
    public.app_user(), 'support.access.started', 'Read-only support session until ' || to_char(to_timestamp(ends / 1000.0) at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC; ticket ' || tkt || '; reason: ' || btrim(why),
    'Access', 'ws', left(coalesce(from_ip, 'unknown'), 64), company);
  return query select eid, ms, ends;
end $$;

-- Ends the caller's live support session, if any, and writes it to the company's log. Returns the company, or null when none was live.
create or replace function public.platform_close_workspace(note text, from_ip text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare ms bigint := public.app_now_ms(); tid uuid; tk text; who text;
begin
  if public.app_platform_role() is null then raise exception 'platform staff only' using errcode = '42501'; end if;
  update public.elevations set ended_ms = expires_ms where user_id = public.app_user() and tenant_id is not null and ended_ms is null and expires_ms <= ms;
  update public.elevations set ended_ms = ms where user_id = public.app_user() and tenant_id is not null and ended_ms is null returning tenant_id, ticket into tid, tk;
  if tid is null then return null; end if;
  select person into who from public.profiles where id = public.app_user();
  insert into public.audit_log (at_ms, actor, actor_id, action, target, cat, space, ip, tenant_id) values (ms, coalesce(who, 'Platform staff') || ' (Selvara platform)',
    public.app_user(), 'support.access.ended', 'Ticket ' || tk || '; ' || left(coalesce(note, 'ended'), 100), 'Access', 'ws', left(coalesce(from_ip, 'unknown'), 64), tid);
  return tid;
end $$;

-- Records in the company's log what a support session looked at. Only inside a live session (app_tenant() is the company).
create or replace function public.support_viewed(what text, from_ip text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t uuid := public.app_tenant(); who text;
begin
  if not public.app_platform() or t is null or public.app_platform_role() is null then raise exception 'no live support session' using errcode = '42501'; end if;
  if what not in ('members', 'settings', 'audit') then raise exception 'unknown view' using errcode = '22023'; end if;
  select person into who from public.profiles where id = public.app_user();
  insert into public.audit_log (at_ms, actor, actor_id, action, target, cat, space, ip, tenant_id) values (public.app_now_ms(), coalesce(who, 'Platform staff') || ' (Selvara platform)',
    public.app_user(), 'support.viewed', what, 'Access', 'ws', left(coalesce(from_ip, 'unknown'), 64), t);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Grants. Only the application role runs these; the Data API roles and the service role never do.
revoke all on public.support_grants from anon, authenticated;
grant select, insert, update on public.support_grants to selvara_app;
revoke all on function public.app_support_live(uuid), public.support_grant_revoked(), public.platform_support_grants(), public.platform_open_workspace(uuid, text, text, int, text),
  public.platform_close_workspace(text, text), public.support_viewed(text, text) from public, anon, authenticated, service_role;
grant execute on function public.app_support_live(uuid), public.platform_support_grants(), public.platform_open_workspace(uuid, text, text, int, text),
  public.platform_close_workspace(text, text), public.support_viewed(text, text) to selvara_app;

notify pgrst, 'reload schema';

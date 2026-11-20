-- Admin Console, slice 3a (design: docs/architecture/BACKEND_FOUNDATION.md). Companies seen from the platform, company creation and
-- suspension through the four-eyes engine (platform approvals: domain 'admin', no tenant), time-boxed elevation, and the platform audit log.
-- Run after 0005, in each project, together with the release that needs schema version 6. Safe to run more than once.
--
-- The application role reaches other companies only through the functions below. Each checks, in the database, that the caller is an active
-- platform super admin with a live elevation (reason, ticket, 60 minutes at most), so a server bug cannot skip the check. Company rows and
-- counts are visible to platform staff; members, invitations and settings of a company stay behind its row level security.

insert into public.schema_version (version, name, applied_ms) values (6, '0006_platform_console', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

-- One live elevation per person: a second insert while one is running fails.
create unique index if not exists elevations_one_live on public.elevations (user_id) where ended_ms is null;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Helpers for the functions below. The request context (app.user_id, app.platform) is set by the server per transaction (0003).
create or replace function public.app_now_ms() returns bigint language sql stable as $$ select (extract(epoch from now()) * 1000)::bigint $$;
create or replace function public.app_platform_role() returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.platform_staff where user_id = public.app_user() and status = 'Active' and public.app_platform()
$$;
-- True when the caller is an active platform super admin with a live, unexpired elevation.
create or replace function public.app_elevated_super() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.app_platform_role() = 'super' and exists (
    select 1 from public.elevations e where e.user_id = public.app_user() and e.tenant_id is null and e.ended_ms is null
      and e.started_ms <= public.app_now_ms() and e.expires_ms > public.app_now_ms())
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Companies as platform staff see them: no member names, only counts.
create or replace function public.platform_companies()
returns table (id uuid, ref text, name text, status text, created_ms bigint, members bigint, admins bigint, pending_invites bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.app_platform_role() is null then raise exception 'platform staff only' using errcode = '42501'; end if;
  return query
    select t.id, t.ref, t.name, t.status, t.created_ms,
      (select count(*) from public.memberships m where m.tenant_id = t.id and m.status = 'Active'),
      (select count(*) from public.memberships m where m.tenant_id = t.id and m.status = 'Active' and m.role = 'admin'),
      (select count(*) from public.invitations i where i.tenant_id = t.id and i.status = 'Pending' and i.expires_ms > public.app_now_ms())
    from public.tenants t order by t.name, t.ref limit 1000;
end $$;

-- Creates an approved company: the company, its settings, and a pending admin invitation (no link yet; an elevated super admin creates it).
-- Called in the transaction that records the approving vote.
create or replace function public.platform_create_company(company_ref text, company_name text, admin_email text, requested_by uuid, approval uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare r text := lower(btrim(company_ref)); n text := btrim(company_name); e text := lower(btrim(admin_email)); tid uuid; ms bigint := public.app_now_ms();
begin
  if not public.app_elevated_super() then raise exception 'an elevated platform super admin is required' using errcode = '42501'; end if;
  if r !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'company code: 3 to 40 characters, lower-case letters, digits and hyphens' using errcode = '22023'; end if;
  if length(n) < 2 or length(n) > 120 then raise exception 'company name: 2 to 120 characters' using errcode = '22023'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 254 then raise exception 'admin email is not valid' using errcode = '22023'; end if;
  if exists (select 1 from public.tenants where ref = r) then raise exception 'company code % is taken', r using errcode = '23505'; end if;
  if exists (select 1 from public.platform_staff s join public.profiles p on p.id = s.user_id where p.email = e) then
    raise exception 'platform staff cannot be a company admin' using errcode = '22023'; end if;
  insert into public.tenants (ref, name, created_ms) values (r, n, ms) returning id into tid;
  insert into public.tenant_settings (tenant_id, updated_ms) values (tid, ms);
  insert into public.invitations (tenant_id, email, role, invited_by, approval_id, created_ms, expires_ms) values (tid, e, 'admin', requested_by, approval, ms, ms + 72 * 3600000);
  insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id) values (ms, 'Platform', 'tenant.created', r || ': ' || n || '; first admin invited: ' || e, 'Access', 'ws', 'database', tid);
  return tid;
end $$;

-- Suspends or reactivates a company. Suspension ends every member's access at their next request (sessions check the company's status).
-- The company's own log records it, so the customer can see what the platform did.
create or replace function public.platform_set_company_status(company uuid, new_status text, why text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare prev text; r text; ms bigint := public.app_now_ms();
begin
  if not public.app_elevated_super() then raise exception 'an elevated platform super admin is required' using errcode = '42501'; end if;
  if new_status not in ('Active', 'Suspended') then raise exception 'status must be Active or Suspended' using errcode = '22023'; end if;
  select status, ref into prev, r from public.tenants where id = company for update;
  if prev is null or prev = 'Closed' or prev = new_status then return false; end if;
  update public.tenants set status = new_status where id = company;
  insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id)
  values (ms, 'Platform', case when new_status = 'Suspended' then 'tenant.suspended' else 'tenant.reactivated' end, r || '; reason: ' || left(why, 300), 'Access', 'ws', 'database', company);
  return true;
end $$;

-- Sets the link of a company's pending admin invitation (one created with the company). Returns the invited email and expiry, or nothing.
create or replace function public.platform_admin_invite_link(company uuid, token_sha256 text)
returns table (email text, expires_ms bigint) language plpgsql security definer set search_path = public, pg_temp as $$
declare ms bigint := public.app_now_ms();
begin
  if not public.app_elevated_super() then raise exception 'an elevated platform super admin is required' using errcode = '42501'; end if;
  if token_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'bad token hash' using errcode = '22023'; end if;
  return query
    update public.invitations i set token_hash = token_sha256, link_ms = ms
    where i.tenant_id = company and i.role = 'admin' and i.status = 'Pending' and i.expires_ms > ms and i.approval_id is not null
      and i.approval_id in (select a.id from public.approvals a where a.domain = 'admin' and a.kind = 'platform-company-create')
    returning i.email, i.expires_ms;
end $$;

-- Verifies the platform audit chain (0003's audit_verify, for the platform scope only). Null means every entry verifies.
create or replace function public.platform_audit_verify() returns bigint language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.app_platform_role() is null then raise exception 'platform staff only' using errcode = '42501'; end if;
  return public.audit_verify('platform');
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Grants. Only the application role runs these; the Data API roles and the service role never do.
revoke all on function public.app_now_ms(), public.app_platform_role(), public.app_elevated_super(), public.platform_companies(),
  public.platform_create_company(text, text, text, uuid, uuid), public.platform_set_company_status(uuid, text, text),
  public.platform_admin_invite_link(uuid, text), public.platform_audit_verify() from public, anon, authenticated, service_role;
grant execute on function public.app_now_ms(), public.app_platform_role(), public.app_elevated_super(), public.platform_companies(),
  public.platform_create_company(text, text, text, uuid, uuid), public.platform_set_company_status(uuid, text, text),
  public.platform_admin_invite_link(uuid, text), public.platform_audit_verify() to selvara_app;

notify pgrst, 'reload schema';

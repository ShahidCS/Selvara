-- Backend foundation, slice 2a (design: docs/architecture/BACKEND_FOUNDATION.md). Sessions belong to one company and roles come from
-- memberships: per-company sign-in settings, the companies a person may choose from, joining a company by its code, the platform staff taken
-- from the old global roles, and a one-off function the owner runs to create the first company. Run after 0003, in each project. Safe to run
-- more than once.
--
-- After running it, the owner creates the first company and makes themselves its admin (docs/guides/SUPABASE.md section 5b):
--   select public.bootstrap_company('acme-eu', 'Acme Europe Ltd', 'your.sign-in@yourcompany.example')  -- your own values, no angle brackets;

insert into public.schema_version (version, name, applied_ms) values (4, '0004_company_sessions', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Per-company sign-in settings (the account lockout preset). Before this they were one global setting that any company's admin could change.
create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  lockout jsonb not null default '{"preset":"standard"}'::jsonb,
  updated_by uuid references public.profiles (id),
  updated_ms bigint not null,
  version int not null default 1
);
alter table public.tenant_settings enable row level security;
drop policy if exists app_tenant_settings on public.tenant_settings;
create policy app_tenant_settings on public.tenant_settings to selvara_app using (tenant_id = public.app_tenant()) with check (tenant_id = public.app_tenant());
-- At sign-in the company is not chosen yet: a person may read the settings of the companies they are an active member of (the strictest
-- lockout of those applies to them).
drop policy if exists app_tenant_settings_member on public.tenant_settings;
create policy app_tenant_settings_member on public.tenant_settings for select to selvara_app using (exists (
  select 1 from public.memberships m where m.tenant_id = tenant_settings.tenant_id and m.user_id = public.app_user() and m.status = 'Active'));

-- A person may see the companies they are an active member of (to choose one at sign-in and switch later), and no other company.
drop policy if exists app_tenants_member on public.tenants;
create policy app_tenants_member on public.tenants for select to selvara_app using (exists (
  select 1 from public.memberships m where m.tenant_id = tenants.id and m.user_id = public.app_user() and m.status = 'Active'));

-- Joining by company code: the server resolves the code without seeing any other company's row. Only active companies resolve; the server
-- answers the same whether or not a code exists, so codes cannot be probed.
create or replace function public.tenant_id_by_ref(code text) returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.tenants where ref = lower(btrim(code)) and status = 'Active'
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Platform staff from the old global roles (profiles.role). Company roles move to memberships when the owner creates a company below.
-- (Skipped once 0005 has dropped profiles.role, so this file stays safe to run again.)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') then
    execute $q$insert into public.platform_staff (user_id, role, created_ms)
      select id, case when role in ('super', 'super2') then 'super' else 'support' end, (extract(epoch from now()) * 1000)::bigint
      from public.profiles where role in ('super', 'super2', 'support') and status = 'Active'
      on conflict (user_id) do nothing$q$;
  end if;
end $$;

-- Creates a company with its settings and makes an existing, active person its admin. For the owner, once per company, in the SQL editor
-- (it runs as the table owner). Company creation by platform staff with four-eyes approval replaces it in a later slice.
create or replace function public.bootstrap_company(company_ref text, company_name text, admin_email text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare r text := lower(btrim(company_ref)); n text := btrim(company_name); uid uuid; tid uuid; ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if r !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'company code: 3 to 40 characters, lower-case letters, digits and hyphens' using errcode = '22023'; end if;
  if length(n) < 2 or length(n) > 120 then raise exception 'company name: 2 to 120 characters' using errcode = '22023'; end if;
  if exists (select 1 from public.tenants where ref = r) then raise exception 'company code % is taken', r using errcode = '23505'; end if;
  select id into uid from public.profiles where email = lower(btrim(admin_email)) and status = 'Active';
  if uid is null then raise exception 'no active person with that email: sign in once first' using errcode = '22023'; end if;
  if exists (select 1 from public.platform_staff where user_id = uid) then raise exception 'platform staff cannot be a company admin' using errcode = '22023'; end if;
  insert into public.tenants (ref, name, created_ms) values (r, n, ms) returning id into tid;
  insert into public.tenant_settings (tenant_id, updated_ms) values (tid, ms);
  insert into public.memberships (tenant_id, user_id, role, status, reason, created_ms, decided_ms) values (tid, uid, 'admin', 'Active', 'First admin, created by the platform owner', ms, ms);
  insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id) values (ms, 'Platform owner', 'tenant.created', r || ': ' || n, 'Access', 'ws', 'database', tid);
  return tid;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Grants. Supabase grants EXECUTE on new functions to anon and authenticated by default, which would expose them through the Data API, so
-- every function is revoked from them explicitly (0003's audit_verify too).
revoke all on function public.tenant_id_by_ref(text) from public, anon, authenticated;
revoke all on function public.bootstrap_company(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.audit_verify(text) from public, anon, authenticated;
revoke all on function public.app_tenant(), public.app_user(), public.app_platform() from anon, authenticated;
revoke all on public.tenant_settings from anon, authenticated;
grant execute on function public.tenant_id_by_ref(text) to selvara_app;
grant select, insert, update on public.tenant_settings to selvara_app;
grant select, insert, update on public.tenant_settings to service_role;

notify pgrst, 'reload schema';

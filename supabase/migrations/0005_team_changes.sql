-- Backend foundation, slice 2c (design: docs/architecture/BACKEND_FOUNDATION.md). Role changes and invitations inside a company, through the
-- server's four-eyes engine (the approvals tables from 0003): invitations with a single-use link, a one-off function the owner runs to add a
-- second company admin, and the old global role column on profiles is dropped (roles come from memberships and platform_staff since 0004).
-- Run after 0004, in each project, together with the release that needs schema version 5. Safe to run more than once.
--
-- A company with a single admin cannot grant an admin or owner role (a second admin must approve it). To add the second admin, the owner runs,
-- in the SQL editor, with plain values (no angle brackets):
--   select public.add_company_admin('acme', 'second.admin@acme.example');

insert into public.schema_version (version, name, applied_ms) values (5, '0005_team_changes', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Invitations. The link carries a random token; only its SHA-256 is stored, so the database never holds a usable link. An invitation lasts 72
-- hours and is used once. An admin or owner invitation exists only after a second admin approved it (approval_id).
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  role text not null check (role in ('admin','owner','analyst','employee','auditor','vendor','viewer')),
  status text not null default 'Pending' check (status in ('Pending','Accepted','Revoked','Expired')),
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references public.profiles (id),
  approval_id uuid references public.approvals (id),
  created_ms bigint not null,
  expires_ms bigint not null,
  link_ms bigint,
  decided_ms bigint,
  accepted_by uuid references public.profiles (id),
  check (expires_ms > created_ms)
);
create unique index if not exists invitations_one_pending on public.invitations (tenant_id, email) where status = 'Pending';
create index if not exists invitations_tenant on public.invitations (tenant_id, created_ms desc);
alter table public.invitations enable row level security;
drop policy if exists app_invitations on public.invitations;
create policy app_invitations on public.invitations to selvara_app using (tenant_id = public.app_tenant()) with check (tenant_id = public.app_tenant());

-- The join form brings a token, not a company: the server finds the invitation by the token's hash without seeing any other invitation.
create or replace function public.invitation_by_token(token_sha256 text) returns table (id uuid, tenant_id uuid, email text, role text, expires_ms bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id, i.tenant_id, i.email, i.role, i.expires_ms from public.invitations i join public.tenants t on t.id = i.tenant_id
  where i.token_hash = token_sha256 and i.status = 'Pending' and t.status = 'Active'
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Adds an admin to a company whose only admin cannot get a second admin's approval. For the owner, in the SQL editor (it runs as the table
-- owner). The person must already be an active member (they joined and were approved). The Admin Console replaces this in a later slice.
create or replace function public.add_company_admin(company_ref text, member_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid; uid uuid; who text; prev text; ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select id into tid from public.tenants where ref = lower(btrim(company_ref)) and status = 'Active';
  if tid is null then raise exception 'no active company with that code' using errcode = '22023'; end if;
  select id, person into uid, who from public.profiles where email = lower(btrim(member_email)) and status = 'Active';
  if uid is null then raise exception 'no active person with that email' using errcode = '22023'; end if;
  if exists (select 1 from public.platform_staff where user_id = uid) then raise exception 'platform staff cannot be a company admin' using errcode = '22023'; end if;
  select role into prev from public.memberships where tenant_id = tid and user_id = uid and status = 'Active';
  if prev is null then raise exception 'that person is not an active member of this company: they request to join first' using errcode = '22023'; end if;
  if prev = 'admin' then return; end if;
  update public.memberships set role = 'admin', decided_ms = ms, reason = 'Second admin, added by the platform owner' where tenant_id = tid and user_id = uid;
  insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id) values (ms, 'Platform owner', 'member.role.changed', who || ': ' || prev || ' → admin (added by the platform owner)', 'Access', 'ws', 'database', tid);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- profiles.role (0001) was the global role before companies existed. Nothing reads it since 0004: company roles are memberships, platform roles
-- are platform_staff. Dropping it stops anyone mistaking it for the source of access.
alter table public.profiles drop column if exists role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Grants (functions revoked from the Data API roles, as in 0004).
revoke all on public.invitations from anon, authenticated;
revoke all on function public.invitation_by_token(text) from public, anon, authenticated;
revoke all on function public.add_company_admin(text, text) from public, anon, authenticated, service_role;
grant select, insert, update on public.invitations to selvara_app;
grant execute on function public.invitation_by_token(text) to selvara_app;

notify pgrst, 'reload schema';

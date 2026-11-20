-- Production programme, group 8 (docs/architecture/PRODUCTION_PROGRAMME.md): platform-owned records for the Admin Console's billing ledger,
-- exchange rates and tax, and the platform's own counters (invoice numbers). Platform staff may never write company rows (0007, 0008), so
-- billing lives here, owned by the platform; a company reads only its own rows (its billing account, invoices and payments). Run after 0009,
-- in each project. Safe to run more than once.
--
-- Who may write, checked by the database (the server checks the same and more):
--   - an active platform super admin with a live elevation (app_elevated_super, 0006);
--   - the server's verified payment-provider webhook (app.system = 'billing-webhook', platform flag on, no person), only payments and
--     provider events, after the server verified the provider's signature;
--   - a company admin's own billing requests (a plan change or a payment started), only through company_billing_request below.
-- Nothing is ever deleted: a removed record keeps its row with deleted_ms set.

insert into public.schema_version (version, name, applied_ms) values (10, '0010_platform_records', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

create table if not exists public.platform_records (
  kind text not null check (kind ~ '^[a-z][a-z0-9.-]{1,39}$'),
  id text not null check (length(id) between 1 and 80),
  tenant_id uuid references public.tenants (id) on delete restrict, -- the company a record belongs to (null: platform-wide, e.g. a rate)
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1048576),
  version int not null default 1 check (version >= 1),
  created_ms bigint not null,
  updated_ms bigint not null,
  updated_by uuid references public.profiles (id),
  deleted_ms bigint,
  primary key (kind, id)
);
create index if not exists platform_records_kind on public.platform_records (kind) where deleted_ms is null;
create index if not exists platform_records_tenant on public.platform_records (tenant_id, kind) where deleted_ms is null and tenant_id is not null;

create table if not exists public.platform_counters (
  kind text primary key check (kind ~ '^[a-z][a-z0-9.-]{1,39}$'),
  n bigint not null default 0
);

create or replace function public.app_system() returns text language sql stable as $$ select coalesce(current_setting('app.system', true), '') $$;
-- The webhook may write only what a provider confirms: payments and the provider's events (deduplication).
create or replace function public.app_billing_webhook_kind(k text) returns boolean language sql immutable as $$ select k in ('billing-entry', 'billing-provider-event', 'billing-invoice') $$;

alter table public.platform_records enable row level security;
alter table public.platform_counters enable row level security;
drop policy if exists app_platform_records_read on public.platform_records;
create policy app_platform_records_read on public.platform_records for select to selvara_app
  using (public.app_platform() or (tenant_id is not null and tenant_id = public.app_tenant()) or (kind = 'billing-price' and public.app_user() is not null)); -- the price list is the same for every company
drop policy if exists app_platform_records_ins on public.platform_records;
create policy app_platform_records_ins on public.platform_records for insert to selvara_app
  with check (public.app_elevated_super() or (public.app_platform() and public.app_system() = 'billing-webhook' and public.app_billing_webhook_kind(kind)));
drop policy if exists app_platform_records_upd on public.platform_records;
create policy app_platform_records_upd on public.platform_records for update to selvara_app
  using (public.app_elevated_super() or (public.app_platform() and public.app_system() = 'billing-webhook' and public.app_billing_webhook_kind(kind)))
  with check (public.app_elevated_super() or (public.app_platform() and public.app_system() = 'billing-webhook' and public.app_billing_webhook_kind(kind)));
drop policy if exists app_platform_counters on public.platform_counters;
create policy app_platform_counters on public.platform_counters to selvara_app
  using (public.app_platform()) with check (public.app_elevated_super() or (public.app_platform() and public.app_system() = 'billing-webhook'));

-- A record's kind, id and company never change, a removed record is never brought back, and versions increase by one.
create or replace function public.platform_records_guard() returns trigger language plpgsql as $$
begin
  if new.kind <> old.kind or new.id <> old.id or new.tenant_id is distinct from old.tenant_id then raise exception 'a record keeps its kind, id and company' using errcode = '42501'; end if;
  if old.deleted_ms is not null then raise exception 'a removed record cannot be changed' using errcode = '42501'; end if;
  if new.version <> old.version + 1 then raise exception 'version must increase by one' using errcode = '40001'; end if;
  return new;
end $$;
drop trigger if exists platform_records_guard on public.platform_records;
create trigger platform_records_guard before update on public.platform_records for each row execute function public.platform_records_guard();
revoke all on function public.platform_records_guard() from public;

-- A company admin's billing request (a plan change for the next cycle, a payment started with the provider): written for the session's own
-- company only, by one of its active admins, into a fixed kind. The platform decides what happens next.
create or replace function public.company_billing_request(p_id text, p_kind text, p_data jsonb, p_at bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t uuid := public.app_tenant();
begin
  if t is null or public.app_platform() or not exists (
    select 1 from public.memberships m where m.tenant_id = t and m.user_id = public.app_user() and m.status = 'Active' and m.role = 'admin'
  ) then raise exception 'company admins only' using errcode = '42501'; end if;
  if p_kind not in ('billing-plan-request', 'billing-checkout') then raise exception 'unknown request' using errcode = '22023'; end if;
  insert into public.platform_records (kind, id, tenant_id, data, created_ms, updated_ms, updated_by)
  values (p_kind, p_id, t, p_data, p_at, p_at, public.app_user());
end $$;
revoke all on function public.company_billing_request(text, text, jsonb, bigint) from public, anon, authenticated, service_role;
grant execute on function public.company_billing_request(text, text, jsonb, bigint) to selvara_app;

-- The company's own log gets an entry for a billing change the platform made to it (invoice issued, credited, paid ...), attributed to
-- "Platform", as tenant.suspended is (0006). Only an elevated super admin or the verified webhook may write it.
create or replace function public.platform_company_audit(p_tenant uuid, p_action text, p_target text, p_cat text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.app_elevated_super() or (public.app_platform() and public.app_system() = 'billing-webhook')) then raise exception 'not permitted' using errcode = '42501'; end if;
  if p_action !~ '^[a-z][a-z0-9._-]{1,79}$' then raise exception 'bad action' using errcode = '22023'; end if;
  insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id)
  values (public.app_now_ms(), 'Platform', p_action, left(p_target, 1000), left(p_cat, 40), 'ws', 'platform', p_tenant, null);
end $$;
revoke all on function public.platform_company_audit(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.platform_company_audit(uuid, text, text, text) to selvara_app;

-- Company admins as platform staff see them, for admin-level MFA resets: no other member is listed.
create or replace function public.platform_company_admins()
returns table (tenant_id uuid, ref text, company text, user_id uuid, person text, email text, role text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.app_platform_role() is null then raise exception 'platform staff only' using errcode = '42501'; end if;
  return query select t.id, t.ref, t.name, p.id, p.person, p.email, m.role from public.memberships m
    join public.tenants t on t.id = m.tenant_id join public.profiles p on p.id = m.user_id
    where m.status = 'Active' and m.role in ('admin', 'owner') and t.status <> 'Closed' order by t.name, p.person;
end $$;
revoke all on function public.platform_company_admins() from public, anon, authenticated, service_role;
grant execute on function public.platform_company_admins() to selvara_app;

revoke all on public.platform_records, public.platform_counters from anon, authenticated;
grant select, insert, update on public.platform_records, public.platform_counters to selvara_app;

notify pgrst, 'reload schema';

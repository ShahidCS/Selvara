-- Production programme, group 1 (docs/architecture/PRODUCTION_PROGRAMME.md, decision D7). The workspace modules' records, one row per record,
-- in the shapes the screens already use: frameworks state, controls, tests, evidence (and, in later groups, the other modules). Reference
-- catalogues (frameworks, requirements, the control library, templates) are not stored here: they ship with the code and are the same for every
-- company. Run after 0007, in each project. Safe to run more than once.
--
-- Isolation: row level security on app_tenant(), as for every company table. Platform staff never write here (restrictive policies, as 0007),
-- and read only inside a support session. Nothing is ever deleted: a removed record keeps its row with deleted_ms set (evidence deletion keeps a
-- tombstone), so the audit trail can always be followed.

insert into public.schema_version (version, name, applied_ms) values (8, '0008_workspace_records', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

create table if not exists public.ws_records (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9.-]{1,39}$'),
  id text not null check (length(id) between 1 and 80),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1048576),
  version int not null default 1 check (version >= 1),
  created_ms bigint not null,
  updated_ms bigint not null,
  updated_by uuid references public.profiles (id),
  deleted_ms bigint,
  primary key (tenant_id, kind, id)
);
create index if not exists ws_records_kind on public.ws_records (tenant_id, kind) where deleted_ms is null;

-- Readable ids per company and kind (EV-209, TST-07, ...), taken under a row lock so two people never get the same one.
create table if not exists public.ws_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9.-]{1,39}$'),
  n bigint not null default 0,
  primary key (tenant_id, kind)
);

alter table public.ws_records enable row level security;
alter table public.ws_counters enable row level security;
drop policy if exists app_ws_records on public.ws_records;
create policy app_ws_records on public.ws_records to selvara_app using (tenant_id = public.app_tenant()) with check (tenant_id = public.app_tenant());
drop policy if exists app_ws_counters on public.ws_counters;
create policy app_ws_counters on public.ws_counters to selvara_app using (tenant_id = public.app_tenant()) with check (tenant_id = public.app_tenant());
do $$
declare t text;
begin
  foreach t in array array['ws_records', 'ws_counters'] loop
    execute format('drop policy if exists app_platform_read_only_ins on public.%I', t);
    execute format('create policy app_platform_read_only_ins on public.%I as restrictive for insert to selvara_app with check (not public.app_platform())', t);
    execute format('drop policy if exists app_platform_read_only_upd on public.%I', t);
    execute format('create policy app_platform_read_only_upd on public.%I as restrictive for update to selvara_app using (not public.app_platform())', t);
  end loop;
end $$;

-- A record's id and kind never change, and a removed record is never brought back by an ordinary update.
create or replace function public.ws_records_guard() returns trigger language plpgsql as $$
begin
  if new.tenant_id <> old.tenant_id or new.kind <> old.kind or new.id <> old.id then raise exception 'a record keeps its company, kind and id' using errcode = '42501'; end if;
  if old.deleted_ms is not null then raise exception 'a removed record cannot be changed' using errcode = '42501'; end if;
  if new.version <> old.version + 1 then raise exception 'version must increase by one' using errcode = '40001'; end if;
  return new;
end $$;
drop trigger if exists ws_records_guard on public.ws_records;
create trigger ws_records_guard before update on public.ws_records for each row execute function public.ws_records_guard();
revoke all on function public.ws_records_guard() from public;

-- Grants: no delete (see above).
revoke all on public.ws_records, public.ws_counters from anon, authenticated;
grant select, insert, update on public.ws_records, public.ws_counters to selvara_app;

notify pgrst, 'reload schema';

-- Data retention settings and legal holds per company, on the server (EDGE-19, owner's decision 2026-11-27; the purge job that applies them
-- comes next). Run after 0015, in each project (staging first). Safe to run more than once.
--
-- tenant_settings.retention holds only what a company changed from the defaults (src/lib/retention.ts), by record kind:
--   { "<kind>": { "months": <int>, "hold": { "by", "byId", "at", "reason" } } }
-- The server checks the rules (minimums, four-eyes for shorter periods and for releasing a hold); the database keeps the value an object of
-- known kinds with sane periods.
--
-- Who may do what (unchanged): the company's admins change it through the server (tenant_settings policies of 0004); a shorter period or a
-- hold release is applied when a second admin approves (the company approvals engine, kinds team-retention and team-hold).

insert into public.schema_version (version, name, applied_ms) values (16, '0016_retention_settings', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

alter table public.tenant_settings add column if not exists retention jsonb not null default '{}'::jsonb;

create or replace function public.valid_retention(r jsonb) returns boolean language sql immutable set search_path = pg_catalog as $$
  select jsonb_typeof(r) = 'object' and not exists (
    select 1 from jsonb_each(r) as e(k, v)
    where k not in ('audit', 'evidence', 'risks', 'policies', 'issues', 'access', 'security', 'joins')
      or jsonb_typeof(v) <> 'object'
      or (v ? 'months' and (jsonb_typeof(v -> 'months') <> 'number' or (v ->> 'months')::numeric not between 1 and 240))
      or (v ? 'hold' and jsonb_typeof(v -> 'hold') <> 'object')
  )
$$;
alter table public.tenant_settings drop constraint if exists tenant_settings_retention_check;
alter table public.tenant_settings add constraint tenant_settings_retention_check check (public.valid_retention(retention));

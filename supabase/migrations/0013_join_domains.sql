-- Company email domains for requests to join (EDGE-20, owner's decision, 2026-11-26). A company may accept requests to join only from its
-- own email domains; anyone else needs an invitation. An empty list (the default) accepts any domain, as before. Run after 0012, in each
-- project (staging first). Safe to run more than once.
--
-- Who may do what (unchanged): the company's admins change it through the server (tenant_settings policies of 0004); the server reads it
-- with the company's id when a request to join names the company's code.

insert into public.schema_version (version, name, applied_ms) values (13, '0013_join_domains', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

alter table public.tenant_settings add column if not exists join_domains text[] not null default '{}';

-- At most 20 domains, each a lower-case domain name (the server checks the same and refuses public email providers). Each element is checked
-- on its own (an element cannot carry a separator).
create or replace function public.valid_join_domains(ds text[]) returns boolean language sql immutable set search_path = pg_catalog as $$
  select cardinality(ds) <= 20 and coalesce(bool_and(d ~ '^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'), true) from unnest(ds) as d
$$;
alter table public.tenant_settings drop constraint if exists tenant_settings_join_domains_check;
alter table public.tenant_settings add constraint tenant_settings_join_domains_check check (public.valid_join_domains(join_domains));

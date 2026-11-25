-- Content-Security-Policy violation reports (from v0.3.2). The browser reports what the site's CSP blocked to POST /api/csp-report; the
-- server keeps a reduced form of each report so platform staff can see, in the Admin Console (Platform Security), when something was blocked:
-- an injection attempt, or a change that broke the CSP. Run after 0011, in each project (staging first). Safe to run more than once.
--
-- What is kept (the server reduces every report before it reaches the database): the CSP directive, the blocked source reduced to its origin
-- or to inline / eval, the page path without query or fragment, the script file path and line. No IP address, no code sample, no person.
-- Identical reports are counted, not repeated. Rows not seen for 30 days are removed; at most 500 distinct rows are kept.
--
-- Who may do what, checked by the database:
--   - anyone (the endpoint takes no sign-in): only through csp_report_add(), which validates and counts;
--   - active platform staff (platform flag on): read;
--   - nobody inserts, changes or deletes rows directly.

insert into public.schema_version (version, name, applied_ms) values (12, '0012_csp_reports', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

create table if not exists public.csp_reports (
  id uuid primary key default gen_random_uuid(),
  directive text not null check (directive ~ '^[a-z][a-z-]{1,39}$'),
  blocked text not null check (length(blocked) between 1 and 200),
  page text not null check (page ~ '^/' and length(page) <= 200),
  source text not null check (length(source) <= 200),
  line integer not null check (line between 0 and 1000000),
  hits integer not null default 1 check (hits >= 1),
  first_ms bigint not null,
  last_ms bigint not null check (last_ms >= first_ms),
  unique (directive, blocked, page, source, line)
);
create index if not exists csp_reports_recent on public.csp_reports (last_ms desc);

-- Counts one reduced report. Returns 'counted' (seen before), 'stored' (new) or 'full' (500 distinct rows already: not kept).
create or replace function public.csp_report_add(p_directive text, p_blocked text, p_page text, p_source text, p_line integer, p_at bigint)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from public.csp_reports where last_ms < p_at - 30::bigint * 86400000;
  update public.csp_reports set hits = least(hits + 1, 2000000000), last_ms = greatest(last_ms, p_at)
    where directive = p_directive and blocked = p_blocked and page = p_page and source = p_source and line = p_line;
  if found then return 'counted'; end if;
  select count(*) into n from public.csp_reports;
  if n >= 500 then return 'full'; end if;
  insert into public.csp_reports (directive, blocked, page, source, line, first_ms, last_ms)
    values (p_directive, p_blocked, p_page, p_source, p_line, p_at, p_at)
    on conflict (directive, blocked, page, source, line) do update set hits = least(public.csp_reports.hits + 1, 2000000000), last_ms = greatest(public.csp_reports.last_ms, excluded.last_ms);
  return 'stored';
end $$;

alter table public.csp_reports enable row level security;
drop policy if exists app_csp_reports_read on public.csp_reports;
create policy app_csp_reports_read on public.csp_reports for select to selvara_app using (public.app_support_staff());

revoke all on public.csp_reports from anon, authenticated;
grant select on public.csp_reports to selvara_app;
revoke all on function public.csp_report_add(text, text, text, text, integer, bigint) from public, anon, authenticated, service_role;
grant execute on function public.csp_report_add(text, text, text, text, integer, bigint) to selvara_app;

notify pgrst, 'reload schema';

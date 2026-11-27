-- The retention purge job (EDGE-19 step 2; owner's decisions 2026-11-26 and 2026-11-27). Run after 0016, in each project (staging first).
-- Safe to run more than once.
--
-- A scheduled server job (Vercel Cron, protected by CRON_SECRET) calls retention_purge once a day, with no person behind it
-- (app.system = 'retention-purge', platform flag on). The database decides everything that matters, so a fault in the server cannot widen
-- what is deleted:
--   * the periods, minimums and legal holds are read here, from tenant_settings.retention (0016) and retention_defaults below, which must
--     match src/lib/retention.ts (a database test compares them);
--   * the time is the database's own clock;
--   * deleting at all needs the platform setting purge-settings/settings to say deletion = 'on', with the id of a platform request of kind
--     platform-purge-delete that was approved by a super admin other than the one who asked, and the first recorded run to be at least
--     30 days old (report-only first). Otherwise the call is refused (42501) and the server runs a report instead.
-- A kind of record under a legal hold is never touched. Every run is recorded (platform record purge-run) and in the platform's audit log;
-- every deletion is in the company's audit log, with the ids.
--
-- What is covered (DRAFT for compliance review; the age of a closed record is measured from its last change, which only keeps it longer):
--   risks     closed risks (ws_records risk, status Closed), and removed risks
--   issues    closed issues (issue, status Closed), and removed issues
--   access    completed access reviews (access-review, status Complete), and removed ones
--   evidence  removed evidence and its deletion records (evidence-tombstone); evidence in use is kept
--   policies  superseded policy versions inside a policy (by their supersededAt day), and removed policies
--   security  ended sign-in sessions (by the company the session was for), in-app notices, CSP reports
--   joins     rejected requests to join (memberships.rejected, new below) and decided or expired invitations
--   audit     COUNTED ONLY, never deleted: removing entries from a hash chain needs a checkpoint design first (owner decision open)
--   always    expired short-lived entries (kv.expires_ms in the past)
-- Files named in a deleted record (a "path" under the company's folder) are returned to the server, which removes them from storage.

insert into public.schema_version (version, name, applied_ms) values (17, '0017_retention_purge', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

-- A request to join that was rejected (not a member who was removed): only those are purged as "rejected requests to join".
alter table public.memberships add column if not exists rejected boolean not null default false;

-- The draft defaults and minimums, in months (src/lib/retention.ts RETENTION_DEFS).
create or replace function public.retention_defaults() returns table (kind text, months integer, floor integer)
language sql immutable set search_path = pg_catalog as $$
  values ('audit', 84, 60), ('evidence', 84, 60), ('risks', 84, 60), ('policies', 120, 60),
         ('issues', 36, 12), ('access', 36, 12), ('security', 12, 6), ('joins', 3, 1)
$$;

-- A company's period for a kind (never below the minimum, as resolveRetention) and whether it is held. Null tenant: the defaults.
create or replace function public.retention_of(p_tenant uuid, p_kind text, out months integer, out held boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d record; s jsonb; m numeric;
begin
  select * into d from public.retention_defaults() x where x.kind = p_kind;
  if not found then raise exception 'unknown retention kind %', p_kind using errcode = '22023'; end if;
  months := d.months; held := false;
  if p_tenant is null then return; end if;
  select retention -> p_kind into s from public.tenant_settings where tenant_id = p_tenant;
  if s is null then return; end if;
  if jsonb_typeof(s -> 'months') = 'number' then
    m := (s ->> 'months')::numeric;
    if m = trunc(m) and m >= d.floor and m <= 240 then months := m::integer; end if;
  end if;
  held := jsonb_typeof(s -> 'hold') = 'object';
end $$;

-- The time before which something of this age is past its period.
create or replace function public.retention_cutoff(now_ms bigint, months integer) returns bigint language sql immutable as $$
  select (extract(epoch from (to_timestamp(now_ms / 1000.0) - make_interval(months => months))) * 1000)::bigint
$$;

-- Why deleting is not allowed now, or null.
create or replace function public.retention_deletion_block(now_ms bigint) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s jsonb; a record; first_ms bigint;
begin
  select data into s from public.platform_records where kind = 'purge-settings' and id = 'settings' and deleted_ms is null;
  if s is null or s ->> 'deletion' is distinct from 'on' then return 'deletion is not switched on'; end if;
  select * into a from public.approvals
    where id::text = s ->> 'approvalId' and kind = 'platform-purge-delete' and domain = 'admin' and tenant_id is null and status = 'Approved';
  if not found then return 'no approved request to switch deletion on'; end if;
  if not exists (select 1 from public.approval_votes v where v.approval_id = a.id and v.by_user <> a.requested_by) then
    return 'the request was not approved by a second super admin'; end if;
  select min(created_ms) into first_ms from public.platform_records where kind = 'purge-run';
  if first_ms is null or first_ms > now_ms - 30::bigint * 86400000 then return 'the first 30 days are report-only'; end if;
  return null;
end $$;

create or replace function public.retention_purge(p_delete boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare now_ms bigint := public.app_now_ms(); blocked text; t record; k text; r record; cut bigint; n integer; ids text[];
  co jsonb; companies jsonb := '[]'::jsonb; files text[] := '{}'; due_total integer := 0; deleted_total integer := 0; kinds jsonb;
  plat jsonb; run_id text; report jsonb; held_kinds text[];
begin
  if not (public.app_platform() and public.app_system() = 'retention-purge') then
    raise exception 'only the retention purge job' using errcode = '42501'; end if;
  if p_delete then
    blocked := public.retention_deletion_block(now_ms);
    if blocked is not null then raise exception 'deletion refused: %', blocked using errcode = '42501'; end if;
  end if;
  -- one run at a time
  perform pg_advisory_xact_lock(hashtext('selvara.retention_purge'));

  for t in select id, ref, name from public.tenants order by ref loop
    kinds := '{}'::jsonb; held_kinds := '{}';
    -- workspace records: closed or removed, older than the period
    foreach k in array array['risks', 'issues', 'access', 'evidence', 'policies'] loop
      r := public.retention_of(t.id, k); cut := public.retention_cutoff(now_ms, r.months);
      if r.held then held_kinds := held_kinds || k; end if;
      select coalesce(array_agg(w.kind || ':' || w.id order by w.kind, w.id), '{}') into ids from public.ws_records w
        where w.tenant_id = t.id and (
          (k = 'risks' and w.kind = 'risk' and ((w.deleted_ms is null and w.data ->> 'status' = 'Closed' and w.updated_ms < cut) or w.deleted_ms < cut))
          or (k = 'issues' and w.kind = 'issue' and ((w.deleted_ms is null and w.data ->> 'status' = 'Closed' and w.updated_ms < cut) or w.deleted_ms < cut))
          or (k = 'access' and w.kind = 'access-review' and ((w.deleted_ms is null and w.data ->> 'status' = 'Complete' and w.updated_ms < cut) or w.deleted_ms < cut))
          or (k = 'evidence' and ((w.kind = 'evidence' and w.deleted_ms < cut) or (w.kind = 'evidence-tombstone' and w.created_ms < cut)))
          or (k = 'policies' and w.kind = 'policy' and w.deleted_ms < cut));
      n := cardinality(ids);
      -- superseded versions inside policies still in use
      if k = 'policies' then
        n := n + coalesce((select sum((select count(*) from jsonb_array_elements(w.data -> 'versions') v
              where v ->> 'status' = 'Superseded' and v ->> 'supersededAt' < to_char(to_timestamp(cut / 1000.0) at time zone 'UTC', 'YYYY-MM-DD')))
            from public.ws_records w where w.tenant_id = t.id and w.kind = 'policy' and w.deleted_ms is null and jsonb_typeof(w.data -> 'versions') = 'array'), 0);
      end if;
      kinds := kinds || jsonb_build_object(k, jsonb_build_object('months', r.months, 'held', r.held, 'due', n, 'deleted', 0));
      if r.held or n = 0 then continue; end if;
      due_total := due_total + n;
      if p_delete then
        files := files || coalesce((select array_agg(distinct p #>> '{}') from public.ws_records w, jsonb_path_query(w.data, 'lax $.**.path') p
          where w.tenant_id = t.id and (w.kind || ':' || w.id) = any (ids) and jsonb_typeof(p) = 'string' and (p #>> '{}') like t.id::text || '/%'), '{}');
        delete from public.ws_records w where w.tenant_id = t.id and (w.kind || ':' || w.id) = any (ids);
        if k = 'policies' then
          with c as (select to_char(to_timestamp(cut / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') as day)
          update public.ws_records w set
            data = jsonb_set(w.data, '{versions}', (select coalesce(jsonb_agg(v order by o), '[]'::jsonb) from jsonb_array_elements(w.data -> 'versions') with ordinality x(v, o), c
              where not (v ->> 'status' = 'Superseded' and v ->> 'supersededAt' < c.day))),
            version = w.version + 1, updated_ms = now_ms
          from c
          where w.tenant_id = t.id and w.kind = 'policy' and w.deleted_ms is null and jsonb_typeof(w.data -> 'versions') = 'array'
            and exists (select 1 from jsonb_array_elements(w.data -> 'versions') v where v ->> 'status' = 'Superseded' and v ->> 'supersededAt' < c.day);
        end if;
        kinds := jsonb_set(kinds, array[k, 'deleted'], to_jsonb(n));
        deleted_total := deleted_total + n;
        insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id)
          values (now_ms, 'System', 'retention.purged', left(k || ': ' || n || ' deleted, older than ' || r.months || ' months'
            || case when cardinality(ids) > 0 then ' (' || array_to_string(ids[1:40], ', ') || case when cardinality(ids) > 40 then ', …' else '' end || ')' else '' end, 1000),
            'Data', 'ws', 'system', t.id, null);
      end if;
    end loop;

    -- joins: rejected requests to join and decided or expired invitations
    r := public.retention_of(t.id, 'joins'); cut := public.retention_cutoff(now_ms, r.months);
    if r.held then held_kinds := held_kinds || 'joins'::text; end if;
    n := (select count(*) from public.memberships m where m.tenant_id = t.id and m.status = 'Removed' and m.rejected and m.decided_ms < cut)
       + (select count(*) from public.invitations i where i.tenant_id = t.id and coalesce(i.decided_ms, case when i.status = 'Pending' then null else i.created_ms end, i.expires_ms) < cut
            and (i.status <> 'Pending' or i.expires_ms < now_ms));
    kinds := kinds || jsonb_build_object('joins', jsonb_build_object('months', r.months, 'held', r.held, 'due', n, 'deleted', 0));
    if not r.held and n > 0 then
      due_total := due_total + n;
      if p_delete then
        delete from public.memberships m where m.tenant_id = t.id and m.status = 'Removed' and m.rejected and m.decided_ms < cut;
        delete from public.invitations i where i.tenant_id = t.id and coalesce(i.decided_ms, case when i.status = 'Pending' then null else i.created_ms end, i.expires_ms) < cut
          and (i.status <> 'Pending' or i.expires_ms < now_ms);
        kinds := jsonb_set(kinds, '{joins,deleted}', to_jsonb(n)); deleted_total := deleted_total + n;
        insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id)
          values (now_ms, 'System', 'retention.purged', 'joins: ' || n || ' rejected request(s) to join and decided invitation(s) deleted, older than ' || r.months || ' months',
            'Data', 'ws', 'system', t.id, null);
      end if;
    end if;

    -- security: ended sessions for this company
    r := public.retention_of(t.id, 'security'); cut := public.retention_cutoff(now_ms, r.months);
    if r.held then held_kinds := held_kinds || 'security'::text; end if;
    n := (select count(*) from public.sessions s where s.tenant_id = t.id and coalesce(s.revoked_ms, s.expires_ms) < cut);
    kinds := kinds || jsonb_build_object('security', jsonb_build_object('months', r.months, 'held', r.held, 'due', n, 'deleted', 0));
    if not r.held and n > 0 then
      due_total := due_total + n;
      if p_delete then
        delete from public.sessions s where s.tenant_id = t.id and coalesce(s.revoked_ms, s.expires_ms) < cut;
        kinds := jsonb_set(kinds, '{security,deleted}', to_jsonb(n)); deleted_total := deleted_total + n;
        insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id)
          values (now_ms, 'System', 'retention.purged', 'security: ' || n || ' ended sign-in session(s) deleted, older than ' || r.months || ' months', 'Data', 'ws', 'system', t.id, null);
      end if;
    end if;

    -- audit: counted only
    r := public.retention_of(t.id, 'audit'); cut := public.retention_cutoff(now_ms, r.months);
    if r.held then held_kinds := held_kinds || 'audit'::text; end if;
    kinds := kinds || jsonb_build_object('audit', jsonb_build_object('months', r.months, 'held', r.held, 'deleted', 0, 'kept', true,
      'due', (select count(*) from public.audit_log a where a.tenant_id = t.id and a.at_ms < cut)));

    companies := companies || jsonb_build_object('tenantId', t.id, 'ref', t.ref, 'name', t.name, 'held', to_jsonb(held_kinds), 'kinds', kinds);
  end loop;

  -- platform-wide: sessions with no company, notices and CSP reports (default security period, unless the person's company holds
  -- security records), and expired short-lived entries
  r := public.retention_of(null, 'security'); cut := public.retention_cutoff(now_ms, r.months);
  plat := jsonb_build_object('months', r.months,
    'sessions', (select count(*) from public.sessions s where s.tenant_id is null and coalesce(s.revoked_ms, s.expires_ms) < cut),
    'notices', (select count(*) from public.notices x where x.at_ms < cut and not exists (select 1 from public.memberships m join public.tenant_settings ts on ts.tenant_id = m.tenant_id
                 where m.user_id = x.user_id and jsonb_typeof(ts.retention -> 'security' -> 'hold') = 'object')),
    'cspReports', (select count(*) from public.csp_reports c where c.last_ms < cut),
    'expired', (select count(*) from public.kv where expires_ms is not null and expires_ms < now_ms),
    'deleted', false);
  due_total := due_total + (plat ->> 'sessions')::int + (plat ->> 'notices')::int + (plat ->> 'cspReports')::int + (plat ->> 'expired')::int;
  if p_delete then
    delete from public.sessions s where s.tenant_id is null and coalesce(s.revoked_ms, s.expires_ms) < cut;
    delete from public.notices x where x.at_ms < cut and not exists (select 1 from public.memberships m join public.tenant_settings ts on ts.tenant_id = m.tenant_id
      where m.user_id = x.user_id and jsonb_typeof(ts.retention -> 'security' -> 'hold') = 'object');
    delete from public.csp_reports c where c.last_ms < cut;
    delete from public.kv where expires_ms is not null and expires_ms < now_ms;
    plat := jsonb_set(plat, '{deleted}', 'true'::jsonb);
    deleted_total := deleted_total + (plat ->> 'sessions')::int + (plat ->> 'notices')::int + (plat ->> 'cspReports')::int + (plat ->> 'expired')::int;
  end if;

  run_id := 'PR-' || to_char(to_timestamp(now_ms / 1000.0) at time zone 'UTC', 'YYYYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 6);
  report := jsonb_build_object('id', run_id, 'at', now_ms, 'mode', case when p_delete then 'delete' else 'report' end,
    'due', due_total, 'deleted', deleted_total, 'companies', companies, 'platform', plat, 'files', cardinality(files));
  insert into public.platform_records (kind, id, tenant_id, data, version, created_ms, updated_ms, updated_by)
    values ('purge-run', run_id, null, report, 1, now_ms, now_ms, null);
  insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id)
    values (now_ms, 'System', 'retention.purge.run', run_id || ': ' || case when p_delete then 'delete' else 'report only' end || '; ' || due_total || ' past their period, '
      || deleted_total || ' deleted, ' || cardinality(files) || ' file(s) to remove', 'Data', 'admin', 'system', null, null);
  return report || jsonb_build_object('paths', to_jsonb(files));
end $$;

revoke all on function public.retention_of(uuid, text), public.retention_deletion_block(bigint), public.retention_purge(boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.retention_purge(boolean), public.retention_deletion_block(bigint) to selvara_app;

notify pgrst, 'reload schema';

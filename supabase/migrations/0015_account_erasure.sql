-- Account erasure (EDGE-19, owner's decisions 2026-11-26; docs/security/DATA_RETENTION.md section 3). Run after 0014, in each project
-- (staging first). Safe to run more than once.
--
-- The workflow (server, src/server/erasure.ts): a platform super admin asks, a second super admin approves (four-eyes), the account is
-- disabled at once and erased after 14 days, unless cancelled. erase_person does the database part of the erasure in one transaction:
--   - refuses a person who is still an active member of a company (offboard them first) or active platform staff, or already erased;
--   - removes the person from the audit log (0014's audit_redact_person: version 2 entries);
--   - replaces their name and email address in their companies' workspace records with the pseudonym and "[erased address]";
--   - deletes their sessions, passkeys, recovery codes and notices;
--   - anonymises the profile: the pseudonym as the name, a placeholder address, status Erased, the admin's decision note removed;
--   - writes privacy.erasure.completed to each affected company's log, attributed to "Platform", without the erased values.
-- The sign-in account (Supabase Auth) is emptied and banned by the server through the provider's admin API (it is not deleted: the profile
-- and records keep pointing at the id).
--
-- Who may do what: only an active platform super admin with a live elevation may run erase_person (checked here and in audit_redact_person).

insert into public.schema_version (version, name, applied_ms) values (15, '0015_account_erasure', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('Pending', 'Active', 'Rejected', 'Erased'));

create or replace function public.erase_person(subject_id uuid, pseudonym text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; esc_name text; esc_email text; esc_pseudo text; t uuid; n integer; total integer := 0; companies integer := 0; logged integer;
  now_ms bigint := public.app_now_ms();
begin
  if not public.app_elevated_super() then raise exception 'an elevated platform super admin is required' using errcode = '42501'; end if;
  if pseudonym !~ '^Former member · M-[0-9a-f]{6,16}$' then raise exception 'invalid pseudonym' using errcode = '22023'; end if;
  select id, email, person as name, status into p from public.profiles where id = subject_id for update;
  if not found then raise exception 'no such person' using errcode = 'P0002'; end if;
  if p.status = 'Erased' then raise exception 'already erased' using errcode = '55000'; end if;
  if exists (select 1 from public.memberships where user_id = subject_id and status = 'Active') then
    raise exception 'still an active member of a company: offboard first' using errcode = '55000'; end if;
  if exists (select 1 from public.platform_staff where user_id = subject_id and status = 'Active') then
    raise exception 'active platform staff: remove from staff first' using errcode = '55000'; end if;

  -- the audit log (version 2 entries; earlier entries stay, restricted, until their retention ends)
  logged := public.audit_redact_person(subject_id, array[p.name], array[p.email], pseudonym);

  -- the workspace records of every company the person belonged to (JSON-escaped forms, so the replacement stays valid JSON)
  esc_name := substr(to_json(p.name)::text, 2, length(to_json(p.name)::text) - 2);
  esc_email := substr(to_json(p.email)::text, 2, length(to_json(p.email)::text) - 2);
  esc_pseudo := substr(to_json(pseudonym)::text, 2, length(to_json(pseudonym)::text) - 2);
  for t in select distinct tenant_id from public.memberships where user_id = subject_id loop
    update public.ws_records set
      data = replace(replace(data::text, esc_email, '[erased address]'), esc_name, esc_pseudo)::jsonb,
      version = version + 1, updated_ms = now_ms
    where tenant_id = t and deleted_ms is null and length(esc_name) >= 3
      and (strpos(data::text, esc_name) > 0 or strpos(data::text, esc_email) > 0);
    get diagnostics n = row_count;
    total := total + n; companies := companies + 1;
    insert into public.audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id)
      values (now_ms, 'Platform', 'privacy.erasure.completed', pseudonym || ': ' || n || ' workspace record(s) updated', 'Access', 'ws', 'system', t, null);
  end loop;

  delete from public.sessions where user_id = subject_id;
  delete from public.passkeys where user_id = subject_id;
  delete from public.recovery_codes where user_id = subject_id;
  delete from public.notices where user_id = subject_id;
  update public.profiles set person = pseudonym, email = 'erased-' || replace(subject_id::text, '-', '') || '@erased.invalid', status = 'Erased',
    decided_by = null, reason = null where id = subject_id;

  return jsonb_build_object('auditEntries', logged, 'records', total, 'companies', companies);
end $$;

revoke all on function public.erase_person(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.erase_person(uuid, text) to selvara_app;

notify pgrst, 'reload schema';

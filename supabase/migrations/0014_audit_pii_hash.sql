-- Audit log entries that can be erased without breaking the hash chain (EDGE-19, owner's decision 2026-11-26: option B in place of
-- crypto-shredding; docs/security/DATA_RETENTION.md section 5). Run after 0013, in each project (staging first). Safe to run more than once.
--
-- Before (chain version 1, from 0003): each entry's hash covers the actor's name, the free-text target and the client address, so removing a
-- person's name from a past entry would break the chain.
-- From now on (chain version 2): those three personal fields are committed through pii_hash = SHA-256(pii_salt || actor, target, ip), with a
-- random 16-byte salt per entry, and the chain hash covers pii_hash plus the fields that are not personal (time, actor id, action, category,
-- space, request id, basis). Erasing a person (audit_redact_person, below) replaces their name with a pseudonym, removes their email
-- address and their client address, and drops the salt: the entry keeps pii_hash, so the chain still verifies, while the old values can
-- no longer be confirmed or guessed from the hash (the salt was random and is gone).
--
-- Version 1 entries (written before this migration) are unchanged and verify as before; they cannot be redacted. They stay restricted to
-- admins and auditors until their retention ends (GDPR Art. 17(3)(b) and (e)), as the policy says.
--
-- Who may do what: inserting is unchanged (the trigger computes everything). Nobody may update or delete an entry, except
-- audit_redact_person, which only an active platform super admin with a live elevation may run, and which may change only the personal
-- fields of version 2 entries (the trigger checks every other column is unchanged).

insert into public.schema_version (version, name, applied_ms) values (14, '0014_audit_pii_hash', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

alter table public.audit_log add column if not exists hash_v smallint not null default 1;
alter table public.audit_log add column if not exists pii_salt bytea;
alter table public.audit_log add column if not exists pii_hash text;
alter table public.audit_log add column if not exists redacted_ms bigint;

create or replace function public.audit_pii_hash(salt bytea, actor text, target text, ip text) returns text language sql immutable set search_path = pg_catalog as $$
  select encode(sha256(salt || convert_to(concat_ws(chr(31), actor, target, ip), 'UTF8')), 'hex')
$$;
create or replace function public.audit_hash_v2(scope_name text, n bigint, prev text, at_ms bigint, actor_id uuid, action text, cat text, space text,
  request_id text, basis text, pii_hash text) returns text language sql immutable set search_path = pg_catalog as $$
  select encode(sha256(convert_to(concat_ws(chr(31), 'v2', scope_name, n::text, prev, at_ms::text, coalesce(actor_id::text, ''), action, cat, space,
    coalesce(request_id, ''), coalesce(basis, ''), pii_hash), 'UTF8')), 'hex')
$$;

-- New entries: chain version 2 (the salt comes from gen_random_uuid, the server's strong random source; 16 bytes).
create or replace function public.audit_log_chain() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare s text := coalesce(new.tenant_id::text, 'platform'); cur bigint; prev text;
begin
  insert into public.audit_chain (scope, n, last_hash) values (s, 0, repeat('0', 64)) on conflict (scope) do nothing;
  select n, last_hash into cur, prev from public.audit_chain where scope = s for update;
  new.chain_n := cur + 1;
  new.prev_hash := prev;
  new.hash_v := 2;
  new.redacted_ms := null;
  new.pii_salt := uuid_send(gen_random_uuid());
  new.pii_hash := public.audit_pii_hash(new.pii_salt, new.actor, new.target, new.ip);
  new.hash := public.audit_hash_v2(s, new.chain_n, new.prev_hash, new.at_ms, new.actor_id, new.action, new.cat, new.space, new.request_id, new.basis, new.pii_hash);
  update public.audit_chain set n = new.chain_n, last_hash = new.hash where scope = s;
  return new;
end $$;
revoke all on function public.audit_log_chain() from public;

-- Verifies both versions. A version 2 entry whose salt is kept must also match its personal fields; a redacted one (no salt) is trusted for
-- them through pii_hash, which the chain covers.
create or replace function public.audit_verify(scope_name text) returns bigint language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r record; prev text := repeat('0', 64); h text;
begin
  for r in select * from public.audit_log where chain_n is not null and coalesce(tenant_id::text, 'platform') = scope_name order by chain_n loop
    if r.hash_v = 2 then
      if r.pii_hash is null or (r.pii_salt is not null and r.pii_hash is distinct from public.audit_pii_hash(r.pii_salt, r.actor, r.target, r.ip))
        or (r.pii_salt is null and r.redacted_ms is null) then return r.chain_n; end if;
      h := public.audit_hash_v2(scope_name, r.chain_n, prev, r.at_ms, r.actor_id, r.action, r.cat, r.space, r.request_id, r.basis, r.pii_hash);
    else
      h := encode(sha256(convert_to(concat_ws(chr(31), scope_name, r.chain_n::text, prev, r.at_ms::text, coalesce(r.actor_id::text, ''),
        r.actor, r.action, r.target, r.cat, r.space, r.ip, coalesce(r.request_id, ''), coalesce(r.basis, '')), 'UTF8')), 'hex');
    end if;
    if r.prev_hash is distinct from prev or r.hash is distinct from h then return r.chain_n; end if;
    prev := r.hash;
  end loop;
  return null;
end $$;
revoke all on function public.audit_verify(text) from public, anon, authenticated;

-- Append-only, with one narrow exception: a redaction by audit_redact_person (it sets app.audit_redact for its own transaction), which may
-- change only actor, target and ip, must drop the salt and set redacted_ms, and only on a version 2 entry that still has its salt.
create or replace function public.audit_log_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.audit_redact', true), '') = 'on'
    and old.hash_v = 2 and old.pii_salt is not null and new.pii_salt is null and new.redacted_ms is not null
    and (new.seq, new.at_ms, new.action, new.cat, new.space, new.tenant_id, new.actor_id, new.request_id, new.basis, new.chain_n, new.prev_hash, new.hash, new.hash_v, new.pii_hash)
      is not distinct from (old.seq, old.at_ms, old.action, old.cat, old.space, old.tenant_id, old.actor_id, old.request_id, old.basis, old.chain_n, old.prev_hash, old.hash, old.hash_v, old.pii_hash)
  then return new; end if;
  raise exception 'audit_log is append-only';
end $$;

-- Erases one person from the version 2 entries of every scope: where they acted, their name becomes the pseudonym and their client address is
-- removed; any name or email address of theirs in a target is replaced (names by the pseudonym, addresses by "[erased address]"). Returns the
-- number of entries changed. Platform super admins with a live elevation only; the server adds the four-eyes approval and audits the erasure.
create or replace function public.audit_redact_person(person uuid, names text[], emails text[], pseudonym text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; t text; x text; n integer := 0; terms text[];
begin
  if not public.app_elevated_super() then raise exception 'an elevated platform super admin is required' using errcode = '42501'; end if;
  if pseudonym !~ '^Former member · M-[0-9a-f]{6,16}$' then raise exception 'invalid pseudonym' using errcode = '22023'; end if;
  select coalesce(array_agg(v order by length(v) desc), '{}') into terms
    from unnest(coalesce(names, '{}') || coalesce(emails, '{}')) as v where length(trim(v)) >= 3;
  perform set_config('app.audit_redact', 'on', true);
  for r in select seq, actor_id, actor, target, ip from public.audit_log
    where hash_v = 2 and pii_salt is not null
      and (actor_id = person or exists (select 1 from unnest(terms) as v where position(lower(v) in lower(target)) > 0))
    for update
  loop
    t := r.target;
    foreach x in array terms loop
      t := regexp_replace(t, regexp_replace(x, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g'), case when position('@' in x) > 0 then '[erased address]' else pseudonym end, 'gi');
    end loop;
    update public.audit_log set
      actor = case when r.actor_id = person then pseudonym else r.actor end,
      target = t,
      ip = case when r.actor_id = person then '' else r.ip end,
      pii_salt = null,
      redacted_ms = public.app_now_ms()
    where seq = r.seq;
    n := n + 1;
  end loop;
  perform set_config('app.audit_redact', '', true);
  return n;
end $$;

revoke all on function public.audit_pii_hash(bytea, text, text, text), public.audit_hash_v2(text, bigint, text, bigint, uuid, text, text, text, text, text, text),
  public.audit_redact_person(uuid, text[], text[], text) from public, anon, authenticated, service_role;
grant execute on function public.audit_redact_person(uuid, text[], text[], text) to selvara_app;

notify pgrst, 'reload schema';

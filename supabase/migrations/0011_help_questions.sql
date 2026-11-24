-- Reference review R4 (docs/architecture/ui-review/REFERENCE-fleetflow.md): "Ask a question" in the Help centre. A company member asks
-- Selvara support a question; platform staff (super admins and support) read every question in the Admin Console's support inbox and
-- answer it; the person who asked reads only their own questions and the answers. Run after 0010, in each project. Safe to run more than once.
--
-- Who may do what, checked by the database (the server checks the same and more):
--   - a company member, in their own company's session: ask (their own question, status Open), add a follow-up to their own open question,
--     close their own question; they see only their own questions;
--   - platform staff (platform flag on, active staff): see every question, answer it, and set it Answered, Closed or Open again;
--   - nobody changes who asked, the company, the subject or the topic, and nothing is ever deleted.
-- Questions hold no records from the workspace: only what the person typed. The asker's name and company name are copied in when the question
-- is asked, so support staff never need to read company tables.

insert into public.schema_version (version, name, applied_ms) values (11, '0011_help_questions', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

create table if not exists public.support_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  asker_id uuid not null references public.profiles (id),
  asker_name text not null check (length(btrim(asker_name)) between 1 and 120),
  company_name text not null check (length(btrim(company_name)) between 1 and 160),
  topic text not null check (topic ~ '^[a-z][a-z0-9-]{1,39}$'),
  subject text not null check (length(btrim(subject)) between 5 and 160),
  status text not null default 'Open' check (status in ('Open', 'Answered', 'Closed')),
  created_ms bigint not null,
  updated_ms bigint not null check (updated_ms >= created_ms)
);
create index if not exists support_questions_asker on public.support_questions (asker_id, updated_ms desc);
create index if not exists support_questions_inbox on public.support_questions (status, updated_ms desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.support_questions (id) on delete restrict,
  author_id uuid not null references public.profiles (id),
  author_name text not null check (length(btrim(author_name)) between 1 and 120),
  staff boolean not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  at_ms bigint not null
);
create index if not exists support_messages_question on public.support_messages (question_id, at_ms);

-- Active platform staff, working on the platform (the server sets the platform flag only for them).
create or replace function public.app_support_staff() returns boolean language sql stable as $$ select public.app_platform() and public.app_platform_role() is not null $$;
-- The asker, in a session of the question's company, and still an active member of it.
create or replace function public.app_support_asker(company uuid, asker uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not public.app_platform() and company = public.app_tenant() and asker = public.app_user() and exists (
    select 1 from public.memberships m where m.tenant_id = company and m.user_id = asker and m.status = 'Active')
$$;

alter table public.support_questions enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists app_support_questions_read on public.support_questions;
create policy app_support_questions_read on public.support_questions for select to selvara_app
  using (public.app_support_staff() or public.app_support_asker(tenant_id, asker_id));
drop policy if exists app_support_questions_ins on public.support_questions;
create policy app_support_questions_ins on public.support_questions for insert to selvara_app
  with check (public.app_support_asker(tenant_id, asker_id) and status = 'Open' and updated_ms = created_ms);
drop policy if exists app_support_questions_upd on public.support_questions;
create policy app_support_questions_upd on public.support_questions for update to selvara_app
  using (public.app_support_staff() or public.app_support_asker(tenant_id, asker_id))
  with check (public.app_support_staff() or (public.app_support_asker(tenant_id, asker_id) and status in ('Open', 'Closed')));

drop policy if exists app_support_messages_read on public.support_messages;
create policy app_support_messages_read on public.support_messages for select to selvara_app
  using (exists (select 1 from public.support_questions q where q.id = question_id)); -- the question's own policy decides
drop policy if exists app_support_messages_ins on public.support_messages;
create policy app_support_messages_ins on public.support_messages for insert to selvara_app
  with check (author_id = public.app_user() and (
    (staff and public.app_support_staff() and exists (select 1 from public.support_questions q where q.id = question_id))
    or (not staff and exists (select 1 from public.support_questions q where q.id = question_id and q.status <> 'Closed' and public.app_support_asker(q.tenant_id, q.asker_id)))));

-- A question keeps who asked, its company, subject, topic and start; its time only moves forward.
create or replace function public.support_questions_guard() returns trigger language plpgsql as $$
begin
  if new.tenant_id <> old.tenant_id or new.asker_id <> old.asker_id or new.subject <> old.subject or new.topic <> old.topic
     or new.created_ms <> old.created_ms or new.asker_name <> old.asker_name or new.company_name <> old.company_name then
    raise exception 'a question keeps who asked, its company, subject and topic' using errcode = '42501';
  end if;
  if new.updated_ms < old.updated_ms then raise exception 'a question''s time only moves forward' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists support_questions_guard on public.support_questions;
create trigger support_questions_guard before update on public.support_questions for each row execute function public.support_questions_guard();
-- Messages are never changed.
create or replace function public.support_messages_frozen() returns trigger language plpgsql as $$
begin raise exception 'messages are never changed or removed' using errcode = '42501'; end $$;
drop trigger if exists support_messages_frozen on public.support_messages;
create trigger support_messages_frozen before update or delete on public.support_messages for each row execute function public.support_messages_frozen();

-- Only the application role reaches these tables; the Data API roles and the service role never do.
revoke all on public.support_questions, public.support_messages from anon, authenticated;
grant select, insert, update on public.support_questions to selvara_app;
grant select, insert on public.support_messages to selvara_app;
revoke all on function public.app_support_staff(), public.app_support_asker(uuid, uuid), public.support_questions_guard(), public.support_messages_frozen()
  from public, anon, authenticated, service_role;
grant execute on function public.app_support_staff(), public.app_support_asker(uuid, uuid) to selvara_app;

notify pgrst, 'reload schema';

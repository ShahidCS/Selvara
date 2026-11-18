-- Test-only stand-in for what Supabase provides before our migrations run: the auth schema with its users table, and the API roles.
-- Used by the database tests (tests/db) on a throwaway local or CI Postgres. Never run this against a Supabase project.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

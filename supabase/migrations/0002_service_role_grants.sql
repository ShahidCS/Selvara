-- Explicit table access for the server's role (service_role). Some Supabase projects do not grant new tables to the API roles automatically,
-- and then every request from the server fails with "permission denied" (42501). The public roles (anon, authenticated) stay locked out:
-- 0001 revoked them and row level security is on with no policies. Safe to run more than once.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles, public.kv, public.sessions, public.notices, public.passkeys, public.recovery_codes to service_role;
-- The audit log is append-only: the server may add and read entries; the trigger in 0001 refuses update and delete for every role.
grant select, insert on public.audit_log to service_role;
grant usage, select on sequence public.audit_log_seq_seq to service_role;
-- Make the Data API see the tables now rather than at its next schema refresh.
notify pgrst, 'reload schema';

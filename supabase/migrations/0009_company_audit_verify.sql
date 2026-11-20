-- Production programme, group 5 (docs/architecture/PRODUCTION_PROGRAMME.md). Lets a company admin verify their own company's audit chain
-- (0003's audit_verify, scoped to the session's company), so the workspace Audit log can show whether the chain is intact. Reading the log
-- itself needs no new grant: row level security (0003, app_audit) already limits selvara_app to the session's company. Run after 0008, in each
-- project. Safe to run more than once.

insert into public.schema_version (version, name, applied_ms) values (9, '0009_company_audit_verify', (extract(epoch from now()) * 1000)::bigint)
on conflict (version) do nothing;

-- Null means every entry of the company's chain verifies; otherwise the first chain_n that does not. Only an active admin of the session's
-- company may call it (the server checks the role too).
create or replace function public.company_audit_verify() returns bigint language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t uuid := public.app_tenant();
begin
  if t is null or public.app_platform() or not exists (
    select 1 from public.memberships m where m.tenant_id = t and m.user_id = public.app_user() and m.status = 'Active' and m.role = 'admin'
  ) then raise exception 'company admins only' using errcode = '42501'; end if;
  return public.audit_verify(t::text);
end $$;

revoke all on function public.company_audit_verify() from public, anon, authenticated, service_role;
grant execute on function public.company_audit_verify() to selvara_app;

notify pgrst, 'reload schema';

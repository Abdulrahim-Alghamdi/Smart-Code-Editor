-- Locks down function privileges flagged by the Security Advisor.
-- Supabase grants EXECUTE on new public functions to anon and authenticated by default, so each grant is revoked explicitly.
-- Safe to run more than once.

-- Trigger-only functions: no API role should call them directly.
-- Triggers keep working: Postgres checks EXECUTE when a trigger is created, not when it fires.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- Account deletion: only signed-in users, and only for themselves (the body deletes where id = auth.uid()).
revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- Verify: every row should show the "expected" value.
select
  p.proname as function,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  case p.proname when 'delete_own_account' then 'anon=false, authenticated=true' else 'both false' end as expected
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('handle_new_user', 'touch_updated_at', 'delete_own_account')
order by p.proname;

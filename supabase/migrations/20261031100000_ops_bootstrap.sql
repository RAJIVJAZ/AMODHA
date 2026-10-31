-- Faster staff screens: one call instead of three when a staff page opens. Starts (or checks) the staff
-- session and, in the same round trip, returns the person's permissions and profile. Exactly the same rules
-- as calling staff_session_start(), my_permissions() and reading the profile one after the other.
create or replace function public.ops_bootstrap(p_portal text default 'ops')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb := public.staff_session_start(p_portal);
begin
  return jsonb_build_object(
    'session', s,
    'permissions', case when s ->> 'state' = 'ended' then '[]'::jsonb else
      (select coalesce(jsonb_agg(jsonb_build_object('module', p.module, 'action', p.action)), '[]'::jsonb) from public.my_permissions() p) end,
    'profile', (select to_jsonb(x) from (select full_name, email, is_admin, ops_active, job_title from public.profiles where id = auth.uid()) x));
end;
$$;
revoke execute on function public.ops_bootstrap(text) from public, anon;
grant execute on function public.ops_bootstrap(text) to authenticated;

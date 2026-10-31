-- ops_bootstrap returns the same session, permissions and profile as the separate calls.
do $$
declare
  b jsonb;
begin
  perform test.login('pm@test.local');
  b := public.ops_bootstrap('ops');
  perform test.eq('session active', b -> 'session' ->> 'state', 'active');
  perform test.eq('same permissions as my_permissions()',
    (select count(*)::int from jsonb_array_elements(b -> 'permissions')), (select count(*)::int from public.my_permissions()));
  perform test.eq('includes production view',
    exists (select 1 from jsonb_array_elements(b -> 'permissions') x where x ->> 'module' = 'production' and x ->> 'action' = 'view'), true);
  perform test.eq('profile returned', (b -> 'profile') ? 'is_admin', true);
end $$;
reset role;

do $$
declare
  b jsonb;
begin
  perform test.login('cust@test.local');
  b := public.ops_bootstrap('ops');
  perform test.eq('customer: no staff permissions', jsonb_array_length(b -> 'permissions'), 0);
end $$;
reset role;

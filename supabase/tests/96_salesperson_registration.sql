-- Salesperson registration: apply, no access until approved, approval creates the salesperson.
do $$
begin
  perform test.put('applicant', test.make_user('newrep@test.local'));
end $$;

do $$
declare
  res jsonb;
begin
  perform test.login('newrep@test.local');
  perform test.eq('nothing yet', public.fs_my_application() ->> 'status', 'none');
  perform test.fails('a valid mobile is required', $q$select public.fs_apply('{"full_name":"Naya Rep","phone":"123"}')$q$, 'mobile');
  res := public.fs_apply('{"full_name":"Naya Rep","phone":"98765 11111","city":"Prayagraj","areas":"Katra, Chowk","experience":"2 years FMCG"}');
  perform test.eq('application pending', res ->> 'status', 'pending');
  perform test.fails('cannot apply twice', $q$select public.fs_apply('{"full_name":"Naya Rep","phone":"9876511111"}')$q$, 'already with the sales manager');
  perform test.eq('applying gives no sales access', public.has_permission('field_sales', 'view'), false);
  perform test.fails('applicant cannot approve themselves',
    format('select public.st_decide_application(%L, true, %L)', (select id from public.salesperson_applications where user_id = test.id('applicant')), 'MW-S99'), 'permission');
end $$;
reset role;

do $$
declare
  sid uuid;
begin
  perform test.login('smgr@test.local');
  perform test.fails('approval needs an employee code',
    format('select public.st_decide_application(%L, true)', (select id from public.salesperson_applications where user_id = test.id('applicant'))), 'employee code');
  sid := public.st_decide_application((select id from public.salesperson_applications where user_id = test.id('applicant')), true, 'MW-S09', array['PRG-CIVIL'], 'Interviewed');
  perform test.put('new_sp', sid);
end $$;
reset role;

do $$
begin
  perform test.eq('salesperson created and linked to the applicant', (select user_id from public.salespeople where id = test.id('new_sp')), test.id('applicant'));
  perform test.eq('territory set', (select territories from public.salespeople where id = test.id('new_sp')), array['PRG-CIVIL']);
  perform test.eq('approval audited', (select count(*)::int from public.audit_log where action = 'salesperson.application_approve'), 1);
  perform test.login('newrep@test.local');
  perform test.eq('now a salesperson', public.fs_my_application() ->> 'status', 'salesperson');
  perform test.eq('sales app opens', (public.fs_dashboard() -> 'salesperson' ->> 'employee_code'), 'MW-S09');
end $$;
reset role;

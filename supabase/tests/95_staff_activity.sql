-- Staff activity monitoring and session management: the 16 required tests (database side; the browser
-- side — interaction detection, warning, autosave flush, redirect — is in src/components/staff and is
-- exercised against these same functions). Time is simulated by moving recorded server timestamps back.

do $$
begin
  perform test.put('mon_pm', test.make_user('monpm@test.local', '{production_manager}'));
  perform test.put('mon_role', test.make_user('monrole@test.local', '{production_manager}'));
end $$;

-- TEST 1: login is recorded with employee, role and permissions ---------------------------------------
do $$
declare
  s public.staff_sessions;
begin
  perform test.login('monpm@test.local');
  reset role;
  select * into s from public.staff_sessions where user_id = test.id('mon_pm') and status = 'active';
  perform test.eq('one session record for the sign-in', (select count(*)::int from public.staff_sessions where user_id = test.id('mon_pm')), 1);
  perform test.eq('role at login', s.role_keys, array['production_manager']);
  perform test.eq('permissions at login', s.permissions ? 'production.create', true);
  perform test.eq('email recorded', s.email, 'monpm@test.local');
  perform test.eq('login time from the server', s.started_at <= now(), true);
  perform test.eq('login event', (select count(*)::int from public.staff_session_events where session_id = s.id and kind = 'login'), 1);
  perform test.put('mon_s1', s.id);
end $$;

-- TEST 2: business actions are recorded where the database commits them -------------------------------
do $$
declare
  bid uuid;
begin
  perform test.login('monpm@test.local');
  bid := public.prod_create_batch(test.id('milk_cake'), public.ist_today(), 10, 'general', null, 'Kitchen 2', 'Monitor test');
  perform test.put('mon_batch', bid);
end $$;
reset role;

do $$
begin
  perform test.login('monpm@test.local');
  perform public.prod_issue_material(test.id('mon_batch'), test.id('sugar'), 1);
end $$;
reset role;

do $$
begin
  perform test.eq('batch creation audited with the session', (select count(*)::int from public.audit_log where action = 'batch.create' and entity_id = test.id('mon_batch')::text and session_id = test.id('mon_s1')), 1);
  perform test.eq('material issue audited with the session', (select count(*)::int from public.audit_log where entity_id = test.id('mon_batch')::text and session_id = test.id('mon_s1')) >= 2, true);
  perform test.eq('role at the time of the action', (select role_keys from public.audit_log where action = 'batch.create' and entity_id = test.id('mon_batch')::text), array['production_manager']);
  perform test.eq('module recorded', (select module from public.audit_log where action = 'batch.create' and entity_id = test.id('mon_batch')::text), 'production');
  perform test.eq('business actions counted on the session', (select business_actions from public.staff_sessions where id = test.id('mon_s1')) >= 2, true);
  perform test.eq('last business action time recorded', (select last_business_action_at is not null from public.staff_sessions where id = test.id('mon_s1')), true);
end $$;

-- TEST 4 & 5: scrolling / form input / navigation reset the timer; navigation records the module -------
do $$
begin
  update public.staff_sessions set last_interaction_at = now() - interval '4 minutes', last_active_minute = null where id = test.id('mon_s1');
  perform test.login('monpm@test.local');
  -- test.login itself counts as interaction; put the clock back again before the real ping.
  reset role;
  update public.staff_sessions set last_interaction_at = now() - interval '4 minutes 30 seconds' where id = test.id('mon_s1');
  perform test.as_session('monpm@test.local', (select auth_session_id from public.staff_sessions where id = test.id('mon_s1')));
  set local role authenticated;
  perform test.eq('scroll / input ping accepted', public.staff_activity_ping('interaction', '/ops/production') ->> 'state', 'active');
  reset role;
  perform test.eq('interaction resets the timer (server time)', (select now() - last_interaction_at < interval '5 seconds' from public.staff_sessions where id = test.id('mon_s1')), true);
  set local role authenticated;
  perform public.staff_activity_ping('navigation', '/ops/inventory');
  reset role;
  perform test.eq('navigation recorded with its module', (select module from public.staff_session_events where session_id = test.id('mon_s1') and kind = 'navigation' order by at desc limit 1), 'inventory');
end $$;

-- TEST 13 & 14: several tabs share one session; repeated pings in the same minute are counted once -----
do $$
declare
  before_active integer;
  before_events bigint;
  sid uuid := (select auth_session_id from public.staff_sessions where id = test.id('mon_s1'));
begin
  update public.staff_sessions set last_active_minute = null where id = test.id('mon_s1');
  select active_seconds into before_active from public.staff_sessions where id = test.id('mon_s1');
  perform test.as_session('monpm@test.local', sid);   -- a second tab loading a page
  set local role authenticated;
  perform public.staff_activity_ping('interaction', '/ops/production');  -- tab 1
  perform public.staff_activity_ping('interaction', '/ops/dispatch');    -- tab 2, same minute
  perform public.staff_activity_ping('interaction', '/ops/dispatch');    -- a retry
  reset role;
  select count(*) into before_events from public.staff_session_events where session_id = test.id('mon_s1') and kind = 'login';
  perform test.eq('still one session record for that sign-in', (select count(*)::int from public.staff_sessions where auth_session_id = sid), 1);
  perform test.eq('no second login event from the second tab', before_events, 1::bigint);
  perform test.eq('the minute is counted once across tabs and retries', (select active_seconds from public.staff_sessions where id = test.id('mon_s1')) - before_active, 60);
end $$;

-- TEST 7: autosaved draft ---------------------------------------------------------------------------------
do $$
begin
  perform test.as_session('monpm@test.local', (select auth_session_id from public.staff_sessions where id = test.id('mon_s1')));
  set local role authenticated;
  perform public.staff_save_draft('prod_complete_batch:/ops/production/x', '{"p_output_qty#num":"58.5","p_notes":"half done"}');
  perform public.staff_save_draft('prod_complete_batch:/ops/production/x', '{"p_output_qty#num":"59","p_notes":"latest"}');
  perform test.eq('latest draft kept', public.staff_get_draft('prod_complete_batch:/ops/production/x') -> 'data' ->> 'p_notes', 'latest');
  reset role;
  perform test.eq('a draft is not a transaction (batch output unchanged)', (select output_qty from public.production_batches where id = test.id('mon_batch')), null::numeric);
end $$;

-- TEST 6: background status checks never keep a session alive ------------------------------------------
do $$
declare
  sid uuid := (select auth_session_id from public.staff_sessions where id = test.id('mon_s1'));
  before_at timestamptz;
begin
  update public.staff_sessions set last_interaction_at = now() - interval '4 minutes' where id = test.id('mon_s1');
  select last_interaction_at into before_at from public.staff_sessions where id = test.id('mon_s1');
  perform test.as_session('monpm@test.local', sid);   -- a page refresh
  set local role authenticated;
  perform public.staff_session_status();
  perform public.staff_session_status();
  perform public.staff_session_status();
  reset role;
  perform test.eq('status checks and page loads do not count as interaction', (select last_interaction_at from public.staff_sessions where id = test.id('mon_s1')), before_at);
end $$;

-- TEST 3: five minutes without interaction ends the session on the server -----------------------------
do $$
declare
  sid uuid := (select auth_session_id from public.staff_sessions where id = test.id('mon_s1'));
begin
  update public.staff_sessions set last_interaction_at = now() - interval '5 minutes 25 seconds' where id = test.id('mon_s1');
  perform set_config('request.jwt.claims', json_build_object('sub', test.id('mon_pm'), 'role', 'authenticated', 'session_id', sid)::text, false);
  set local role authenticated;
  perform test.eq('idle session has no permissions', public.has_permission('production', 'view'), false);
  perform test.fails('idle session cannot record production',
    format('select public.prod_issue_material(%L, %L, 1)', test.id('mon_batch'), test.id('sugar')), 'session has ended');
  perform test.eq('idle session sees no batches', (select count(*)::int from public.production_batches), 0);
  perform test.eq('a ping cannot revive it', public.staff_activity_ping('interaction', '/ops') ->> 'state', 'ended');
  perform test.fails('draft saves are refused after the timeout (the app keeps the draft on the device)',
    $q$select public.staff_save_draft('x:/ops', '{}')$q$, 'session has ended');
  perform public.staff_log_failure('prod_issue_material', 'Your session has ended (idle timeout). Please sign in again.', '/ops/production');
  reset role;
  perform test.eq('ended by the server', (select end_reason from public.staff_sessions where id = test.id('mon_s1')), 'expired');
  perform test.eq('sign-in invalidated (refresh token removed)', exists (select 1 from auth.sessions where id = sid), false);
  perform test.eq('failed request after expiry is logged', (select count(*)::int from public.audit_log where actor = test.id('mon_pm') and result = 'failure' and error_code = 'session_ended'), 1);
  perform test.eq('reloading never revives an ended sign-in', (select count(*)::int from public.staff_sessions where auth_session_id = sid and status = 'active'), 0);
end $$;

-- Client-driven timeout (the app saved drafts first) and TEST 8: a failed save is reported as failed ----
do $$
declare
  sid uuid := gen_random_uuid();
  res jsonb;
begin
  insert into auth.sessions (id, user_id, user_agent) values (sid, test.id('mon_pm'), 'Mozilla/5.0 (Linux; Android 14) Mobile');
  perform test.as_session('monpm@test.local', sid);
  perform test.eq('device category from the browser', (select device from public.staff_sessions where auth_session_id = sid), 'phone');
  update public.staff_sessions set last_interaction_at = now() - interval '5 minutes' where auth_session_id = sid;
  set local role authenticated;
  res := public.staff_session_end('idle_timeout', 'failed', 'Network error saving the dispatch draft');
  reset role;
  perform test.eq('recorded as automatic idle timeout', (select end_reason from public.staff_sessions where auth_session_id = sid), 'idle_timeout');
  perform test.eq('sign-out time recorded', (select ended_at is not null from public.staff_sessions where auth_session_id = sid), true);
  perform test.eq('save failure recorded honestly', (select save_status from public.staff_sessions where auth_session_id = sid), 'failed');
  perform test.eq('server session invalidated', exists (select 1 from auth.sessions where id = sid), false);
  perform test.eq('the earlier draft is still there for recovery', (select count(*)::int from public.staff_drafts where user_id = test.id('mon_pm')), 1);
end $$;

-- Manual sign-out is told apart from timeouts.
do $$
declare
  sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id) values (sid, test.id('mon_pm'));
  perform test.as_session('monpm@test.local', sid);
  set local role authenticated;
  perform public.staff_session_end('idle_timeout', 'saved');   -- claimed too early: interaction was just now
  reset role;
  perform test.eq('an early "timeout" is recorded as manual', (select end_reason from public.staff_sessions where auth_session_id = sid), 'manual');
end $$;

-- TEST 16: browser closed — no invented sign-out ----------------------------------------------------------
do $$
declare
  sid uuid := gen_random_uuid();
  s public.staff_sessions;
begin
  insert into auth.sessions (id, user_id) values (sid, test.id('mon_pm'));
  perform test.as_session('monpm@test.local', sid);
  update public.staff_sessions set started_at = now() - interval '40 minutes', last_interaction_at = now() - interval '20 minutes', last_seen_at = now() - interval '20 minutes'
  where auth_session_id = sid;
  perform public.staff_reconcile_sessions();
  select * into s from public.staff_sessions where auth_session_id = sid;
  perform test.eq('stale session ended by the server', s.status, 'ended');
  perform test.eq('marked interrupted', s.interrupted, true);
  perform test.eq('no sign-out time invented', s.ended_at, null::timestamptz);
  perform test.eq('no logout event invented', (select count(*)::int from public.staff_session_events where session_id = s.id and kind = 'logout'), 0);
  perform test.eq('duration runs to the last interaction + timeout', (select logged_in_seconds from public._staff_durations(s)), 25 * 60);
  perform test.put('mon_interrupted', s.id);
end $$;

-- TEST 15: duration arithmetic on known timestamps --------------------------------------------------------
do $$
declare
  s public.staff_sessions;
  d record;
begin
  s.started_at := '2026-10-14 10:00:00+05:30';
  s.last_interaction_at := '2026-10-14 10:30:00+05:30';
  s.last_seen_at := '2026-10-14 10:30:00+05:30';
  s.ended_at := '2026-10-14 10:40:00+05:30';
  s.last_business_action_at := '2026-10-14 10:10:00+05:30';
  s.active_seconds := 1200;
  s.status := 'ended';
  select * into d from public._staff_durations(s);
  perform test.eq('logged-in time', d.logged_in_seconds, 2400);
  perform test.eq('active time', d.active_seconds, 1200);
  perform test.eq('idle = logged in − active (never counted twice)', d.idle_seconds, 1200);
  perform test.eq('time since last business action', d.since_business_seconds, 1800);
  s.active_seconds := 99999;
  select * into d from public._staff_durations(s);
  perform test.eq('active time never exceeds logged-in time', d.active_seconds, 2400);
  perform test.eq('idle never negative', d.idle_seconds, 0);
end $$;

-- TEST 9: role history keeps what was held at the time ----------------------------------------------------
do $$
declare
  old_session uuid;
begin
  perform test.login('monrole@test.local');
  reset role;
  select id into old_session from public.staff_sessions where user_id = test.id('mon_role') and status = 'active';
  perform test.login('owner@test.local');
  perform public.ops_set_user_roles(test.id('mon_role'), array['finance_officer'], 'Moved to accounts');
  reset role;
  perform test.eq('the earlier session keeps the role held at login', (select role_keys from public.staff_sessions where id = old_session), array['production_manager']);
  perform test.eq('history shows the new role', (select role_keys from public.staff_role_history where user_id = test.id('mon_role') order by effective_from desc, id desc limit 1), array['finance_officer']);
  perform test.eq('history keeps the reason', (select reason from public.staff_role_history where user_id = test.id('mon_role') order by id desc limit 1), 'Moved to accounts');
  perform test.eq('history keeps who changed it', (select changed_by from public.staff_role_history where user_id = test.id('mon_role') order by id desc limit 1), test.id('owner'));
  perform test.login('monrole@test.local');
  perform test.eq('the open session loses production access at once', public.has_permission('production', 'create'), false);
  perform test.eq('…and has the new finance access', public.has_permission('purchases', 'view'), true);
  reset role;
  perform test.fails('role history cannot be rewritten', format('update public.staff_role_history set role_keys = %L where user_id = %L', '{admin}', test.id('mon_role')), 'permanent');
end $$;

-- TEST 10: revocation ------------------------------------------------------------------------------------
do $$
declare
  victim uuid;
begin
  perform test.login('monpm@test.local');
  reset role;
  select id into victim from public.staff_sessions where user_id = test.id('mon_pm') and status = 'active';
  perform test.put('mon_s_rev', victim);
  perform test.login('owner@test.local');
  perform public.staff_revoke_session(victim, 'Phone lost');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', test.id('mon_pm'), 'role', 'authenticated',
    'session_id', (select auth_session_id from public.staff_sessions where id = victim))::text, false);
  set local role authenticated;
  perform test.fails('revoked session cannot act', format('select public.prod_issue_material(%L, %L, 1)', test.id('mon_batch'), test.id('sugar')), 'session has ended');
  reset role;
  perform test.eq('recorded as revoked by an administrator', (select end_reason from public.staff_sessions where id = victim), 'revoked');
  perform test.eq('revocation in the audit log', (select count(*)::int from public.audit_log where action = 'session.revoke' and entity_id = victim::text), 1);
end $$;

-- TEST 11: timeline from recorded events only ---------------------------------------------------------
do $$
declare
  t jsonb;
  kinds text[];
begin
  perform test.login('owner@test.local');
  t := public.staff_timeline(test.id('mon_pm'), public.ist_today());
  select array_agg(e ->> 'kind' order by ord) into kinds from jsonb_array_elements(t) with ordinality as x(e, ord);
  perform test.eq('timeline has logins', 'login' = any (kinds), true);
  perform test.eq('timeline has navigation', 'navigation' = any (kinds), true);
  perform test.eq('timeline has business actions', 'business_action' = any (kinds), true);
  perform test.eq('timeline has the failed request', 'action_failed' = any (kinds), true);
  perform test.eq('timeline has the timeout and the revocation', 'idle_timeout' = any (kinds) and 'revoked' = any (kinds), true);
  perform test.eq('timeline is in time order', (select bool_and(a <= b) from (select (e ->> 'at')::timestamptz as a, lead((e ->> 'at')::timestamptz) over (order by ord) as b
    from jsonb_array_elements(t) with ordinality as x(e, ord)) z where b is not null), true);
  perform test.eq('reports show the interrupted session', (select count(*)::int from jsonb_array_elements(public.staff_session_history(public.ist_today(), public.ist_today(), test.id('mon_pm'), 'interrupted')) e
    where e ->> 'id' = test.id('mon_interrupted')::text), 1);
  perform test.eq('activity report counts timeouts', (select (e ->> 'timeouts')::int from jsonb_array_elements(public.staff_activity_report(public.ist_today(), public.ist_today())) e
    where e ->> 'user_id' = test.id('mon_pm')::text), 1);
  perform test.eq('inactivity report finds the 20-minute gap', (select count(*)::int from jsonb_array_elements(public.staff_inactivity_report(public.ist_today(), public.ist_today(), 15, 600, test.id('mon_pm'))) e
    where e ->> 'type' = 'no_interaction' and (e ->> 'minutes')::int >= 15) >= 1, true);
end $$;
reset role;

-- TEST 12: ordinary staff cannot see monitoring or change logs ----------------------------------------
do $$
begin
  perform test.login('pm@test.local');
  perform test.fails('production manager cannot open the activity center', 'select public.staff_live_sessions()', 'permission');
  perform test.fails('…or a colleague''s timeline', format('select public.staff_timeline(%L, %L)', test.id('mon_pm'), public.ist_today()), 'permission');
  perform test.fails('…or revoke sessions', format('select public.staff_revoke_session(%L, %L)', test.id('mon_s1'), 'x'), 'permission');
  perform test.eq('…and sees only their own session rows', (select count(*)::int from public.staff_sessions where user_id <> test.id('pm')), 0);
  perform test.fails('staff cannot delete their audit records', 'delete from public.audit_log', 'permission denied');
  perform test.fails('staff cannot delete session events', 'delete from public.staff_session_events', 'permission denied');
  perform test.fails('staff cannot change session records', 'update public.staff_sessions set end_reason = null', 'permission denied');
end $$;
reset role;

do $$
begin
  perform test.fails('even the database owner cannot rewrite session events', 'update public.staff_session_events set kind = ''login''', 'permanent');
  perform test.fails('…or delete them outside the retention purge', 'delete from public.staff_session_events', 'permanent');
end $$;

-- Monitoring notice acknowledgement.
do $$
begin
  perform test.login('pm@test.local');
  perform test.eq('notice not yet acknowledged', (public.staff_session_start('ops') ->> 'acknowledged')::boolean, false);
  perform public.staff_acknowledge_policy((select value #>> '{}' from public.business_settings where key = 'monitoring.policy_version'));
  perform test.eq('acknowledged', (public.staff_session_start('ops') ->> 'acknowledged')::boolean, true);
end $$;
reset role;

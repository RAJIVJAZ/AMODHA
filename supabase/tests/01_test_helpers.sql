-- Test helpers: sign in as a test user (row-level security applies) and assert results.
-- Used on local staging, and on the live project only inside a transaction that is rolled back.

create schema if not exists test;
grant usage on schema test to authenticated, service_role;

-- Signs in as a test user the way the app does: an auth session (the JWT's session_id), a staff session
-- record for staff, and an interaction "now" (the person is using the app). An ended session is never reused.
create or replace function test.login(p_email text)
returns void
language plpgsql
as $$
declare
  uid uuid;
  sid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is null then
    raise exception 'No test user %', p_email;
  end if;
  select s.auth_session_id into sid from public.staff_sessions s
  where s.user_id = uid and s.status = 'active' and exists (select 1 from auth.sessions a where a.id = s.auth_session_id)
  order by s.started_at desc limit 1;
  if sid is null then
    select a.id into sid from auth.sessions a where a.user_id = uid
      and not exists (select 1 from public.staff_sessions s where s.auth_session_id = a.id) order by a.created_at desc limit 1;
  end if;
  if sid is null then
    sid := gen_random_uuid();
    insert into auth.sessions (id, user_id, user_agent) values (sid, uid, 'test-runner');
  end if;
  perform test.as_session(p_email, sid);
  update public.staff_sessions set last_interaction_at = now(), last_seen_at = now() where auth_session_id = sid and status = 'active';
  perform set_config('role', 'authenticated', false);
end;
$$;

-- Claims for a given auth session (used directly by the session tests); starts the staff session record.
create or replace function test.as_session(p_email text, p_session uuid)
returns void
language plpgsql
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', p_email, 'session_id', p_session)::text, false);
  perform public.staff_session_start('ops', '/ops/today');
end;
$$;

create or replace function test.eq(p_label text, p_got anyelement, p_expected anyelement)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_expected then
    raise exception 'FAIL %: got %, expected %', p_label, p_got, p_expected;
  end if;
  raise notice 'ok  %', p_label;
end;
$$;

create or replace function test.near(p_label text, p_got numeric, p_expected numeric, p_tolerance numeric default 0.05)
returns void
language plpgsql
as $$
begin
  if p_got is null or abs(p_got - p_expected) > p_tolerance then
    raise exception 'FAIL %: got %, expected % (±%)', p_label, p_got, p_expected, p_tolerance;
  end if;
  raise notice 'ok  %', p_label;
end;
$$;

-- Runs p_sql and passes only if it fails with a message matching p_pattern.
create or replace function test.fails(p_label text, p_sql text, p_pattern text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'ok  % (rejected: %)', p_label, sqlerrm;
      return;
    end if;
    raise exception 'FAIL %: wrong error: %', p_label, sqlerrm;
  end;
  raise exception 'FAIL %: was allowed but should have been rejected', p_label;
end;
$$;

grant execute on all functions in schema test to authenticated, service_role;

-- Test users, one per role.
create or replace function test.make_user(p_email text, p_roles text[] default '{}', p_owner boolean default false)
returns uuid
language plpgsql
as $$
declare
  uid uuid := gen_random_uuid();
begin
  if p_owner then
    insert into public.staff_emails (email) values (p_email) on conflict do nothing;
  end if;
  insert into auth.users (id, email, email_confirmed_at) values (uid, p_email, now());
  insert into public.ops_user_roles (user_id, role_key) select uid, r from unnest(p_roles) r;
  return uid;
end;
$$;

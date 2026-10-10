-- Test helpers: sign in as a test user (row-level security applies) and assert results.
-- Used on local staging, and on the live project only inside a transaction that is rolled back.

create schema if not exists test;
grant usage on schema test to authenticated, service_role;

create or replace function test.login(p_email text)
returns void
language plpgsql
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is null then
    raise exception 'No test user %', p_email;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', p_email)::text, false);
  perform set_config('role', 'authenticated', false);
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

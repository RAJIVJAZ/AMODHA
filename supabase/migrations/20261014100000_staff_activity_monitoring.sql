-- Staff sessions, inactivity timeout, activity and audit monitoring.
--
-- How it fits the existing system:
--   * Sign-in stays Supabase Auth. Each sign-in is an auth session (auth.sessions, the JWT's session_id).
--     staff_sessions keeps one record per auth session of a staff member: who, roles and permissions at
--     login, portal, device, and the server's own timestamps of interaction, business actions and the end.
--   * The idle timeout is enforced in the database: has_permission() / require_permission(), which every
--     protected read policy and every business function already calls, now also require the caller's
--     session to be live: present in auth.sessions, not ended, interaction within the timeout (5 minutes
--     by default) and within the absolute session limit. An idle, revoked or ended session can read and
--     change nothing, whatever the browser does.
--   * Interaction is recorded only when the app reports a real user interaction (click, key, scroll, touch,
--     form input, navigation) through staff_activity_ping(); the server stamps its own time and never takes
--     a time from the client. Status checks, page refreshes and background requests do not extend a session.
--   * Business actions are counted where they are committed: write_audit(), called by every business
--     function inside its transaction, now also stamps the session and the role held at the time.
--   * Session events, role history and the audit log are append-only.

-- Module and settings ---------------------------------------------------------------------------------
insert into public.ops_modules (key, label, description, sort_order) values
  ('staff_monitoring', 'Staff activity & audit', 'Staff sessions, activity timelines, inactivity and audit reports, session revocation and monitoring policy', 23)
on conflict (key) do nothing;
insert into public.ops_role_permissions (role_key, module, action)
select 'admin', 'staff_monitoring', a.key from public.ops_actions a
on conflict do nothing;

insert into public.business_settings (key, value, label, description, category, value_type) values
  ('monitoring.idle_timeout_minutes', '5', 'Sign out after inactivity (minutes)',
    'Staff apps sign out after this many minutes without a click, key press, scroll, touch, form input or navigation', 'monitoring', 'number'),
  ('monitoring.warning_seconds', '30', 'Warn before signing out (seconds)', 'A "Continue working" warning shows this long before the timeout; 0 for none', 'monitoring', 'number'),
  ('monitoring.absolute_timeout_hours', '12', 'Longest session (hours)', 'A session ends after this long even with activity; sign in again', 'monitoring', 'number'),
  ('monitoring.retention_days', '365', 'Keep session activity records (days)', 'Interaction events older than this can be purged. Sessions, business audit and role history are kept.', 'monitoring', 'number'),
  ('monitoring.policy_version', '"2026-10-14"', 'Staff monitoring notice version', 'Changing this asks every staff member to read and acknowledge the notice again', 'monitoring', 'text')
on conflict (key) do nothing;

alter table public.profiles
  add column if not exists department text,
  add column if not exists shift_start time,
  add column if not exists shift_end time;

-- Supabase provides auth.jwt(); defined here only if missing (local staging).
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'jwt') then
    execute $f$create function auth.jwt() returns jsonb language sql stable as
      'select coalesce(nullif(current_setting(''request.jwt.claims'', true), ''''), ''{}'')::jsonb'$f$;
    execute 'grant execute on function auth.jwt() to anon, authenticated, service_role';
  end if;
end $$;

-- Tables ---------------------------------------------------------------------------------------------------
create table public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_session_id uuid not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text,
  full_name text,
  role_keys text[] not null default '{}',
  permissions jsonb not null default '[]',
  is_owner boolean not null default false,
  portal text not null default 'ops',
  user_agent text,
  device text,
  ip text,
  started_at timestamptz not null default now(),
  last_interaction_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_active_minute timestamptz,
  active_seconds integer not null default 0,
  last_business_action_at timestamptz,
  last_business_action text,
  business_actions integer not null default 0,
  failed_actions integer not null default 0,
  status text not null default 'active' check (status in ('active', 'ended')),
  end_reason text check (end_reason in ('manual', 'idle_timeout', 'revoked', 'expired', 'absolute_timeout', 'deactivated', 'security')),
  ended_at timestamptz,          -- a real sign-out / timeout / revocation recorded by the server; null when the browser never reported one
  invalidated_at timestamptz,    -- when the server invalidated the sign-in (refresh token removed)
  interrupted boolean not null default false,   -- ended by the server's clean-up because the browser stopped reporting
  save_status text check (save_status in ('saved', 'failed', 'nothing_pending', 'unknown')),
  end_note text
);
create index staff_sessions_user_idx on public.staff_sessions (user_id, started_at desc);
create index staff_sessions_active_idx on public.staff_sessions (status) where status = 'active';

-- Session timeline: login, navigation, active minutes, warnings, failures, sign-out. Append-only.
create table public.staff_session_events (
  id bigint generated always as identity primary key,
  session_id uuid references public.staff_sessions on delete cascade,
  user_id uuid not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('login', 'portal', 'navigation', 'active_minute', 'action_failed', 'draft_saved', 'draft_save_failed',
    'logout', 'idle_timeout', 'revoked', 'expired', 'deactivated', 'security', 'absolute_timeout', 'policy_acknowledged')),
  module text,
  path text,
  detail jsonb
);
create index staff_session_events_user_idx on public.staff_session_events (user_id, at);
create index staff_session_events_session_idx on public.staff_session_events (session_id, at);

-- Effective role history: the roles and permissions a person held from each moment. Append-only.
create table public.staff_role_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  effective_from timestamptz not null default now(),
  role_keys text[] not null,
  permissions jsonb not null,
  change text not null,
  changed_by uuid,
  reason text
);
create index staff_role_history_user_idx on public.staff_role_history (user_id, effective_from);

-- Autosaved drafts of unfinished forms (never a posted transaction).
create table public.staff_drafts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  draft_key text not null check (length(draft_key) between 3 and 200),
  data jsonb not null,
  session_id uuid references public.staff_sessions on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, draft_key)
);

create table public.staff_policy_acknowledgements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  version text not null,
  acknowledged_at timestamptz not null default now(),
  session_id uuid,
  primary key (user_id, version)
);

-- The audit log learns the session, the role held and whether the action succeeded.
alter table public.audit_log
  add column if not exists session_id uuid,
  add column if not exists role_keys text[],
  add column if not exists module text,
  add column if not exists result text not null default 'success' check (result in ('success', 'failure')),
  add column if not exists error_code text;
create index if not exists audit_log_session_idx on public.audit_log (session_id);

-- Retention: interaction events can be purged only through staff_purge_activity().
create function public._staff_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('mw.retention_purge', true) = 'on'
     and old.at < now() - make_interval(days => greatest(public.setting_num('monitoring.retention_days', 365)::int, 30)) then
    return old;
  end if;
  raise exception '% records are permanent and cannot be changed or deleted; record a correction instead', tg_table_name using errcode = '55000';
end;
$$;
create trigger staff_session_events_append_only before update or delete on public.staff_session_events
  for each row execute function public._staff_events_guard();
create trigger staff_role_history_append_only before update or delete on public.staff_role_history
  for each row execute function public.reject_change();
create trigger staff_policy_ack_append_only before update or delete on public.staff_policy_acknowledgements
  for each row execute function public.reject_change();

-- Helpers ---------------------------------------------------------------------------------------------------
create function public._staff_auth_session_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(auth.jwt() ->> 'session_id', '')::uuid;
exception when others then
  return null;
end;
$$;

create function public._staff_idle_limit()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(secs => greatest(public.setting_num('monitoring.idle_timeout_minutes', 5), 1) * 60)
$$;

-- The app reports interaction at most every 15 seconds, so the server allows that much on top of the timeout.
create function public._staff_grace()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '20 seconds'
$$;

create function public._is_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id
    and (p.is_admin or exists (select 1 from public.ops_user_roles r where r.user_id = p.id)))
$$;

-- Why the caller's session is not usable, or null when it is.
create function public._staff_session_problem()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sid uuid := public._staff_auth_session_id();
  s public.staff_sessions;
begin
  if auth.uid() is null then
    return 'signed_out';
  end if;
  if sid is null or not exists (select 1 from auth.sessions a where a.id = sid) then
    return 'invalid';
  end if;
  select * into s from public.staff_sessions where auth_session_id = sid;
  if not found then
    return 'not_started';
  end if;
  if s.status <> 'active' then
    return coalesce(s.end_reason, 'ended');
  end if;
  if now() - s.last_interaction_at > public._staff_idle_limit() + public._staff_grace() then
    return 'idle_timeout';
  end if;
  if now() - s.started_at > make_interval(hours => public.setting_num('monitoring.absolute_timeout_hours', 12)::int) then
    return 'absolute_timeout';
  end if;
  return null;
end;
$$;

create function public._staff_session()
returns public.staff_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.staff_sessions where auth_session_id = public._staff_auth_session_id()
$$;

create function public._staff_module(p_path text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_path is null then null
    when p_path ~ '^/sales' then 'field_sales'
    when p_path ~ '^/ops/production|^/ops/procurement' then 'production'
    when p_path ~ '^/ops/inventory' then 'inventory'
    when p_path ~ '^/ops/(dispatch|deliveries)' then 'dispatch'
    when p_path ~ '^/ops/subscriptions' then 'subscriptions'
    when p_path ~ '^/ops/finance/payroll' then 'payroll'
    when p_path ~ '^/ops/finance' then 'finance'
    when p_path ~ '^/ops/b2b/pricing' then 'pricing'
    when p_path ~ '^/ops/b2b/(team|reports)' then 'sales_team'
    when p_path ~ '^/ops/b2b/marketing' then 'marketing'
    when p_path ~ '^/ops/b2b/customers' then 'b2b_customers'
    when p_path ~ '^/ops/b2b' then 'dispatch'
    when p_path ~ '^/ops/catalog' then 'catalog'
    when p_path ~ '^/ops/admin/activity' then 'staff_monitoring'
    when p_path ~ '^/ops/admin' then 'administration'
    when p_path ~ '^/ops/reports' then 'reports'
    when p_path ~ '^/ops' then 'dashboard'
    else 'other'
  end
$$;

create function public._staff_entity_module(p_entity text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entity in ('production_batches', 'batch', 'recipes', 'milk_collections') then 'production'
    when p_entity in ('stock_lots', 'stock_movements', 'items') then 'inventory'
    when p_entity in ('orders', 'dispatches', 'order_allocations') then 'dispatch'
    when p_entity in ('purchase_invoices', 'payments', 'expenses', 'journal_entries', 'bank_accounts') then 'finance'
    when p_entity in ('payroll_runs', 'payroll_lines', 'employees') then 'payroll'
    when p_entity in ('b2b_customers', 'price_requests', 'wholesale_prices', 'salespeople', 'sales_territories', 'marketing_campaigns') then 'sales'
    when p_entity in ('profiles', 'ops_roles', 'ops_staff_invites', 'business_settings', 'staff_sessions', 'report') then 'administration'
    when p_entity in ('subscriptions', 'subscription_deliveries') then 'subscriptions'
    else p_entity
  end
$$;

-- The roles and permissions a person holds right now.
create function public._staff_access_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'roles', coalesce((select array_agg(r.role_key order by r.role_key) from public.ops_user_roles r where r.user_id = p_user_id), '{}'),
    'owner', coalesce((select p.is_admin from public.profiles p where p.id = p_user_id), false),
    'permissions', coalesce((select jsonb_agg(distinct rp.module || '.' || rp.action) from public.ops_user_roles r
      join public.ops_role_permissions rp on rp.role_key = r.role_key where r.user_id = p_user_id), '[]'))
$$;

-- Permission checks now also require a live session ------------------------------------------------------
create or replace function public.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.ops_active
      and (
        p.is_admin
        or exists (
          select 1
          from public.ops_user_roles ur
          join public.ops_role_permissions rp on rp.role_key = ur.role_key
          where ur.user_id = p.id and rp.module = p_module and rp.action = p_action
        )
      )
  ) and public._staff_session_problem() is null
$$;

create or replace function public.require_permission(p_module text, p_action text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  problem text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  problem := public._staff_session_problem();
  if problem is not null and public._is_staff(auth.uid()) then
    raise exception 'Your session has ended (%). Please sign in again.', replace(problem, '_', ' ') using errcode = '42501', hint = 'session_ended';
  end if;
  if not public.has_permission(p_module, p_action) then
    raise exception 'You do not have permission to % in %', p_action, p_module using errcode = '42501';
  end if;
end;
$$;

-- Every business action is stamped with the session and role, and counted on the session.
create or replace function public.write_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default null, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions := public._staff_session();
  -- One business action per committed transaction, however many audit rows it writes.
  first_in_txn boolean := not exists (select 1 from public.audit_log a where a.actor = auth.uid() and a.at = now() and a.result = 'success');
begin
  insert into public.audit_log (actor, action, entity, entity_id, details, reason, session_id, role_keys, module, result)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details, nullif(trim(coalesce(p_reason, '')), ''), s.id, s.role_keys,
    public._staff_entity_module(p_entity), 'success');
  if s.id is not null then
    update public.staff_sessions set last_business_action_at = now(), last_business_action = p_action,
      business_actions = business_actions + case when first_in_txn then 1 else 0 end
    where id = s.id;
  end if;
end;
$$;
revoke execute on function public.write_audit(text, text, text, jsonb, text) from public, anon, authenticated;

-- Steps recorded only as stock movements or batch status changes (e.g. issuing material to a batch) also
-- become audited business actions, once per transaction, attributed to the person and session.
create function public._staff_business_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or exists (select 1 from public.audit_log a where a.actor = auth.uid() and a.at = now() and a.result = 'success') then
    return null;
  end if;
  if tg_table_name = 'stock_movements' then
    perform public.write_audit('stock.' || new.movement_type, case when new.doc_type = 'batch' then 'production_batches' else 'stock_movements' end,
      case when new.doc_type = 'batch' then new.doc_id else new.id::text end,
      jsonb_build_object('movement', new.id, 'item', new.item_id, 'qty', new.qty, 'doc', new.doc_no));
  else
    perform public.write_audit('batch.' || new.to_status, 'production_batches', new.batch_id::text, jsonb_build_object('from', new.from_status, 'note', new.note));
  end if;
  return null;
end;
$$;
create trigger stock_movements_staff_business after insert on public.stock_movements
  for each row execute function public._staff_business_event();
create trigger batch_events_staff_business after insert on public.batch_events
  for each row execute function public._staff_business_event();
revoke execute on function public._staff_business_event() from public, anon, authenticated;

-- Role history ----------------------------------------------------------------------------------------------
create function public._staff_role_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
  snap jsonb;
begin
  if not exists (select 1 from public.profiles where id = uid) then
    return null;
  end if;
  snap := public._staff_access_snapshot(uid);
  insert into public.staff_role_history (user_id, role_keys, permissions, change, changed_by, reason)
  values (uid, array(select jsonb_array_elements_text(snap -> 'roles')), snap -> 'permissions',
    case when tg_op = 'INSERT' then 'granted ' || new.role_key else 'removed ' || old.role_key end,
    auth.uid(), nullif(current_setting('mw.change_reason', true), ''));
  return null;
end;
$$;
create trigger ops_user_roles_history after insert or delete on public.ops_user_roles
  for each row execute function public._staff_role_history();


-- Role changes carry their reason into the history.
create or replace function public.ops_set_user_roles(p_user_id uuid, p_role_keys text[], p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_roles text[];
begin
  perform public.require_permission('users', 'edit');
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'No such user';
  end if;
  if exists (select 1 from unnest(coalesce(p_role_keys, '{}')) r where r not in (select key from public.ops_roles)) then
    raise exception 'Unknown role';
  end if;
  if p_user_id = auth.uid() and not (select is_admin from public.profiles where id = p_user_id)
     and 'admin' <> all (coalesce(p_role_keys, '{}')) and exists (select 1 from public.ops_user_roles where user_id = p_user_id and role_key = 'admin') then
    raise exception 'You cannot remove your own administrator role';
  end if;
  perform set_config('mw.change_reason', coalesce(p_reason, ''), true);
  select coalesce(array_agg(role_key order by role_key), '{}') into before_roles from public.ops_user_roles where user_id = p_user_id;
  delete from public.ops_user_roles where user_id = p_user_id and role_key <> all (coalesce(p_role_keys, '{}'));
  insert into public.ops_user_roles (user_id, role_key, granted_by)
  select p_user_id, r, auth.uid() from unnest(coalesce(p_role_keys, '{}')) r
  on conflict do nothing;
  perform public.write_audit('user.roles', 'profiles', p_user_id::text,
    jsonb_build_object('from', before_roles, 'to', coalesce(p_role_keys, '{}')), p_reason);
end;
$$;

-- Session lifecycle -----------------------------------------------------------------------------------------
-- Durations of a session. Logged-in time runs to the recorded sign-out; when the browser never reported
-- one, to the moment the server's timeout took effect (last interaction + timeout), never a guessed time.
create function public._staff_durations(s public.staff_sessions)
returns table (effective_end timestamptz, logged_in_seconds integer, active_seconds integer, idle_seconds integer, since_business_seconds integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  effective_end := case
    when s.status = 'active' then least(now(), s.last_interaction_at + public._staff_idle_limit())
    when s.ended_at is not null then s.ended_at
    else least(coalesce(s.invalidated_at, now()), greatest(s.last_interaction_at + public._staff_idle_limit(), s.last_seen_at))
  end;
  logged_in_seconds := greatest(extract(epoch from effective_end - s.started_at), 0)::int;
  active_seconds := least(s.active_seconds, logged_in_seconds);
  idle_seconds := logged_in_seconds - active_seconds;
  since_business_seconds := greatest(extract(epoch from effective_end - coalesce(s.last_business_action_at, s.started_at)), 0)::int;
  return next;
end;
$$;

-- End a session on the server: mark it, record the event and remove the sign-in (its refresh token).
create function public._staff_end(p_session_id uuid, p_reason text, p_by_server boolean, p_save_status text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions;
begin
  select * into s from public.staff_sessions where id = p_session_id for update;
  if not found or s.status <> 'active' then
    return;
  end if;
  update public.staff_sessions set status = 'ended', end_reason = p_reason,
    ended_at = case when p_by_server then null else now() end,
    invalidated_at = now(), interrupted = p_by_server,
    save_status = coalesce(p_save_status, case when p_by_server then 'unknown' end), end_note = p_note
  where id = s.id;
  delete from auth.sessions where id = s.auth_session_id;
  insert into public.staff_session_events (session_id, user_id, kind, detail)
  values (s.id, s.user_id, case when p_reason = 'manual' then 'logout' else p_reason end,
    jsonb_build_object('by_server', p_by_server, 'save_status', p_save_status, 'note', p_note,
      'last_interaction_at', s.last_interaction_at, 'last_seen_at', s.last_seen_at));
end;
$$;

-- Server clean-up of sessions whose browser stopped reporting (closed, asleep, offline). They are ended
-- as 'expired' with no sign-out time: the last reliable server event stays the last thing we know.
create function public.staff_reconcile_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select s.id, s.user_id,
      case
        when not exists (select 1 from auth.sessions a where a.id = s.auth_session_id) then 'security'
        when not coalesce(p.ops_active, false) then 'deactivated'
        when now() - s.started_at > make_interval(hours => public.setting_num('monitoring.absolute_timeout_hours', 12)::int) then 'absolute_timeout'
        else 'expired'
      end as reason
    from public.staff_sessions s
    left join public.profiles p on p.id = s.user_id
    where s.status = 'active'
      and (now() - s.last_interaction_at > public._staff_idle_limit() + public._staff_grace()
        or not exists (select 1 from auth.sessions a where a.id = s.auth_session_id)
        or not coalesce(p.ops_active, false)
        or now() - s.started_at > make_interval(hours => public.setting_num('monitoring.absolute_timeout_hours', 12)::int))
    for update of s skip locked
  loop
    perform public._staff_end(r.id, r.reason, true, null, 'Ended by the server: no activity reported by the browser');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Called when a staff app page loads. Starts the record for a new sign-in, or reports that this sign-in
-- has ended (an ended sign-in is never revived). Does not count as interaction.
create function public.staff_session_start(p_portal text default 'ops', p_path text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  sid uuid := public._staff_auth_session_id();
  prof public.profiles;
  s public.staff_sessions;
  a record;
  snap jsonb;
  ver text := coalesce(public.setting('monitoring.policy_version') #>> '{}', '1');
  problem text;
begin
  if uid is null then
    return jsonb_build_object('state', 'signed_out');
  end if;
  select * into prof from public.profiles where id = uid;
  if not public._is_staff(uid) then
    return jsonb_build_object('state', 'not_staff');
  end if;
  perform public.staff_reconcile_sessions();
  if sid is null then
    return jsonb_build_object('state', 'ended', 'reason', 'invalid');
  end if;
  select * into s from public.staff_sessions where auth_session_id = sid;
  if found then
    problem := public._staff_session_problem();
    if problem is not null then
      if s.status = 'active' then
        perform public._staff_end(s.id, case when problem = 'invalid' then 'security' when problem = 'idle_timeout' then 'expired' else problem end, true);
      end if;
      select * into s from public.staff_sessions where id = s.id;
      return jsonb_build_object('state', 'ended', 'reason', s.end_reason);
    end if;
    update public.staff_sessions set last_seen_at = now(), portal = coalesce(nullif(p_portal, ''), portal) where id = s.id;
    if s.portal is distinct from p_portal then
      insert into public.staff_session_events (session_id, user_id, kind, module, path) values (s.id, uid, 'portal', p_portal, p_path);
    end if;
  else
    if not prof.ops_active then
      return jsonb_build_object('state', 'ended', 'reason', 'deactivated');
    end if;
    select * into a from auth.sessions x where x.id = sid;
    if not found then
      return jsonb_build_object('state', 'ended', 'reason', 'invalid');
    end if;
    snap := public._staff_access_snapshot(uid);
    insert into public.staff_sessions (auth_session_id, user_id, email, full_name, role_keys, permissions, is_owner, portal, user_agent, device, ip)
    values (sid, uid, prof.email, prof.full_name, array(select jsonb_array_elements_text(snap -> 'roles')), snap -> 'permissions', prof.is_admin,
      coalesce(nullif(p_portal, ''), 'ops'), left(a.user_agent, 300),
      case when a.user_agent ~* 'ipad|tablet' then 'tablet' when a.user_agent ~* 'mobile|android|iphone' then 'phone'
        when a.user_agent is null then null else 'computer' end,
      host(a.ip))
    returning * into s;
    insert into public.staff_session_events (session_id, user_id, kind, module, path, detail)
    values (s.id, uid, 'login', p_portal, p_path, jsonb_build_object('roles', s.role_keys, 'device', s.device));
  end if;
  return jsonb_build_object(
    'state', 'active', 'session_ref', 'S-' || upper(left(md5(s.id::text), 8)),
    'timeout_seconds', extract(epoch from public._staff_idle_limit())::int,
    'warning_seconds', public.setting_num('monitoring.warning_seconds', 30)::int,
    'policy_version', ver,
    'acknowledged', exists (select 1 from public.staff_policy_acknowledgements k where k.user_id = uid and k.version = ver),
    'server_now', now(), 'last_interaction_at', s.last_interaction_at);
end;
$$;

-- A real user interaction (click, key, scroll, touch, form input, navigation) reported by the app. The
-- server stamps its own time; active time is counted in whole minutes with interaction, once per session
-- however many tabs report. Only works on a live session, so it can never revive an ended one.
create function public.staff_activity_ping(p_kind text default 'interaction', p_path text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions := public._staff_session();
  problem text := public._staff_session_problem();
  minute timestamptz := date_trunc('minute', now());
begin
  if s.id is null or problem is not null then
    if s.id is not null and s.status = 'active' then
      perform public._staff_end(s.id, case when problem = 'invalid' then 'security' when problem = 'idle_timeout' then 'expired' else problem end, true);
    end if;
    return jsonb_build_object('state', 'ended', 'reason', coalesce(problem, 'not_started'));
  end if;
  if p_kind not in ('interaction', 'navigation') then
    raise exception 'Unknown activity';
  end if;
  update public.staff_sessions set last_interaction_at = now(), last_seen_at = now(),
    active_seconds = active_seconds + case when last_active_minute is distinct from minute then 60 else 0 end,
    last_active_minute = minute
  where id = s.id;
  if s.last_active_minute is distinct from minute then
    insert into public.staff_session_events (session_id, user_id, at, kind, module, path) values (s.id, s.user_id, minute, 'active_minute', public._staff_module(p_path), left(p_path, 200));
  end if;
  if p_kind = 'navigation' then
    insert into public.staff_session_events (session_id, user_id, kind, module, path) values (s.id, s.user_id, 'navigation', public._staff_module(p_path), left(p_path, 200));
  end if;
  return jsonb_build_object('state', 'active', 'expires_at', now() + public._staff_idle_limit());
end;
$$;

-- Background status check (every open tab). Never extends the session.
create function public.staff_session_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions := public._staff_session();
  problem text := public._staff_session_problem();
begin
  if s.id is null then
    return jsonb_build_object('state', 'ended', 'reason', coalesce(problem, 'not_started'));
  end if;
  if problem is not null then
    if s.status = 'active' then
      perform public._staff_end(s.id, case when problem = 'invalid' then 'security' when problem = 'idle_timeout' then 'expired' else problem end, true);
      select * into s from public.staff_sessions where id = s.id;
    end if;
    return jsonb_build_object('state', 'ended', 'reason', s.end_reason);
  end if;
  return jsonb_build_object('state', 'active', 'idle_seconds', extract(epoch from now() - s.last_interaction_at)::int,
    'timeout_seconds', extract(epoch from public._staff_idle_limit())::int);
end;
$$;

-- Sign-out from the app: manual, or the inactivity timeout, after saving drafts. p_save_status is what the
-- app's save step reported ('saved', 'failed', 'nothing_pending').
create function public.staff_session_end(p_reason text, p_save_status text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions := public._staff_session();
begin
  if p_reason not in ('manual', 'idle_timeout') then
    raise exception 'Unknown sign-out reason';
  end if;
  if p_save_status is not null and p_save_status not in ('saved', 'failed', 'nothing_pending') then
    raise exception 'Unknown save status';
  end if;
  if s.id is null then
    return jsonb_build_object('state', 'ended', 'reason', 'not_started');
  end if;
  if s.status <> 'active' then
    return jsonb_build_object('state', 'ended', 'reason', s.end_reason);
  end if;
  -- A timeout reported early (while interaction is still recent) is treated as a manual sign-out.
  perform public._staff_end(s.id,
    case when p_reason = 'idle_timeout' and now() - s.last_interaction_at < public._staff_idle_limit() - interval '15 seconds' then 'manual' else p_reason end,
    false, p_save_status, left(p_note, 300));
  return jsonb_build_object('state', 'ended', 'reason', p_reason);
end;
$$;

-- Administrator: end someone's session now.
create function public.staff_revoke_session(p_session_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('staff_monitoring', 'edit');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  if not exists (select 1 from public.staff_sessions where id = p_session_id and status = 'active') then
    raise exception 'That session has already ended';
  end if;
  perform public._staff_end(p_session_id, 'revoked', false, null, trim(p_reason));
  perform public.write_audit('session.revoke', 'staff_sessions', p_session_id::text, null, p_reason);
end;
$$;

-- Switching an account off ends its sessions straight away.
create function public._staff_on_deactivate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if old.ops_active and not new.ops_active then
    for r in select id from public.staff_sessions where user_id = new.id and status = 'active' loop
      perform public._staff_end(r.id, 'deactivated', false, null, 'Account switched off');
    end loop;
  end if;
  return null;
end;
$$;
create trigger profiles_staff_deactivate after update of ops_active on public.profiles
  for each row execute function public._staff_on_deactivate();

-- A failed action (refused permission, ended session, invalid entry), logged by the app's server after
-- the database refused it. Allowed even on an ended session, so refusals after a timeout are recorded.
create function public.staff_log_failure(p_action text, p_message text, p_path text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions := public._staff_session();
  code text;
begin
  if auth.uid() is null or not public._is_staff(auth.uid()) then
    return;
  end if;
  if (select count(*) from public.audit_log where actor = auth.uid() and result = 'failure' and at > now() - interval '1 minute') >= 30 then
    return;  -- rate limit
  end if;
  code := case
    when p_message ~* 'session has ended' then 'session_ended'
    when p_message ~* 'permission' then 'permission_denied'
    when p_message ~* 'not enough|stock' then 'stock'
    else 'rejected' end;
  insert into public.audit_log (actor, action, entity, entity_id, details, session_id, role_keys, module, result, error_code)
  values (auth.uid(), left(coalesce(p_action, 'unknown'), 80), 'action', null, jsonb_build_object('message', left(p_message, 300), 'path', left(p_path, 200)),
    s.id, s.role_keys, public._staff_module(p_path), 'failure', code);
  if s.id is not null then
    update public.staff_sessions set failed_actions = failed_actions + 1 where id = s.id;
    insert into public.staff_session_events (session_id, user_id, kind, module, path, detail)
    values (s.id, auth.uid(), 'action_failed', public._staff_module(p_path), left(p_path, 200), jsonb_build_object('action', p_action, 'error', code));
  end if;
end;
$$;

-- Drafts ----------------------------------------------------------------------------------------------------
create function public.staff_save_draft(p_key text, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions := public._staff_session();
  at timestamptz := now();
begin
  if public._staff_session_problem() is not null then
    raise exception 'Your session has ended; the draft stays on this device until you sign in again' using errcode = '42501', hint = 'session_ended';
  end if;
  if octet_length(p_data::text) > 200000 then
    raise exception 'Draft too large';
  end if;
  insert into public.staff_drafts (user_id, draft_key, data, session_id, updated_at) values (auth.uid(), p_key, p_data, s.id, at)
  on conflict (user_id, draft_key) do update set data = excluded.data, session_id = excluded.session_id, updated_at = at;
  return at;
end;
$$;

create function public.staff_get_draft(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('data', d.data, 'updated_at', d.updated_at) from public.staff_drafts d
  where d.user_id = auth.uid() and d.draft_key = p_key and public._staff_session_problem() is null
$$;

create function public.staff_discard_draft(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.staff_drafts where user_id = auth.uid() and draft_key = p_key
$$;

create function public.staff_my_drafts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', d.draft_key, 'updated_at', d.updated_at) order by d.updated_at desc), '[]')
  from public.staff_drafts d where d.user_id = auth.uid()
$$;

-- Monitoring notice ---------------------------------------------------------------------------------------
create function public.staff_acknowledge_policy(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.staff_sessions := public._staff_session();
begin
  if auth.uid() is null or not public._is_staff(auth.uid()) then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if p_version is distinct from coalesce(public.setting('monitoring.policy_version') #>> '{}', '1') then
    raise exception 'The notice has changed; please read the current version';
  end if;
  insert into public.staff_policy_acknowledgements (user_id, version, session_id) values (auth.uid(), p_version, s.id) on conflict do nothing;
  insert into public.staff_session_events (session_id, user_id, kind, detail) values (s.id, auth.uid(), 'policy_acknowledged', jsonb_build_object('version', p_version));
end;
$$;

-- What a staff member can see about their own recorded activity (transparency).
create function public.staff_my_activity()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('started_at', s.started_at, 'ended_at', s.ended_at, 'end_reason', s.end_reason, 'portal', s.portal,
        'device', s.device, 'business_actions', s.business_actions, 'interrupted', s.interrupted, 'save_status', s.save_status,
        'logged_in_seconds', d.logged_in_seconds, 'active_seconds', d.active_seconds) order by s.started_at desc), '[]')
      from (select * from public.staff_sessions where user_id = auth.uid() order by started_at desc limit 30) s
      cross join lateral public._staff_durations(s) d),
    'acknowledgements', (select coalesce(jsonb_agg(jsonb_build_object('version', k.version, 'at', k.acknowledged_at)), '[]')
      from public.staff_policy_acknowledgements k where k.user_id = auth.uid()))
$$;

-- Staff Activity & Audit Center ----------------------------------------------------------------------------
create function public._staff_ref(p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'S-' || upper(left(md5(p_id::text), 8))
$$;

create function public._staff_status_label(s public.staff_sessions)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.status = 'active' and now() - s.last_interaction_at < interval '60 seconds' then 'active_interaction'
    when s.status = 'active' and now() - s.last_interaction_at < public._staff_idle_limit() then 'no_recent_interaction'
    when s.status = 'active' then 'idle'
    when s.end_reason = 'manual' then 'logged_out'
    when s.end_reason = 'idle_timeout' then 'session_expired'
    when s.end_reason = 'revoked' then 'revoked'
    when s.interrupted then 'disconnected'
    else 'ended'
  end
$$;

create function public._staff_session_json(s public.staff_sessions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'ref', public._staff_ref(s.id), 'user_id', s.user_id, 'name', coalesce(s.full_name, s.email), 'email', s.email,
    'roles', s.role_keys, 'owner', s.is_owner, 'portal', s.portal, 'device', s.device, 'user_agent', s.user_agent, 'ip', s.ip,
    'started_at', s.started_at, 'last_interaction_at', s.last_interaction_at, 'last_seen_at', s.last_seen_at,
    'last_business_action_at', s.last_business_action_at, 'last_business_action', s.last_business_action,
    'business_actions', s.business_actions, 'failed_actions', s.failed_actions, 'status', s.status, 'status_label', public._staff_status_label(s),
    'end_reason', s.end_reason, 'ended_at', s.ended_at, 'invalidated_at', s.invalidated_at, 'interrupted', s.interrupted,
    'save_status', s.save_status, 'end_note', s.end_note,
    'idle_seconds_now', case when s.status = 'active' then extract(epoch from now() - s.last_interaction_at)::int end,
    'effective_end', d.effective_end, 'logged_in_seconds', d.logged_in_seconds, 'active_seconds', d.active_seconds,
    'idle_seconds', d.idle_seconds, 'since_business_seconds', d.since_business_seconds)
  from public._staff_durations(s) d
$$;

-- Live: open sessions (after clean-up) and today's ended ones.
create function public.staff_live_sessions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('staff_monitoring', 'view');
  perform public.staff_reconcile_sessions();
  return (select coalesce(jsonb_agg(public._staff_session_json(s) order by s.status, s.last_interaction_at desc), '[]')
    from public.staff_sessions s
    where s.status = 'active' or s.started_at >= (public.ist_today()::timestamp at time zone 'Asia/Kolkata'));
end;
$$;

-- Session history with filters.
create function public.staff_session_history(p_from date, p_to date, p_user_id uuid default null, p_reason text default null, p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('staff_monitoring', 'view');
  perform public.staff_reconcile_sessions();
  return (select coalesce(jsonb_agg(public._staff_session_json(s) order by s.started_at desc), '[]') from (
    select * from public.staff_sessions s
    where s.started_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and s.started_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
      and (p_user_id is null or s.user_id = p_user_id)
      and (coalesce(p_reason, '') = '' or s.end_reason = p_reason or (p_reason = 'interrupted' and s.interrupted) or (p_reason = 'active' and s.status = 'active'))
    order by s.started_at desc limit least(greatest(coalesce(p_limit, 500), 1), 5000)) s);
end;
$$;

-- Per employee: sessions, durations, how sessions ended, business actions by module.
create function public.staff_activity_report(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t1 timestamptz := p_from::timestamp at time zone 'Asia/Kolkata';
  t2 timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';
begin
  perform public.require_permission('staff_monitoring', 'view');
  perform public.staff_reconcile_sessions();
  return (select coalesce(jsonb_agg(x order by x ->> 'name'), '[]') from (
    select jsonb_build_object(
      'user_id', p.id, 'name', coalesce(p.full_name, p.email), 'email', p.email, 'department', p.department, 'active', p.ops_active,
      'current_roles', coalesce((select array_agg(r.role_key order by r.role_key) from public.ops_user_roles r where r.user_id = p.id), '{}'),
      'sessions', count(s.id),
      'logged_in_seconds', coalesce(sum(d.logged_in_seconds), 0), 'active_seconds', coalesce(sum(d.active_seconds), 0),
      'idle_seconds', coalesce(sum(d.idle_seconds), 0),
      'no_business_seconds', coalesce(sum(case when s.business_actions = 0 then d.logged_in_seconds else 0 end), 0),
      'timeouts', count(*) filter (where s.end_reason = 'idle_timeout'),
      'manual_logouts', count(*) filter (where s.end_reason = 'manual'),
      'interrupted', count(*) filter (where s.interrupted),
      'revoked', count(*) filter (where s.end_reason = 'revoked'),
      'business_actions', (select count(*) from public.audit_log a where a.actor = p.id and a.result = 'success' and a.at >= t1 and a.at < t2),
      'failed_actions', (select count(*) from public.audit_log a where a.actor = p.id and a.result = 'failure' and a.at >= t1 and a.at < t2),
      'by_module', (select coalesce(jsonb_object_agg(m.module, m.n), '{}') from (select coalesce(a.module, 'other') as module, count(*) as n
        from public.audit_log a where a.actor = p.id and a.result = 'success' and a.at >= t1 and a.at < t2 group by 1) m),
      'orders_processed', (select count(distinct a.entity_id) from public.audit_log a where a.actor = p.id and a.result = 'success' and a.at >= t1 and a.at < t2
        and (a.action like 'order.%' or a.action like 'dispatch.%')),
      'batches_updated', (select count(distinct a.entity_id) from public.audit_log a where a.actor = p.id and a.result = 'success' and a.at >= t1 and a.at < t2
        and a.entity in ('production_batches', 'batch')),
      'dispatches_completed', (select count(*) from public.audit_log a where a.actor = p.id and a.result = 'success' and a.at >= t1 and a.at < t2
        and a.action in ('order.dispatch', 'dispatch.delivered')),
      'finance_entries', case when public.has_permission('sales', 'view') or public.has_permission('purchases', 'view') then
        (select count(*) from public.audit_log a where a.actor = p.id and a.result = 'success' and a.at >= t1 and a.at < t2 and a.module in ('finance', 'payroll')) end
    ) as x
    from public.profiles p
    left join public.staff_sessions s on s.user_id = p.id and s.started_at >= t1 and s.started_at < t2
    left join lateral public._staff_durations(s) d on s.id is not null
    where p.is_admin or exists (select 1 from public.ops_user_roles r where r.user_id = p.id) or exists (select 1 from public.staff_sessions z where z.user_id = p.id)
    group by p.id) t);
end;
$$;

-- One person's day, from recorded events only: sign-ins, navigation, business actions, failures, gaps
-- without interaction (between recorded active minutes) and how each session ended.
create function public.staff_timeline(p_user_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t1 timestamptz := p_date::timestamp at time zone 'Asia/Kolkata';
  t2 timestamptz := (p_date + 1)::timestamp at time zone 'Asia/Kolkata';
  gap_min integer := greatest(public.setting_num('monitoring.idle_timeout_minutes', 5)::int, 1);
begin
  perform public.require_permission('staff_monitoring', 'view');
  return (select coalesce(jsonb_agg(x order by x ->> 'at', x ->> 'seq'), '[]') from (
    -- Session events (minute markers are summarised as gaps below, not listed one by one).
    select jsonb_build_object('at', e.at, 'seq', '1' || lpad(e.id::text, 12, '0'), 'kind', e.kind, 'module', e.module, 'path', e.path,
      'detail', e.detail, 'session', public._staff_ref(e.session_id)) as x
    from public.staff_session_events e
    where e.user_id = p_user_id and e.at >= t1 and e.at < t2 and e.kind <> 'active_minute'
    union all
    -- Business actions and failures from the audit log.
    select jsonb_build_object('at', a.at, 'seq', '2' || lpad(a.id::text, 12, '0'), 'kind', case when a.result = 'failure' then 'action_failed' else 'business_action' end,
      'module', a.module, 'action', a.action, 'entity', a.entity, 'entity_id', a.entity_id, 'reason', a.reason, 'error_code', a.error_code,
      'session', case when a.session_id is not null then public._staff_ref(a.session_id) end)
    from public.audit_log a
    where a.actor = p_user_id and a.at >= t1 and a.at < t2
    union all
    -- Gaps: no interaction recorded between two consecutive active minutes of the same session.
    select jsonb_build_object('at', g.prev_at + interval '1 minute', 'seq', '0', 'kind', 'no_interaction',
      'minutes', extract(epoch from g.at - g.prev_at - interval '1 minute')::int / 60, 'until', g.at, 'session', public._staff_ref(g.session_id))
    from (select e.session_id, e.at, lag(e.at) over (partition by e.session_id order by e.at) as prev_at
          from public.staff_session_events e where e.user_id = p_user_id and e.kind = 'active_minute' and e.at >= t1 and e.at < t2) g
    where g.prev_at is not null and g.at - g.prev_at > make_interval(mins => 2)
    union all
    -- Sessions that the server ended after the browser stopped reporting: the last recorded interaction.
    select jsonb_build_object('at', s.last_interaction_at, 'seq', '3', 'kind', 'last_interaction', 'session', public._staff_ref(s.id),
      'detail', jsonb_build_object('then', case when s.interrupted then 'no further activity; ended by the server' else s.end_reason end))
    from public.staff_sessions s where s.user_id = p_user_id and s.started_at >= t1 and s.started_at < t2 and s.status = 'ended'
  ) t);
end;
$$;

-- Periods without interaction, and without business actions, at least the given length.
create function public.staff_inactivity_report(p_from date, p_to date, p_min_idle_minutes integer default 5, p_min_no_action_minutes integer default 30,
  p_user_id uuid default null, p_role text default null, p_module text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t1 timestamptz := p_from::timestamp at time zone 'Asia/Kolkata';
  t2 timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';
begin
  perform public.require_permission('staff_monitoring', 'view');
  perform public.staff_reconcile_sessions();
  return (select coalesce(jsonb_agg(x order by x ->> 'from'), '[]') from (
    -- No interaction: between consecutive active minutes (and from the last one to the end of the session).
    select jsonb_build_object('type', 'no_interaction', 'user_id', s.user_id, 'name', coalesce(s.full_name, s.email), 'roles', s.role_keys,
      'session', public._staff_ref(s.id), 'portal', s.portal, 'module', g.module, 'from', g.gap_from, 'to', g.gap_to,
      'minutes', round(extract(epoch from g.gap_to - g.gap_from) / 60)) as x
    from public.staff_sessions s
    cross join lateral public._staff_durations(s) d
    cross join lateral (
      select m.module, m.at + interval '1 minute' as gap_from, coalesce(lead(m.at) over (order by m.at), d.effective_end) as gap_to
      from (select s.started_at - interval '1 minute' as at, null::text as module
            union all select e.at, e.module from public.staff_session_events e where e.session_id = s.id and e.kind = 'active_minute') m
    ) g
    where s.started_at >= t1 and s.started_at < t2 and (p_user_id is null or s.user_id = p_user_id)
      and (coalesce(p_role, '') = '' or p_role = any (s.role_keys)) and (coalesce(p_module, '') = '' or g.module = p_module)
      and g.gap_to - g.gap_from >= make_interval(mins => greatest(coalesce(p_min_idle_minutes, 5), 1))
    union all
    -- No recorded business action within a session for at least the given time.
    select jsonb_build_object('type', 'no_business_action', 'user_id', s.user_id, 'name', coalesce(s.full_name, s.email), 'roles', s.role_keys,
      'session', public._staff_ref(s.id), 'portal', s.portal, 'module', b.module, 'from', b.gap_from, 'to', b.gap_to,
      'minutes', round(extract(epoch from b.gap_to - b.gap_from) / 60))
    from public.staff_sessions s
    cross join lateral public._staff_durations(s) d
    cross join lateral (
      select a.module, a.at as gap_from, coalesce(lead(a.at) over (order by a.at), d.effective_end) as gap_to
      from (select s.started_at as at, null::text as module
            union all select x.at, x.module from public.audit_log x where x.session_id = s.id and x.result = 'success') a
    ) b
    where s.started_at >= t1 and s.started_at < t2 and (p_user_id is null or s.user_id = p_user_id)
      and (coalesce(p_role, '') = '' or p_role = any (s.role_keys))
      and b.gap_to - b.gap_from >= make_interval(mins => greatest(coalesce(p_min_no_action_minutes, 30), 1))
  ) t);
end;
$$;

-- Attendance view (separate from application use): shift, first sign-in, last session end, totals.
create function public.staff_attendance(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('staff_monitoring', 'view');
  perform public.staff_reconcile_sessions();
  return (select coalesce(jsonb_agg(x order by x ->> 'day', x ->> 'name'), '[]') from (
    select jsonb_build_object('day', public._ist_date(s.started_at), 'user_id', p.id, 'name', coalesce(p.full_name, p.email), 'department', p.department,
      'shift_start', p.shift_start, 'shift_end', p.shift_end,
      'first_login', min(s.started_at), 'last_end', max(d.effective_end),
      'sessions', count(*), 'logged_in_seconds', sum(d.logged_in_seconds), 'active_seconds', sum(d.active_seconds), 'idle_seconds', sum(d.idle_seconds),
      'interrupted', count(*) filter (where s.interrupted), 'manual_logouts', count(*) filter (where s.end_reason = 'manual'),
      'timeouts', count(*) filter (where s.end_reason = 'idle_timeout')) as x
    from public.staff_sessions s
    join public.profiles p on p.id = s.user_id
    cross join lateral public._staff_durations(s) d
    where s.started_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and s.started_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
    group by public._ist_date(s.started_at), p.id) t);
end;
$$;

-- Role history for a person (what they held when).
create function public.staff_role_history_for(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('staff_monitoring', 'view');
  return (select coalesce(jsonb_agg(jsonb_build_object('effective_from', h.effective_from, 'roles', h.role_keys, 'permissions', h.permissions,
      'change', h.change, 'reason', h.reason, 'changed_by', coalesce(p.full_name, p.email)) order by h.effective_from desc, h.id desc), '[]')
    from public.staff_role_history h left join public.profiles p on p.id = h.changed_by where h.user_id = p_user_id);
end;
$$;

create function public.staff_set_shift(p_user_id uuid, p_department text, p_shift_start time, p_shift_end time)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('users', 'edit');
  update public.profiles set department = nullif(trim(coalesce(p_department, '')), ''), shift_start = p_shift_start, shift_end = p_shift_end where id = p_user_id;
  if not found then
    raise exception 'No such user';
  end if;
  perform public.write_audit('user.shift', 'profiles', p_user_id::text, jsonb_build_object('department', p_department, 'start', p_shift_start, 'end', p_shift_end));
end;
$$;

-- Retention: removes interaction events (navigation / active minutes) older than the retention period.
-- Sessions, business audit, failures and role history are kept.
create function public.staff_purge_activity()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_permission('staff_monitoring', 'delete');
  perform set_config('mw.retention_purge', 'on', true);
  delete from public.staff_session_events
  where kind in ('active_minute', 'navigation', 'portal')
    and at < now() - make_interval(days => greatest(public.setting_num('monitoring.retention_days', 365)::int, 30));
  get diagnostics n = row_count;
  perform set_config('mw.retention_purge', 'off', true);
  perform public.write_audit('monitoring.purge', 'staff_session_events', null, jsonb_build_object('removed', n));
  return n;
end;
$$;

-- Access rules ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['staff_sessions', 'staff_session_events', 'staff_role_history', 'staff_drafts', 'staff_policy_acknowledgements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy "Monitoring staff read sessions" on public.staff_sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff_monitoring', 'view')));
create policy "Monitoring staff read session events" on public.staff_session_events for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff_monitoring', 'view')));
create policy "Monitoring staff read role history" on public.staff_role_history for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff_monitoring', 'view')));
create policy "People read their own drafts" on public.staff_drafts for select to authenticated using (user_id = (select auth.uid()));
create policy "Monitoring staff read acknowledgements" on public.staff_policy_acknowledgements for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff_monitoring', 'view')));

do $$
declare
  f text;
begin
  foreach f in array array[
    '_staff_auth_session_id()', '_staff_idle_limit()', '_staff_grace()', '_is_staff(uuid)', '_staff_session_problem()', '_staff_session()',
    '_staff_access_snapshot(uuid)', '_staff_role_history()', '_staff_durations(public.staff_sessions)', '_staff_end(uuid, text, boolean, text, text)',
    '_staff_on_deactivate()', '_staff_events_guard()', '_staff_status_label(public.staff_sessions)', '_staff_session_json(public.staff_sessions)',
    'staff_reconcile_sessions()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'staff_session_start(text, text)', 'staff_activity_ping(text, text)', 'staff_session_status()', 'staff_session_end(text, text, text)',
    'staff_revoke_session(uuid, text)', 'staff_log_failure(text, text, text)', 'staff_save_draft(text, jsonb)', 'staff_get_draft(text)',
    'staff_discard_draft(text)', 'staff_my_drafts()', 'staff_acknowledge_policy(text)', 'staff_my_activity()', 'staff_live_sessions()',
    'staff_session_history(date, date, uuid, text, integer)', 'staff_activity_report(date, date)', 'staff_timeline(uuid, date)',
    'staff_inactivity_report(date, date, integer, integer, uuid, text, text)', 'staff_attendance(date, date)', 'staff_role_history_for(uuid)',
    'staff_set_shift(uuid, text, time, time)', 'staff_purge_activity()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.staff_reconcile_sessions() to service_role;

-- Starting history: everyone's current roles, effective from now.
insert into public.staff_role_history (user_id, role_keys, permissions, change)
select p.id, array(select jsonb_array_elements_text(public._staff_access_snapshot(p.id) -> 'roles')), public._staff_access_snapshot(p.id) -> 'permissions', 'history started'
from public.profiles p where p.is_admin or exists (select 1 from public.ops_user_roles r where r.user_id = p.id);

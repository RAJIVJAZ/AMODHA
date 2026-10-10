-- Business application foundation (the /ops portals).
--
-- Security model, used by every ops table that follows:
--   * Row-level security is on, and the API roles have no INSERT/UPDATE/DELETE grants.
--   * Reads go through SELECT policies that check public.has_permission(module, action).
--   * Every write goes through a SECURITY DEFINER function that checks the caller's permission
--     with public.require_permission(), does its work in one transaction and writes the audit log.
--   * Posted / approved records are never edited in place; corrections are new, linked records.

-- Permission matrix ------------------------------------------------------
create table public.ops_modules (
  key text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0
);

create table public.ops_actions (
  key text primary key check (key in ('view', 'create', 'edit', 'approve', 'export', 'delete')),
  label text not null,
  sort_order integer not null default 0
);

create table public.ops_roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ops_role_permissions (
  role_key text not null references public.ops_roles on delete cascade,
  module text not null references public.ops_modules,
  action text not null references public.ops_actions,
  primary key (role_key, module, action)
);

create table public.ops_user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_key text not null references public.ops_roles on delete cascade,
  granted_by uuid references auth.users on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);
create index ops_user_roles_role_idx on public.ops_user_roles (role_key);

-- Roles waiting for someone who hasn't signed in yet; applied when their account is created.
create table public.ops_staff_invites (
  email text primary key check (email = lower(email)),
  role_keys text[] not null,
  invited_by uuid references auth.users on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Staff accounts can be switched off without deleting them.
alter table public.profiles add column if not exists ops_active boolean not null default true;
alter table public.profiles add column if not exists job_title text;

insert into public.ops_actions (key, label, sort_order) values
  ('view', 'View', 1), ('create', 'Create', 2), ('edit', 'Edit', 3),
  ('approve', 'Approve', 4), ('export', 'Export', 5), ('delete', 'Delete / cancel', 6);

insert into public.ops_modules (key, label, description, sort_order) values
  ('dashboard', 'Dashboard', 'Business overview figures', 1),
  ('users', 'Users & roles', 'Staff accounts, roles and permissions', 2),
  ('settings', 'Business settings', 'Company, tax, thresholds, delivery and subscription settings', 3),
  ('catalog', 'Products & recipes', 'Products, SKUs, recipes and packaging configurations', 4),
  ('inventory', 'Inventory', 'Stock, lots, adjustments and expiry', 5),
  ('procurement', 'Milk procurement', 'Milk collection register and suppliers', 6),
  ('production', 'Manufacturing', 'Batches, material issues, output and packaging', 7),
  ('quality', 'Quality control', 'Quality checks and batch approval', 8),
  ('dispatch', 'Orders & dispatch', 'Order allocation, dispatch and delivery status', 9),
  ('subscriptions', 'Milk subscriptions', 'Subscribers, daily milk demand and deliveries', 10),
  ('purchases', 'Purchases & payables', 'Supplier invoices and supplier payments', 11),
  ('sales', 'Sales & receivables', 'Sales accounting, receipts, refunds and credit notes', 12),
  ('expenses', 'Expenses', 'Expense register and approvals', 13),
  ('payroll', 'Employees & payroll', 'Employee records, salaries, advances and payroll (sensitive)', 14),
  ('banking', 'Cash & bank', 'Cash and bank accounts, transfers and reconciliation', 15),
  ('reports', 'Financial reports', 'Profit and loss, cash flow, margins and valuation', 16),
  ('audit', 'Audit log', 'Who changed what, and login history', 17);

insert into public.ops_roles (key, label, description, is_system) values
  ('admin', 'Administrator', 'Full control of the business application', true),
  ('production_manager', 'Production & dispatch manager', 'Runs manufacturing, packaging, stock and dispatch. No salary or financial-report access.', true),
  ('finance_officer', 'Finance officer', 'Purchases, sales accounting, expenses, payroll, cash and bank. Read-only on production.', true),
  ('quality_inspector', 'Quality inspector', 'Records quality checks and approves or rejects batches.', true),
  ('dispatch_staff', 'Dispatch & delivery staff', 'Picks, packs and updates delivery status.', true);

-- Administrator: everything.
insert into public.ops_role_permissions (role_key, module, action)
select 'admin', m.key, a.key from public.ops_modules m cross join public.ops_actions a;

-- Production & dispatch manager.
insert into public.ops_role_permissions (role_key, module, action)
select 'production_manager', v.module, v.action
from (values
  ('dashboard', 'view'),
  ('catalog', 'view'),
  ('inventory', 'view'), ('inventory', 'create'), ('inventory', 'edit'), ('inventory', 'export'),
  ('procurement', 'view'), ('procurement', 'create'), ('procurement', 'edit'), ('procurement', 'export'),
  ('production', 'view'), ('production', 'create'), ('production', 'edit'), ('production', 'approve'), ('production', 'export'),
  ('quality', 'view'), ('quality', 'create'),
  ('dispatch', 'view'), ('dispatch', 'create'), ('dispatch', 'edit'), ('dispatch', 'approve'), ('dispatch', 'export'),
  ('subscriptions', 'view')
) as v (module, action);

-- Finance officer.
insert into public.ops_role_permissions (role_key, module, action)
select 'finance_officer', v.module, v.action
from (values
  ('dashboard', 'view'),
  ('catalog', 'view'),
  ('inventory', 'view'), ('inventory', 'export'),
  ('procurement', 'view'), ('procurement', 'export'),
  ('production', 'view'), ('production', 'export'),
  ('dispatch', 'view'),
  ('subscriptions', 'view'), ('subscriptions', 'export'),
  ('purchases', 'view'), ('purchases', 'create'), ('purchases', 'edit'), ('purchases', 'approve'), ('purchases', 'export'),
  ('sales', 'view'), ('sales', 'create'), ('sales', 'edit'), ('sales', 'approve'), ('sales', 'export'),
  ('expenses', 'view'), ('expenses', 'create'), ('expenses', 'edit'), ('expenses', 'export'),
  ('payroll', 'view'), ('payroll', 'create'), ('payroll', 'edit'), ('payroll', 'approve'), ('payroll', 'export'),
  ('banking', 'view'), ('banking', 'create'), ('banking', 'edit'), ('banking', 'approve'), ('banking', 'export'),
  ('reports', 'view'), ('reports', 'export')
) as v (module, action);

insert into public.ops_role_permissions (role_key, module, action)
select 'quality_inspector', v.module, v.action
from (values ('dashboard', 'view'), ('production', 'view'), ('quality', 'view'), ('quality', 'create'), ('quality', 'approve')) as v (module, action);

insert into public.ops_role_permissions (role_key, module, action)
select 'dispatch_staff', v.module, v.action
from (values ('dispatch', 'view'), ('dispatch', 'edit'), ('inventory', 'view'), ('subscriptions', 'view')) as v (module, action);

-- Permission checks ------------------------------------------------------
-- The owner accounts (profiles.is_admin) always have every permission.
create function public.has_permission(p_module text, p_action text)
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
  )
$$;

create function public.require_permission(p_module text, p_action text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if not public.has_permission(p_module, p_action) then
    raise exception 'You do not have permission to % in %', p_action, p_module using errcode = '42501';
  end if;
end;
$$;

-- What the signed-in person may do (the app uses this to build menus; the database still checks every action).
create function public.my_permissions()
returns table (module text, action text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.key, a.key
  from public.ops_modules m
  cross join public.ops_actions a
  where public.has_permission(m.key, a.key)
$$;

-- Audit trail --------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  reason text
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_actor_idx on public.audit_log (actor);

create function public.write_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default null, p_reason text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor, action, entity, entity_id, details, reason)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details, nullif(trim(coalesce(p_reason, '')), ''));
$$;

-- Ledgers and logs are append-only.
create function public.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are permanent and cannot be changed or deleted; record a correction instead', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.reject_change();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.reject_change();

-- Business settings ---------------------------------------------------------
create table public.business_settings (
  key text primary key,
  value jsonb not null,
  label text not null,
  description text,
  category text not null,
  value_type text not null default 'number' check (value_type in ('number', 'text', 'boolean', 'time', 'json')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null
);

insert into public.business_settings (key, value, label, description, category, value_type) values
  ('company', '{"legal_name": "Anuradha Enterprises", "brand": "Mithai Wallah", "gstin": "09AGNPJ5616L1ZW", "fssai": "12725998000262", "state": "Uttar Pradesh", "state_code": "09", "city": "Prayagraj"}',
    'Company details', 'Legal name, brand, GSTIN, FSSAI licence and state', 'company', 'json'),
  ('tax.prices_include_gst', 'true', 'Selling prices include GST', 'When on, GST is worked out from the price the customer pays', 'tax', 'boolean'),
  ('tax.gst_registered', 'true', 'GST registered', 'Turn off if purchases should carry GST inside inventory cost', 'tax', 'boolean'),
  ('production.variance_threshold_pct', '5', 'Material variance needing an explanation (%)', 'If actual use differs from plan by more than this, the manager must explain', 'production', 'number'),
  ('production.min_yield_pct', '85', 'Yield alert below (%)', 'Batches whose yield falls below this are flagged (a product can override it)', 'production', 'number'),
  ('production.output_tolerance_pct', '1', 'Output split tolerance (%)', 'Finished + rejected + rework must match actual output within this', 'production', 'number'),
  ('production.packaging_tolerance_pct', '2', 'Packaging reconciliation tolerance (%)', 'Packed + unpacked must match the finished quantity within this, or an approver must sign off', 'production', 'number'),
  ('production.overhead_per_kg', '0', 'Manufacturing overhead per kg / litre (₹)', 'Allocated to each batch on release; 0 to leave out', 'production', 'number'),
  ('production.labour_cost_per_hour', '0', 'Direct labour cost per batch hour (₹)', 'Allocated from batch start to finish times; 0 to leave out', 'production', 'number'),
  ('inventory.expiry_alert_days', '3', 'Near-expiry alert (days)', 'Stock expiring within this many days is flagged', 'inventory', 'number'),
  ('inventory.adjustment_approval_value', '2000', 'Stock adjustment needing approval (₹)', 'Write-offs and corrections worth more than this need inventory approve permission', 'inventory', 'number'),
  ('finance.expense_approval_limit', '5000', 'Expense needing approval (₹)', 'Expenses above this stay pending until someone with approve permission approves them', 'finance', 'number'),
  ('finance.year_start_month', '4', 'Financial year starts in month', '4 = April', 'finance', 'number'),
  ('delivery.areas', '[{"name": "Prayagraj", "pincode_prefix": "211"}]', 'Delivery areas', 'Areas served, by pincode prefix', 'delivery', 'json'),
  ('subscriptions.enabled', 'false', 'Milk subscriptions open to customers', 'Keep off until the service launches; staff can still test', 'subscriptions', 'boolean'),
  ('subscriptions.cutoff_time', '"20:00"', 'Change cut-off for next delivery', 'Customers can change the next day''s delivery until this time (India time) the day before', 'subscriptions', 'time'),
  ('subscriptions.schedule_days', '14', 'Days of deliveries scheduled ahead', 'How far ahead upcoming deliveries are created', 'subscriptions', 'number'),
  ('subscriptions.bottle_deposit', '0', 'Glass bottle deposit (₹ per bottle)', 'Refundable deposit; 0 for none', 'subscriptions', 'number'),
  ('subscriptions.bottle_damage_charge', '0', 'Damaged / lost bottle charge (₹)', 'Charged only when shown to the customer before subscribing', 'subscriptions', 'number'),
  ('subscriber_benefits', '{"discount_pct": 20, "free_delivery_minimum": 499, "priority_delivery": true, "priority_support": true}',
    'Milk subscriber benefits', 'Discount and delivery benefits for active milk subscribers', 'subscriptions', 'json');

create function public.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.business_settings where key = p_key
$$;

create function public.setting_num(p_key text, p_default numeric default 0)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.business_settings where key = p_key), p_default)
$$;

create function public.ops_update_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_value jsonb;
  kind text;
begin
  perform public.require_permission('settings', 'edit');
  select value, value_type into old_value, kind from public.business_settings where key = p_key for update;
  if not found then
    raise exception 'Unknown setting %', p_key;
  end if;
  if kind = 'number' and jsonb_typeof(p_value) <> 'number' then
    raise exception 'Setting % must be a number', p_key;
  elsif kind = 'boolean' and jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'Setting % must be on or off', p_key;
  elsif kind = 'time' and (jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception 'Setting % must be a time like 20:00', p_key;
  end if;
  update public.business_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public.write_audit('setting.update', 'business_settings', p_key, jsonb_build_object('from', old_value, 'to', p_value));
end;
$$;

-- Document numbers: permanent, gap-free per type and period (e.g. MW-MFG-2026-0001).
create table public.doc_counters (
  doc_type text not null,
  period text not null,
  last_number integer not null default 0,
  primary key (doc_type, period)
);

create function public.next_doc_number(p_doc_type text, p_prefix text, p_period text, p_width integer default 4)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.doc_counters (doc_type, period, last_number) values (p_doc_type, p_period, 1)
  on conflict (doc_type, period) do update set last_number = public.doc_counters.last_number + 1
  returning last_number into n;
  return p_prefix || '-' || p_period || '-' || lpad(n::text, p_width, '0');
end;
$$;

-- India time helpers.
create function public.ist_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create function public.financial_year(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when extract(month from p_date) >= 4
    then extract(year from p_date)::int::text || '-' || lpad(((extract(year from p_date)::int + 1) % 100)::text, 2, '0')
    else (extract(year from p_date)::int - 1)::text || '-' || lpad((extract(year from p_date)::int % 100)::text, 2, '0')
  end
$$;

-- Staff management -----------------------------------------------------------
create function public.ops_set_user_roles(p_user_id uuid, p_role_keys text[], p_reason text default null)
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
  select coalesce(array_agg(role_key order by role_key), '{}') into before_roles from public.ops_user_roles where user_id = p_user_id;
  delete from public.ops_user_roles where user_id = p_user_id and role_key <> all (coalesce(p_role_keys, '{}'));
  insert into public.ops_user_roles (user_id, role_key, granted_by)
  select p_user_id, r, auth.uid() from unnest(coalesce(p_role_keys, '{}')) r
  on conflict do nothing;
  perform public.write_audit('user.roles', 'profiles', p_user_id::text,
    jsonb_build_object('from', before_roles, 'to', coalesce(p_role_keys, '{}')), p_reason);
end;
$$;

-- Give a person staff roles by email. If they already have an account the roles apply now;
-- otherwise they apply the first time they sign in.
create function public.ops_invite_staff(p_email text, p_role_keys text[], p_job_title text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(p_email));
  existing uuid;
begin
  perform public.require_permission('users', 'create');
  if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if coalesce(array_length(p_role_keys, 1), 0) = 0 then
    raise exception 'Choose at least one role';
  end if;
  if exists (select 1 from unnest(p_role_keys) r where r not in (select key from public.ops_roles)) then
    raise exception 'Unknown role';
  end if;
  select id into existing from public.profiles where email = clean_email;
  if existing is not null then
    perform public.ops_set_user_roles(existing, (select array(select distinct x from unnest(p_role_keys || coalesce((select array_agg(role_key) from public.ops_user_roles where user_id = existing), '{}')) x)), 'Added as staff');
    update public.profiles set ops_active = true, job_title = coalesce(nullif(trim(p_job_title), ''), job_title) where id = existing;
    return 'assigned';
  end if;
  insert into public.ops_staff_invites (email, role_keys, invited_by) values (clean_email, p_role_keys, auth.uid())
  on conflict (email) do update set role_keys = excluded.role_keys, invited_by = excluded.invited_by, invited_at = now(), accepted_at = null;
  perform public.write_audit('user.invite', 'ops_staff_invites', clean_email, jsonb_build_object('roles', p_role_keys, 'job_title', p_job_title));
  return 'invited';
end;
$$;

create function public.ops_set_user_active(p_user_id uuid, p_active boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('users', 'edit');
  if p_user_id = auth.uid() then
    raise exception 'You cannot switch off your own account';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  update public.profiles set ops_active = p_active where id = p_user_id;
  if not found then
    raise exception 'No such user';
  end if;
  if not p_active then
    delete from auth.sessions where user_id = p_user_id;
  end if;
  perform public.write_audit(case when p_active then 'user.activate' else 'user.deactivate' end, 'profiles', p_user_id::text, null, p_reason);
end;
$$;

-- "Reset access": signs the person out on every device; they must sign in again with a fresh code.
create function public.ops_reset_user_sessions(p_user_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_permission('users', 'edit');
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  perform public.write_audit('user.sessions_reset', 'profiles', p_user_id::text, jsonb_build_object('sessions_ended', n), p_reason);
  return n;
end;
$$;

create function public.ops_set_role_permissions(p_role_key text, p_permissions jsonb, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_perms jsonb;
begin
  perform public.require_permission('users', 'approve');
  if p_role_key = 'admin' then
    raise exception 'The administrator role always has every permission';
  end if;
  if not exists (select 1 from public.ops_roles where key = p_role_key) then
    raise exception 'No such role';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('module', module, 'action', action) order by module, action), '[]')
    into before_perms from public.ops_role_permissions where role_key = p_role_key;
  delete from public.ops_role_permissions where role_key = p_role_key;
  insert into public.ops_role_permissions (role_key, module, action)
  select distinct p_role_key, e ->> 'module', e ->> 'action' from jsonb_array_elements(coalesce(p_permissions, '[]')) e;
  perform public.write_audit('role.permissions', 'ops_roles', p_role_key, jsonb_build_object('from', before_perms, 'to', p_permissions), p_reason);
end;
$$;

create function public.ops_create_role(p_key text, p_label text, p_description text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('users', 'create');
  insert into public.ops_roles (key, label, description) values (lower(trim(p_key)), trim(p_label), nullif(trim(coalesce(p_description, '')), ''));
  perform public.write_audit('role.create', 'ops_roles', lower(trim(p_key)), jsonb_build_object('label', p_label));
end;
$$;

-- Staff list with login history (sign-in sessions from Supabase Auth).
create function public.ops_staff_directory()
returns table (
  user_id uuid, email text, full_name text, job_title text, is_owner boolean, active boolean,
  roles text[], last_sign_in_at timestamptz, active_sessions bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('users', 'view');
  return query
  select p.id, p.email, p.full_name, p.job_title, p.is_admin, p.ops_active,
    coalesce((select array_agg(ur.role_key order by ur.role_key) from public.ops_user_roles ur where ur.user_id = p.id), '{}'),
    u.last_sign_in_at,
    (select count(*) from auth.sessions s where s.user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_admin or exists (select 1 from public.ops_user_roles ur where ur.user_id = p.id) or not p.ops_active
  order by p.is_admin desc, p.email;
end;
$$;

create function public.ops_login_history(p_user_id uuid default null, p_limit integer default 100)
returns table (user_id uuid, email text, signed_in_at timestamptz, last_active_at timestamptz, user_agent text, ip text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('audit', 'view');
  return query
  select s.user_id, u.email::text, s.created_at, s.updated_at, s.user_agent, host(s.ip)
  from auth.sessions s
  join auth.users u on u.id = s.user_id
  where p_user_id is null or s.user_id = p_user_id
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 500);
end;
$$;

-- Report exports are recorded too (the export screen checks the module's export permission first).
create function public.ops_log_export(p_report text, p_rows integer, p_params jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.my_permissions() where action = 'export') then
    raise exception 'You do not have permission to export reports' using errcode = '42501';
  end if;
  perform public.write_audit('report.export', 'report', p_report, jsonb_build_object('rows', p_rows, 'params', p_params));
end;
$$;

-- Audit trail with the name of the person who made each change.
create function public.ops_audit_log(p_from date default null, p_to date default null, p_entity text default null, p_search text default null, p_limit integer default 300)
returns table (id bigint, at timestamptz, actor uuid, actor_name text, action text, entity text, entity_id text, details jsonb, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('audit', 'view');
  return query
  select a.id, a.at, a.actor, coalesce(nullif(p.full_name, ''), p.email, case when a.actor is null then 'System' end), a.action, a.entity, a.entity_id, a.details, a.reason
  from public.audit_log a
  left join public.profiles p on p.id = a.actor
  where (p_from is null or a.at >= (p_from::timestamp at time zone 'Asia/Kolkata'))
    and (p_to is null or a.at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
    and (p_entity is null or a.entity = p_entity)
    and (p_search is null or a.action ilike '%' || p_search || '%' or a.entity_id ilike '%' || p_search || '%' or a.reason ilike '%' || p_search || '%'
      or p.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 300), 1), 1000);
end;
$$;

-- New accounts pick up invited staff roles (and owners keep getting is_admin from staff_emails).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.ops_staff_invites;
begin
  insert into public.profiles (id, phone, email, is_admin)
  values (
    new.id,
    nullif(right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10), ''),
    lower(new.email),
    exists (select 1 from public.staff_emails s where s.email = lower(new.email))
  );

  select * into invite from public.ops_staff_invites where email = lower(new.email) and accepted_at is null;
  if found then
    insert into public.ops_user_roles (user_id, role_key, granted_by)
    select new.id, r, invite.invited_by from unnest(invite.role_keys) r
    where exists (select 1 from public.ops_roles where key = r)
    on conflict do nothing;
    update public.ops_staff_invites set accepted_at = now() where email = invite.email;
  end if;
  return new;
end;
$$;

-- Access rules -----------------------------------------------------------------
alter table public.ops_modules enable row level security;
alter table public.ops_actions enable row level security;
alter table public.ops_roles enable row level security;
alter table public.ops_role_permissions enable row level security;
alter table public.ops_user_roles enable row level security;
alter table public.ops_staff_invites enable row level security;
alter table public.audit_log enable row level security;
alter table public.business_settings enable row level security;
alter table public.doc_counters enable row level security;

revoke insert, update, delete, truncate on public.ops_modules, public.ops_actions, public.ops_roles, public.ops_role_permissions,
  public.ops_user_roles, public.ops_staff_invites, public.audit_log, public.business_settings, public.doc_counters from anon, authenticated;
revoke all on public.ops_modules, public.ops_actions, public.ops_roles, public.ops_role_permissions,
  public.ops_user_roles, public.ops_staff_invites, public.audit_log, public.business_settings, public.doc_counters from anon;

-- Profiles are created only by the sign-up trigger (staff flags must never be self-assigned).
revoke insert on public.profiles from anon, authenticated;

create policy "Staff see the modules and actions" on public.ops_modules for select to authenticated using (true);
create policy "Staff see the actions" on public.ops_actions for select to authenticated using (true);
create policy "Role managers see roles" on public.ops_roles for select to authenticated using ((select public.has_permission('users', 'view')));
create policy "Role managers see the matrix" on public.ops_role_permissions for select to authenticated using ((select public.has_permission('users', 'view')));
create policy "People see their own roles; managers see all" on public.ops_user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users', 'view')));
create policy "Managers see invites" on public.ops_staff_invites for select to authenticated using ((select public.has_permission('users', 'view')));
create policy "Auditors read the audit log" on public.audit_log for select to authenticated using ((select public.has_permission('audit', 'view')));
create policy "Staff read settings" on public.business_settings for select to authenticated
  using ((select public.has_permission('settings', 'view')) or (select public.has_permission('dashboard', 'view')));

-- Function access: internal helpers are not callable through the API; actions are, and check permissions themselves.
revoke execute on function public.write_audit(text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.next_doc_number(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.reject_change() from public, anon, authenticated;
revoke execute on function public.setting(text) from public, anon;
revoke execute on function public.setting_num(text, numeric) from public, anon;
revoke execute on function public.has_permission(text, text) from public, anon;
revoke execute on function public.require_permission(text, text) from public, anon;
revoke execute on function public.my_permissions() from public, anon;
revoke execute on function public.ops_update_setting(text, jsonb) from public, anon;
revoke execute on function public.ops_set_user_roles(uuid, text[], text) from public, anon;
revoke execute on function public.ops_invite_staff(text, text[], text) from public, anon;
revoke execute on function public.ops_set_user_active(uuid, boolean, text) from public, anon;
revoke execute on function public.ops_reset_user_sessions(uuid, text) from public, anon;
revoke execute on function public.ops_set_role_permissions(text, jsonb, text) from public, anon;
revoke execute on function public.ops_create_role(text, text, text) from public, anon;
revoke execute on function public.ops_staff_directory() from public, anon;
revoke execute on function public.ops_login_history(uuid, integer) from public, anon;
revoke execute on function public.ops_audit_log(date, date, text, text, integer) from public, anon;
revoke execute on function public.ops_log_export(text, integer, jsonb) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.has_permission(text, text), public.require_permission(text, text), public.my_permissions(),
  public.setting(text), public.setting_num(text, numeric), public.ops_update_setting(text, jsonb),
  public.ops_set_user_roles(uuid, text[], text), public.ops_invite_staff(text, text[], text),
  public.ops_set_user_active(uuid, boolean, text), public.ops_reset_user_sessions(uuid, text),
  public.ops_set_role_permissions(text, jsonb, text), public.ops_create_role(text, text, text),
  public.ops_staff_directory(), public.ops_login_history(uuid, integer), public.ops_audit_log(date, date, text, text, integer), public.ops_log_export(text, integer, jsonb), public.ist_today(), public.financial_year(date)
  to authenticated;

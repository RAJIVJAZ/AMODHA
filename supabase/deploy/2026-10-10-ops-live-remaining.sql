-- ONE-TIME LIVE DEPLOYMENT: completes the business-app database on the live Supabase project.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this whole file -> Run.
--
-- Already on live (10 Oct 2026): the permission tables and settings from 20261010100000_ops_foundation.sql,
-- their access rules, the settings/numbering helpers, and a temporary switch that stops new tables and
-- functions from being opened to the public API while this update runs. This file is everything else:
-- the rest of the six 20261010* migrations in order, then the final API permissions (exactly as the
-- migrations leave them) and Supabase's normal defaults switched back on.
--
-- It runs as one transaction: if any statement fails, nothing is changed.
-- Backup of all existing data: schema backup_20261010 (taken before any change).
-- Fresh environments use supabase/migrations/ instead; do not run this file anywhere else.

begin;
set local lock_timeout = '15s';

-- ===== 20261010100000_ops_foundation (rest) =====
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

-- ===== 20261010110000_ops_inventory_manufacturing =====
-- Inventory, milk procurement, products, recipes, packaging and batch manufacturing.
--
-- Three separate things, linked by traceable stock movements:
--   1. Manufacturing batches   (production_batches)  — what was made, from which material lots.
--   2. Stock                   (stock_lots + stock_movements) — every quantity in or out, by lot.
--   3. Customer orders         (orders, later phase) — which finished-goods lots were sent to whom.
-- Raw materials leave stock once, when issued to a batch. Finished goods enter stock once, when a
-- quality-approved, packed batch is released, and leave once, when dispatched.

-- Reference data -------------------------------------------------------------
create table public.units (
  code text primary key,
  label text not null,
  dimension text not null check (dimension in ('mass', 'volume', 'count')),
  sort_order integer not null default 0
);

insert into public.units (code, label, dimension, sort_order) values
  ('kg', 'kg', 'mass', 1), ('g', 'g', 'mass', 2), ('l', 'litre', 'volume', 3), ('ml', 'ml', 'volume', 4),
  ('pcs', 'piece', 'count', 5), ('pack', 'pack', 'count', 6), ('box', 'box', 'count', 7), ('pouch', 'pouch', 'count', 8),
  ('bottle', 'bottle', 'count', 9), ('label', 'label', 'count', 10), ('roll', 'roll', 'count', 11), ('tray', 'tray', 'count', 12),
  ('dozen', 'dozen', 'count', 13), ('tin', 'tin', 'count', 14), ('jar', 'jar', 'count', 15), ('tub', 'tub', 'count', 16);

create table public.categories (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  kind text not null check (kind in ('inventory', 'catalog')),
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into public.categories (code, label, kind, sort_order) values
  ('raw_milk', 'Raw milk', 'inventory', 1),
  ('milk_derived', 'Milk-derived ingredients', 'inventory', 2),
  ('sugar_ingredients', 'Sugar and food ingredients', 'inventory', 3),
  ('fats', 'Ghee, butter and cream', 'inventory', 4),
  ('smp', 'Skimmed milk powder', 'inventory', 5),
  ('packaging', 'Packaging materials', 'inventory', 6),
  ('finished_goods', 'Finished products', 'inventory', 7),
  ('purchased_dairy', 'Purchased dairy products', 'inventory', 8),
  ('bakery', 'Bakery products', 'inventory', 9),
  ('eggs', 'Eggs and breakfast products', 'inventory', 10),
  ('consumables', 'Consumables', 'inventory', 11),
  ('other', 'Other', 'inventory', 12),
  ('sweets', 'Mithai Wallah sweets', 'catalog', 21),
  ('dairy', 'Dairy products', 'catalog', 22),
  ('milk', 'Fresh milk', 'catalog', 23),
  ('bakery_products', 'Bakery', 'catalog', 24),
  ('eggs_breakfast', 'Eggs', 'catalog', 25);

-- Suppliers (farmers, vendors, brand distributors) ------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,30}$'),
  name text not null check (length(trim(name)) > 1),
  kind text not null default 'vendor' check (kind in ('farmer', 'vendor', 'distributor', 'service')),
  phone text,
  email text,
  address text,
  village text,
  gstin text,
  payment_terms_days integer not null default 0 check (payment_terms_days >= 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Products (what is made or bought and sold) ----------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,30}$'),
  name text not null check (length(trim(name)) > 1),
  category text not null references public.categories (code),
  source text not null check (source in ('manufactured', 'purchased')),
  brand text not null default 'Mithai Wallah',
  base_unit text not null references public.units (code),
  description text,
  storage_conditions text,
  shelf_life_days integer check (shelf_life_days >= 0),
  qc_required boolean not null default true,
  min_yield_pct numeric(6, 2) check (min_yield_pct between 0 and 200),
  hsn text,
  gst_rate numeric(5, 2) check (gst_rate between 0 and 40),
  pure_desi_ghee boolean not null default false,
  is_subscribable boolean not null default false,
  show_in_app boolean not null default false,
  sort_order integer not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Packaging configurations (e.g. "500 g box", "10 kg pouch") and what each pack uses.
create table public.packaging_configs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,30}$'),
  name text not null,
  pack_type text not null check (pack_type in ('box', 'pouch', 'bottle', 'packet', 'tray', 'tub', 'tin', 'jar', 'crate', 'other')),
  net_qty numeric(14, 3) not null check (net_qty > 0),
  net_unit text not null references public.units (code),
  is_bulk boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create type public.item_type as enum ('raw_material', 'packaging', 'finished_good', 'purchased_good', 'consumable');

-- Every stockable thing: raw materials, packaging, consumables and sellable SKUs.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,40}$'),
  name text not null check (length(trim(name)) > 1),
  item_type public.item_type not null,
  category text not null references public.categories (code),
  unit text not null references public.units (code),
  product_id uuid references public.products,
  packaging_config_id uuid references public.packaging_configs,
  net_qty numeric(14, 3) check (net_qty > 0),
  sale_price numeric(12, 2) check (sale_price >= 0),
  mrp numeric(12, 2) check (mrp >= 0),
  barcode text unique,
  storefront_slug text,
  storefront_pack text,
  is_perishable boolean not null default false,
  shelf_life_days integer check (shelf_life_days >= 0),
  rotation text not null default 'FIFO' check (rotation in ('FIFO', 'FEFO')),
  reorder_level numeric(14, 3) not null default 0 check (reorder_level >= 0),
  reorder_qty numeric(14, 3) not null default 0 check (reorder_qty >= 0),
  standard_cost numeric(14, 4) not null default 0 check (standard_cost >= 0),
  hsn text,
  gst_rate numeric(5, 2) check (gst_rate between 0 and 40),
  storage_conditions text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_sku_has_product check ((item_type in ('finished_good', 'purchased_good')) = (product_id is not null)),
  constraint items_sku_has_net_qty check (item_type not in ('finished_good', 'purchased_good') or net_qty is not null),
  constraint items_fg_has_packaging check (item_type <> 'finished_good' or packaging_config_id is not null),
  constraint items_storefront_pair check ((storefront_slug is null) = (storefront_pack is null)),
  unique (storefront_slug, storefront_pack)
);
create index items_product_idx on public.items (product_id);
create index items_type_idx on public.items (item_type);

create table public.packaging_bom (
  packaging_config_id uuid not null references public.packaging_configs on delete cascade,
  item_id uuid not null references public.items,
  qty_per_pack numeric(14, 4) not null check (qty_per_pack > 0),
  primary key (packaging_config_id, item_id)
);

-- Stock: lots and movements ------------------------------------------------------
create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items,
  lot_code text not null,
  supplier_lot text,
  source_type text not null check (source_type in ('opening', 'purchase', 'milk_collection', 'production', 'customer_return', 'adjustment')),
  source_id text,
  supplier_id uuid references public.suppliers,
  batch_id uuid,
  received_at timestamptz not null default now(),
  mfg_date date,
  expiry_date date,
  unit_cost numeric(14, 4) not null default 0 check (unit_cost >= 0),
  qty_received numeric(14, 3) not null check (qty_received >= 0),
  qty_on_hand numeric(14, 3) not null default 0,
  qty_reserved numeric(14, 3) not null default 0,
  status text not null default 'available' check (status in ('available', 'hold', 'quarantine', 'rejected')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (item_id, lot_code),
  constraint stock_lots_not_negative check (qty_on_hand >= 0),
  constraint stock_lots_reservation check (qty_reserved >= 0 and qty_reserved <= qty_on_hand)
);
create index stock_lots_item_idx on public.stock_lots (item_id) where qty_on_hand > 0;
create index stock_lots_batch_idx on public.stock_lots (batch_id);
create index stock_lots_expiry_idx on public.stock_lots (expiry_date) where qty_on_hand > 0;

create table public.stock_movements (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  item_id uuid not null references public.items,
  lot_id uuid not null references public.stock_lots,
  qty numeric(14, 3) not null check (qty <> 0),
  movement_type text not null check (movement_type in (
    'opening', 'purchase_receipt', 'procurement_receipt', 'supplier_return',
    'issue_to_production', 'return_from_production', 'packaging_consumption', 'production_receipt',
    'dispatch', 'customer_return', 'damage', 'expiry', 'adjustment_in', 'adjustment_out', 'reversal'
  )),
  unit_cost numeric(14, 4) not null,
  value numeric(14, 2) generated always as (round(qty * unit_cost, 2)) stored,
  doc_type text not null,
  doc_id text not null,
  doc_no text,
  reason text,
  actor uuid default auth.uid(),
  reversal_of bigint unique references public.stock_movements
);
create index stock_movements_item_idx on public.stock_movements (item_id, occurred_at desc);
create index stock_movements_lot_idx on public.stock_movements (lot_id);
create index stock_movements_doc_idx on public.stock_movements (doc_type, doc_id);

create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function public.reject_change();
create trigger stock_movements_no_truncate before truncate on public.stock_movements
  for each statement execute function public.reject_change();

-- One-time request keys stop a double-click or a retried request from posting twice.
create table public.ops_request_keys (
  key text primary key,
  fn text not null,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create function public._claim_request_key(p_key text, p_fn text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or length(p_key) < 8 then
    return;
  end if;
  insert into public.ops_request_keys (key, fn) values (p_key, p_fn) on conflict do nothing;
  if not found then
    raise exception 'This entry was already saved (duplicate submission ignored)' using errcode = '23505';
  end if;
end;
$$;

-- Posts one stock movement against a lot. Outflows are checked: the lot must be available,
-- unexpired and hold enough unreserved stock (unless p_from_reserved / p_force says otherwise).
create function public._stock_post(
  p_lot_id uuid, p_qty numeric, p_type text, p_doc_type text, p_doc_id text, p_doc_no text,
  p_reason text default null, p_from_reserved numeric default 0, p_force boolean default false, p_reversal_of bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  lot public.stock_lots;
  item_name text;
  unit_code text;
  movement_id bigint;
begin
  if p_qty is null or p_qty = 0 then
    raise exception 'Quantity must not be zero';
  end if;
  select * into lot from public.stock_lots where id = p_lot_id for update;
  if not found then
    raise exception 'Stock lot not found';
  end if;
  select name, unit into item_name, unit_code from public.items where id = lot.item_id;

  if p_from_reserved > 0 then
    if p_from_reserved > lot.qty_reserved then
      raise exception 'Reservation on lot % of % is smaller than %', lot.lot_code, item_name, p_from_reserved;
    end if;
    update public.stock_lots set qty_reserved = qty_reserved - p_from_reserved where id = lot.id;
    lot.qty_reserved := lot.qty_reserved - p_from_reserved;
  end if;

  if p_qty < 0 and not p_force then
    if lot.status <> 'available' then
      raise exception 'Lot % of % is on %, so it cannot be used', lot.lot_code, item_name, lot.status;
    end if;
    if lot.expiry_date is not null and lot.expiry_date < public.ist_today() then
      raise exception 'Lot % of % expired on %', lot.lot_code, item_name, lot.expiry_date;
    end if;
    if lot.qty_on_hand - lot.qty_reserved + p_qty < 0 then
      raise exception 'Not enough % in lot %: % % free, % needed', item_name, lot.lot_code,
        trim(to_char(lot.qty_on_hand - lot.qty_reserved, 'FM999999990.###')), unit_code, trim(to_char(-p_qty, 'FM999999990.###'))
        using errcode = '23514';
    end if;
  end if;
  if lot.qty_on_hand + p_qty < 0 then
    raise exception 'Not enough % in lot %: only % % on hand', item_name, lot.lot_code,
      trim(to_char(lot.qty_on_hand, 'FM999999990.###')), unit_code using errcode = '23514';
  end if;

  update public.stock_lots set qty_on_hand = qty_on_hand + p_qty where id = lot.id;
  insert into public.stock_movements (item_id, lot_id, qty, movement_type, unit_cost, doc_type, doc_id, doc_no, reason, reversal_of)
  values (lot.item_id, lot.id, p_qty, p_type, lot.unit_cost, p_doc_type, p_doc_id, p_doc_no, nullif(trim(coalesce(p_reason, '')), ''), p_reversal_of)
  returning id into movement_id;
  return movement_id;
end;
$$;

-- Lots to take p_qty from, oldest expiry first (FEFO) or oldest receipt first (FIFO).
create function public._stock_pick(p_item_id uuid, p_qty numeric)
returns table (lot_id uuid, qty numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining numeric := p_qty;
  r record;
  rule text;
  free_total numeric;
  item_name text;
  unit_code text;
begin
  select rotation, name, unit into rule, item_name, unit_code from public.items where id = p_item_id;
  for r in
    select l.id, l.qty_on_hand - l.qty_reserved as free
    from public.stock_lots l
    where l.item_id = p_item_id and l.status = 'available' and l.qty_on_hand - l.qty_reserved > 0
      and (l.expiry_date is null or l.expiry_date >= public.ist_today())
    order by case when rule = 'FEFO' then l.expiry_date end nulls last, l.received_at, l.lot_code
  loop
    exit when remaining <= 0;
    lot_id := r.id;
    qty := least(r.free, remaining);
    remaining := remaining - qty;
    return next;
  end loop;
  if remaining > 0 then
    select coalesce(sum(l.qty_on_hand - l.qty_reserved), 0) into free_total
    from public.stock_lots l
    where l.item_id = p_item_id and l.status = 'available' and (l.expiry_date is null or l.expiry_date >= public.ist_today());
    raise exception 'Not enough % in stock: % % available, % needed', item_name,
      trim(to_char(free_total, 'FM999999990.###')), unit_code, trim(to_char(p_qty, 'FM999999990.###')) using errcode = '23514';
  end if;
end;
$$;

create function public._new_lot(
  p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_source_type text, p_source_id text,
  p_lot_code text default null, p_supplier_id uuid default null, p_expiry date default null,
  p_mfg_date date default null, p_status text default 'available', p_supplier_lot text default null, p_batch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  code text := coalesce(nullif(trim(p_lot_code), ''), public.next_doc_number('lot', 'LOT', to_char(public.ist_today(), 'YYYY'), 5));
  life integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity received must be more than zero';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'Cost must not be negative';
  end if;
  select shelf_life_days into life from public.items where id = p_item_id;
  insert into public.stock_lots (item_id, lot_code, supplier_lot, source_type, source_id, supplier_id, batch_id, mfg_date, expiry_date,
    unit_cost, qty_received, qty_on_hand, status)
  values (p_item_id, code, nullif(trim(coalesce(p_supplier_lot, '')), ''), p_source_type, p_source_id, p_supplier_id, p_batch_id,
    coalesce(p_mfg_date, public.ist_today()),
    coalesce(p_expiry, case when life is not null then coalesce(p_mfg_date, public.ist_today()) + life end),
    p_unit_cost, p_qty, 0, p_status)
  returning id into new_id;
  return new_id;
end;
$$;

-- Inventory actions -------------------------------------------------------------
create function public.inv_receive_opening_stock(
  p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_expiry date default null, p_supplier_lot text default null,
  p_reason text default 'Opening stock', p_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  lot_id uuid;
begin
  perform public.require_permission('inventory', 'create');
  perform public._claim_request_key(p_key, 'inv_receive_opening_stock');
  if not exists (select 1 from public.items where id = p_item_id and is_active) then
    raise exception 'Choose an active item';
  end if;
  if exists (select 1 from public.items where id = p_item_id and item_type = 'finished_good') then
    raise exception 'Finished goods enter stock only by releasing a manufacturing batch';
  end if;
  lot_id := public._new_lot(p_item_id, p_qty, p_unit_cost, 'opening', null, null, null, p_expiry, null, 'available', p_supplier_lot);
  perform public._stock_post(lot_id, p_qty, 'opening', 'opening_stock', lot_id::text, null, p_reason);
  perform public.write_audit('stock.opening', 'stock_lots', lot_id::text, jsonb_build_object('item_id', p_item_id, 'qty', p_qty, 'unit_cost', p_unit_cost), p_reason);
  return lot_id;
end;
$$;

-- Damage, expiry write-off or a physical count correction on one lot.
create function public.inv_adjust_stock(p_lot_id uuid, p_qty_delta numeric, p_kind text, p_reason text, p_key text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  lot public.stock_lots;
  mtype text;
  movement_id bigint;
  adj_value numeric;
begin
  perform public.require_permission('inventory', 'edit');
  perform public._claim_request_key(p_key, 'inv_adjust_stock');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the adjustment';
  end if;
  select * into lot from public.stock_lots where id = p_lot_id;
  if not found then
    raise exception 'Stock lot not found';
  end if;
  if p_kind in ('damage', 'expiry') and p_qty_delta >= 0 then
    raise exception 'Damage and expiry write-offs reduce stock: enter a negative quantity';
  end if;
  mtype := case p_kind
    when 'damage' then 'damage'
    when 'expiry' then 'expiry'
    when 'count' then case when p_qty_delta > 0 then 'adjustment_in' else 'adjustment_out' end
  end;
  if mtype is null then
    raise exception 'Unknown adjustment type %', p_kind;
  end if;
  adj_value := abs(p_qty_delta * lot.unit_cost);
  if adj_value > public.setting_num('inventory.adjustment_approval_value', 2000) then
    perform public.require_permission('inventory', 'approve');
  end if;
  -- Write-offs may come from lots on hold or past expiry; a count can't touch reserved stock.
  if p_qty_delta < 0 and lot.qty_on_hand - lot.qty_reserved + p_qty_delta < 0 then
    raise exception 'Only % is free in this lot (the rest is reserved for orders)', lot.qty_on_hand - lot.qty_reserved;
  end if;
  movement_id := public._stock_post(p_lot_id, p_qty_delta, mtype, 'stock_adjustment', p_lot_id::text, lot.lot_code, p_reason, 0, true);
  perform public.write_audit('stock.adjust', 'stock_lots', p_lot_id::text,
    jsonb_build_object('kind', p_kind, 'qty', p_qty_delta, 'value', round(p_qty_delta * lot.unit_cost, 2), 'movement_id', movement_id), p_reason);
  return movement_id;
end;
$$;

create function public.inv_set_lot_status(p_lot_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_status text;
begin
  perform public.require_permission('inventory', 'edit');
  if p_status not in ('available', 'hold') then
    raise exception 'A lot can be put on hold or made available';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select status into old_status from public.stock_lots where id = p_lot_id for update;
  if not found then
    raise exception 'Stock lot not found';
  end if;
  if old_status in ('quarantine', 'rejected') then
    raise exception 'Quarantined or rejected stock is released through its quality workflow';
  end if;
  update public.stock_lots set status = p_status where id = p_lot_id;
  perform public.write_audit('stock.lot_status', 'stock_lots', p_lot_id::text, jsonb_build_object('from', old_status, 'to', p_status), p_reason);
end;
$$;

-- Reverses an opening-stock or adjustment movement with a linked, opposite movement.
create function public.inv_reverse_movement(p_movement_id bigint, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.stock_movements;
  new_id bigint;
begin
  perform public.require_permission('inventory', 'approve');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the reversal';
  end if;
  select * into m from public.stock_movements where id = p_movement_id;
  if not found then
    raise exception 'Movement not found';
  end if;
  if m.movement_type not in ('opening', 'damage', 'expiry', 'adjustment_in', 'adjustment_out') then
    raise exception 'This movement belongs to a % document; correct it through that document', m.doc_type;
  end if;
  if exists (select 1 from public.stock_movements where reversal_of = p_movement_id) then
    raise exception 'This movement has already been reversed';
  end if;
  new_id := public._stock_post(m.lot_id, -m.qty, 'reversal', m.doc_type, m.doc_id, m.doc_no, p_reason, 0, true, p_movement_id);
  perform public.write_audit('stock.reverse', 'stock_movements', p_movement_id::text, jsonb_build_object('reversal_id', new_id, 'qty', -m.qty), p_reason);
  return new_id;
end;
$$;

-- Milk procurement ------------------------------------------------------------------
insert into public.business_settings (key, value, label, description, category, value_type) values
  ('procurement.raw_milk_item', '"RM-MILK"', 'Raw milk stock item code', 'Accepted milk from collections is received into this item', 'procurement', 'text');

create table public.quality_parameters (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('product', 'milk_receipt')),
  product_id uuid references public.products on delete cascade,
  name text not null,
  kind text not null check (kind in ('pass_fail', 'numeric', 'text')),
  min_value numeric,
  max_value numeric,
  unit text,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  check (scope = 'product' or product_id is null)
);

insert into public.quality_parameters (scope, name, kind, min_value, max_value, unit, is_required, sort_order) values
  ('milk_receipt', 'Fat', 'numeric', 3.0, 10.0, '%', false, 1),
  ('milk_receipt', 'SNF', 'numeric', 8.0, 10.0, '%', false, 2),
  ('milk_receipt', 'Temperature at receipt', 'numeric', null, 8.0, '°C', false, 3),
  ('milk_receipt', 'Adulteration test (MBRT / alcohol)', 'pass_fail', null, null, null, false, 4),
  ('product', 'Taste, colour and texture', 'pass_fail', null, null, null, true, 1),
  ('product', 'Moisture / consistency', 'pass_fail', null, null, null, false, 2),
  ('product', 'Foreign matter check', 'pass_fail', null, null, null, true, 3);

create table public.milk_collections (
  id uuid primary key default gen_random_uuid(),
  collection_no text not null unique,
  supplier_id uuid not null references public.suppliers,
  item_id uuid not null references public.items,
  collected_on date not null,
  shift text not null check (shift in ('morning', 'evening')),
  qty_received numeric(12, 3) not null check (qty_received > 0),
  qty_rejected numeric(12, 3) not null default 0 check (qty_rejected >= 0),
  qty_accepted numeric(12, 3) generated always as (qty_received - qty_rejected) stored,
  fat_pct numeric(5, 2) check (fat_pct between 0 and 15),
  snf_pct numeric(5, 2) check (snf_pct between 0 and 15),
  temperature_c numeric(5, 2),
  quality jsonb not null default '{}',
  quality_flags text[] not null default '{}',
  rate_per_litre numeric(10, 2) not null check (rate_per_litre >= 0),
  amount numeric(12, 2) generated always as (round((qty_received - qty_rejected) * rate_per_litre, 2)) stored,
  reference text,
  notes text,
  lot_id uuid references public.stock_lots,
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (qty_rejected <= qty_received),
  unique (supplier_id, collected_on, shift, reference)
);
create index milk_collections_date_idx on public.milk_collections (collected_on desc);
create index milk_collections_supplier_idx on public.milk_collections (supplier_id);

create function public.proc_record_collection(
  p_supplier_id uuid, p_collected_on date, p_shift text, p_qty_received numeric, p_qty_rejected numeric,
  p_rate numeric, p_fat numeric default null, p_snf numeric default null, p_temperature numeric default null,
  p_quality jsonb default '{}', p_reference text default null, p_notes text default null, p_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  milk_item uuid;
  new_id uuid := gen_random_uuid();
  no text;
  lot uuid;
  flags text[] := '{}';
  q record;
  accepted numeric := p_qty_received - coalesce(p_qty_rejected, 0);
begin
  perform public.require_permission('procurement', 'create');
  perform public._claim_request_key(p_key, 'proc_record_collection');
  if not exists (select 1 from public.suppliers where id = p_supplier_id and is_active) then
    raise exception 'Choose an active supplier';
  end if;
  if p_collected_on > public.ist_today() then
    raise exception 'Collection date cannot be in the future';
  end if;
  select id into milk_item from public.items where code = public.setting('procurement.raw_milk_item') #>> '{}';
  if milk_item is null then
    raise exception 'Set up the raw milk stock item (%) first', public.setting('procurement.raw_milk_item') #>> '{}';
  end if;
  -- Flag readings outside the configured ranges.
  for q in select * from public.quality_parameters where scope = 'milk_receipt' and is_active and kind = 'numeric' loop
    declare
      v numeric := case q.name when 'Fat' then p_fat when 'SNF' then p_snf when 'Temperature at receipt' then p_temperature
                   else (p_quality ->> q.name)::numeric end;
    begin
      if v is not null and ((q.min_value is not null and v < q.min_value) or (q.max_value is not null and v > q.max_value)) then
        flags := flags || (q.name || ' out of range');
      end if;
    end;
  end loop;

  no := public.next_doc_number('milk_collection', 'MW-MLK', to_char(p_collected_on, 'YYYYMMDD'), 3);
  insert into public.milk_collections (id, collection_no, supplier_id, item_id, collected_on, shift, qty_received, qty_rejected,
    fat_pct, snf_pct, temperature_c, quality, quality_flags, rate_per_litre, reference, notes)
  values (new_id, no, p_supplier_id, milk_item, p_collected_on, p_shift, p_qty_received, coalesce(p_qty_rejected, 0),
    p_fat, p_snf, p_temperature, coalesce(p_quality, '{}'), flags, p_rate, nullif(trim(coalesce(p_reference, '')), ''), p_notes);

  if accepted > 0 then
    lot := public._new_lot(milk_item, accepted, p_rate, 'milk_collection', new_id::text, no, p_supplier_id, null, p_collected_on);
    perform public._stock_post(lot, accepted, 'procurement_receipt', 'milk_collection', new_id::text, no);
    update public.milk_collections set lot_id = lot where id = new_id;
  end if;
  perform public.write_audit('procurement.collection', 'milk_collections', new_id::text,
    jsonb_build_object('no', no, 'accepted', accepted, 'rate', p_rate, 'flags', flags));
  return new_id;
end;
$$;

create function public.proc_cancel_collection(p_collection_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.milk_collections;
  lot public.stock_lots;
begin
  perform public.require_permission('procurement', 'approve');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into c from public.milk_collections where id = p_collection_id for update;
  if not found or c.status = 'cancelled' then
    raise exception 'Collection not found or already cancelled';
  end if;
  if c.lot_id is not null then
    select * into lot from public.stock_lots where id = c.lot_id for update;
    if lot.qty_on_hand <> lot.qty_received then
      raise exception 'Some of this milk has already been used; record a stock adjustment instead';
    end if;
    perform public._stock_post(c.lot_id, -lot.qty_on_hand, 'reversal', 'milk_collection', c.id::text, c.collection_no, p_reason, 0, true);
  end if;
  update public.milk_collections set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason where id = c.id;
  perform public.write_audit('procurement.cancel', 'milk_collections', c.id::text, jsonb_build_object('no', c.collection_no), p_reason);
end;
$$;

-- Recipes (versioned bills of materials) --------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  standard_output_qty numeric(14, 3) not null check (standard_output_qty > 0),
  expected_minutes integer check (expected_minutes > 0),
  instructions text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  activated_by uuid,
  activated_at timestamptz,
  unique (product_id, version)
);
create unique index recipes_one_active on public.recipes (product_id) where status = 'active';

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes on delete cascade,
  item_id uuid not null references public.items,
  qty numeric(14, 3) not null check (qty > 0),
  is_main_input boolean not null default false,
  notes text,
  sort_order integer not null default 0,
  unique (recipe_id, item_id)
);

-- Manufacturing batches ----------------------------------------------------------------
create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  product_id uuid not null references public.products,
  recipe_id uuid not null references public.recipes,
  production_date date not null,
  shift text not null check (shift in ('morning', 'afternoon', 'evening', 'night', 'general')),
  production_unit text,
  supervisor text,
  planned_qty numeric(14, 3) not null check (planned_qty > 0),
  planned_packaging text,
  notes text,
  status text not null default 'planned' check (status in (
    'planned', 'materials_issued', 'in_production', 'production_completed', 'awaiting_qc', 'qc_approved', 'qc_rejected',
    'packaging', 'packaging_completed', 'released', 'partially_dispatched', 'fully_dispatched', 'closed', 'cancelled'
  )),
  started_at timestamptz,
  completed_at timestamptz,
  output_qty numeric(14, 3) check (output_qty >= 0),
  finished_qty numeric(14, 3) check (finished_qty >= 0),
  rejected_qty numeric(14, 3) check (rejected_qty >= 0),
  rework_qty numeric(14, 3) check (rework_qty >= 0),
  process_loss_qty numeric(14, 3) check (process_loss_qty >= 0),
  production_notes text,
  yield_pct numeric(8, 2),
  yield_flag boolean not null default false,
  qc_decision text check (qc_decision in ('approved', 'rejected')),
  qc_by uuid,
  qc_at timestamptz,
  qc_notes text,
  packaging_completed_at timestamptz,
  unpacked_qty numeric(14, 3) check (unpacked_qty >= 0),
  unpacked_disposition text,
  packaging_variance_qty numeric(14, 3),
  packaging_adjustment_reason text,
  packaging_adjusted_by uuid,
  released_at timestamptz,
  released_by uuid,
  material_cost numeric(14, 2),
  packaging_cost numeric(14, 2),
  labour_cost numeric(14, 2),
  overhead_cost numeric(14, 2),
  total_cost numeric(14, 2),
  cost_per_unit numeric(14, 4),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  cancel_mode text check (cancel_mode in ('return_materials', 'write_off')),
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index production_batches_date_idx on public.production_batches (production_date desc);
create index production_batches_status_idx on public.production_batches (status);
create index production_batches_product_idx on public.production_batches (product_id);

alter table public.stock_lots add constraint stock_lots_batch_fk foreign key (batch_id) references public.production_batches;

create table public.batch_materials (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches on delete cascade,
  item_id uuid not null references public.items,
  planned_qty numeric(14, 3) not null default 0 check (planned_qty >= 0),
  is_main_input boolean not null default false,
  from_recipe boolean not null default true,
  variance_reason text,
  variance_reason_by uuid,
  variance_reason_at timestamptz,
  unique (batch_id, item_id)
);

create table public.batch_events (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.production_batches on delete cascade,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  from_status text,
  to_status text not null,
  note text
);
create index batch_events_batch_idx on public.batch_events (batch_id);
create trigger batch_events_append_only before update or delete on public.batch_events
  for each row execute function public.reject_change();

create table public.batch_qc_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches on delete cascade,
  parameter_id uuid references public.quality_parameters,
  parameter_name text not null,
  value_text text,
  value_num numeric,
  passed boolean,
  checked_by uuid default auth.uid(),
  checked_at timestamptz not null default now()
);
create index batch_qc_results_batch_idx on public.batch_qc_results (batch_id);

create table public.batch_packaging (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches,
  sku_item_id uuid not null references public.items,
  packaging_config_id uuid not null references public.packaging_configs,
  net_qty_per_pack numeric(14, 3) not null check (net_qty_per_pack > 0),
  packed_on date not null,
  packs_good integer not null check (packs_good >= 0),
  packs_rejected integer not null default 0 check (packs_rejected >= 0),
  packs_damaged integer not null default 0 check (packs_damaged >= 0),
  net_qty_good numeric(14, 3) generated always as (packs_good * net_qty_per_pack) stored,
  net_qty_total numeric(14, 3) generated always as ((packs_good + packs_rejected + packs_damaged) * net_qty_per_pack) stored,
  packed_by text not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_by uuid,
  reversed_at timestamptz,
  reverse_reason text,
  lot_id uuid references public.stock_lots,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (packs_good + packs_rejected + packs_damaged > 0)
);
create index batch_packaging_batch_idx on public.batch_packaging (batch_id);

-- Corrections to recorded batch figures keep the original values.
create table public.batch_corrections (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.production_batches,
  field text not null,
  old_value text,
  new_value text,
  reason text not null,
  corrected_by uuid default auth.uid(),
  corrected_at timestamptz not null default now()
);
create trigger batch_corrections_append_only before update or delete on public.batch_corrections
  for each row execute function public.reject_change();

create function public._batch_set_status(p_batch_id uuid, p_to text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_status text;
begin
  select status into from_status from public.production_batches where id = p_batch_id;
  if from_status is distinct from p_to then
    update public.production_batches set status = p_to, updated_at = now() where id = p_batch_id;
    insert into public.batch_events (batch_id, from_status, to_status, note) values (p_batch_id, from_status, p_to, p_note);
  end if;
end;
$$;

create function public._batch_lock(p_batch_id uuid)
returns public.production_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
begin
  select * into b from public.production_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Batch not found';
  end if;
  return b;
end;
$$;

-- Planned vs actual material use per batch (actual = issued − returned).
create view public.v_batch_materials with (security_invoker = true) as
select
  bm.batch_id,
  bm.item_id,
  i.code as item_code,
  i.name as item_name,
  i.unit,
  bm.planned_qty,
  bm.is_main_input,
  bm.from_recipe,
  coalesce(-(select sum(m.qty) from public.stock_movements m
     where m.doc_type = 'batch' and m.doc_id = bm.batch_id::text and m.item_id = bm.item_id), 0) as actual_qty,
  coalesce(-(select sum(m.value) from public.stock_movements m
     where m.doc_type = 'batch' and m.doc_id = bm.batch_id::text and m.item_id = bm.item_id), 0) as actual_value,
  bm.variance_reason
from public.batch_materials bm
join public.items i on i.id = bm.item_id;

create function public.prod_create_batch(
  p_product_id uuid, p_production_date date, p_planned_qty numeric, p_shift text,
  p_recipe_id uuid default null, p_production_unit text default null, p_supervisor text default null,
  p_planned_packaging text default null, p_notes text default null, p_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.recipes;
  prod public.products;
  new_id uuid := gen_random_uuid();
  no text;
begin
  perform public.require_permission('production', 'create');
  perform public._claim_request_key(p_key, 'prod_create_batch');
  select * into prod from public.products where id = p_product_id;
  if not found or not prod.is_active or prod.source <> 'manufactured' then
    raise exception 'Choose an active manufactured product';
  end if;
  if p_planned_qty is null or p_planned_qty <= 0 then
    raise exception 'Planned quantity must be more than zero';
  end if;
  if p_production_date is null or p_production_date < public.ist_today() - 7 then
    raise exception 'Production date is missing or too far in the past';
  end if;
  if p_recipe_id is null then
    select * into rec from public.recipes where product_id = p_product_id and status = 'active';
  else
    select * into rec from public.recipes where id = p_recipe_id and product_id = p_product_id and status in ('active', 'retired');
  end if;
  if rec.id is null then
    raise exception 'This product has no active recipe; approve a recipe first';
  end if;

  no := public.next_doc_number('batch', 'MW-MFG', to_char(p_production_date, 'YYYY'), 4);
  insert into public.production_batches (id, batch_no, product_id, recipe_id, production_date, shift, production_unit, supervisor,
    planned_qty, planned_packaging, notes)
  values (new_id, no, p_product_id, rec.id, p_production_date, p_shift, nullif(trim(coalesce(p_production_unit, '')), ''),
    nullif(trim(coalesce(p_supervisor, '')), ''), p_planned_qty, nullif(trim(coalesce(p_planned_packaging, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''));

  -- Standard quantities scaled to the plan: line qty × planned output ÷ standard output.
  insert into public.batch_materials (batch_id, item_id, planned_qty, is_main_input)
  select new_id, rl.item_id, round(rl.qty * p_planned_qty / rec.standard_output_qty, 3), rl.is_main_input
  from public.recipe_lines rl where rl.recipe_id = rec.id;

  insert into public.batch_events (batch_id, from_status, to_status, note) values (new_id, null, 'planned', 'Batch created');
  perform public.write_audit('batch.create', 'production_batches', new_id::text,
    jsonb_build_object('batch_no', no, 'product', prod.code, 'recipe_version', rec.version, 'planned_qty', p_planned_qty));
  return new_id;
end;
$$;

-- Issue material to a batch: from a chosen lot, or automatically by FEFO/FIFO.
create function public.prod_issue_material(
  p_batch_id uuid, p_item_id uuid, p_qty numeric, p_lot_id uuid default null, p_note text default null, p_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  pick record;
  n integer := 0;
  it public.items;
begin
  perform public.require_permission('production', 'edit');
  perform public._claim_request_key(p_key, 'prod_issue_material');
  b := public._batch_lock(p_batch_id);
  if b.status not in ('planned', 'materials_issued', 'in_production') then
    raise exception 'Materials can only be issued before production is completed (batch is %)', b.status;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be more than zero';
  end if;
  select * into it from public.items where id = p_item_id;
  if not found or it.item_type not in ('raw_material', 'consumable', 'purchased_good') then
    raise exception 'Only raw materials and consumables can be issued to production';
  end if;

  if p_lot_id is not null then
    if not exists (select 1 from public.stock_lots where id = p_lot_id and item_id = p_item_id) then
      raise exception 'That lot is not %', it.name;
    end if;
    perform public._stock_post(p_lot_id, -p_qty, 'issue_to_production', 'batch', b.id::text, b.batch_no, p_note);
    n := 1;
  else
    for pick in select * from public._stock_pick(p_item_id, p_qty) loop
      perform public._stock_post(pick.lot_id, -pick.qty, 'issue_to_production', 'batch', b.id::text, b.batch_no, p_note);
      n := n + 1;
    end loop;
  end if;

  insert into public.batch_materials (batch_id, item_id, planned_qty, from_recipe)
  values (b.id, p_item_id, 0, false) on conflict (batch_id, item_id) do nothing;
  if b.status = 'planned' then
    perform public._batch_set_status(b.id, 'materials_issued', 'First material issued');
  end if;
  return n;
end;
$$;

-- Return unused material from a batch to the lot it came from.
create function public.prod_return_material(p_batch_id uuid, p_lot_id uuid, p_qty numeric, p_reason text, p_key text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  issued numeric;
begin
  perform public.require_permission('production', 'edit');
  perform public._claim_request_key(p_key, 'prod_return_material');
  b := public._batch_lock(p_batch_id);
  if b.status not in ('materials_issued', 'in_production', 'production_completed', 'awaiting_qc') then
    raise exception 'Material can be returned while the batch is in progress (batch is %)', b.status;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be more than zero';
  end if;
  select -coalesce(sum(qty), 0) into issued from public.stock_movements
  where doc_type = 'batch' and doc_id = b.id::text and lot_id = p_lot_id;
  if p_qty > issued then
    raise exception 'Only % was issued from this lot to this batch', issued;
  end if;
  return public._stock_post(p_lot_id, p_qty, 'return_from_production', 'batch', b.id::text, b.batch_no, p_reason, 0, true);
end;
$$;

create function public.prod_start_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
begin
  perform public.require_permission('production', 'edit');
  b := public._batch_lock(p_batch_id);
  if b.status not in ('planned', 'materials_issued') then
    raise exception 'Batch is already %', b.status;
  end if;
  update public.production_batches set started_at = now() where id = b.id;
  perform public._batch_set_status(b.id, 'in_production');
end;
$$;

-- Record output. Variances beyond the threshold need an explanation per material.
create function public.prod_complete_batch(
  p_batch_id uuid, p_output_qty numeric, p_finished_qty numeric, p_rejected_qty numeric default 0,
  p_rework_qty numeric default 0, p_process_loss_qty numeric default null, p_notes text default null,
  p_variance_reasons jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  prod public.products;
  threshold numeric := public.setting_num('production.variance_threshold_pct', 5);
  out_tol numeric := public.setting_num('production.output_tolerance_pct', 1);
  min_yield numeric;
  y numeric;
  r record;
  missing text[] := '{}';
  split numeric := coalesce(p_finished_qty, 0) + coalesce(p_rejected_qty, 0) + coalesce(p_rework_qty, 0);
begin
  perform public.require_permission('production', 'edit');
  b := public._batch_lock(p_batch_id);
  if b.status not in ('materials_issued', 'in_production') then
    raise exception 'Only a batch in production can be completed (batch is %)', b.status;
  end if;
  if p_output_qty is null or p_output_qty <= 0 or p_finished_qty is null or p_finished_qty < 0 then
    raise exception 'Enter the actual output and finished quantity';
  end if;
  if abs(split - p_output_qty) > p_output_qty * out_tol / 100 then
    raise exception 'Finished (%), rejected (%) and rework (%) add up to %, but output is %',
      p_finished_qty, coalesce(p_rejected_qty, 0), coalesce(p_rework_qty, 0), split, p_output_qty;
  end if;
  if not exists (select 1 from public.stock_movements where doc_type = 'batch' and doc_id = b.id::text) then
    raise exception 'No materials have been issued to this batch';
  end if;

  -- Save explanations first, then insist on one for every material outside the threshold.
  for r in select * from jsonb_each_text(coalesce(p_variance_reasons, '{}')) loop
    if coalesce(trim(r.value), '') <> '' then
      update public.batch_materials set variance_reason = trim(r.value), variance_reason_by = auth.uid(), variance_reason_at = now()
      where batch_id = b.id and item_id = r.key::uuid;
    end if;
  end loop;
  for r in select * from public.v_batch_materials where batch_id = b.id loop
    if (r.planned_qty = 0 and r.actual_qty <> 0) or (r.planned_qty > 0 and abs(r.actual_qty - r.planned_qty) / r.planned_qty * 100 > threshold) then
      if coalesce(trim(r.variance_reason), '') = '' then
        missing := missing || r.item_name;
      end if;
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'Explain the variance for: % (more than % %% from plan)', array_to_string(missing, ', '), threshold
      using errcode = '22023';
  end if;

  select * into prod from public.products where id = b.product_id;
  min_yield := coalesce(prod.min_yield_pct, public.setting_num('production.min_yield_pct', 85));
  y := round(p_output_qty / b.planned_qty * 100, 2);

  update public.production_batches set
    output_qty = p_output_qty, finished_qty = p_finished_qty, rejected_qty = coalesce(p_rejected_qty, 0),
    rework_qty = coalesce(p_rework_qty, 0),
    process_loss_qty = coalesce(p_process_loss_qty, greatest(b.planned_qty - p_output_qty, 0)),
    production_notes = nullif(trim(coalesce(p_notes, '')), ''), yield_pct = y, yield_flag = y < min_yield,
    completed_at = now(), started_at = coalesce(started_at, now())
  where id = b.id;
  perform public._batch_set_status(b.id, 'production_completed', case when y < min_yield then 'Low yield: ' || y || '%' end);
  if prod.qc_required then
    perform public._batch_set_status(b.id, 'awaiting_qc');
  else
    update public.production_batches set qc_decision = 'approved', qc_at = now(), qc_notes = 'Quality check not required for this product' where id = b.id;
    perform public._batch_set_status(b.id, 'qc_approved', 'No quality check required');
  end if;
  perform public.write_audit('batch.complete', 'production_batches', b.id::text,
    jsonb_build_object('output', p_output_qty, 'finished', p_finished_qty, 'rejected', p_rejected_qty, 'yield_pct', y));
  return jsonb_build_object('yield_pct', y, 'low_yield', y < min_yield);
end;
$$;

-- Correct recorded output before release; the original value is kept.
create function public.prod_correct_output(p_batch_id uuid, p_field text, p_new_value numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  old_value numeric;
begin
  perform public.require_permission('production', 'approve');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the correction';
  end if;
  if p_field not in ('output_qty', 'finished_qty', 'rejected_qty', 'rework_qty', 'process_loss_qty') then
    raise exception 'That figure cannot be corrected here';
  end if;
  b := public._batch_lock(p_batch_id);
  if b.status not in ('production_completed', 'awaiting_qc', 'qc_approved', 'qc_rejected') then
    raise exception 'Output can be corrected after completion and before packaging (batch is %)', b.status;
  end if;
  if p_new_value is null or p_new_value < 0 then
    raise exception 'Enter a valid quantity';
  end if;
  execute format('select %I from public.production_batches where id = $1', p_field) into old_value using b.id;
  execute format('update public.production_batches set %I = $1, updated_at = now() where id = $2', p_field) using p_new_value, b.id;
  if p_field = 'output_qty' then
    update public.production_batches set yield_pct = round(p_new_value / planned_qty * 100, 2) where id = b.id;
  end if;
  insert into public.batch_corrections (batch_id, field, old_value, new_value, reason) values (b.id, p_field, old_value::text, p_new_value::text, p_reason);
  perform public.write_audit('batch.correct', 'production_batches', b.id::text, jsonb_build_object('field', p_field, 'from', old_value, 'to', p_new_value), p_reason);
end;
$$;

-- Quality check: record results; an approver passes or rejects the batch.
create function public.prod_record_qc(p_batch_id uuid, p_results jsonb, p_decision text default null, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  r jsonb;
  param public.quality_parameters;
  failed text[] := '{}';
begin
  perform public.require_permission('quality', 'create');
  b := public._batch_lock(p_batch_id);
  if b.status <> 'awaiting_qc' then
    raise exception 'This batch is not waiting for a quality check (it is %)', b.status;
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]')) loop
    select * into param from public.quality_parameters where id = (r ->> 'parameter_id')::uuid;
    insert into public.batch_qc_results (batch_id, parameter_id, parameter_name, value_text, value_num, passed)
    values (b.id, param.id, coalesce(param.name, r ->> 'name', 'Check'), r ->> 'value_text', (r ->> 'value_num')::numeric,
      case
        when param.kind = 'numeric' and (r ->> 'value_num') is not null then
          ((param.min_value is null or (r ->> 'value_num')::numeric >= param.min_value) and (param.max_value is null or (r ->> 'value_num')::numeric <= param.max_value))
        else (r ->> 'passed')::boolean
      end);
  end loop;

  if p_decision is not null then
    perform public.require_permission('quality', 'approve');
    if p_decision not in ('approved', 'rejected') then
      raise exception 'Decision must be approved or rejected';
    end if;
    select coalesce(array_agg(distinct q.name), '{}') into failed
    from public.quality_parameters q
    where q.is_active and q.is_required and q.scope = 'product' and (q.product_id is null or q.product_id = b.product_id)
      and not exists (select 1 from public.batch_qc_results x where x.batch_id = b.id and x.parameter_id = q.id and x.passed);
    if p_decision = 'approved' and array_length(failed, 1) > 0 then
      raise exception 'Required checks not passed: %', array_to_string(failed, ', ');
    end if;
    update public.production_batches set qc_decision = p_decision, qc_by = auth.uid(), qc_at = now(), qc_notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = b.id;
    perform public._batch_set_status(b.id, case when p_decision = 'approved' then 'qc_approved' else 'qc_rejected' end, p_notes);
    perform public.write_audit('batch.qc', 'production_batches', b.id::text, jsonb_build_object('decision', p_decision), p_notes);
  end if;
end;
$$;

-- Record packs made in one packaging configuration. Packaging materials are deducted from the
-- packaging bill of materials (including for rejected and damaged packs). Finished goods enter
-- stock only when the batch is released.
create function public.prod_record_packaging(
  p_batch_id uuid, p_sku_item_id uuid, p_packs_good integer, p_packs_rejected integer default 0, p_packs_damaged integer default 0,
  p_packed_by text default null, p_packed_on date default null, p_notes text default null, p_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  sku public.items;
  pc public.packaging_configs;
  tol numeric := public.setting_num('production.packaging_tolerance_pct', 2);
  packed_so_far numeric;
  this_total numeric;
  new_id uuid := gen_random_uuid();
  bom record;
  pick record;
  packs integer := coalesce(p_packs_good, 0) + coalesce(p_packs_rejected, 0) + coalesce(p_packs_damaged, 0);
begin
  perform public.require_permission('production', 'edit');
  perform public._claim_request_key(p_key, 'prod_record_packaging');
  b := public._batch_lock(p_batch_id);
  if b.status not in ('qc_approved', 'packaging') then
    raise exception 'Packaging starts after quality approval (batch is %)', b.status;
  end if;
  select * into sku from public.items where id = p_sku_item_id;
  if not found or sku.item_type <> 'finished_good' or sku.product_id <> b.product_id then
    raise exception 'Choose a pack size of this batch''s product';
  end if;
  if not sku.is_active then
    raise exception 'That pack size is switched off';
  end if;
  if packs <= 0 or coalesce(p_packs_good, 0) < 0 or coalesce(p_packs_rejected, 0) < 0 or coalesce(p_packs_damaged, 0) < 0 then
    raise exception 'Enter the number of packs';
  end if;
  if coalesce(trim(p_packed_by), '') = '' then
    raise exception 'Enter who packed it';
  end if;
  select * into pc from public.packaging_configs where id = sku.packaging_config_id;

  select coalesce(sum(net_qty_total), 0) into packed_so_far from public.batch_packaging where batch_id = b.id and status = 'active';
  this_total := packs * sku.net_qty;
  if packed_so_far + this_total > b.finished_qty * (1 + tol / 100) then
    raise exception 'Packing % more would exceed the batch''s finished quantity (% packed of %)', this_total, packed_so_far, b.finished_qty
      using errcode = '23514';
  end if;

  insert into public.batch_packaging (id, batch_id, sku_item_id, packaging_config_id, net_qty_per_pack, packed_on, packs_good, packs_rejected,
    packs_damaged, packed_by, notes)
  values (new_id, b.id, sku.id, pc.id, sku.net_qty, coalesce(p_packed_on, public.ist_today()), coalesce(p_packs_good, 0),
    coalesce(p_packs_rejected, 0), coalesce(p_packs_damaged, 0), trim(p_packed_by), nullif(trim(coalesce(p_notes, '')), ''));

  for bom in select * from public.packaging_bom where packaging_config_id = pc.id loop
    for pick in select * from public._stock_pick(bom.item_id, round(bom.qty_per_pack * packs, 3)) loop
      perform public._stock_post(pick.lot_id, -pick.qty, 'packaging_consumption', 'batch_packaging', new_id::text, b.batch_no);
    end loop;
  end loop;

  if b.status = 'qc_approved' then
    perform public._batch_set_status(b.id, 'packaging');
  end if;
  return new_id;
end;
$$;

create function public.prod_reverse_packaging(p_packaging_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.batch_packaging;
  b public.production_batches;
  m record;
begin
  perform public.require_permission('production', 'edit');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into p from public.batch_packaging where id = p_packaging_id for update;
  if not found or p.status <> 'active' then
    raise exception 'Packaging entry not found or already reversed';
  end if;
  b := public._batch_lock(p.batch_id);
  if b.status not in ('packaging', 'qc_approved') then
    raise exception 'Packaging can be corrected only before packaging is completed';
  end if;
  for m in select * from public.stock_movements where doc_type = 'batch_packaging' and doc_id = p.id::text and reversal_of is null
    and not exists (select 1 from public.stock_movements r where r.reversal_of = stock_movements.id) loop
    perform public._stock_post(m.lot_id, -m.qty, 'reversal', 'batch_packaging', p.id::text, m.doc_no, p_reason, 0, true, m.id);
  end loop;
  update public.batch_packaging set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(), reverse_reason = p_reason where id = p.id;
  perform public.write_audit('batch.packaging_reverse', 'batch_packaging', p.id::text, jsonb_build_object('batch_id', b.id), p_reason);
end;
$$;

-- Close packaging: packed + unpacked must reconcile with the finished quantity.
create function public.prod_complete_packaging(p_batch_id uuid, p_unpacked_qty numeric default 0, p_unpacked_disposition text default null, p_adjustment_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  tol numeric := public.setting_num('production.packaging_tolerance_pct', 2);
  packed numeric;
  diff numeric;
begin
  perform public.require_permission('production', 'edit');
  b := public._batch_lock(p_batch_id);
  if b.status <> 'packaging' then
    raise exception 'Record at least one packaging entry first (batch is %)', b.status;
  end if;
  if coalesce(p_unpacked_qty, 0) < 0 then
    raise exception 'Unpacked quantity cannot be negative';
  end if;
  if coalesce(p_unpacked_qty, 0) > 0 and coalesce(trim(p_unpacked_disposition), '') = '' then
    raise exception 'Say what happened to the unpacked quantity (e.g. loss, samples, staff)';
  end if;
  select coalesce(sum(net_qty_total), 0) into packed from public.batch_packaging where batch_id = b.id and status = 'active';
  if not exists (select 1 from public.batch_packaging where batch_id = b.id and status = 'active' and packs_good > 0) then
    raise exception 'No good packs recorded';
  end if;
  diff := b.finished_qty - packed - coalesce(p_unpacked_qty, 0);
  if abs(diff) > b.finished_qty * tol / 100 then
    if coalesce(trim(p_adjustment_reason), '') = '' then
      raise exception 'Packed (%) + unpacked (%) differs from finished quantity (%) by %, beyond the % %% tolerance. An approver must give a reason.',
        packed, coalesce(p_unpacked_qty, 0), b.finished_qty, diff, tol using errcode = '22023';
    end if;
    perform public.require_permission('production', 'approve');
    update public.production_batches set packaging_adjustment_reason = p_adjustment_reason, packaging_adjusted_by = auth.uid() where id = b.id;
  end if;
  update public.production_batches set packaging_completed_at = now(), unpacked_qty = coalesce(p_unpacked_qty, 0),
    unpacked_disposition = nullif(trim(coalesce(p_unpacked_disposition, '')), ''), packaging_variance_qty = diff
  where id = b.id;
  perform public._batch_set_status(b.id, 'packaging_completed');
  perform public.write_audit('batch.packaging_complete', 'production_batches', b.id::text,
    jsonb_build_object('packed', packed, 'unpacked', p_unpacked_qty, 'difference', diff), p_adjustment_reason);
  return jsonb_build_object('packed', packed, 'difference', diff);
end;
$$;

-- Release to finished goods: cost the batch and create one stock lot per pack size.
create function public.prod_release_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  prod public.products;
  mat numeric;
  pkg_total numeric;
  pkg_orphan numeric;
  labour numeric;
  overhead numeric;
  good_net numeric;
  per_unit numeric;
  hours numeric;
  r record;
  lot uuid;
  unit_cost numeric;
  life integer;
  lots jsonb := '[]';
begin
  perform public.require_permission('production', 'approve');
  b := public._batch_lock(p_batch_id);
  if b.status <> 'packaging_completed' then
    raise exception 'Only a batch with packaging completed can be released (batch is %)', b.status;
  end if;
  if b.qc_decision is distinct from 'approved' then
    raise exception 'This batch has not passed quality control';
  end if;
  select * into prod from public.products where id = b.product_id;

  select coalesce(-sum(value), 0) into mat from public.stock_movements where doc_type = 'batch' and doc_id = b.id::text;
  select coalesce(-sum(m.value), 0) into pkg_total from public.stock_movements m
    join public.batch_packaging p on p.id::text = m.doc_id where m.doc_type = 'batch_packaging' and p.batch_id = b.id;
  -- Packaging used on entries with no good packs is spread over the good output.
  select coalesce(-sum(m.value), 0) into pkg_orphan from public.stock_movements m
    join public.batch_packaging p on p.id::text = m.doc_id
    where m.doc_type = 'batch_packaging' and p.batch_id = b.id and p.status = 'active'
      and p.sku_item_id not in (select sku_item_id from public.batch_packaging where batch_id = b.id and status = 'active' and packs_good > 0);
  hours := greatest(extract(epoch from (coalesce(b.completed_at, now()) - coalesce(b.started_at, b.completed_at, now()))) / 3600, 0);
  labour := round(hours * public.setting_num('production.labour_cost_per_hour', 0), 2);
  overhead := round(b.finished_qty * public.setting_num('production.overhead_per_kg', 0), 2);
  select coalesce(sum(net_qty_good), 0) into good_net from public.batch_packaging where batch_id = b.id and status = 'active';
  if good_net <= 0 then
    raise exception 'No good packs to release';
  end if;
  per_unit := (mat + labour + overhead + pkg_orphan) / good_net;

  for r in
    select p.sku_item_id, sum(p.packs_good) as packs, max(p.net_qty_per_pack) as net,
      coalesce(-sum((select sum(m.value) from public.stock_movements m where m.doc_type = 'batch_packaging' and m.doc_id = p.id::text)), 0) as pkg_cost
    from public.batch_packaging p
    where p.batch_id = b.id and p.status = 'active'
    group by p.sku_item_id
    having sum(p.packs_good) > 0
  loop
    unit_cost := round(per_unit * r.net + r.pkg_cost / r.packs, 4);
    select coalesce(i.shelf_life_days, prod.shelf_life_days) into life from public.items i where i.id = r.sku_item_id;
    lot := public._new_lot(r.sku_item_id, r.packs, unit_cost, 'production', b.id::text, b.batch_no, null,
      case when life is not null then b.production_date + life end, b.production_date, 'available', null, b.id);
    perform public._stock_post(lot, r.packs, 'production_receipt', 'batch', b.id::text, b.batch_no);
    update public.batch_packaging set lot_id = lot where batch_id = b.id and sku_item_id = r.sku_item_id and status = 'active';
    lots := lots || jsonb_build_object('sku_item_id', r.sku_item_id, 'packs', r.packs, 'unit_cost', unit_cost, 'lot_id', lot);
  end loop;

  update public.production_batches set
    material_cost = round(mat, 2), packaging_cost = round(pkg_total, 2), labour_cost = labour, overhead_cost = overhead,
    total_cost = round(mat + pkg_total + labour + overhead, 2), cost_per_unit = round(per_unit, 4),
    released_at = now(), released_by = auth.uid()
  where id = b.id;
  perform public._batch_set_status(b.id, 'released', 'Released to finished goods');
  perform public.write_audit('batch.release', 'production_batches', b.id::text,
    jsonb_build_object('material_cost', round(mat, 2), 'packaging_cost', round(pkg_total, 2), 'labour', labour, 'overhead', overhead, 'lots', lots));
  return jsonb_build_object('total_cost', round(mat + pkg_total + labour + overhead, 2), 'lots', lots);
end;
$$;

-- Cancel before release: return unused materials (before production starts) or write the batch off.
create function public.prod_cancel_batch(p_batch_id uuid, p_reason text, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  r record;
  m record;
begin
  perform public.require_permission('production', 'delete');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for cancelling';
  end if;
  b := public._batch_lock(p_batch_id);
  if b.status in ('released', 'partially_dispatched', 'fully_dispatched', 'closed', 'cancelled') then
    raise exception 'A % batch cannot be cancelled', b.status;
  end if;
  if p_mode = 'return_materials' then
    if b.status not in ('planned', 'materials_issued') then
      raise exception 'Materials can be returned only before production starts; write the batch off instead';
    end if;
    for r in select lot_id, -sum(qty) as net from public.stock_movements where doc_type = 'batch' and doc_id = b.id::text group by lot_id having -sum(qty) > 0 loop
      perform public._stock_post(r.lot_id, r.net, 'return_from_production', 'batch', b.id::text, b.batch_no, 'Batch cancelled: ' || p_reason, 0, true);
    end loop;
  elsif p_mode = 'write_off' then
    -- Materials and packaging already used stay consumed; their cost is written off as production loss.
    null;
  else
    raise exception 'Choose return_materials or write_off';
  end if;
  update public.batch_packaging set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reverse_reason = 'Batch cancelled'
  where batch_id = b.id and status = 'active' and p_mode = 'return_materials';
  update public.production_batches set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason, cancel_mode = p_mode where id = b.id;
  perform public._batch_set_status(b.id, 'cancelled', p_reason);
  perform public.write_audit('batch.cancel', 'production_batches', b.id::text, jsonb_build_object('mode', p_mode, 'from_status', b.status), p_reason);
end;
$$;

-- Dispatch progress of a released batch, from its finished-goods lots.
create function public._batch_refresh_dispatch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st text;
  on_hand numeric;
  received numeric;
begin
  select status into st from public.production_batches where id = p_batch_id;
  if st not in ('released', 'partially_dispatched', 'fully_dispatched') then
    return;
  end if;
  select coalesce(sum(qty_on_hand), 0), coalesce(sum(qty_received), 0) into on_hand, received from public.stock_lots where batch_id = p_batch_id;
  perform public._batch_set_status(p_batch_id,
    case when on_hand = 0 then 'fully_dispatched' when on_hand < received then 'partially_dispatched' else 'released' end);
end;
$$;

create function public.prod_close_batch(p_batch_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.production_batches;
  left_over numeric;
begin
  perform public.require_permission('production', 'approve');
  b := public._batch_lock(p_batch_id);
  if b.status not in ('fully_dispatched', 'released', 'partially_dispatched') then
    raise exception 'Only a released batch can be closed (batch is %)', b.status;
  end if;
  select coalesce(sum(qty_on_hand), 0) into left_over from public.stock_lots where batch_id = b.id;
  if left_over > 0 then
    raise exception 'This batch still has % packs in stock; dispatch or write them off first', left_over;
  end if;
  update public.production_batches set closed_at = now(), closed_by = auth.uid() where id = b.id;
  perform public._batch_set_status(b.id, 'closed', p_note);
end;
$$;

-- Traceability: everything linked to a batch, from milk/material lots to the customers who received it.
create function public.prod_batch_trace(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_permission('production', 'view');
  select jsonb_build_object(
    'batch', (select to_jsonb(b) || jsonb_build_object('product_name', p.name, 'product_code', p.code, 'recipe_version', r.version)
              from public.production_batches b join public.products p on p.id = b.product_id join public.recipes r on r.id = b.recipe_id
              where b.id = p_batch_id),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object(
        'item', i.name, 'unit', i.unit, 'lot_code', l.lot_code, 'supplier_lot', l.supplier_lot, 'source_type', l.source_type,
        'supplier', s.name, 'collection_no', mc.collection_no, 'qty', -m.qty, 'value', -m.value, 'movement', m.movement_type,
        'at', m.occurred_at, 'issued_by', pr.email) order by m.occurred_at), '[]')
      from public.stock_movements m
      join public.items i on i.id = m.item_id
      join public.stock_lots l on l.id = m.lot_id
      left join public.suppliers s on s.id = l.supplier_id
      left join public.milk_collections mc on mc.id::text = l.source_id and l.source_type = 'milk_collection'
      left join public.profiles pr on pr.id = m.actor
      where m.doc_type = 'batch' and m.doc_id = p_batch_id::text and m.movement_type in ('issue_to_production', 'return_from_production')),
    'packaging', (select coalesce(jsonb_agg(jsonb_build_object(
        'sku', i.name, 'sku_code', i.code, 'packs_good', p.packs_good, 'packs_rejected', p.packs_rejected, 'packs_damaged', p.packs_damaged,
        'net_qty_good', p.net_qty_good, 'packed_by', p.packed_by, 'packed_on', p.packed_on, 'status', p.status) order by p.created_at), '[]')
      from public.batch_packaging p join public.items i on i.id = p.sku_item_id where p.batch_id = p_batch_id),
    'finished_lots', (select coalesce(jsonb_agg(jsonb_build_object(
        'lot_id', l.id, 'lot_code', l.lot_code, 'sku', i.name, 'sku_code', i.code, 'received', l.qty_received, 'on_hand', l.qty_on_hand,
        'reserved', l.qty_reserved, 'unit_cost', l.unit_cost, 'expiry_date', l.expiry_date)), '[]')
      from public.stock_lots l join public.items i on i.id = l.item_id where l.batch_id = p_batch_id),
    'outgoing', (select coalesce(jsonb_agg(jsonb_build_object(
        'sku', i.name, 'qty', -m.qty, 'movement', m.movement_type, 'doc_type', m.doc_type, 'doc_no', m.doc_no, 'doc_id', m.doc_id, 'at', m.occurred_at) order by m.occurred_at), '[]')
      from public.stock_movements m join public.stock_lots l on l.id = m.lot_id join public.items i on i.id = m.item_id
      where l.batch_id = p_batch_id and m.qty < 0),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'from', e.from_status, 'to', e.to_status, 'note', e.note, 'by', pr.email) order by e.at), '[]')
      from public.batch_events e left join public.profiles pr on pr.id = e.actor where e.batch_id = p_batch_id),
    'corrections', (select coalesce(jsonb_agg(to_jsonb(c) order by c.corrected_at), '[]') from public.batch_corrections c where c.batch_id = p_batch_id)
  ) into result;
  return result;
end;
$$;

-- Stock summary per item.
create view public.v_stock_summary with (security_invoker = true) as
select
  i.id as item_id, i.code, i.name, i.item_type, i.category, i.unit, i.reorder_level, i.reorder_qty, i.is_active, i.product_id,
  coalesce(sum(l.qty_on_hand), 0) as on_hand,
  coalesce(sum(l.qty_reserved), 0) as reserved,
  coalesce(sum(l.qty_on_hand - l.qty_reserved) filter (where l.status = 'available' and (l.expiry_date is null or l.expiry_date >= public.ist_today())), 0) as available,
  coalesce(sum(l.qty_on_hand * l.unit_cost), 0)::numeric(14, 2) as stock_value,
  coalesce(sum(l.qty_on_hand) filter (where l.expiry_date < public.ist_today()), 0) as expired_qty,
  coalesce(sum(l.qty_on_hand) filter (where l.expiry_date between public.ist_today() and public.ist_today() + public.setting_num('inventory.expiry_alert_days', 3)::int), 0) as near_expiry_qty,
  min(l.expiry_date) filter (where l.qty_on_hand > 0) as next_expiry
from public.items i
left join public.stock_lots l on l.item_id = i.id and l.qty_on_hand > 0
group by i.id;

-- Catalogue maintenance ---------------------------------------------------------------
create function public._text(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(trim(coalesce(p ->> k, '')), '')
$$;

create function public.cat_save_supplier(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid := (p ->> 'id')::uuid;
begin
  if not (public.has_permission('procurement', 'create') or public.has_permission('purchases', 'create')) then
    perform public.require_permission('purchases', 'create');
  end if;
  if sid is null then
    insert into public.suppliers (code, name, kind, phone, email, address, village, gstin, payment_terms_days, notes)
    values (upper(public._text(p, 'code')), public._text(p, 'name'), coalesce(public._text(p, 'kind'), 'vendor'), public._text(p, 'phone'),
      lower(public._text(p, 'email')), public._text(p, 'address'), public._text(p, 'village'), upper(public._text(p, 'gstin')),
      coalesce((p ->> 'payment_terms_days')::int, 0), public._text(p, 'notes'))
    returning id into sid;
    perform public.write_audit('supplier.create', 'suppliers', sid::text, p);
  else
    update public.suppliers set
      name = coalesce(public._text(p, 'name'), name),
      kind = coalesce(public._text(p, 'kind'), kind),
      phone = case when p ? 'phone' then public._text(p, 'phone') else phone end,
      email = case when p ? 'email' then lower(public._text(p, 'email')) else email end,
      address = case when p ? 'address' then public._text(p, 'address') else address end,
      village = case when p ? 'village' then public._text(p, 'village') else village end,
      gstin = case when p ? 'gstin' then upper(public._text(p, 'gstin')) else gstin end,
      payment_terms_days = coalesce((p ->> 'payment_terms_days')::int, payment_terms_days),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      notes = case when p ? 'notes' then public._text(p, 'notes') else notes end,
      updated_at = now()
    where id = sid;
    perform public.write_audit('supplier.update', 'suppliers', sid::text, p);
  end if;
  return sid;
end;
$$;

create function public.cat_save_product(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := (p ->> 'id')::uuid;
begin
  if pid is null then
    perform public.require_permission('catalog', 'create');
    insert into public.products (code, name, category, source, brand, base_unit, description, storage_conditions, shelf_life_days, qc_required,
      min_yield_pct, hsn, gst_rate, pure_desi_ghee, is_subscribable, show_in_app, sort_order, image_url)
    values (upper(public._text(p, 'code')), public._text(p, 'name'), public._text(p, 'category'), public._text(p, 'source'),
      coalesce(public._text(p, 'brand'), 'Mithai Wallah'), public._text(p, 'base_unit'), public._text(p, 'description'),
      public._text(p, 'storage_conditions'), (p ->> 'shelf_life_days')::int, coalesce((p ->> 'qc_required')::boolean, true),
      (p ->> 'min_yield_pct')::numeric, public._text(p, 'hsn'), (p ->> 'gst_rate')::numeric, coalesce((p ->> 'pure_desi_ghee')::boolean, false),
      coalesce((p ->> 'is_subscribable')::boolean, false), coalesce((p ->> 'show_in_app')::boolean, false), coalesce((p ->> 'sort_order')::int, 0),
      public._text(p, 'image_url'))
    returning id into pid;
    perform public.write_audit('product.create', 'products', pid::text, p);
  else
    perform public.require_permission('catalog', 'edit');
    update public.products set
      name = coalesce(public._text(p, 'name'), name),
      category = coalesce(public._text(p, 'category'), category),
      brand = coalesce(public._text(p, 'brand'), brand),
      description = case when p ? 'description' then public._text(p, 'description') else description end,
      storage_conditions = case when p ? 'storage_conditions' then public._text(p, 'storage_conditions') else storage_conditions end,
      shelf_life_days = case when p ? 'shelf_life_days' then (p ->> 'shelf_life_days')::int else shelf_life_days end,
      qc_required = coalesce((p ->> 'qc_required')::boolean, qc_required),
      min_yield_pct = case when p ? 'min_yield_pct' then (p ->> 'min_yield_pct')::numeric else min_yield_pct end,
      hsn = case when p ? 'hsn' then public._text(p, 'hsn') else hsn end,
      gst_rate = case when p ? 'gst_rate' then (p ->> 'gst_rate')::numeric else gst_rate end,
      pure_desi_ghee = coalesce((p ->> 'pure_desi_ghee')::boolean, pure_desi_ghee),
      is_subscribable = coalesce((p ->> 'is_subscribable')::boolean, is_subscribable),
      show_in_app = coalesce((p ->> 'show_in_app')::boolean, show_in_app),
      sort_order = coalesce((p ->> 'sort_order')::int, sort_order),
      image_url = case when p ? 'image_url' then public._text(p, 'image_url') else image_url end,
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      updated_at = now()
    where id = pid;
    perform public.write_audit('product.update', 'products', pid::text, p);
  end if;
  return pid;
end;
$$;

create function public.cat_save_item(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  iid uuid := (p ->> 'id')::uuid;
begin
  if iid is null then
    perform public.require_permission('catalog', 'create');
    insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, mrp, barcode,
      storefront_slug, storefront_pack, is_perishable, shelf_life_days, rotation, reorder_level, reorder_qty, standard_cost, hsn, gst_rate, storage_conditions)
    values (upper(public._text(p, 'code')), public._text(p, 'name'), (p ->> 'item_type')::public.item_type, public._text(p, 'category'),
      public._text(p, 'unit'), (p ->> 'product_id')::uuid, (p ->> 'packaging_config_id')::uuid, (p ->> 'net_qty')::numeric,
      (p ->> 'sale_price')::numeric, (p ->> 'mrp')::numeric, public._text(p, 'barcode'), public._text(p, 'storefront_slug'),
      public._text(p, 'storefront_pack'), coalesce((p ->> 'is_perishable')::boolean, false), (p ->> 'shelf_life_days')::int,
      coalesce(public._text(p, 'rotation'), case when coalesce((p ->> 'is_perishable')::boolean, false) then 'FEFO' else 'FIFO' end),
      coalesce((p ->> 'reorder_level')::numeric, 0), coalesce((p ->> 'reorder_qty')::numeric, 0), coalesce((p ->> 'standard_cost')::numeric, 0),
      public._text(p, 'hsn'), (p ->> 'gst_rate')::numeric, public._text(p, 'storage_conditions'))
    returning id into iid;
    perform public.write_audit('item.create', 'items', iid::text, p);
  else
    perform public.require_permission('catalog', 'edit');
    -- Type, unit and pack definition are fixed once an item exists, so history keeps its meaning.
    update public.items set
      name = coalesce(public._text(p, 'name'), name),
      category = coalesce(public._text(p, 'category'), category),
      sale_price = case when p ? 'sale_price' then (p ->> 'sale_price')::numeric else sale_price end,
      mrp = case when p ? 'mrp' then (p ->> 'mrp')::numeric else mrp end,
      barcode = case when p ? 'barcode' then public._text(p, 'barcode') else barcode end,
      storefront_slug = case when p ? 'storefront_slug' then public._text(p, 'storefront_slug') else storefront_slug end,
      storefront_pack = case when p ? 'storefront_pack' then public._text(p, 'storefront_pack') else storefront_pack end,
      is_perishable = coalesce((p ->> 'is_perishable')::boolean, is_perishable),
      shelf_life_days = case when p ? 'shelf_life_days' then (p ->> 'shelf_life_days')::int else shelf_life_days end,
      rotation = coalesce(public._text(p, 'rotation'), rotation),
      reorder_level = coalesce((p ->> 'reorder_level')::numeric, reorder_level),
      reorder_qty = coalesce((p ->> 'reorder_qty')::numeric, reorder_qty),
      standard_cost = coalesce((p ->> 'standard_cost')::numeric, standard_cost),
      hsn = case when p ? 'hsn' then public._text(p, 'hsn') else hsn end,
      gst_rate = case when p ? 'gst_rate' then (p ->> 'gst_rate')::numeric else gst_rate end,
      storage_conditions = case when p ? 'storage_conditions' then public._text(p, 'storage_conditions') else storage_conditions end,
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      updated_at = now()
    where id = iid;
    perform public.write_audit('item.update', 'items', iid::text, p);
  end if;
  return iid;
end;
$$;

create function public.cat_save_packaging_config(p jsonb, p_bom jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := (p ->> 'id')::uuid;
  e jsonb;
begin
  if cid is null then
    perform public.require_permission('catalog', 'create');
    insert into public.packaging_configs (code, name, pack_type, net_qty, net_unit, is_bulk, notes)
    values (upper(public._text(p, 'code')), public._text(p, 'name'), public._text(p, 'pack_type'), (p ->> 'net_qty')::numeric,
      public._text(p, 'net_unit'), coalesce((p ->> 'is_bulk')::boolean, false), public._text(p, 'notes'))
    returning id into cid;
  else
    perform public.require_permission('catalog', 'edit');
    update public.packaging_configs set name = coalesce(public._text(p, 'name'), name), is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      notes = case when p ? 'notes' then public._text(p, 'notes') else notes end
    where id = cid;
  end if;
  if p_bom is not null then
    delete from public.packaging_bom where packaging_config_id = cid;
    for e in select * from jsonb_array_elements(p_bom) loop
      if not exists (select 1 from public.items where id = (e ->> 'item_id')::uuid and item_type in ('packaging', 'consumable')) then
        raise exception 'Packaging bill of materials can only use packaging or consumable items';
      end if;
      insert into public.packaging_bom (packaging_config_id, item_id, qty_per_pack) values (cid, (e ->> 'item_id')::uuid, (e ->> 'qty_per_pack')::numeric);
    end loop;
  end if;
  perform public.write_audit('packaging_config.save', 'packaging_configs', cid::text, jsonb_build_object('config', p, 'bom', p_bom));
  return cid;
end;
$$;

-- New recipe version (draft). Lines: [{item_id, qty, is_main_input, notes}].
create function public.cat_save_recipe_draft(p_product_id uuid, p_standard_output_qty numeric, p_lines jsonb, p_expected_minutes integer default null,
  p_instructions text default null, p_recipe_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid := p_recipe_id;
  next_version integer;
  e jsonb;
  st text;
begin
  perform public.require_permission('catalog', 'edit');
  if not exists (select 1 from public.products where id = p_product_id and source = 'manufactured') then
    raise exception 'Recipes are for manufactured products';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then
    raise exception 'Add at least one material';
  end if;
  if rid is null then
    select coalesce(max(version), 0) + 1 into next_version from public.recipes where product_id = p_product_id;
    insert into public.recipes (product_id, version, standard_output_qty, expected_minutes, instructions)
    values (p_product_id, next_version, p_standard_output_qty, p_expected_minutes, nullif(trim(coalesce(p_instructions, '')), ''))
    returning id into rid;
  else
    select status into st from public.recipes where id = rid and product_id = p_product_id for update;
    if st is distinct from 'draft' then
      raise exception 'Only a draft recipe can be edited; create a new version instead';
    end if;
    update public.recipes set standard_output_qty = p_standard_output_qty, expected_minutes = p_expected_minutes,
      instructions = nullif(trim(coalesce(p_instructions, '')), '') where id = rid;
    delete from public.recipe_lines where recipe_id = rid;
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from public.items where id = (e ->> 'item_id')::uuid and item_type in ('raw_material', 'consumable', 'purchased_good')) then
      raise exception 'Recipes use raw materials or consumables (packaging belongs to the packaging configuration)';
    end if;
    insert into public.recipe_lines (recipe_id, item_id, qty, is_main_input, notes, sort_order)
    values (rid, (e ->> 'item_id')::uuid, (e ->> 'qty')::numeric, coalesce((e ->> 'is_main_input')::boolean, false), e ->> 'notes',
      coalesce((e ->> 'sort_order')::int, 0));
  end loop;
  perform public.write_audit('recipe.save_draft', 'recipes', rid::text, jsonb_build_object('lines', p_lines, 'standard_output_qty', p_standard_output_qty));
  return rid;
end;
$$;

create function public.cat_activate_recipe(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.recipes;
begin
  perform public.require_permission('catalog', 'approve');
  select * into rec from public.recipes where id = p_recipe_id for update;
  if not found or rec.status <> 'draft' then
    raise exception 'Only a draft recipe can be approved';
  end if;
  update public.recipes set status = 'retired' where product_id = rec.product_id and status = 'active';
  update public.recipes set status = 'active', activated_by = auth.uid(), activated_at = now() where id = rec.id;
  perform public.write_audit('recipe.activate', 'recipes', rec.id::text, jsonb_build_object('product_id', rec.product_id, 'version', rec.version));
end;
$$;

-- Recipe lines can't change once a recipe is approved (batches keep their version).
create function public._recipe_lines_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st text;
begin
  select status into st from public.recipes where id = coalesce(new.recipe_id, old.recipe_id);
  if st is distinct from 'draft' then
    raise exception 'Approved recipe versions cannot be changed; create a new version' using errcode = '55000';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger recipe_lines_guard before insert or update or delete on public.recipe_lines
  for each row execute function public._recipe_lines_guard();

create function public.cat_save_quality_parameter(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  qid uuid := (p ->> 'id')::uuid;
begin
  perform public.require_permission('catalog', 'edit');
  if qid is null then
    insert into public.quality_parameters (scope, product_id, name, kind, min_value, max_value, unit, is_required, sort_order)
    values (public._text(p, 'scope'), (p ->> 'product_id')::uuid, public._text(p, 'name'), public._text(p, 'kind'), (p ->> 'min_value')::numeric,
      (p ->> 'max_value')::numeric, public._text(p, 'unit'), coalesce((p ->> 'is_required')::boolean, true), coalesce((p ->> 'sort_order')::int, 0))
    returning id into qid;
  else
    update public.quality_parameters set name = coalesce(public._text(p, 'name'), name),
      min_value = case when p ? 'min_value' then (p ->> 'min_value')::numeric else min_value end, max_value = case when p ? 'max_value' then (p ->> 'max_value')::numeric else max_value end,
      unit = case when p ? 'unit' then public._text(p, 'unit') else unit end, is_required = coalesce((p ->> 'is_required')::boolean, is_required),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active)
    where id = qid;
  end if;
  perform public.write_audit('quality_parameter.save', 'quality_parameters', qid::text, p);
  return qid;
end;
$$;

-- Access rules ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['units', 'categories', 'suppliers', 'products', 'packaging_configs', 'items', 'packaging_bom', 'stock_lots',
    'stock_movements', 'ops_request_keys', 'quality_parameters', 'milk_collections', 'recipes', 'recipe_lines', 'production_batches',
    'batch_materials', 'batch_events', 'batch_qc_results', 'batch_packaging', 'batch_corrections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "Staff read units" on public.units for select to authenticated using (true);
create policy "Staff read categories" on public.categories for select to authenticated using (true);
create policy "Buyers and procurement read suppliers" on public.suppliers for select to authenticated
  using ((select public.has_permission('procurement', 'view')) or (select public.has_permission('purchases', 'view')) or (select public.has_permission('inventory', 'view')));
create policy "Staff read products" on public.products for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('inventory', 'view')) or (select public.has_permission('dispatch', 'view')));
create policy "Staff read packaging configurations" on public.packaging_configs for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('production', 'view')));
create policy "Staff read items" on public.items for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('inventory', 'view')) or (select public.has_permission('production', 'view'))
    or (select public.has_permission('dispatch', 'view')) or (select public.has_permission('purchases', 'view')));
create policy "Staff read packaging BOM" on public.packaging_bom for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('production', 'view')));
create policy "Stock readers read lots" on public.stock_lots for select to authenticated
  using ((select public.has_permission('inventory', 'view')) or (select public.has_permission('production', 'view')) or (select public.has_permission('dispatch', 'view')));
create policy "Stock readers read movements" on public.stock_movements for select to authenticated
  using ((select public.has_permission('inventory', 'view')) or (select public.has_permission('production', 'view')));
create policy "Staff read quality parameters" on public.quality_parameters for select to authenticated
  using ((select public.has_permission('quality', 'view')) or (select public.has_permission('procurement', 'view')) or (select public.has_permission('catalog', 'view')));
create policy "Procurement reads collections" on public.milk_collections for select to authenticated
  using ((select public.has_permission('procurement', 'view')) or (select public.has_permission('purchases', 'view')));
create policy "Staff read recipes" on public.recipes for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('production', 'view')));
create policy "Staff read recipe lines" on public.recipe_lines for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('production', 'view')));
create policy "Production reads batches" on public.production_batches for select to authenticated
  using ((select public.has_permission('production', 'view')) or (select public.has_permission('quality', 'view')));
create policy "Production reads batch materials" on public.batch_materials for select to authenticated using ((select public.has_permission('production', 'view')));
create policy "Production reads batch events" on public.batch_events for select to authenticated
  using ((select public.has_permission('production', 'view')) or (select public.has_permission('quality', 'view')));
create policy "Quality results" on public.batch_qc_results for select to authenticated
  using ((select public.has_permission('quality', 'view')) or (select public.has_permission('production', 'view')));
create policy "Production reads packaging" on public.batch_packaging for select to authenticated using ((select public.has_permission('production', 'view')));
create policy "Production reads corrections" on public.batch_corrections for select to authenticated
  using ((select public.has_permission('production', 'view')) or (select public.has_permission('audit', 'view')));

-- Internal helpers are not callable through the API.
revoke execute on function public._claim_request_key(text, text) from public, anon, authenticated;
revoke execute on function public._stock_post(uuid, numeric, text, text, text, text, text, numeric, boolean, bigint) from public, anon, authenticated;
revoke execute on function public._stock_pick(uuid, numeric) from public, anon, authenticated;
revoke execute on function public._new_lot(uuid, numeric, numeric, text, text, text, uuid, date, date, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._batch_set_status(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._batch_lock(uuid) from public, anon, authenticated;
revoke execute on function public._batch_refresh_dispatch(uuid) from public, anon, authenticated;
revoke execute on function public._recipe_lines_guard() from public, anon, authenticated;

-- Actions: callable by signed-in staff; each checks its own permission.
do $$
declare
  f text;
begin
  foreach f in array array[
    'inv_receive_opening_stock(uuid, numeric, numeric, date, text, text, text)',
    'inv_adjust_stock(uuid, numeric, text, text, text)',
    'inv_set_lot_status(uuid, text, text)',
    'inv_reverse_movement(bigint, text)',
    'proc_record_collection(uuid, date, text, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text, text)',
    'proc_cancel_collection(uuid, text)',
    'prod_create_batch(uuid, date, numeric, text, uuid, text, text, text, text, text)',
    'prod_issue_material(uuid, uuid, numeric, uuid, text, text)',
    'prod_return_material(uuid, uuid, numeric, text, text)',
    'prod_start_batch(uuid)',
    'prod_complete_batch(uuid, numeric, numeric, numeric, numeric, numeric, text, jsonb)',
    'prod_correct_output(uuid, text, numeric, text)',
    'prod_record_qc(uuid, jsonb, text, text)',
    'prod_record_packaging(uuid, uuid, integer, integer, integer, text, date, text, text)',
    'prod_reverse_packaging(uuid, text)',
    'prod_complete_packaging(uuid, numeric, text, text)',
    'prod_release_batch(uuid)',
    'prod_cancel_batch(uuid, text, text)',
    'prod_close_batch(uuid, text)',
    'prod_batch_trace(uuid)',
    'cat_save_supplier(jsonb)',
    'cat_save_product(jsonb)',
    'cat_save_item(jsonb)',
    'cat_save_packaging_config(jsonb, jsonb)',
    'cat_save_recipe_draft(uuid, numeric, jsonb, integer, text, uuid)',
    'cat_activate_recipe(uuid)',
    'cat_save_quality_parameter(jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._text(jsonb, text) from public, anon;
grant execute on function public._text(jsonb, text) to authenticated;
grant select on public.v_batch_materials, public.v_stock_summary to authenticated;
revoke all on public.v_batch_materials, public.v_stock_summary from anon;

-- ===== 20261010115000_ops_seed_website_catalogue =====
-- The website's existing sweets catalogue as products and sellable SKUs, so website orders can be
-- allocated to stock and dispatched. Prices and tax codes are copied from the live site's catalogue
-- (src/data/sweets.ts, src/data/tax.ts). Recipes, shelf life and packaging materials are NOT invented:
-- the administrator adds them in the business app.

insert into public.packaging_configs (code, name, pack_type, net_qty, net_unit) values
  ('BOX-250G', '250 g box', 'box', 0.25, 'kg'),
  ('BOX-500G', '500 g box', 'box', 0.5, 'kg'),
  ('BOX-1KG', '1 kg box', 'box', 1, 'kg'),
  ('TIN-1KG', '1 kg tin', 'tin', 1, 'kg')
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('MILK-CAKE', 'Milk Cake', 'sweets', 'manufactured', 'kg', 'Dense, caramelised milk cake slow-cooked from fresh khoya in pure desi ghee — golden, grainy and rich.', '21069099', 5, true, 1)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MILK-CAKE-250G', 'Milk Cake — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 180, 'milk-cake', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MILK-CAKE' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MILK-CAKE-500G', 'Milk Cake — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 340, 'milk-cake', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MILK-CAKE' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MILK-CAKE-1KG', 'Milk Cake — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 650, 'milk-cake', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MILK-CAKE' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('KALAKAND', 'Kalakand', 'sweets', 'manufactured', 'kg', 'Soft, moist kalakand made from fresh paneer and reduced milk — gently sweet with a delicate grainy texture.', '21069099', 5, true, 2)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KALAKAND-250G', 'Kalakand — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 200, 'kalakand', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KALAKAND' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KALAKAND-500G', 'Kalakand — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 380, 'kalakand', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KALAKAND' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KALAKAND-1KG', 'Kalakand — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 720, 'kalakand', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KALAKAND' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('CHOCOLATE-BARFI', 'Chocolate Barfi', 'sweets', 'manufactured', 'kg', 'Fudgy cocoa-and-khoya barfi finished with almonds and pistachios — classic mithai with a modern twist.', '21069099', 5, true, 3)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'CHOCOLATE-BARFI-250G', 'Chocolate Barfi — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 220, 'chocolate-barfi', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'CHOCOLATE-BARFI' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'CHOCOLATE-BARFI-500G', 'Chocolate Barfi — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 420, 'chocolate-barfi', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'CHOCOLATE-BARFI' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'CHOCOLATE-BARFI-1KG', 'Chocolate Barfi — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 800, 'chocolate-barfi', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'CHOCOLATE-BARFI' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('DODA-BARFI', 'Doda Barfi', 'sweets', 'manufactured', 'kg', 'Dense, deeply roasted doda barfi with a firm, grainy bite and a rich ghee aroma.', '21069099', 5, true, 4)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'DODA-BARFI-250G', 'Doda Barfi — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 190, 'doda-barfi', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'DODA-BARFI' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'DODA-BARFI-500G', 'Doda Barfi — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 360, 'doda-barfi', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'DODA-BARFI' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'DODA-BARFI-1KG', 'Doda Barfi — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 680, 'doda-barfi', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'DODA-BARFI' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('MALAI-BARFI', 'Malai Barfi', 'sweets', 'manufactured', 'kg', 'Pale, creamy malai barfi that melts in the mouth, generously topped with pistachios.', '21069099', 5, true, 5)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MALAI-BARFI-250G', 'Malai Barfi — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 210, 'malai-barfi', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MALAI-BARFI' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MALAI-BARFI-500G', 'Malai Barfi — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 400, 'malai-barfi', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MALAI-BARFI' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MALAI-BARFI-1KG', 'Malai Barfi — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 760, 'malai-barfi', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MALAI-BARFI' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('PEDA', 'Peda', 'sweets', 'manufactured', 'kg', 'Hand-shaped khoya peda with a soft crumb, a hint of cardamom and pistachio on top.', '21069099', 5, true, 6)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PEDA-250G', 'Peda — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 180, 'peda', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'PEDA' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PEDA-500G', 'Peda — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 340, 'peda', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'PEDA' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PEDA-1KG', 'Peda — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 640, 'peda', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'PEDA' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('KUNDA', 'Kunda', 'sweets', 'manufactured', 'kg', 'Prayagraj''s own specialty — a thick, caramelised khoya sweet, rich enough to eat by the spoon.', '21069099', 5, true, 7)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KUNDA-250G', 'Kunda — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 220, 'kunda', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KUNDA' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KUNDA-500G', 'Kunda — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 420, 'kunda', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KUNDA' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KUNDA-1KG-TIN', 'Kunda — 1 kg tin', 'finished_good', 'finished_goods', 'tin', p.id, c.id, 1, 800, 'kunda', '1 kg tin', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KUNDA' and c.code = 'TIN-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('BIKANERI-CAKE', 'Bikaneri Cake', 'sweets', 'manufactured', 'kg', 'A firm, layered milk sweet with rich caramel notes that keeps and travels well.', '21069099', 5, true, 8)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'BIKANERI-CAKE-250G', 'Bikaneri Cake — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 200, 'bikaneri-cake', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'BIKANERI-CAKE' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'BIKANERI-CAKE-500G', 'Bikaneri Cake — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 380, 'bikaneri-cake', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'BIKANERI-CAKE' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'BIKANERI-CAKE-1KG', 'Bikaneri Cake — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 720, 'bikaneri-cake', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'BIKANERI-CAKE' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('PREMIUM-DRY-FRUIT-BOX', 'Premium Dry Fruit Box', 'sweets', 'manufactured', 'kg', 'Almonds, cashews, pistachios, walnuts and raisins in an elegant Mithai Wallah gift box — thoughtful inside, impressive outside.', '08135020', 5, false, 9)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PREMIUM-DRY-FRUIT-BOX-500G', 'Premium Dry Fruit Box — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 900, 'premium-dry-fruit-box', '500 g', false, 'FEFO', '08135020', 5
from public.products p, public.packaging_configs c where p.code = 'PREMIUM-DRY-FRUIT-BOX' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PREMIUM-DRY-FRUIT-BOX-1KG', 'Premium Dry Fruit Box — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 1700, 'premium-dry-fruit-box', '1 kg', false, 'FEFO', '08135020', 5
from public.products p, public.packaging_configs c where p.code = 'PREMIUM-DRY-FRUIT-BOX' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

-- The stock item that accepted milk from the collection register goes into.
insert into public.items (code, name, item_type, category, unit, is_perishable, rotation, shelf_life_days)
values ('RM-MILK', 'Raw milk', 'raw_material', 'raw_milk', 'l', true, 'FEFO', 1)
on conflict (code) do nothing;

-- ===== 20261010120000_ops_dispatch =====
-- Orders, batch-aware stock allocation and dispatch.
--
-- Every order (website, app, milk subscription, staff-entered) lives in public.orders with its own lines.
-- Allocation reserves specific finished-goods lots (FEFO) for each line; dispatch takes stock out of
-- exactly those lots, so each delivery records which manufacturing batch it came from. Stock is
-- deducted once, at dispatch — never again for materials already consumed in manufacturing.

alter table public.orders
  add column if not exists source text not null default 'website' check (source in ('website', 'app', 'subscription', 'staff')),
  add column if not exists fulfilment_status text not null default 'confirmed' check (fulfilment_status in (
    'awaiting_payment', 'confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched', 'dispatched',
    'out_for_delivery', 'partially_delivered', 'delivered', 'delivery_failed', 'returned', 'cancelled')),
  add column if not exists on_hold boolean not null default false,
  add column if not exists hold_reason text,
  add column if not exists delivery_date date,
  add column if not exists delivery_slot text,
  add column if not exists created_by uuid;
create index if not exists orders_fulfilment_idx on public.orders (fulfilment_status);
create index if not exists orders_delivery_date_idx on public.orders (delivery_date);

alter table public.order_items add column if not exists item_id uuid references public.items;
create index if not exists order_items_item_idx on public.order_items (item_id);

-- Existing orders get a fulfilment status from their current status.
update public.orders set fulfilment_status = case status
  when 'pending_payment' then 'awaiting_payment'
  when 'received' then 'confirmed'
  when 'preparing' then 'processing'
  when 'out_for_delivery' then 'out_for_delivery'
  when 'delivered' then 'delivered'
  when 'cancelled' then 'cancelled'
end;

-- Website order lines are linked to their stock item (SKU) by product slug and pack label.
update public.order_items oi set item_id = i.id
from public.items i where oi.item_id is null and i.storefront_slug = oi.slug and i.storefront_pack = oi.pack_label;

create function public._order_item_link_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_id is null then
    select id into new.item_id from public.items where storefront_slug = new.slug and storefront_pack = new.pack_label;
  end if;
  return new;
end;
$$;
create trigger order_items_link_sku before insert on public.order_items
  for each row execute function public._order_item_link_sku();

-- Keep the operational status and the customer-facing status in step.
create function public._order_status_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending_payment' then
      new.fulfilment_status := 'awaiting_payment';
    elsif new.status = 'cancelled' then
      new.fulfilment_status := 'cancelled';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and new.fulfilment_status is not distinct from old.fulfilment_status then
    new.fulfilment_status := case new.status
      when 'received' then case when old.fulfilment_status = 'awaiting_payment' then 'confirmed' else old.fulfilment_status end
      when 'preparing' then case when old.fulfilment_status in ('confirmed', 'awaiting_payment') then 'processing' else old.fulfilment_status end
      when 'out_for_delivery' then 'out_for_delivery'
      when 'delivered' then 'delivered'
      when 'cancelled' then 'cancelled'
      else old.fulfilment_status
    end;
  elsif new.fulfilment_status is distinct from old.fulfilment_status and new.status is not distinct from old.status then
    new.status := case new.fulfilment_status
      when 'processing' then 'preparing'
      when 'picking' then 'preparing'
      when 'packed' then 'preparing'
      when 'ready_for_dispatch' then 'preparing'
      when 'partially_dispatched' then 'out_for_delivery'
      when 'dispatched' then 'out_for_delivery'
      when 'out_for_delivery' then 'out_for_delivery'
      when 'partially_delivered' then 'out_for_delivery'
      when 'delivered' then 'delivered'
      when 'cancelled' then 'cancelled'
      else old.status
    end::public.order_status;
  end if;
  return new;
end;
$$;
create trigger orders_status_sync before insert or update on public.orders
  for each row execute function public._order_status_sync();

-- Allocations: finished-goods lots reserved for an order line --------------------------
create table public.order_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  order_item_id uuid not null references public.order_items on delete cascade,
  item_id uuid not null references public.items,
  lot_id uuid not null references public.stock_lots,
  qty numeric(14, 3) not null check (qty > 0),
  qty_dispatched numeric(14, 3) not null default 0 check (qty_dispatched >= 0),
  qty_released numeric(14, 3) not null default 0 check (qty_released >= 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (qty_dispatched + qty_released <= qty)
);
create index order_allocations_order_idx on public.order_allocations (order_id);
create index order_allocations_lot_idx on public.order_allocations (lot_id);

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_no text not null unique,
  order_id uuid not null references public.orders,
  delivery_person text,
  dispatched_at timestamptz not null default now(),
  expected_at timestamptz,
  delivered_at timestamptz,
  status text not null default 'dispatched' check (status in ('dispatched', 'out_for_delivery', 'delivered', 'partially_delivered', 'delivery_failed', 'returned')),
  remarks text,
  cash_collected numeric(12, 2) check (cash_collected >= 0),
  collection_method text check (collection_method in ('cash', 'upi', 'card', 'other')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index dispatches_order_idx on public.dispatches (order_id);
create index dispatches_date_idx on public.dispatches (dispatched_at desc);

create table public.dispatch_lines (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches on delete cascade,
  order_item_id uuid not null references public.order_items,
  allocation_id uuid references public.order_allocations,
  item_id uuid not null references public.items,
  lot_id uuid not null references public.stock_lots,
  batch_id uuid references public.production_batches,
  qty numeric(14, 3) not null check (qty > 0),
  qty_returned numeric(14, 3) not null default 0 check (qty_returned >= 0),
  movement_id bigint not null references public.stock_movements,
  check (qty_returned <= qty)
);
create index dispatch_lines_dispatch_idx on public.dispatch_lines (dispatch_id);
create index dispatch_lines_batch_idx on public.dispatch_lines (batch_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders on delete cascade,
  dispatch_id uuid references public.dispatches,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  status text not null,
  note text
);
create index order_events_order_idx on public.order_events (order_id);
create trigger order_events_append_only before update or delete on public.order_events
  for each row execute function public.reject_change();

create function public._order_lock(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  return o;
end;
$$;

create function public._order_set_fulfilment(p_order_id uuid, p_status text, p_note text default null, p_dispatch_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set fulfilment_status = p_status where id = p_order_id and fulfilment_status is distinct from p_status;
  insert into public.order_events (order_id, dispatch_id, status, note) values (p_order_id, p_dispatch_id, p_status, p_note);
end;
$$;

-- Line quantities: ordered, reserved (still to dispatch), dispatched.
create view public.v_order_line_fulfilment with (security_invoker = true) as
select
  oi.id as order_item_id, oi.order_id, oi.item_id, oi.product_name, oi.pack_label, oi.quantity::numeric as ordered,
  coalesce(sum(a.qty - a.qty_dispatched - a.qty_released), 0) as reserved,
  coalesce(sum(a.qty_dispatched), 0) as dispatched
from public.order_items oi
left join public.order_allocations a on a.order_item_id = oi.id
group by oi.id;

-- Reserve stock for every line still short, oldest-expiry lots first. Reports shortages.
create function public.disp_allocate_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  line record;
  lot record;
  needed numeric;
  take numeric;
  allocated jsonb := '[]';
  shortages jsonb := '[]';
begin
  perform public.require_permission('dispatch', 'create');
  o := public._order_lock(p_order_id);
  if o.fulfilment_status in ('awaiting_payment', 'cancelled', 'delivered', 'returned') then
    raise exception 'This order is % and cannot be allocated', replace(o.fulfilment_status, '_', ' ');
  end if;
  if o.on_hold then
    raise exception 'This order is on hold: %', coalesce(o.hold_reason, 'no reason given');
  end if;

  for line in
    select f.*, i.name as item_name, i.unit
    from public.v_order_line_fulfilment f left join public.items i on i.id = f.item_id
    where f.order_id = o.id
  loop
    needed := line.ordered - line.reserved - line.dispatched;
    continue when needed <= 0;
    if line.item_id is null then
      shortages := shortages || jsonb_build_object('order_item_id', line.order_item_id, 'product', line.product_name || ' ' || line.pack_label,
        'needed', needed, 'available', 0, 'reason', 'Not linked to a stock item (SKU)');
      continue;
    end if;
    for lot in
      select l.id, l.qty_on_hand - l.qty_reserved as free, l.lot_code, l.batch_id
      from public.stock_lots l
      join public.items i on i.id = l.item_id
      where l.item_id = line.item_id and l.status = 'available' and l.qty_on_hand - l.qty_reserved > 0
        and (l.expiry_date is null or l.expiry_date >= public.ist_today())
      order by l.expiry_date nulls last, l.received_at, l.lot_code
      for update of l
    loop
      exit when needed <= 0;
      take := least(lot.free, needed);
      update public.stock_lots set qty_reserved = qty_reserved + take where id = lot.id;
      insert into public.order_allocations (order_id, order_item_id, item_id, lot_id, qty) values (o.id, line.order_item_id, line.item_id, lot.id, take);
      allocated := allocated || jsonb_build_object('product', line.item_name, 'lot_code', lot.lot_code, 'batch_id', lot.batch_id, 'qty', take);
      needed := needed - take;
    end loop;
    if needed > 0 then
      shortages := shortages || jsonb_build_object('order_item_id', line.order_item_id, 'product', line.item_name, 'needed', needed,
        'available', (line.ordered - line.reserved - line.dispatched) - needed, 'reason', 'Not enough saleable stock');
    end if;
  end loop;

  if jsonb_array_length(allocated) > 0 and o.fulfilment_status in ('confirmed', 'delivery_failed') then
    perform public._order_set_fulfilment(o.id, 'processing', 'Stock allocated');
  end if;
  perform public.write_audit('order.allocate', 'orders', o.id::text, jsonb_build_object('allocated', allocated, 'shortages', shortages));
  return jsonb_build_object('allocated', allocated, 'shortages', shortages);
end;
$$;

create function public.disp_release_allocation(p_allocation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.order_allocations;
  open_qty numeric;
begin
  perform public.require_permission('dispatch', 'edit');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into a from public.order_allocations where id = p_allocation_id for update;
  if not found then
    raise exception 'Allocation not found';
  end if;
  open_qty := a.qty - a.qty_dispatched - a.qty_released;
  if open_qty <= 0 then
    raise exception 'Nothing left to release on this allocation';
  end if;
  perform 1 from public.stock_lots where id = a.lot_id for update;
  update public.stock_lots set qty_reserved = qty_reserved - open_qty where id = a.lot_id;
  update public.order_allocations set qty_released = qty_released + open_qty where id = a.id;
  perform public.write_audit('order.release_allocation', 'order_allocations', a.id::text, jsonb_build_object('qty', open_qty, 'order_id', a.order_id), p_reason);
end;
$$;

create function public.disp_set_stage(p_order_id uuid, p_stage text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  perform public.require_permission('dispatch', 'edit');
  if p_stage not in ('processing', 'picking', 'packed', 'ready_for_dispatch') then
    raise exception 'Unknown stage %', p_stage;
  end if;
  o := public._order_lock(p_order_id);
  if o.fulfilment_status not in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched') then
    raise exception 'The order is %', replace(o.fulfilment_status, '_', ' ');
  end if;
  perform public._order_set_fulfilment(o.id, p_stage, p_note);
end;
$$;

create function public.disp_hold_order(p_order_id uuid, p_hold boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('dispatch', 'approve');
  if p_hold and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for holding the order';
  end if;
  perform public._order_lock(p_order_id);
  update public.orders set on_hold = p_hold, hold_reason = case when p_hold then p_reason end where id = p_order_id;
  insert into public.order_events (order_id, status, note) values (p_order_id, case when p_hold then 'on_hold' else 'hold_released' end, p_reason);
  perform public.write_audit(case when p_hold then 'order.hold' else 'order.unhold' end, 'orders', p_order_id::text, null, p_reason);
end;
$$;

-- Dispatch reserved stock. p_lines = [{allocation_id, qty}]; null dispatches everything reserved.
create function public.disp_dispatch_order(
  p_order_id uuid, p_lines jsonb default null, p_delivery_person text default null, p_expected_at timestamptz default null,
  p_remarks text default null, p_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  did uuid := gen_random_uuid();
  no text := public.next_doc_number('dispatch', 'MW-DSP', to_char(public.ist_today(), 'YYYY'), 5);
  req record;
  a public.order_allocations;
  open_qty numeric;
  mid bigint;
  lot_batch uuid;
  batches uuid[] := '{}';
  n integer := 0;
  total_ordered numeric;
  total_dispatched numeric;
begin
  perform public.require_permission('dispatch', 'edit');
  perform public._claim_request_key(p_key, 'disp_dispatch_order');
  o := public._order_lock(p_order_id);
  if o.on_hold then
    raise exception 'This order is on hold: %', coalesce(o.hold_reason, 'no reason given');
  end if;
  if o.fulfilment_status in ('awaiting_payment', 'cancelled', 'delivered', 'returned') then
    raise exception 'This order is % and cannot be dispatched', replace(o.fulfilment_status, '_', ' ');
  end if;

  insert into public.dispatches (id, dispatch_no, order_id, delivery_person, expected_at, remarks)
  values (did, no, o.id, nullif(trim(coalesce(p_delivery_person, '')), ''), p_expected_at, nullif(trim(coalesce(p_remarks, '')), ''));

  for req in
    select (e ->> 'allocation_id')::uuid as allocation_id, (e ->> 'qty')::numeric as qty
    from jsonb_array_elements(coalesce(p_lines, '[]')) e
    union all
    select x.id, null::numeric
    from public.order_allocations x
    where p_lines is null and x.order_id = o.id and x.qty - x.qty_dispatched - x.qty_released > 0
  loop
    select * into a from public.order_allocations where id = req.allocation_id and order_id = o.id for update;
    if not found then
      raise exception 'That allocation does not belong to this order';
    end if;
    open_qty := a.qty - a.qty_dispatched - a.qty_released;
    if coalesce(req.qty, open_qty) <= 0 then
      continue;
    end if;
    if coalesce(req.qty, open_qty) > open_qty then
      raise exception 'Only % reserved on this line; dispatching % would exceed saleable stock reserved for the order', open_qty, req.qty
        using errcode = '23514';
    end if;
    mid := public._stock_post(a.lot_id, -coalesce(req.qty, open_qty), 'dispatch', 'dispatch', did::text, no, null, coalesce(req.qty, open_qty));
    update public.order_allocations set qty_dispatched = qty_dispatched + coalesce(req.qty, open_qty) where id = a.id;
    select batch_id into lot_batch from public.stock_lots where id = a.lot_id;
    insert into public.dispatch_lines (dispatch_id, order_item_id, allocation_id, item_id, lot_id, batch_id, qty, movement_id)
    values (did, a.order_item_id, a.id, a.item_id, a.lot_id, lot_batch, coalesce(req.qty, open_qty), mid);
    if lot_batch is not null then
      batches := batches || lot_batch;
    end if;
    n := n + 1;
  end loop;

  if n = 0 then
    raise exception 'Nothing is reserved to dispatch; allocate stock first' using errcode = '23514';
  end if;
  for lot_batch in select distinct unnest(batches) loop
    perform public._batch_refresh_dispatch(lot_batch);
  end loop;

  select sum(ordered), sum(dispatched) into total_ordered, total_dispatched from public.v_order_line_fulfilment where order_id = o.id;
  perform public._order_set_fulfilment(o.id, case when total_dispatched >= total_ordered then 'dispatched' else 'partially_dispatched' end,
    'Dispatch ' || no, did);
  perform public.write_audit('order.dispatch', 'dispatches', did::text, jsonb_build_object('dispatch_no', no, 'order_id', o.id, 'lines', n));
  return did;
end;
$$;

-- Delivery updates. Failed or returned goods come back into the same lot (restocked) or are written off.
create function public.disp_update_delivery(
  p_dispatch_id uuid, p_status text, p_remarks text default null, p_cash_collected numeric default null,
  p_collection_method text default null, p_returns jsonb default null, p_restock boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dispatches;
  o public.orders;
  r record;
  ret_qty numeric;
  undelivered integer;
  all_dispatched boolean;
  mid bigint;
begin
  perform public.require_permission('dispatch', 'edit');
  if p_returns is not null and jsonb_array_length(p_returns) = 0 then
    p_returns := null;   -- an empty list means "everything" for failed / returned deliveries
  end if;
  if p_status not in ('out_for_delivery', 'delivered', 'partially_delivered', 'delivery_failed', 'returned') then
    raise exception 'Unknown delivery status %', p_status;
  end if;
  select * into d from public.dispatches where id = p_dispatch_id for update;
  if not found then
    raise exception 'Dispatch not found';
  end if;
  if d.status in ('delivered', 'delivery_failed', 'returned') and p_status <> 'returned' then
    raise exception 'This dispatch is already %', replace(d.status, '_', ' ');
  end if;
  o := public._order_lock(d.order_id);

  if p_status in ('delivery_failed', 'returned', 'partially_delivered') then
    if p_status <> 'partially_delivered' and coalesce(trim(p_remarks), '') = '' then
      raise exception 'Say what happened';
    end if;
    for r in
      select dl.*, coalesce((select (e ->> 'qty')::numeric from jsonb_array_elements(coalesce(p_returns, '[]')) e
        where (e ->> 'dispatch_line_id')::uuid = dl.id), case when p_returns is null and p_status <> 'partially_delivered' then dl.qty - dl.qty_returned end) as back
      from public.dispatch_lines dl where dl.dispatch_id = d.id
    loop
      ret_qty := coalesce(r.back, 0);
      continue when ret_qty <= 0;
      if ret_qty > r.qty - r.qty_returned then
        raise exception 'Cannot return more than was dispatched on a line';
      end if;
      mid := public._stock_post(r.lot_id, ret_qty, 'customer_return', 'dispatch', d.id::text, d.dispatch_no, p_remarks, 0, true);
      if not p_restock then
        perform public._stock_post(r.lot_id, -ret_qty, 'damage', 'dispatch', d.id::text, d.dispatch_no, 'Returned goods not fit for sale: ' || coalesce(p_remarks, ''), 0, true);
      end if;
      update public.dispatch_lines set qty_returned = qty_returned + ret_qty where id = r.id;
      if r.batch_id is not null then
        perform public._batch_refresh_dispatch(r.batch_id);
      end if;
    end loop;
  end if;

  update public.dispatches set status = p_status, remarks = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks),
    delivered_at = case when p_status in ('delivered', 'partially_delivered') then now() else delivered_at end,
    cash_collected = coalesce(p_cash_collected, cash_collected), collection_method = coalesce(p_collection_method, collection_method)
  where id = d.id;

  select count(*) into undelivered from public.dispatches where order_id = o.id and status in ('dispatched', 'out_for_delivery');
  select bool_and(dispatched >= ordered) into all_dispatched from public.v_order_line_fulfilment where order_id = o.id;
  perform public._order_set_fulfilment(o.id,
    case
      when p_status = 'out_for_delivery' then 'out_for_delivery'
      when p_status = 'delivery_failed' then 'delivery_failed'
      when p_status = 'returned' then 'returned'
      when p_status = 'delivered' and undelivered = 0 and all_dispatched then 'delivered'
      else 'partially_delivered'
    end, p_remarks, d.id);
  perform public.write_audit('dispatch.' || p_status, 'dispatches', d.id::text,
    jsonb_build_object('cash_collected', p_cash_collected, 'restock', p_restock, 'returns', p_returns), p_remarks);
end;
$$;

-- An order entered by staff (phone or walk-in). Prices come from the item master unless an approver overrides.
create function public.disp_create_staff_order(p_customer jsonb, p_lines jsonb, p_payment_method text, p_delivery_fee integer default 0,
  p_notes text default null, p_delivery_date date default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  oid uuid := gen_random_uuid();
  e jsonb;
  it public.items;
  price numeric;
  v_subtotal integer := 0;
  v_phone text := right(regexp_replace(coalesce(p_customer ->> 'phone', ''), '\D', '', 'g'), 10);
begin
  perform public.require_permission('dispatch', 'create');
  perform public._claim_request_key(p_key, 'disp_create_staff_order');
  if length(v_phone) <> 10 or coalesce(trim(p_customer ->> 'name'), '') = '' or coalesce(trim(p_customer ->> 'address'), '') = '' then
    raise exception 'Enter the customer''s name, 10-digit mobile number and address';
  end if;
  if p_payment_method not in ('online', 'cod') then
    raise exception 'Payment method must be online or cod';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then
    raise exception 'Add at least one product';
  end if;
  insert into public.orders (id, customer_name, phone, email, address, city, pincode, notes, payment_method, payment_status, status,
    subtotal, delivery_fee, discount, total, source, delivery_date, created_by)
  values (oid, trim(p_customer ->> 'name'), v_phone, lower(nullif(trim(coalesce(p_customer ->> 'email', '')), '')), trim(p_customer ->> 'address'),
    coalesce(nullif(trim(coalesce(p_customer ->> 'city', '')), ''), 'Prayagraj'), coalesce(nullif(trim(coalesce(p_customer ->> 'pincode', '')), ''), '211001'),
    nullif(trim(coalesce(p_notes, '')), ''), p_payment_method, case when p_payment_method = 'cod' then 'cod' else 'pending' end,
    (case when p_payment_method = 'cod' then 'received' else 'pending_payment' end)::public.order_status, 0, coalesce(p_delivery_fee, 0), 0, 0, 'staff', p_delivery_date, auth.uid());
  for e in select * from jsonb_array_elements(p_lines) loop
    select * into it from public.items where id = (e ->> 'item_id')::uuid and is_active and item_type in ('finished_good', 'purchased_good');
    if not found then
      raise exception 'Choose active sellable products';
    end if;
    price := it.sale_price;
    if (e ->> 'unit_price') is not null and (e ->> 'unit_price')::numeric <> it.sale_price then
      perform public.require_permission('sales', 'approve');
      price := (e ->> 'unit_price')::numeric;
    end if;
    if price is null then
      raise exception '% has no price', it.name;
    end if;
    if (e ->> 'qty')::int is null or (e ->> 'qty')::int <= 0 then
      raise exception 'Quantities must be whole numbers above zero';
    end if;
    insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity, hsn, gst_rate, item_id)
    values (oid, coalesce(it.storefront_slug, lower(it.code)), it.name, coalesce(it.storefront_pack, it.unit), round(price)::int, (e ->> 'qty')::int,
      it.hsn, it.gst_rate, it.id);
    v_subtotal := v_subtotal + round(price)::int * (e ->> 'qty')::int;
  end loop;
  update public.orders set subtotal = v_subtotal, total = v_subtotal + coalesce(p_delivery_fee, 0) where id = oid;
  if p_payment_method = 'cod' then
    perform public.assign_invoice_number(oid);
  end if;
  insert into public.order_events (order_id, status, note) values (oid, 'confirmed', 'Entered by staff');
  perform public.write_audit('order.staff_create', 'orders', oid::text, jsonb_build_object('lines', p_lines, 'payment', p_payment_method));
  return oid;
end;
$$;

-- Cancelling an order frees any stock still reserved for it.
create function public._order_release_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    for a in select * from public.order_allocations where order_id = new.id and qty - qty_dispatched - qty_released > 0 for update loop
      update public.stock_lots set qty_reserved = qty_reserved - (a.qty - a.qty_dispatched - a.qty_released) where id = a.lot_id;
      update public.order_allocations set qty_released = qty - qty_dispatched where id = a.id;
    end loop;
  end if;
  return new;
end;
$$;
create trigger orders_release_on_cancel after update of status on public.orders
  for each row execute function public._order_release_on_cancel();

-- Orders waiting to go out (the daily dispatch sheet).
create view public.v_dispatch_queue with (security_invoker = true) as
select
  o.id, o.order_number, o.created_at, o.source, o.customer_name, o.phone, o.address, o.city, o.pincode, o.notes, o.total,
  o.payment_method, o.payment_status, o.fulfilment_status, o.on_hold, o.hold_reason, o.milk_subscriber, o.delivery_date, o.delivery_slot,
  coalesce(o.delivery_date, (o.created_at at time zone 'Asia/Kolkata')::date) as due_date,
  (select coalesce(sum(f.ordered), 0) from public.v_order_line_fulfilment f where f.order_id = o.id) as units_ordered,
  (select coalesce(sum(f.reserved), 0) from public.v_order_line_fulfilment f where f.order_id = o.id) as units_reserved,
  (select coalesce(sum(f.dispatched), 0) from public.v_order_line_fulfilment f where f.order_id = o.id) as units_dispatched
from public.orders o
where o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched', 'delivery_failed');

-- Access rules ----------------------------------------------------------------------
alter table public.order_allocations enable row level security;
alter table public.dispatches enable row level security;
alter table public.dispatch_lines enable row level security;
alter table public.order_events enable row level security;
revoke insert, update, delete, truncate on public.order_allocations, public.dispatches, public.dispatch_lines, public.order_events from anon, authenticated;
-- Orders are written only by the server and by these functions, never directly by a signed-in user.
revoke insert, update, delete, truncate on public.orders, public.order_items from anon, authenticated;
revoke all on public.order_allocations, public.dispatches, public.dispatch_lines, public.order_events from anon;

create policy "Staff read orders" on public.orders for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('sales', 'view')));
create policy "Staff read order lines" on public.order_items for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('sales', 'view')));
create policy "Dispatch reads allocations" on public.order_allocations for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('production', 'view')));
create policy "Dispatch reads dispatches" on public.dispatches for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('sales', 'view')) or (select public.has_permission('production', 'view')));
create policy "Customers see their own dispatches" on public.dispatches for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy "Dispatch reads dispatch lines" on public.dispatch_lines for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('production', 'view')) or (select public.has_permission('sales', 'view')));
create policy "Staff read order events" on public.order_events for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('sales', 'view')));
create policy "Customers see their own order events" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

revoke execute on function public._order_item_link_sku() from public, anon, authenticated;
revoke execute on function public._order_status_sync() from public, anon, authenticated;
revoke execute on function public._order_lock(uuid) from public, anon, authenticated;
revoke execute on function public._order_set_fulfilment(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._order_release_on_cancel() from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'disp_allocate_order(uuid)', 'disp_release_allocation(uuid, text)', 'disp_set_stage(uuid, text, text)', 'disp_hold_order(uuid, boolean, text)',
    'disp_dispatch_order(uuid, jsonb, text, timestamptz, text, text)',
    'disp_update_delivery(uuid, text, text, numeric, text, jsonb, boolean)',
    'disp_create_staff_order(jsonb, jsonb, text, integer, text, date, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant select on public.v_order_line_fulfilment, public.v_dispatch_queue to authenticated;
revoke all on public.v_order_line_fulfilment, public.v_dispatch_queue from anon;

-- ===== 20261010130000_ops_finance =====
-- Finance: double-entry ledger, purchases, payments, sales accounting, expenses, payroll, cash & bank, reports.
--
-- Every business document posts its own journal entry, once: each entry carries a unique posting key
-- (e.g. 'stock:123', 'sale:<order>', 'receipt:dispatch:<id>'), so a retried request or a repeated
-- payment callback can never post twice. Entries must balance and can never be edited or deleted;
-- corrections are reversing entries linked to the original.
--
-- What posts automatically:
--   stock movements         → inventory / work-in-progress / cost of goods sold / wastage
--   milk collections        → raw milk inventory against the farmer's payable
--   purchase invoices       → inventory or expense + GST input against the supplier's payable
--   orders (when invoiced)  → receivable against sales + GST output; online payments → receipt
--   cash collected on delivery → receipt
--   batch release / write-off → overhead absorption, rounding, production loss

-- Chart of accounts --------------------------------------------------------------------
create table public.ledger_accounts (
  code text primary key check (code ~ '^[0-9]{4}$'),
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  subtype text,
  is_system boolean not null default false,
  is_active boolean not null default true
);

insert into public.ledger_accounts (code, name, type, subtype, is_system) values
  ('1000', 'Cash in hand', 'asset', 'cash', true),
  ('1010', 'Bank — current account', 'asset', 'bank', true),
  ('1020', 'Razorpay / payment gateway clearing', 'asset', 'bank', true),
  ('1100', 'Accounts receivable — customers', 'asset', 'receivable', true),
  ('1150', 'Employee advances', 'asset', 'receivable', true),
  ('1200', 'Inventory — raw materials', 'asset', 'inventory', true),
  ('1210', 'Inventory — packaging materials', 'asset', 'inventory', true),
  ('1220', 'Inventory — finished goods', 'asset', 'inventory', true),
  ('1230', 'Inventory — purchased goods for resale', 'asset', 'inventory', true),
  ('1240', 'Inventory — consumables', 'asset', 'inventory', true),
  ('1250', 'Work in progress', 'asset', 'inventory', true),
  ('1300', 'GST input — CGST', 'asset', 'tax', true),
  ('1301', 'GST input — SGST', 'asset', 'tax', true),
  ('1302', 'GST input — IGST', 'asset', 'tax', true),
  ('1400', 'Machinery and equipment', 'asset', 'fixed_asset', true),
  ('2000', 'Accounts payable — suppliers', 'liability', 'payable', true),
  ('2050', 'Other payables (expenses)', 'liability', 'payable', true),
  ('2100', 'GST output — CGST', 'liability', 'tax', true),
  ('2101', 'GST output — SGST', 'liability', 'tax', true),
  ('2102', 'GST output — IGST', 'liability', 'tax', true),
  ('2200', 'Salaries payable', 'liability', 'payable', true),
  ('2210', 'Payroll deductions payable', 'liability', 'payable', true),
  ('2300', 'Customer bottle deposits', 'liability', 'deposit', true),
  ('2310', 'Customer advances / prepaid balance', 'liability', 'deposit', true),
  ('3000', 'Owner''s capital', 'equity', null, true),
  ('3100', 'Opening balance equity', 'equity', null, true),
  ('4000', 'Sales — Mithai Wallah products', 'income', 'sales', true),
  ('4010', 'Sales — purchased goods', 'income', 'sales', true),
  ('4095', 'Sales returns and credit notes', 'income', 'sales', true),
  ('4100', 'Other income', 'income', 'other', true),
  ('5000', 'Cost of goods sold', 'expense', 'cogs', true),
  ('5100', 'Production loss and wastage', 'expense', 'cogs', true),
  ('5110', 'Inventory count differences', 'expense', 'cogs', true),
  ('5200', 'Production overhead absorbed', 'expense', 'cogs', true),
  ('6000', 'Electricity', 'expense', 'operating', true),
  ('6010', 'Fuel', 'expense', 'operating', true),
  ('6020', 'Boiler expenses', 'expense', 'operating', true),
  ('6030', 'Transportation and freight', 'expense', 'operating', true),
  ('6040', 'Repairs and maintenance', 'expense', 'operating', true),
  ('6050', 'Rent', 'expense', 'operating', true),
  ('6060', 'Telephone and internet', 'expense', 'operating', true),
  ('6070', 'Office expenses', 'expense', 'operating', true),
  ('6080', 'Marketing', 'expense', 'operating', true),
  ('6090', 'Packaging (not stocked)', 'expense', 'operating', true),
  ('6100', 'Employee welfare and expenses', 'expense', 'operating', true),
  ('6200', 'Salaries and wages', 'expense', 'operating', true),
  ('6900', 'Other operating expenses', 'expense', 'operating', true),
  ('6950', 'Bank charges and gateway fees', 'expense', 'operating', true),
  ('6990', 'Rounding and cash differences', 'expense', 'operating', true);

-- Journal ----------------------------------------------------------------------------
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  entry_date date not null,
  source_type text not null,
  source_id text,
  memo text,
  posting_key text not null unique,
  reversal_of uuid unique references public.journal_entries,
  reason text,
  posted_by uuid default auth.uid(),
  posted_at timestamptz not null default now()
);
create index journal_entries_date_idx on public.journal_entries (entry_date);
create index journal_entries_source_idx on public.journal_entries (source_type, source_id);

create table public.journal_lines (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.journal_entries,
  account_code text not null references public.ledger_accounts,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  party_type text check (party_type in ('customer', 'supplier', 'employee', 'batch', 'other')),
  party_id text,
  memo text,
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0)
);
create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account_code);
create index journal_lines_party_idx on public.journal_lines (party_type, party_id);

create trigger journal_entries_append_only before update or delete on public.journal_entries
  for each row execute function public.reject_change();
create trigger journal_lines_append_only before update or delete on public.journal_lines
  for each row execute function public.reject_change();
create trigger journal_entries_no_truncate before truncate on public.journal_entries
  for each statement execute function public.reject_change();
create trigger journal_lines_no_truncate before truncate on public.journal_lines
  for each statement execute function public.reject_change();

-- Every entry must balance (checked when the transaction commits).
create function public._journal_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  diff numeric;
begin
  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) into diff from public.journal_lines where entry_id = new.entry_id;
  if diff <> 0 then
    raise exception 'Journal entry does not balance (difference %)', diff using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger journal_lines_balanced after insert on public.journal_lines
  deferrable initially deferred for each row execute function public._journal_balanced();

-- Post an entry. Lines: [{account, debit, credit, party_type, party_id, memo}]. Returns the existing
-- entry if this posting key was already used. Zero lines are dropped; amounts are rounded to paise.
create function public._post_journal(p_date date, p_source_type text, p_source_id text, p_memo text, p_key text, p_lines jsonb,
  p_reversal_of uuid default null, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid;
  e jsonb;
  dr numeric := 0;
  cr numeric := 0;
  d numeric;
  c numeric;
begin
  select id into eid from public.journal_entries where posting_key = p_key;
  if found then
    return eid;
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    dr := dr + round(coalesce((e ->> 'debit')::numeric, 0), 2);
    cr := cr + round(coalesce((e ->> 'credit')::numeric, 0), 2);
  end loop;
  if dr = 0 and cr = 0 then
    return null;
  end if;
  if dr <> cr then
    raise exception 'Journal entry does not balance: debits % vs credits %', dr, cr using errcode = '23514';
  end if;
  insert into public.journal_entries (entry_no, entry_date, source_type, source_id, memo, posting_key, reversal_of, reason)
  values (public.next_doc_number('journal', 'JV', public.financial_year(p_date), 6), p_date, p_source_type, p_source_id, p_memo, p_key, p_reversal_of, p_reason)
  returning id into eid;
  for e in select * from jsonb_array_elements(p_lines) loop
    d := round(coalesce((e ->> 'debit')::numeric, 0), 2);
    c := round(coalesce((e ->> 'credit')::numeric, 0), 2);
    -- A negative amount on one side is posted as a positive amount on the other.
    if d < 0 then c := c - d; d := 0; end if;
    if c < 0 then d := d - c; c := 0; end if;
    if d - c <> 0 then
      insert into public.journal_lines (entry_id, account_code, debit, credit, party_type, party_id, memo)
      values (eid, e ->> 'account', greatest(d - c, 0), greatest(c - d, 0), e ->> 'party_type', e ->> 'party_id', e ->> 'memo');
    end if;
  end loop;
  return eid;
end;
$$;

-- Builds a two-line entry in one call.
create function public._jl(p_account text, p_amount numeric, p_party_type text default null, p_party_id text default null, p_memo text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('account', p_account,
    'debit', case when p_amount > 0 then p_amount else 0 end,
    'credit', case when p_amount < 0 then -p_amount else 0 end,
    'party_type', p_party_type, 'party_id', p_party_id, 'memo', p_memo)
$$;

create function public._inventory_account(p_item_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case item_type
    when 'raw_material' then '1200' when 'packaging' then '1210' when 'finished_good' then '1220'
    when 'purchased_good' then '1230' else '1240' end
  from public.items where id = p_item_id
$$;

create function public._ist_date(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Kolkata')::date
$$;

-- Stock movements → ledger ---------------------------------------------------------------
create function public._gl_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv text := public._inventory_account(new.item_id);
  v numeric := new.value;          -- signed: + into stock, − out of stock
  orig public.stock_movements;
  counter text;
  ptype text;
  pid text;
  t text := new.movement_type;
begin
  if v = 0 then
    return null;
  end if;
  if t = 'reversal' then
    if new.reversal_of is null then
      return null;                 -- reversals of documents (collections, purchases) post through the document
    end if;
    select * into orig from public.stock_movements where id = new.reversal_of;
    t := orig.movement_type;
  end if;
  if t in ('purchase_receipt', 'procurement_receipt', 'supplier_return') then
    return null;                   -- posted by the purchase / collection document itself
  end if;

  counter := case t
    when 'opening' then '3100'
    when 'issue_to_production' then '1250'
    when 'return_from_production' then '1250'
    when 'packaging_consumption' then '1250'
    when 'production_receipt' then '1250'
    when 'dispatch' then '5000'
    when 'customer_return' then '5000'
    when 'damage' then '5100'
    when 'expiry' then '5100'
    when 'adjustment_in' then '5110'
    when 'adjustment_out' then '5110'
  end;
  if counter is null then
    return null;
  end if;
  if counter = '1250' then
    ptype := 'batch';
    pid := case new.doc_type
      when 'batch' then new.doc_id
      when 'batch_packaging' then (select batch_id::text from public.batch_packaging where id::text = new.doc_id)
    end;
  end if;
  perform public._post_journal(public._ist_date(new.occurred_at), 'stock_movement', new.id::text,
    initcap(replace(new.movement_type, '_', ' ')) || coalesce(' · ' || new.doc_no, ''), 'stock:' || new.id,
    jsonb_build_array(public._jl(inv, v), public._jl(counter, -v, ptype, pid)));
  return null;
end;
$$;
create trigger stock_movements_post_gl after insert on public.stock_movements
  for each row execute function public._gl_stock_movement();

-- Batches: overhead absorption on release; leftover work in progress to rounding or loss.
create function public._gl_batch_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  absorbed numeric := coalesce(new.labour_cost, 0) + coalesce(new.overhead_cost, 0);
  wip numeric;
begin
  if new.status = old.status or new.status not in ('released', 'cancelled') then
    return null;
  end if;
  if new.status = 'released' and absorbed > 0 then
    perform public._post_journal(public.ist_today(), 'batch', new.id::text, 'Labour and overhead absorbed · ' || new.batch_no,
      'batch-absorb:' || new.id, jsonb_build_array(public._jl('1250', absorbed, 'batch', new.id::text), public._jl('5200', -absorbed)));
  end if;
  select coalesce(sum(debit - credit), 0) into wip from public.journal_lines where account_code = '1250' and party_type = 'batch' and party_id = new.id::text;
  if wip <> 0 then
    perform public._post_journal(public.ist_today(), 'batch', new.id::text,
      case when new.status = 'released' then 'Batch cost rounding · ' else 'Batch written off · ' end || new.batch_no,
      'batch-close:' || new.id,
      jsonb_build_array(public._jl(case when new.status = 'released' then '6990' else '5100' end, wip), public._jl('1250', -wip, 'batch', new.id::text)));
  end if;
  return null;
end;
$$;
create trigger production_batches_post_gl after update of status on public.production_batches
  for each row execute function public._gl_batch_status();

-- Milk collections → farmer payable ---------------------------------------------------------
alter table public.milk_collections add column if not exists amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partly_paid', 'paid'));

create function public._gl_milk_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.amount > 0 then
    perform public._post_journal(new.collected_on, 'milk_collection', new.id::text, 'Milk collection ' || new.collection_no,
      'milk:' || new.id, jsonb_build_array(public._jl('1200', new.amount), public._jl('2000', -new.amount, 'supplier', new.supplier_id::text)));
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' and new.amount > 0 then
    perform public._post_journal(public.ist_today(), 'milk_collection', new.id::text, 'Cancelled milk collection ' || new.collection_no,
      'milk-cancel:' || new.id, jsonb_build_array(public._jl('2000', new.amount, 'supplier', new.supplier_id::text), public._jl('1200', -new.amount)),
      (select id from public.journal_entries where posting_key = 'milk:' || new.id), new.cancel_reason);
  end if;
  return null;
end;
$$;
create trigger milk_collections_post_gl after insert or update of status on public.milk_collections
  for each row execute function public._gl_milk_collection();

-- Purchases --------------------------------------------------------------------------------
create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  purchase_no text not null unique,
  supplier_id uuid not null references public.suppliers,
  invoice_no text not null,
  invoice_date date not null,
  due_date date,
  is_interstate boolean not null default false,
  taxable_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  freight numeric(14, 2) not null default 0 check (freight >= 0),
  other_charges numeric(14, 2) not null default 0 check (other_charges >= 0),
  round_off numeric(8, 2) not null default 0 check (abs(round_off) < 1),
  total numeric(14, 2) not null,
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  document_url text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  unique (supplier_id, invoice_no)
);
create index purchase_invoices_date_idx on public.purchase_invoices (invoice_date desc);

create table public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices on delete cascade,
  line_no integer not null,
  item_id uuid references public.items,
  account_code text references public.ledger_accounts,
  description text,
  qty numeric(14, 3) not null check (qty > 0),
  rate numeric(14, 4) not null check (rate >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  gst_rate numeric(5, 2) not null default 0 check (gst_rate between 0 and 40),
  taxable numeric(14, 2) not null,
  tax numeric(14, 2) not null,
  landed_cost numeric(14, 2),
  lot_id uuid references public.stock_lots,
  check ((item_id is null) <> (account_code is null))
);
create index purchase_invoice_lines_invoice_idx on public.purchase_invoice_lines (invoice_id);

-- p_header: {supplier_id, invoice_no, invoice_date, due_date, is_interstate, freight, other_charges, round_off, notes, document_url}
-- p_lines:  [{item_id | account_code, description, qty, rate, discount, gst_rate, expiry_date, supplier_lot}]
create function public.fin_post_purchase_invoice(p_header jsonb, p_lines jsonb, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := gen_random_uuid();
  sup public.suppliers;
  e jsonb;
  n integer := 0;
  v_taxable numeric;
  v_tax numeric;
  v_taxable_total numeric := 0;
  v_stock_taxable numeric := 0;
  v_tax_total numeric := 0;
  v_charges numeric := coalesce((p_header ->> 'freight')::numeric, 0) + coalesce((p_header ->> 'other_charges')::numeric, 0);
  v_round_off numeric := coalesce((p_header ->> 'round_off')::numeric, 0);
  v_registered boolean := coalesce((public.setting('tax.gst_registered') #>> '{}')::boolean, true);
  v_interstate boolean := coalesce((p_header ->> 'is_interstate')::boolean, false);
  v_inv_date date := (p_header ->> 'invoice_date')::date;
  l record;
  v_share numeric;
  v_landed numeric;
  lot uuid;
  jl jsonb := '[]';
  v_total numeric;
  pno text;
begin
  perform public.require_permission('purchases', 'create');
  perform public._claim_request_key(p_key, 'fin_post_purchase_invoice');
  select * into sup from public.suppliers where id = (p_header ->> 'supplier_id')::uuid and is_active;
  if not found then
    raise exception 'Choose an active supplier';
  end if;
  if coalesce(trim(p_header ->> 'invoice_no'), '') = '' or v_inv_date is null then
    raise exception 'Enter the supplier''s invoice number and date';
  end if;
  if v_inv_date > public.ist_today() then
    raise exception 'Invoice date cannot be in the future';
  end if;
  if exists (select 1 from public.purchase_invoices where supplier_id = sup.id and invoice_no = trim(p_header ->> 'invoice_no')) then
    raise exception 'Invoice % from % is already recorded', trim(p_header ->> 'invoice_no'), sup.name using errcode = '23505';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then
    raise exception 'Add at least one line';
  end if;

  pno := public.next_doc_number('purchase', 'MW-PUR', public.financial_year(v_inv_date), 5);
  insert into public.purchase_invoices (id, purchase_no, supplier_id, invoice_no, invoice_date, due_date, is_interstate, freight, other_charges,
    round_off, total, notes, document_url)
  values (pid, pno, sup.id, trim(p_header ->> 'invoice_no'), v_inv_date,
    coalesce((p_header ->> 'due_date')::date, v_inv_date + sup.payment_terms_days), v_interstate,
    coalesce((p_header ->> 'freight')::numeric, 0), coalesce((p_header ->> 'other_charges')::numeric, 0), v_round_off, 0,
    nullif(trim(coalesce(p_header ->> 'notes', '')), ''), nullif(trim(coalesce(p_header ->> 'document_url', '')), ''));

  for e in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    if (e ->> 'item_id') is not null then
      if not exists (select 1 from public.items where id = (e ->> 'item_id')::uuid and is_active and item_type <> 'finished_good') then
        raise exception 'Line %: choose an active stock item you buy (finished goods are made, not bought)', n;
      end if;
    elsif not exists (select 1 from public.ledger_accounts where code = e ->> 'account_code' and is_active
                        and ((type = 'expense' and subtype is distinct from 'cogs') or (type = 'asset' and subtype = 'fixed_asset'))) then
      -- Stock, cost of goods sold, tax and money accounts move only through their own documents.
      raise exception 'Line %: choose a stock item or an expense / fixed-asset account', n;
    end if;
    if coalesce((e ->> 'qty')::numeric, 0) <= 0 or coalesce((e ->> 'rate')::numeric, -1) < 0 then
      raise exception 'Line %: enter quantity and rate', n;
    end if;
    v_taxable := round((e ->> 'qty')::numeric * (e ->> 'rate')::numeric - coalesce((e ->> 'discount')::numeric, 0), 2);
    if v_taxable < 0 then
      raise exception 'Line %: discount is larger than the line value', n;
    end if;
    v_tax := round(v_taxable * coalesce((e ->> 'gst_rate')::numeric, 0) / 100, 2);
    insert into public.purchase_invoice_lines (invoice_id, line_no, item_id, account_code, description, qty, rate, discount, gst_rate, taxable, tax)
    values (pid, n, (e ->> 'item_id')::uuid, case when (e ->> 'item_id') is null then e ->> 'account_code' end, e ->> 'description',
      (e ->> 'qty')::numeric, (e ->> 'rate')::numeric, coalesce((e ->> 'discount')::numeric, 0), coalesce((e ->> 'gst_rate')::numeric, 0), v_taxable, v_tax);
    v_taxable_total := v_taxable_total + v_taxable;
    v_tax_total := v_tax_total + v_tax;
    if (e ->> 'item_id') is not null then
      v_stock_taxable := v_stock_taxable + v_taxable;
    end if;
  end loop;

  -- Freight and other charges are part of the landed cost of stock lines (or a freight expense if none).
  for l in select pl.*, (select e2 from jsonb_array_elements(p_lines) with ordinality as x(e2, i) where x.i = pl.line_no) as src
           from public.purchase_invoice_lines pl where pl.invoice_id = pid order by pl.line_no loop
    if l.item_id is not null then
      v_share := case when v_stock_taxable > 0 then round(v_charges * l.taxable / v_stock_taxable, 2) else 0 end;
      v_landed := l.taxable + v_share + case when v_registered then 0 else l.tax end;
      lot := public._new_lot(l.item_id, l.qty, round(v_landed / l.qty, 4), 'purchase', pid::text, null, sup.id,
        (l.src ->> 'expiry_date')::date, v_inv_date, 'available', l.src ->> 'supplier_lot');
      perform public._stock_post(lot, l.qty, 'purchase_receipt', 'purchase_invoice', pid::text, pno);
      update public.purchase_invoice_lines set lot_id = lot, landed_cost = v_landed where id = l.id;
      jl := jl || public._jl(public._inventory_account(l.item_id), v_landed, null, null, 'Line ' || l.line_no);
    else
      jl := jl || public._jl(l.account_code, l.taxable + case when v_registered then 0 else l.tax end, null, null, coalesce(l.description, 'Line ' || l.line_no));
    end if;
  end loop;
  -- Rounding of the freight split goes to the last stock line's account via the rounding account.
  if v_stock_taxable = 0 and v_charges > 0 then
    jl := jl || public._jl('6030', v_charges, null, null, 'Freight and charges');
  elsif v_stock_taxable > 0 then
    jl := jl || public._jl('6990', v_charges - (select coalesce(sum(round(v_charges * pil.taxable / v_stock_taxable, 2)), 0) from public.purchase_invoice_lines pil where pil.invoice_id = pid and pil.item_id is not null));
  end if;
  if v_registered and v_tax_total > 0 then
    if v_interstate then
      jl := jl || public._jl('1302', v_tax_total);
    else
      jl := jl || public._jl('1300', round(v_tax_total / 2, 2)) || public._jl('1301', v_tax_total - round(v_tax_total / 2, 2));
    end if;
  end if;
  jl := jl || public._jl('6990', v_round_off);
  v_total := v_taxable_total + v_tax_total + v_charges + v_round_off;
  jl := jl || public._jl('2000', -v_total, 'supplier', sup.id::text, 'Invoice ' || trim(p_header ->> 'invoice_no'));
  update public.purchase_invoices set taxable_total = v_taxable_total, tax_total = v_tax_total, total = v_total where id = pid;
  perform public._post_journal(v_inv_date, 'purchase_invoice', pid::text, 'Purchase ' || pno || ' · ' || sup.name || ' inv ' || trim(p_header ->> 'invoice_no'),
    'purchase:' || pid, jl);
  perform public.write_audit('purchase.post', 'purchase_invoices', pid::text, jsonb_build_object('purchase_no', pno, 'total', v_total));
  return pid;
end;
$$;

create function public.fin_cancel_purchase_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pi public.purchase_invoices;
  l record;
  orig uuid;
  jl jsonb := '[]';
  r record;
begin
  perform public.require_permission('purchases', 'approve');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into pi from public.purchase_invoices where id = p_invoice_id for update;
  if not found or pi.status = 'cancelled' then
    raise exception 'Invoice not found or already cancelled';
  end if;
  if pi.amount_paid > 0 then
    raise exception 'This invoice has payments against it; record a supplier return / debit note instead';
  end if;
  for l in select pl.*, sl.qty_on_hand, sl.qty_received from public.purchase_invoice_lines pl left join public.stock_lots sl on sl.id = pl.lot_id
           where pl.invoice_id = pi.id and pl.lot_id is not null loop
    if l.qty_on_hand <> l.qty_received then
      raise exception 'Stock from line % has already been used; record a supplier return instead', l.line_no;
    end if;
    perform public._stock_post(l.lot_id, -l.qty_on_hand, 'reversal', 'purchase_invoice', pi.id::text, pi.purchase_no, p_reason, 0, true);
  end loop;
  select id into orig from public.journal_entries where posting_key = 'purchase:' || pi.id;
  for r in select * from public.journal_lines where entry_id = orig loop
    jl := jl || jsonb_build_object('account', r.account_code, 'debit', r.credit, 'credit', r.debit, 'party_type', r.party_type, 'party_id', r.party_id);
  end loop;
  perform public._post_journal(public.ist_today(), 'purchase_invoice', pi.id::text, 'Cancelled purchase ' || pi.purchase_no, 'purchase-cancel:' || pi.id, jl, orig, p_reason);
  update public.purchase_invoices set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason where id = pi.id;
  perform public.write_audit('purchase.cancel', 'purchase_invoices', pi.id::text, null, p_reason);
end;
$$;

-- Return purchased stock to the supplier (debit note).
create function public.fin_supplier_return(p_invoice_id uuid, p_lines jsonb, p_reason text, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pi public.purchase_invoices;
  e jsonb;
  pl public.purchase_invoice_lines;
  lot public.stock_lots;
  qty numeric;
  value numeric;
  tax numeric;
  total numeric := 0;
  tax_total numeric := 0;
  jl jsonb := '[]';
  rid uuid := gen_random_uuid();
  registered boolean := coalesce((public.setting('tax.gst_registered') #>> '{}')::boolean, true);
begin
  perform public.require_permission('purchases', 'edit');
  perform public._claim_request_key(p_key, 'fin_supplier_return');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into pi from public.purchase_invoices where id = p_invoice_id and status = 'posted';
  if not found then
    raise exception 'Purchase invoice not found';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select * into pl from public.purchase_invoice_lines where id = (e ->> 'line_id')::uuid and invoice_id = pi.id and lot_id is not null;
    if not found then
      raise exception 'Choose stock lines of this invoice';
    end if;
    qty := (e ->> 'qty')::numeric;
    select * into lot from public.stock_lots where id = pl.lot_id;
    perform public._stock_post(pl.lot_id, -qty, 'supplier_return', 'supplier_return', rid::text, pi.purchase_no, p_reason, 0, true);
    value := round(qty * lot.unit_cost, 2);
    tax := case when registered then round(qty * pl.rate * pl.gst_rate / 100, 2) else 0 end;
    jl := jl || public._jl(public._inventory_account(pl.item_id), -value);
    total := total + value + tax;
    tax_total := tax_total + tax;
  end loop;
  if total = 0 then
    raise exception 'Nothing to return';
  end if;
  if tax_total > 0 then
    if pi.is_interstate then
      jl := jl || public._jl('1302', -tax_total);
    else
      jl := jl || public._jl('1300', -round(tax_total / 2, 2)) || public._jl('1301', -(tax_total - round(tax_total / 2, 2)));
    end if;
  end if;
  jl := jl || public._jl('2000', total, 'supplier', pi.supplier_id::text, 'Debit note on ' || pi.invoice_no);
  perform public._post_journal(public.ist_today(), 'supplier_return', rid::text, 'Supplier return on ' || pi.purchase_no, 'supplier-return:' || rid, jl, null, p_reason);
  perform public.write_audit('purchase.return', 'purchase_invoices', pi.id::text, jsonb_build_object('lines', p_lines, 'value', total), p_reason);
  return rid;
end;
$$;

-- Payments in and out -------------------------------------------------------------------
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique references public.ledger_accounts,
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'upi', 'gateway')),
  bank_name text,
  account_masked text,
  is_active boolean not null default true
);
insert into public.bank_accounts (account_code, name, kind) values
  ('1000', 'Cash in hand', 'cash'), ('1010', 'Bank — current account', 'bank'), ('1020', 'Razorpay settlements', 'gateway');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  direction text not null check (direction in ('in', 'out')),
  party_type text not null check (party_type in ('customer', 'supplier', 'employee', 'other')),
  party_id text,
  party_name text,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null,
  method text not null check (method in ('cash', 'bank_transfer', 'upi', 'cheque', 'razorpay', 'card', 'other')),
  account_code text not null references public.ledger_accounts,
  reference text,
  notes text,
  entry_id uuid references public.journal_entries,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index payments_party_idx on public.payments (party_type, party_id);
create index payments_date_idx on public.payments (paid_on desc);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments on delete cascade,
  doc_type text not null check (doc_type in ('purchase_invoice', 'milk_collection', 'order', 'expense')),
  doc_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0)
);
create index payment_allocations_doc_idx on public.payment_allocations (doc_type, doc_id);

create trigger payments_append_only before update or delete on public.payments for each row execute function public.reject_change();
create trigger payment_allocations_append_only before update or delete on public.payment_allocations for each row execute function public.reject_change();

create function public._check_money_account(p_code text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.bank_accounts where account_code = p_code and is_active) then
    raise exception 'Choose a cash or bank account';
  end if;
end;
$$;

-- Pay a supplier. Allocations: [{doc_type: purchase_invoice | milk_collection, doc_id, amount}].
create function public.fin_pay_supplier(p_supplier_id uuid, p_amount numeric, p_paid_on date, p_method text, p_account_code text,
  p_reference text default null, p_allocations jsonb default '[]', p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sup public.suppliers;
  pid uuid := gen_random_uuid();
  no text;
  e jsonb;
  outstanding numeric;
  alloc_total numeric := 0;
  eid uuid;
begin
  perform public.require_permission('purchases', 'edit');
  perform public._claim_request_key(p_key, 'fin_pay_supplier');
  perform public._check_money_account(p_account_code);
  select * into sup from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Supplier not found';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount paid';
  end if;
  no := public.next_doc_number('payment', 'MW-PAY', public.financial_year(p_paid_on), 5);
  insert into public.payments (id, payment_no, direction, party_type, party_id, party_name, amount, paid_on, method, account_code, reference)
  values (pid, no, 'out', 'supplier', sup.id::text, sup.name, p_amount, p_paid_on, p_method, p_account_code, nullif(trim(coalesce(p_reference, '')), ''));
  for e in select * from jsonb_array_elements(coalesce(p_allocations, '[]')) loop
    if e ->> 'doc_type' = 'purchase_invoice' then
      select total - amount_paid into outstanding from public.purchase_invoices where id = (e ->> 'doc_id')::uuid and supplier_id = sup.id and status = 'posted' for update;
      if outstanding is null then raise exception 'Invoice not found for this supplier'; end if;
      if (e ->> 'amount')::numeric > outstanding then raise exception 'Allocation is more than the % outstanding on the invoice', outstanding; end if;
      update public.purchase_invoices set amount_paid = amount_paid + (e ->> 'amount')::numeric where id = (e ->> 'doc_id')::uuid;
    elsif e ->> 'doc_type' = 'milk_collection' then
      select amount - amount_paid into outstanding from public.milk_collections where id = (e ->> 'doc_id')::uuid and supplier_id = sup.id and status = 'posted' for update;
      if outstanding is null then raise exception 'Collection not found for this supplier'; end if;
      if (e ->> 'amount')::numeric > outstanding then raise exception 'Allocation is more than the % outstanding on the collection', outstanding; end if;
      update public.milk_collections set amount_paid = amount_paid + (e ->> 'amount')::numeric,
        payment_status = case when amount_paid + (e ->> 'amount')::numeric >= amount then 'paid' else 'partly_paid' end
      where id = (e ->> 'doc_id')::uuid;
    else
      raise exception 'Supplier payments can be allocated to purchase invoices or milk collections';
    end if;
    insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, e ->> 'doc_type', (e ->> 'doc_id')::uuid, (e ->> 'amount')::numeric);
    alloc_total := alloc_total + (e ->> 'amount')::numeric;
  end loop;
  if alloc_total > p_amount then
    raise exception 'Allocations (%) are more than the payment (%)', alloc_total, p_amount;
  end if;
  eid := public._post_journal(p_paid_on, 'payment', pid::text, 'Payment ' || no || ' to ' || sup.name, 'payment:' || pid,
    jsonb_build_array(public._jl('2000', p_amount, 'supplier', sup.id::text), public._jl(p_account_code, -p_amount)));
  perform public.write_audit('payment.supplier', 'payments', pid::text, jsonb_build_object('no', no, 'amount', p_amount, 'allocations', p_allocations));
  return pid;
end;
$$;

-- Sales accounting -------------------------------------------------------------------------
create function public._order_party(o public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(o.user_id::text, 'phone:' || o.phone)
$$;

-- GST split of an order, the same way the tax invoice shows it: delivery fee and discount are spread
-- over the lines by value, and every price includes GST.
create function public._order_tax(p_order_id uuid)
returns table (taxable_manufactured numeric, taxable_purchased numeric, tax numeric, total numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
  gross_total numeric;
  adj numeric;
  r record;
  net numeric;
  taxable numeric;
  allocated numeric := 0;
  n integer;
  i integer := 0;
begin
  select * into o from public.orders where id = p_order_id;
  select sum(unit_price * quantity), count(*) into gross_total, n from public.order_items where order_id = o.id;
  -- Delivery fee less discount, taken from the order total so the split always adds up to what the customer pays.
  adj := o.total - gross_total;
  taxable_manufactured := 0;
  taxable_purchased := 0;
  tax := 0;
  for r in
    select oi.unit_price * oi.quantity as gross, coalesce(oi.gst_rate, it.gst_rate, 0) as rate, coalesce(p.source, 'manufactured') as source
    from public.order_items oi left join public.items it on it.id = oi.item_id left join public.products p on p.id = it.product_id
    where oi.order_id = o.id order by oi.id
  loop
    i := i + 1;
    if i = n then
      net := r.gross + (adj - allocated);
    else
      net := r.gross + round(adj * r.gross / nullif(gross_total, 0), 2);
      allocated := allocated + round(adj * r.gross / nullif(gross_total, 0), 2);
    end if;
    taxable := round(net * 100 / (100 + r.rate), 2);
    tax := tax + (net - taxable);
    if r.source = 'purchased' then
      taxable_purchased := taxable_purchased + taxable;
    else
      taxable_manufactured := taxable_manufactured + taxable;
    end if;
  end loop;
  total := o.total;
  return next;
end;
$$;

create function public._post_order_sale(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  t record;
  party text;
  eid uuid;
  half numeric;
begin
  select * into o from public.orders where id = p_order_id;
  if o.invoice_number is null or o.status = 'cancelled' then
    return null;
  end if;
  select * into t from public._order_tax(o.id);
  party := public._order_party(o);
  half := round(t.tax / 2, 2);
  eid := public._post_journal(public._ist_date(coalesce(o.invoice_date, o.created_at)), 'order', o.id::text,
    'Sale ' || o.invoice_number || ' · order #' || o.order_number, 'sale:' || o.id,
    jsonb_build_array(
      public._jl('1100', o.total, 'customer', party),
      public._jl('4000', -t.taxable_manufactured),
      public._jl('4010', -t.taxable_purchased),
      public._jl('2100', -half),
      public._jl('2101', -(t.tax - half)),
      public._jl('6990', -(o.total - t.taxable_manufactured - t.taxable_purchased - t.tax))));
  if o.payment_status = 'paid' and o.payment_method = 'online' then
    perform public._post_journal(public._ist_date(coalesce(o.invoice_date, o.created_at)), 'order', o.id::text,
      'Online payment · order #' || o.order_number || coalesce(' · ' || o.razorpay_payment_id, ''), 'receipt:order:' || o.id,
      jsonb_build_array(public._jl('1020', o.total), public._jl('1100', -o.total, 'customer', party)));
  end if;
  return eid;
end;
$$;

-- Postings triggered by the storefront must never block a customer's order. If one fails, it is
-- logged here and finance re-posts it (fin_retry_postings) once the cause is fixed.
create table public.posting_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source_type text not null,
  source_id text not null,
  error text not null,
  resolved_at timestamptz
);

create function public._gl_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  orig uuid;
  jl jsonb := '[]';
  r record;
begin
  if new.invoice_number is not null and (old.invoice_number is null or (new.payment_status = 'paid' and old.payment_status is distinct from 'paid')) then
    begin
      perform public._post_order_sale(new.id);
    exception when others then
      insert into public.posting_errors (source_type, source_id, error) values ('order', new.id::text, sqlerrm);
    end;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select id into orig from public.journal_entries where posting_key = 'sale:' || new.id;
    if orig is not null then
      for r in select * from public.journal_lines where entry_id = orig loop
        jl := jl || jsonb_build_object('account', case when r.account_code in ('4000', '4010') then '4095' else r.account_code end,
          'debit', r.credit, 'credit', r.debit, 'party_type', r.party_type, 'party_id', r.party_id);
      end loop;
      perform public._post_journal(public.ist_today(), 'order', new.id::text, 'Cancelled order #' || new.order_number || ' (credit note)',
        'sale-cancel:' || new.id, jl, orig, 'Order cancelled');
    end if;
  end if;
  return null;
end;
$$;
create trigger orders_post_gl after update of invoice_number, payment_status, status on public.orders
  for each row execute function public._gl_order();

-- Cash collected on delivery.
create function public._gl_dispatch_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  amt numeric := coalesce(new.cash_collected, 0) - coalesce(old.cash_collected, 0);
begin
  if amt <= 0 then
    return null;
  end if;
  select * into o from public.orders where id = new.order_id;
  begin
    perform public._post_journal(public.ist_today(), 'dispatch', new.id::text, 'Collected on delivery ' || new.dispatch_no || ' · order #' || o.order_number,
      'receipt:dispatch:' || new.id || ':' || coalesce(old.cash_collected, 0),
      jsonb_build_array(public._jl(case new.collection_method when 'cash' then '1000' else '1010' end, amt),
        public._jl('1100', -amt, 'customer', public._order_party(o))));
  exception when others then
    insert into public.posting_errors (source_type, source_id, error) values ('dispatch_collection', new.id::text, sqlerrm);
  end;
  return null;
end;
$$;
create trigger dispatches_post_gl after update of cash_collected on public.dispatches
  for each row execute function public._gl_dispatch_collection();

-- Customer receipts outside delivery (bank transfer, UPI, settling a balance).
create function public.fin_receive_customer_payment(p_order_id uuid, p_amount numeric, p_paid_on date, p_method text, p_account_code text,
  p_reference text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  pid uuid := gen_random_uuid();
  no text;
  eid uuid;
begin
  perform public.require_permission('sales', 'create');
  perform public._claim_request_key(p_key, 'fin_receive_customer_payment');
  perform public._check_money_account(p_account_code);
  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount received';
  end if;
  no := public.next_doc_number('receipt', 'MW-RCT', public.financial_year(p_paid_on), 5);
  eid := public._post_journal(p_paid_on, 'payment', pid::text, 'Receipt ' || no || ' · order #' || o.order_number, 'payment:' || pid,
    jsonb_build_array(public._jl(p_account_code, p_amount), public._jl('1100', -p_amount, 'customer', public._order_party(o))));
  insert into public.payments (id, payment_no, direction, party_type, party_id, party_name, amount, paid_on, method, account_code, reference, entry_id)
  values (pid, no, 'in', 'customer', public._order_party(o), o.customer_name, p_amount, p_paid_on, p_method, p_account_code, p_reference, eid);
  insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, 'order', o.id, p_amount);
  perform public.write_audit('payment.customer', 'payments', pid::text, jsonb_build_object('order', o.order_number, 'amount', p_amount));
  return pid;
end;
$$;

-- Credit note (e.g. returned or short-delivered goods) and refund.
create function public.fin_credit_note(p_order_id uuid, p_amount numeric, p_reason text, p_refund_account text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  rate numeric;
  taxable numeric;
  tax numeric;
  half numeric;
  cid uuid := gen_random_uuid();
  no text;
  party text;
begin
  perform public.require_permission('sales', 'approve');
  perform public._claim_request_key(p_key, 'fin_credit_note');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into o from public.orders where id = p_order_id and invoice_number is not null;
  if not found then
    raise exception 'Credit notes are issued against an invoiced order';
  end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > o.total then
    raise exception 'Credit note amount must be between 0 and the order total';
  end if;
  select coalesce(max(coalesce(oi.gst_rate, 0)), 0) into rate from public.order_items oi where oi.order_id = o.id;
  taxable := round(p_amount * 100 / (100 + rate), 2);
  tax := p_amount - taxable;
  half := round(tax / 2, 2);
  party := public._order_party(o);
  no := public.next_doc_number('credit_note', 'MW-CN', public.financial_year(public.ist_today()), 5);
  perform public._post_journal(public.ist_today(), 'credit_note', cid::text, 'Credit note ' || no || ' · order #' || o.order_number, 'credit-note:' || cid,
    jsonb_build_array(public._jl('4095', taxable), public._jl('2100', half), public._jl('2101', tax - half), public._jl('1100', -p_amount, 'customer', party)),
    null, p_reason);
  if p_refund_account is not null then
    perform public._check_money_account(p_refund_account);
    perform public._post_journal(public.ist_today(), 'refund', cid::text, 'Refund for ' || no, 'refund:' || cid,
      jsonb_build_array(public._jl('1100', p_amount, 'customer', party), public._jl(p_refund_account, -p_amount)), null, p_reason);
  end if;
  perform public.write_audit('sales.credit_note', 'orders', o.id::text, jsonb_build_object('no', no, 'amount', p_amount, 'refunded', p_refund_account is not null), p_reason);
  return cid;
end;
$$;

-- Expenses -----------------------------------------------------------------------------------
create table public.expense_categories (
  code text primary key,
  label text not null,
  account_code text not null references public.ledger_accounts,
  is_active boolean not null default true
);
insert into public.expense_categories (code, label, account_code) values
  ('electricity', 'Electricity', '6000'), ('fuel', 'Fuel', '6010'), ('boiler', 'Boiler expenses', '6020'),
  ('transport', 'Transportation', '6030'), ('repairs', 'Repairs and maintenance', '6040'), ('rent', 'Rent', '6050'),
  ('telephone', 'Telephone and internet', '6060'), ('office', 'Office expenses', '6070'), ('marketing', 'Marketing', '6080'),
  ('packaging', 'Packaging (not stocked)', '6090'), ('employee', 'Employee expenses', '6100'), ('bank_charges', 'Bank and gateway charges', '6950'),
  ('other', 'Other operating expenses', '6900');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  expense_date date not null,
  category_code text not null references public.expense_categories,
  amount numeric(14, 2) not null check (amount > 0),
  gst_amount numeric(14, 2) not null default 0 check (gst_amount >= 0),
  payee text not null,
  description text,
  paid_from text references public.ledger_accounts,
  payment_method text check (payment_method in ('cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other')),
  reference text,
  document_url text,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'rejected', 'cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  decision_note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (gst_amount <= amount)
);
create index expenses_date_idx on public.expenses (expense_date desc);

create function public._post_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.expenses;
  acct text;
  registered boolean := coalesce((public.setting('tax.gst_registered') #>> '{}')::boolean, true);
  gst numeric;
begin
  select * into x from public.expenses where id = p_expense_id;
  select account_code into acct from public.expense_categories where code = x.category_code;
  gst := case when registered then x.gst_amount else 0 end;
  perform public._post_journal(x.expense_date, 'expense', x.id::text, 'Expense ' || x.expense_no || ' · ' || x.payee, 'expense:' || x.id,
    jsonb_build_array(public._jl(acct, x.amount - gst, null, null, x.description), public._jl('1300', round(gst / 2, 2)), public._jl('1301', gst - round(gst / 2, 2)),
      public._jl(coalesce(x.paid_from, '2050'), -x.amount, case when x.paid_from is null then 'other' end, case when x.paid_from is null then x.payee end)));
end;
$$;

create function public.fin_record_expense(p_date date, p_category text, p_amount numeric, p_payee text, p_description text default null,
  p_paid_from text default null, p_payment_method text default null, p_gst_amount numeric default 0, p_reference text default null,
  p_document_url text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  xid uuid := gen_random_uuid();
  no text;
  needs_approval boolean := p_amount > public.setting_num('finance.expense_approval_limit', 5000);
begin
  perform public.require_permission('expenses', 'create');
  perform public._claim_request_key(p_key, 'fin_record_expense');
  if p_date is null or p_date > public.ist_today() then
    raise exception 'Enter a valid expense date';
  end if;
  if coalesce(trim(p_payee), '') = '' then
    raise exception 'Enter who was paid';
  end if;
  if p_paid_from is not null then
    perform public._check_money_account(p_paid_from);
  end if;
  no := public.next_doc_number('expense', 'MW-EXP', public.financial_year(p_date), 5);
  insert into public.expenses (id, expense_no, expense_date, category_code, amount, gst_amount, payee, description, paid_from, payment_method, reference, document_url, status)
  values (xid, no, p_date, p_category, p_amount, coalesce(p_gst_amount, 0), trim(p_payee), nullif(trim(coalesce(p_description, '')), ''), p_paid_from,
    p_payment_method, nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_document_url, '')), ''),
    case when needs_approval then 'pending_approval' else 'approved' end);
  if not needs_approval then
    update public.expenses set approved_at = now(), decision_note = 'Within the approval limit' where id = xid;
    perform public._post_expense(xid);
  end if;
  perform public.write_audit('expense.record', 'expenses', xid::text, jsonb_build_object('no', no, 'amount', p_amount, 'needs_approval', needs_approval));
  return xid;
end;
$$;

create function public.fin_decide_expense(p_expense_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.expenses;
begin
  perform public.require_permission('expenses', 'approve');
  select * into x from public.expenses where id = p_expense_id for update;
  if not found or x.status <> 'pending_approval' then
    raise exception 'This expense is not waiting for approval';
  end if;
  if x.created_by = auth.uid() and not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'Someone else must approve an expense you recorded';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for rejecting';
  end if;
  update public.expenses set status = case when p_approve then 'approved' else 'rejected' end, approved_by = auth.uid(), approved_at = now(),
    decision_note = p_note where id = x.id;
  if p_approve then
    perform public._post_expense(x.id);
  end if;
  perform public.write_audit(case when p_approve then 'expense.approve' else 'expense.reject' end, 'expenses', x.id::text, null, p_note);
end;
$$;

-- Employees and payroll (sensitive: payroll permission only) ------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  department text,
  designation text,
  joining_date date not null,
  leaving_date date,
  phone text,
  user_id uuid references public.profiles (id) on delete set null,
  pay_type text not null default 'monthly' check (pay_type in ('monthly', 'daily')),
  monthly_salary numeric(12, 2) check (monthly_salary >= 0),
  daily_rate numeric(10, 2) check (daily_rate >= 0),
  -- Configured components: [{name, kind: earning|deduction, amount}] — no statutory rule is assumed.
  salary_components jsonb not null default '[]',
  overtime_rate_per_hour numeric(10, 2) not null default 0 check (overtime_rate_per_hour >= 0),
  bank_account_masked text,
  is_active boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pay_type = 'monthly' and monthly_salary is not null) or (pay_type = 'daily' and daily_rate is not null))
);

create table public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees,
  advance_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  recovered numeric(12, 2) not null default 0 check (recovered >= 0),
  reason text,
  paid_from text not null references public.ledger_accounts,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (recovered <= amount)
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  run_no text not null unique,
  period_start date not null unique check (extract(day from period_start) = 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'cancelled')),
  total_gross numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null default 0,
  total_net numeric(14, 2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  paid_from text references public.ledger_accounts,
  payment_reference text
);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs on delete cascade,
  employee_id uuid not null references public.employees,
  days_in_period integer not null,
  days_payable numeric(5, 2) not null,
  base_pay numeric(12, 2) not null default 0,
  component_earnings numeric(12, 2) not null default 0,
  overtime_hours numeric(6, 2) not null default 0,
  overtime_pay numeric(12, 2) not null default 0,
  other_earnings numeric(12, 2) not null default 0,
  component_deductions numeric(12, 2) not null default 0,
  advance_recovery numeric(12, 2) not null default 0,
  other_deductions numeric(12, 2) not null default 0,
  gross numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null default 0,
  note text,
  unique (run_id, employee_id),
  check (net_pay >= 0)
);

create function public._payroll_recalc(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.payroll_lines;
  emp public.employees;
  earn numeric := 0;
  ded numeric := 0;
  c jsonb;
  ratio numeric;
begin
  select * into l from public.payroll_lines where id = p_line_id;
  select * into emp from public.employees where id = l.employee_id;
  ratio := l.days_payable / l.days_in_period;
  for c in select * from jsonb_array_elements(emp.salary_components) loop
    if c ->> 'kind' = 'earning' then earn := earn + round(coalesce((c ->> 'amount')::numeric, 0) * ratio, 2);
    elsif c ->> 'kind' = 'deduction' then ded := ded + round(coalesce((c ->> 'amount')::numeric, 0), 2);
    end if;
  end loop;
  update public.payroll_lines set
    base_pay = case when emp.pay_type = 'monthly' then round(emp.monthly_salary * ratio, 2) else round(emp.daily_rate * l.days_payable, 2) end,
    component_earnings = earn,
    overtime_pay = round(l.overtime_hours * emp.overtime_rate_per_hour, 2),
    component_deductions = ded
  where id = l.id;
  update public.payroll_lines set gross = base_pay + component_earnings + overtime_pay + other_earnings,
    net_pay = base_pay + component_earnings + overtime_pay + other_earnings - component_deductions - advance_recovery - other_deductions
  where id = l.id;
end;
$$;

create function public._payroll_totals(p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payroll_runs r set
    total_gross = coalesce((select sum(gross) from public.payroll_lines where run_id = r.id), 0),
    total_deductions = coalesce((select sum(component_deductions + advance_recovery + other_deductions) from public.payroll_lines where run_id = r.id), 0),
    total_net = coalesce((select sum(net_pay) from public.payroll_lines where run_id = r.id), 0)
  where r.id = p_run_id
$$;

create function public.pay_save_employee(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid := (p ->> 'id')::uuid;
begin
  if eid is null then
    perform public.require_permission('payroll', 'create');
    insert into public.employees (employee_code, full_name, department, designation, joining_date, phone, pay_type, monthly_salary, daily_rate,
      salary_components, overtime_rate_per_hour, bank_account_masked, notes)
    values (upper(public._text(p, 'employee_code')), public._text(p, 'full_name'), public._text(p, 'department'), public._text(p, 'designation'),
      (p ->> 'joining_date')::date, public._text(p, 'phone'), coalesce(public._text(p, 'pay_type'), 'monthly'), (p ->> 'monthly_salary')::numeric,
      (p ->> 'daily_rate')::numeric, coalesce(p -> 'salary_components', '[]'), coalesce((p ->> 'overtime_rate_per_hour')::numeric, 0),
      public._text(p, 'bank_account_masked'), public._text(p, 'notes'))
    returning id into eid;
    perform public.write_audit('employee.create', 'employees', eid::text, p - 'bank_account_masked');
  else
    perform public.require_permission('payroll', 'edit');
    update public.employees set
      full_name = coalesce(public._text(p, 'full_name'), full_name),
      department = case when p ? 'department' then public._text(p, 'department') else department end,
      designation = case when p ? 'designation' then public._text(p, 'designation') else designation end,
      leaving_date = case when p ? 'leaving_date' then (p ->> 'leaving_date')::date else leaving_date end,
      phone = case when p ? 'phone' then public._text(p, 'phone') else phone end,
      monthly_salary = case when p ? 'monthly_salary' then (p ->> 'monthly_salary')::numeric else monthly_salary end,
      daily_rate = case when p ? 'daily_rate' then (p ->> 'daily_rate')::numeric else daily_rate end,
      salary_components = coalesce(p -> 'salary_components', salary_components),
      overtime_rate_per_hour = coalesce((p ->> 'overtime_rate_per_hour')::numeric, overtime_rate_per_hour),
      bank_account_masked = case when p ? 'bank_account_masked' then public._text(p, 'bank_account_masked') else bank_account_masked end,
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      notes = case when p ? 'notes' then public._text(p, 'notes') else notes end,
      updated_at = now()
    where id = eid;
    perform public.write_audit('employee.update', 'employees', eid::text, p - 'bank_account_masked');
  end if;
  return eid;
end;
$$;

create function public.pay_record_advance(p_employee_id uuid, p_amount numeric, p_date date, p_paid_from text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  aid uuid := gen_random_uuid();
begin
  perform public.require_permission('payroll', 'create');
  perform public._check_money_account(p_paid_from);
  if not exists (select 1 from public.employees where id = p_employee_id and is_active) then
    raise exception 'Choose an active employee';
  end if;
  insert into public.employee_advances (id, employee_id, advance_date, amount, reason, paid_from) values (aid, p_employee_id, p_date, p_amount, p_reason, p_paid_from);
  perform public._post_journal(p_date, 'employee_advance', aid::text, 'Salary advance', 'advance:' || aid,
    jsonb_build_array(public._jl('1150', p_amount, 'employee', p_employee_id::text), public._jl(p_paid_from, -p_amount)));
  perform public.write_audit('payroll.advance', 'employee_advances', aid::text, jsonb_build_object('employee_id', p_employee_id, 'amount', p_amount), p_reason);
  return aid;
end;
$$;

create function public.pay_create_run(p_period_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid := gen_random_uuid();
  days integer := extract(day from (date_trunc('month', p_period_start) + interval '1 month - 1 day'))::int;
  emp record;
  lid uuid;
begin
  perform public.require_permission('payroll', 'create');
  if extract(day from p_period_start) <> 1 then
    raise exception 'A payroll period starts on the 1st of a month';
  end if;
  insert into public.payroll_runs (id, run_no, period_start) values (rid, 'MW-SAL-' || to_char(p_period_start, 'YYYY-MM'), p_period_start);
  for emp in
    select * from public.employees
    where is_active and joining_date <= (p_period_start + days - 1) and (leaving_date is null or leaving_date >= p_period_start)
  loop
    insert into public.payroll_lines (run_id, employee_id, days_in_period, days_payable)
    values (rid, emp.id, days,
      -- Part months for joiners/leavers; full attendance otherwise (edit from attendance before approving).
      (least(coalesce(emp.leaving_date, p_period_start + days - 1), p_period_start + days - 1) - greatest(emp.joining_date, p_period_start) + 1))
    returning id into lid;
    perform public._payroll_recalc(lid);
  end loop;
  perform public._payroll_totals(rid);
  perform public.write_audit('payroll.create', 'payroll_runs', rid::text, jsonb_build_object('period', p_period_start));
  return rid;
end;
$$;

create function public.pay_update_line(p_line_id uuid, p_days_payable numeric, p_overtime_hours numeric default 0, p_other_earnings numeric default 0,
  p_advance_recovery numeric default 0, p_other_deductions numeric default 0, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.payroll_lines;
  st text;
  open_advances numeric;
begin
  perform public.require_permission('payroll', 'edit');
  select * into l from public.payroll_lines where id = p_line_id for update;
  if not found then
    raise exception 'Payroll line not found';
  end if;
  select status into st from public.payroll_runs where id = l.run_id;
  if st <> 'draft' then
    raise exception 'An approved payroll cannot be edited';
  end if;
  if p_days_payable < 0 or p_days_payable > l.days_in_period then
    raise exception 'Days payable must be between 0 and %', l.days_in_period;
  end if;
  select coalesce(sum(amount - recovered), 0) into open_advances from public.employee_advances where employee_id = l.employee_id;
  if coalesce(p_advance_recovery, 0) > open_advances then
    raise exception 'Only % of advances is outstanding', open_advances;
  end if;
  update public.payroll_lines set days_payable = p_days_payable, overtime_hours = coalesce(p_overtime_hours, 0), other_earnings = coalesce(p_other_earnings, 0),
    advance_recovery = coalesce(p_advance_recovery, 0), other_deductions = coalesce(p_other_deductions, 0), note = p_note
  where id = l.id;
  perform public._payroll_recalc(l.id);
  perform public._payroll_totals(l.run_id);
end;
$$;

create function public.pay_approve_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payroll_runs;
  l record;
  remaining numeric;
  a record;
  take numeric;
  jl jsonb := '[]';
begin
  perform public.require_permission('payroll', 'approve');
  select * into r from public.payroll_runs where id = p_run_id for update;
  if not found or r.status <> 'draft' then
    raise exception 'Only a draft payroll can be approved';
  end if;
  if exists (select 1 from public.payroll_lines where run_id = r.id and net_pay < 0) then
    raise exception 'A net pay is below zero';
  end if;
  jl := jl || public._jl('6200', r.total_gross, null, null, 'Salaries ' || to_char(r.period_start, 'Mon YYYY'));
  for l in select * from public.payroll_lines where run_id = r.id loop
    jl := jl || public._jl('2200', -l.net_pay, 'employee', l.employee_id::text);
    if l.advance_recovery > 0 then
      jl := jl || public._jl('1150', -l.advance_recovery, 'employee', l.employee_id::text);
      remaining := l.advance_recovery;
      for a in select * from public.employee_advances where employee_id = l.employee_id and recovered < amount order by advance_date for update loop
        exit when remaining <= 0;
        take := least(remaining, a.amount - a.recovered);
        update public.employee_advances set recovered = recovered + take where id = a.id;
        remaining := remaining - take;
      end loop;
    end if;
    jl := jl || public._jl('2210', -(l.component_deductions + l.other_deductions), 'employee', l.employee_id::text);
  end loop;
  perform public._post_journal((r.period_start + interval '1 month - 1 day')::date, 'payroll', r.id::text, 'Payroll ' || r.run_no, 'payroll:' || r.id, jl);
  update public.payroll_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = r.id;
  perform public.write_audit('payroll.approve', 'payroll_runs', r.id::text, jsonb_build_object('gross', r.total_gross, 'net', r.total_net));
end;
$$;

create function public.pay_mark_paid(p_run_id uuid, p_paid_on date, p_paid_from text, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payroll_runs;
  jl jsonb := '[]';
  l record;
begin
  perform public.require_permission('payroll', 'approve');
  perform public._check_money_account(p_paid_from);
  select * into r from public.payroll_runs where id = p_run_id for update;
  if not found or r.status <> 'approved' then
    raise exception 'Approve the payroll before paying it';
  end if;
  for l in select * from public.payroll_lines where run_id = r.id and net_pay > 0 loop
    jl := jl || public._jl('2200', l.net_pay, 'employee', l.employee_id::text);
  end loop;
  jl := jl || public._jl(p_paid_from, -r.total_net);
  perform public._post_journal(p_paid_on, 'payroll_payment', r.id::text, 'Salaries paid ' || r.run_no, 'payroll-paid:' || r.id, jl);
  update public.payroll_runs set status = 'paid', paid_at = now(), paid_from = p_paid_from, payment_reference = p_reference where id = r.id;
  perform public.write_audit('payroll.paid', 'payroll_runs', r.id::text, jsonb_build_object('net', r.total_net, 'from', p_paid_from), p_reference);
end;
$$;

-- Cash and bank -------------------------------------------------------------------------------
create table public.bank_reconciliations (
  journal_line_id bigint primary key references public.journal_lines,
  statement_date date not null,
  statement_ref text,
  reconciled_by uuid default auth.uid(),
  reconciled_at timestamptz not null default now()
);

create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null,
  account_code text not null references public.ledger_accounts,
  counted numeric(14, 2) not null,
  book_balance numeric(14, 2) not null,
  difference numeric(14, 2) generated always as (counted - book_balance) stored,
  notes text,
  counted_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create function public._account_balance(p_code text, p_to date default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.debit - l.credit), 0)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = p_code and (p_to is null or e.entry_date <= p_to)
$$;

create function public.fin_transfer(p_from text, p_to text, p_amount numeric, p_date date, p_reference text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid := gen_random_uuid();
begin
  perform public.require_permission('banking', 'create');
  perform public._claim_request_key(p_key, 'fin_transfer');
  perform public._check_money_account(p_from);
  perform public._check_money_account(p_to);
  if p_from = p_to or coalesce(p_amount, 0) <= 0 then
    raise exception 'Choose two different accounts and an amount';
  end if;
  perform public._post_journal(p_date, 'transfer', tid::text, coalesce(p_reference, 'Transfer'), 'transfer:' || tid,
    jsonb_build_array(public._jl(p_to, p_amount), public._jl(p_from, -p_amount)));
  perform public.write_audit('bank.transfer', 'journal_entries', tid::text, jsonb_build_object('from', p_from, 'to', p_to, 'amount', p_amount));
  return tid;
end;
$$;

create function public.fin_reconcile(p_line_ids bigint[], p_statement_date date, p_statement_ref text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_permission('banking', 'approve');
  insert into public.bank_reconciliations (journal_line_id, statement_date, statement_ref)
  select l.id, p_statement_date, p_statement_ref from public.journal_lines l
  where l.id = any (p_line_ids) and l.account_code in (select account_code from public.bank_accounts where kind in ('bank', 'gateway', 'upi'))
  on conflict do nothing;
  get diagnostics n = row_count;
  perform public.write_audit('bank.reconcile', 'bank_reconciliations', null, jsonb_build_object('lines', n, 'statement_date', p_statement_date), p_statement_ref);
  return n;
end;
$$;

create function public.fin_cash_count(p_account_code text, p_counted numeric, p_date date default null, p_notes text default null, p_post_difference boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := gen_random_uuid();
  book numeric := public._account_balance(p_account_code, coalesce(p_date, public.ist_today()));
  diff numeric := p_counted - book;
begin
  perform public.require_permission('banking', 'create');
  perform public._check_money_account(p_account_code);
  insert into public.cash_counts (id, count_date, account_code, counted, book_balance, notes)
  values (cid, coalesce(p_date, public.ist_today()), p_account_code, p_counted, book, p_notes);
  if p_post_difference and diff <> 0 then
    perform public.require_permission('banking', 'approve');
    perform public._post_journal(coalesce(p_date, public.ist_today()), 'cash_count', cid::text, 'Cash count difference', 'cash-count:' || cid,
      jsonb_build_array(public._jl(p_account_code, diff), public._jl('6990', -diff)), null, p_notes);
  end if;
  return cid;
end;
$$;

-- Accountant's journal (opening balances, accruals, corrections).
create function public.fin_manual_journal(p_date date, p_memo text, p_lines jsonb, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mid uuid := gen_random_uuid();
  eid uuid;
begin
  perform public.require_permission('banking', 'approve');
  perform public._claim_request_key(p_key, 'fin_manual_journal');
  if coalesce(trim(p_memo), '') = '' then
    raise exception 'Describe the entry';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where (e ->> 'account') in ('1200', '1210', '1220', '1230', '1240', '1250')) then
    raise exception 'Inventory accounts change only through stock movements';
  end if;
  eid := public._post_journal(p_date, 'manual', mid::text, p_memo, 'manual:' || mid, p_lines);
  perform public.write_audit('journal.manual', 'journal_entries', eid::text, jsonb_build_object('lines', p_lines), p_memo);
  return eid;
end;
$$;

-- Reverse a manual, opening or transfer entry. The original stays; the reversal is linked to it.
create function public.fin_reverse_entry(p_entry_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.journal_entries;
  jl jsonb := '[]';
  r record;
  rid uuid;
begin
  perform public.require_permission('banking', 'approve');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the reversal';
  end if;
  select * into e from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'Entry not found';
  end if;
  if e.source_type not in ('manual', 'transfer', 'cash_count') then
    raise exception 'This entry belongs to a % document; correct it through that document', e.source_type;
  end if;
  if e.reversal_of is not null then
    raise exception 'A reversal cannot itself be reversed; post a new entry';
  end if;
  if exists (select 1 from public.journal_entries where reversal_of = e.id) then
    raise exception 'This entry has already been reversed';
  end if;
  for r in select * from public.journal_lines where entry_id = e.id loop
    jl := jl || jsonb_build_object('account', r.account_code, 'debit', r.credit, 'credit', r.debit, 'party_type', r.party_type, 'party_id', r.party_id);
  end loop;
  rid := public._post_journal(public.ist_today(), e.source_type, e.source_id, 'Reversal of ' || e.entry_no, 'reversal:' || e.id, jl, e.id, p_reason);
  perform public.write_audit('journal.reverse', 'journal_entries', e.id::text, jsonb_build_object('reversal_id', rid), p_reason);
  return rid;
end;
$$;

-- Book balance of every cash, bank and gateway account, with what is not yet matched to a bank statement.
create function public.fin_money_balances(p_to date default null)
returns table (account_code text, name text, kind text, balance numeric, unreconciled numeric, last_counted date, last_count_difference numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('banking', 'view');
  return query
  select b.account_code, b.name, b.kind, public._account_balance(b.account_code, p_to),
    case when b.kind = 'cash' then null else
      (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where l.account_code = b.account_code and (p_to is null or e.entry_date <= p_to)
         and not exists (select 1 from public.bank_reconciliations r where r.journal_line_id = l.id)) end,
    (select max(c.count_date) from public.cash_counts c where c.account_code = b.account_code),
    (select c.difference from public.cash_counts c where c.account_code = b.account_code order by c.count_date desc, c.created_at desc limit 1)
  from public.bank_accounts b
  where b.is_active
  order by b.account_code;
end;
$$;

create function public.fin_retry_postings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  perform public.require_permission('sales', 'approve');
  for r in select * from public.posting_errors where resolved_at is null and source_type = 'order' loop
    begin
      perform public._post_order_sale(r.source_id::uuid);
      update public.posting_errors set resolved_at = now() where id = r.id;
      n := n + 1;
    exception when others then
      update public.posting_errors set error = sqlerrm, at = now() where id = r.id;
    end;
  end loop;
  return n;
end;
$$;

-- Reports ------------------------------------------------------------------------------------
create function public.fin_trial_balance(p_to date default null)
returns table (account_code text, name text, type text, debit numeric, credit numeric, balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return query
  select a.code, a.name, a.type, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0), coalesce(sum(l.debit - l.credit), 0)
  from public.ledger_accounts a
  left join public.journal_lines l on l.account_code = a.code
    and exists (select 1 from public.journal_entries e where e.id = l.entry_id and (p_to is null or e.entry_date <= p_to))
  group by a.code
  having coalesce(sum(l.debit), 0) <> 0 or coalesce(sum(l.credit), 0) <> 0
  order by a.code;
end;
$$;

-- Profit and loss, with cash received, purchases and expenses shown separately from profit.
create function public.fin_profit_and_loss(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rows jsonb;
  revenue numeric;
  cogs numeric;
  opex numeric;
begin
  perform public.require_permission('reports', 'view');
  with mv as (
    select a.code, a.name, a.type, a.subtype, sum(l.credit - l.debit) as net
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id join public.ledger_accounts a on a.code = l.account_code
    where e.entry_date between p_from and p_to and a.type in ('income', 'expense')
    group by a.code
  )
  select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'type', type, 'subtype', subtype,
      'amount', case when type = 'income' then net else -net end) order by code),
    coalesce(sum(net) filter (where type = 'income'), 0),
    coalesce(-sum(net) filter (where type = 'expense' and subtype = 'cogs'), 0),
    coalesce(-sum(net) filter (where type = 'expense' and subtype <> 'cogs'), 0)
  into rows, revenue, cogs, opex
  from mv;
  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'lines', coalesce(rows, '[]'),
    'net_sales', revenue, 'cost_of_goods_sold', cogs, 'gross_profit', revenue - cogs,
    'operating_expenses', opex, 'operating_profit', revenue - cogs - opex,
    'cash_received', (select coalesce(sum(l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where e.entry_date between p_from and p_to and l.account_code in (select account_code from public.bank_accounts)
         and e.source_type in ('order', 'dispatch', 'payment') and l.debit > 0),
    'inventory_purchased', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where e.entry_date between p_from and p_to and e.source_type in ('purchase_invoice', 'milk_collection', 'supplier_return')
         and l.account_code in ('1200', '1210', '1220', '1230', '1240')),
    'expenses_incurred', (select coalesce(sum(amount), 0) from public.expenses where status = 'approved' and expense_date between p_from and p_to),
    'note', 'Net sales exclude GST. Profit is sales less cost of goods sold and expenses — not the cash received.'
  );
end;
$$;

create function public.fin_account_ledger(p_code text, p_from date, p_to date)
returns table (entry_date date, entry_no text, memo text, party text, debit numeric, credit numeric, running_balance numeric, line_id bigint, reconciled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  opening numeric;
begin
  if not (public.has_permission('reports', 'view') or public.has_permission('banking', 'view')) then
    perform public.require_permission('reports', 'view');
  end if;
  if p_code in ('6200', '2200', '1150', '2210') then
    perform public.require_permission('payroll', 'view');
  end if;
  opening := public._account_balance(p_code, p_from - 1);
  return query
  select e.entry_date, e.entry_no, e.memo, l.party_type || coalesce(':' || l.party_id, ''), l.debit, l.credit,
    opening + sum(l.debit - l.credit) over (order by e.entry_date, e.posted_at, l.id), l.id,
    exists (select 1 from public.bank_reconciliations br where br.journal_line_id = l.id)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = p_code and e.entry_date between p_from and p_to
  order by e.entry_date, e.posted_at, l.id;
end;
$$;

create function public.fin_receivables()
returns table (party_id text, customer text, phone text, balance numeric, last_activity date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('sales', 'view');
  return query
  select l.party_id,
    (select o.customer_name from public.orders o where public._order_party(o) = l.party_id order by o.created_at desc limit 1),
    (select o.phone from public.orders o where public._order_party(o) = l.party_id order by o.created_at desc limit 1),
    sum(l.debit - l.credit), max(e.entry_date)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = '1100'
  group by l.party_id
  having sum(l.debit - l.credit) <> 0
  order by 4 desc;
end;
$$;

create function public.fin_payables()
returns table (supplier_id uuid, supplier text, balance numeric, overdue numeric, next_due date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('purchases', 'view');
  return query
  select s.id, s.name,
    coalesce((select sum(l.credit - l.debit) from public.journal_lines l where l.account_code = '2000' and l.party_type = 'supplier' and l.party_id = s.id::text), 0),
    coalesce((select sum(pi.total - pi.amount_paid) from public.purchase_invoices pi where pi.supplier_id = s.id and pi.status = 'posted' and pi.due_date < public.ist_today()), 0),
    (select min(pi.due_date) from public.purchase_invoices pi where pi.supplier_id = s.id and pi.status = 'posted' and pi.total > pi.amount_paid)
  from public.suppliers s
  where exists (select 1 from public.journal_lines l where l.account_code = '2000' and l.party_type = 'supplier' and l.party_id = s.id::text)
  order by 3 desc;
end;
$$;

create function public.fin_cash_flow(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_permission('reports', 'view');
  with money as (
    select e.id, e.source_type, l.debit - l.credit as amount
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where e.entry_date between p_from and p_to and l.account_code in (select account_code from public.bank_accounts) and e.source_type <> 'transfer'
  )
  select jsonb_build_object(
    'opening', (select coalesce(sum(public._account_balance(account_code, p_from - 1)), 0) from public.bank_accounts),
    'closing', (select coalesce(sum(public._account_balance(account_code, p_to)), 0) from public.bank_accounts),
    'inflows', coalesce((select jsonb_object_agg(source_type, s) from (select source_type, sum(amount) s from money where amount > 0 group by source_type) x), '{}'),
    'outflows', coalesce((select jsonb_object_agg(source_type, s) from (select source_type, -sum(amount) s from money where amount < 0 group by source_type) x), '{}'),
    'net_change', (select coalesce(sum(amount), 0) from money)
  ) into result;
  return result;
end;
$$;

create function public.fin_gst_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return jsonb_build_object(
    'output_cgst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2100' and e.entry_date between p_from and p_to),
    'output_sgst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2101' and e.entry_date between p_from and p_to),
    'output_igst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2102' and e.entry_date between p_from and p_to),
    'input_cgst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1300' and e.entry_date between p_from and p_to),
    'input_sgst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1301' and e.entry_date between p_from and p_to),
    'input_igst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1302' and e.entry_date between p_from and p_to),
    'note', 'Summary from the books for your accountant; file GST returns from verified invoice registers.'
  );
end;
$$;

-- Sales, cost and margin per SKU from dispatches.
create function public.fin_product_margins(p_from date, p_to date)
returns table (item_id uuid, code text, name text, units_dispatched numeric, sales_value numeric, cost_value numeric, gross_margin numeric, margin_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return query
  with lines as (
    select dl.item_id, dl.qty - dl.qty_returned as qty,
      -- Ex-GST selling price of the order line.
      oi.unit_price * 100 / (100 + coalesce(oi.gst_rate, i.gst_rate, 0)) as unit_net,
      -m.unit_cost as unit_cost
    from public.dispatch_lines dl
    join public.dispatches d on d.id = dl.dispatch_id
    join public.order_items oi on oi.id = dl.order_item_id
    join public.items i on i.id = dl.item_id
    join public.stock_movements m on m.id = dl.movement_id
    where public._ist_date(d.dispatched_at) between p_from and p_to
  )
  select i.id, i.code, i.name, sum(l.qty), round(sum(l.qty * l.unit_net), 2), round(sum(l.qty * -l.unit_cost), 2),
    round(sum(l.qty * l.unit_net) - sum(l.qty * -l.unit_cost), 2),
    round((sum(l.qty * l.unit_net) - sum(l.qty * -l.unit_cost)) / nullif(sum(l.qty * l.unit_net), 0) * 100, 1)
  from lines l join public.items i on i.id = l.item_id
  group by i.id
  order by 6 desc;
end;
$$;

create function public.inv_valuation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('inventory', 'view') or public.has_permission('reports', 'view')) then
    perform public.require_permission('inventory', 'view');
  end if;
  return jsonb_build_object(
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('item_type', item_type, 'value', v, 'ledger', public._account_balance(acct))), '[]')
      from (select i.item_type, case i.item_type when 'raw_material' then '1200' when 'packaging' then '1210' when 'finished_good' then '1220'
              when 'purchased_good' then '1230' else '1240' end as acct, round(sum(l.qty_on_hand * l.unit_cost), 2) as v
            from public.stock_lots l join public.items i on i.id = l.item_id where l.qty_on_hand > 0 group by i.item_type) x),
    'work_in_progress', public._account_balance('1250'),
    'total', (select coalesce(round(sum(qty_on_hand * unit_cost), 2), 0) from public.stock_lots)
  );
end;
$$;

-- Dashboard figures. Financial figures appear only for people allowed to see them.
create function public.ops_dashboard(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f date := coalesce(p_from, public.ist_today());
  t date := coalesce(p_to, public.ist_today());
  m date := date_trunc('month', public.ist_today())::date;
  result jsonb := '{}';
begin
  perform public.require_permission('dashboard', 'view');
  result := jsonb_build_object('from', f, 'to', t);
  if public.has_permission('dispatch', 'view') or public.has_permission('sales', 'view') then
    result := result || jsonb_build_object(
      'orders', (select count(*) from public.orders where public._ist_date(created_at) between f and t and status <> 'pending_payment'),
      'orders_pending', (select count(*) from public.orders where fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch')),
      'orders_awaiting_dispatch', (select count(*) from public.orders where fulfilment_status in ('ready_for_dispatch', 'packed', 'partially_dispatched')),
      'deliveries_completed', (select count(*) from public.dispatches where status = 'delivered' and public._ist_date(delivered_at) between f and t),
      'orders_on_hold', (select count(*) from public.orders where on_hold),
      'new_customers', (select count(*) from public.profiles p where public._ist_date(p.created_at) between f and t and not p.is_admin
          and not exists (select 1 from public.ops_user_roles ur where ur.user_id = p.id)));
  end if;
  if public.has_permission('production', 'view') or public.has_permission('procurement', 'view') then
    result := result || jsonb_build_object(
      'milk_procured_litres', (select coalesce(sum(qty_accepted), 0) from public.milk_collections where status = 'posted' and collected_on between f and t),
      'production_output', (select coalesce(jsonb_agg(jsonb_build_object('product', p.name, 'unit', p.base_unit, 'qty', x.q)), '[]')
          from (select product_id, sum(finished_qty) q from public.production_batches where completed_at is not null and public._ist_date(completed_at) between f and t group by product_id) x
          join public.products p on p.id = x.product_id),
      'active_batches', (select count(*) from public.production_batches where status in ('planned', 'materials_issued', 'in_production', 'production_completed', 'packaging', 'qc_approved')),
      'batches_awaiting_qc', (select count(*) from public.production_batches where status = 'awaiting_qc'),
      'batches_awaiting_release', (select count(*) from public.production_batches where status = 'packaging_completed'));
  end if;
  if public.has_permission('inventory', 'view') then
    result := result || jsonb_build_object(
      'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'available', available, 'reorder_level', reorder_level, 'unit', unit) order by name), '[]')
          from public.v_stock_summary where is_active and reorder_level > 0 and available <= reorder_level),
      'near_expiry_lots', (select count(*) from public.stock_lots where qty_on_hand > 0 and expiry_date between public.ist_today() and public.ist_today() + public.setting_num('inventory.expiry_alert_days', 3)::int),
      'expired_lots', (select count(*) from public.stock_lots where qty_on_hand > 0 and expiry_date < public.ist_today()),
      'raw_material_value', (select coalesce(round(sum(l.qty_on_hand * l.unit_cost), 2), 0) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type in ('raw_material', 'packaging', 'consumable')),
      'finished_goods_value', (select coalesce(round(sum(l.qty_on_hand * l.unit_cost), 2), 0) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type in ('finished_good', 'purchased_good')));
  end if;
  if public.has_permission('reports', 'view') then
    result := result || jsonb_build_object(
      'sales_period', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code in ('4000', '4010', '4095') and e.entry_date between f and t),
      'sales_month', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code in ('4000', '4010', '4095') and e.entry_date >= m),
      'purchases_period', (select coalesce(sum(total), 0) from public.purchase_invoices where status = 'posted' and invoice_date between f and t)
          + (select coalesce(sum(amount), 0) from public.milk_collections where status = 'posted' and collected_on between f and t),
      'expenses_period', (select coalesce(sum(amount), 0) from public.expenses where status = 'approved' and expense_date between f and t),
      'cash_and_bank', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'balance', public._account_balance(account_code))), '[]') from public.bank_accounts where is_active),
      'receivables', public._account_balance('1100'),
      'payables', -public._account_balance('2000'),
      'profit', public.fin_profit_and_loss(f, t) - 'lines');
  end if;
  if public.has_permission('payroll', 'view') then
    result := result || jsonb_build_object(
      'monthly_salary_commitment', (select coalesce(sum(coalesce(monthly_salary, daily_rate * 26)), 0) from public.employees where is_active));
  end if;
  if public.has_permission('subscriptions', 'view') then
    result := result || jsonb_build_object(
      'milk_interest', (select count(*) from public.milk_interest where status <> 'cancelled'),
      'active_subscribers', (select count(distinct user_id) from public.subscriptions where status = 'active'),
      'subscription_deliveries_period', (select count(*) from public.subscription_deliveries where status = 'delivered' and delivery_date between f and t),
      'subscription_revenue_period', (select coalesce(sum(o.total), 0) from public.orders o where o.source = 'subscription' and o.status <> 'cancelled'
          and o.delivery_date between f and t));
  end if;
  return result;
end;
$$;

-- Existing invoiced orders enter the books.
do $$
declare
  r record;
begin
  for r in select id from public.orders where invoice_number is not null and status <> 'cancelled' loop
    perform public._post_order_sale(r.id);
  end loop;
end $$;
-- Check those entries balance now, so the tables can be altered below in the same transaction;
-- then back to checking each entry at commit, as normal.
set constraints all immediate;
set constraints all deferred;

-- Access rules ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ledger_accounts', 'journal_entries', 'journal_lines', 'purchase_invoices', 'purchase_invoice_lines', 'bank_accounts',
    'payments', 'payment_allocations', 'expense_categories', 'expenses', 'employees', 'employee_advances', 'payroll_runs', 'payroll_lines',
    'bank_reconciliations', 'cash_counts', 'posting_errors'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "Finance reads accounts" on public.ledger_accounts for select to authenticated
  using ((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'view'))
    or (select public.has_permission('expenses', 'view')) or (select public.has_permission('sales', 'view')));
-- Journal lines of payroll accounts are visible only to payroll users.
create policy "Finance reads journal entries" on public.journal_entries for select to authenticated
  using ((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')));
create policy "Finance reads journal lines" on public.journal_lines for select to authenticated
  using (((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')))
    and (account_code not in ('6200', '2200', '1150', '2210') or (select public.has_permission('payroll', 'view'))));
create policy "Buyers read purchase invoices" on public.purchase_invoices for select to authenticated using ((select public.has_permission('purchases', 'view')));
create policy "Buyers read purchase lines" on public.purchase_invoice_lines for select to authenticated using ((select public.has_permission('purchases', 'view')));
create policy "Finance reads bank accounts" on public.bank_accounts for select to authenticated
  using ((select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'edit')) or (select public.has_permission('expenses', 'create'))
    or (select public.has_permission('payroll', 'create')) or (select public.has_permission('payroll', 'approve')) or (select public.has_permission('sales', 'create'))
    or (select public.has_permission('dispatch', 'edit')));
create policy "Finance reads payments" on public.payments for select to authenticated
  using ((select public.has_permission('banking', 'view')) or ((select public.has_permission('purchases', 'view')) and party_type = 'supplier')
    or ((select public.has_permission('sales', 'view')) and party_type = 'customer'));
create policy "Finance reads payment allocations" on public.payment_allocations for select to authenticated
  using ((select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'view')) or (select public.has_permission('sales', 'view')));
create policy "Staff read expense categories" on public.expense_categories for select to authenticated using ((select public.has_permission('expenses', 'view')));
create policy "Finance reads expenses" on public.expenses for select to authenticated using ((select public.has_permission('expenses', 'view')));
create policy "Payroll reads employees" on public.employees for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads advances" on public.employee_advances for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads runs" on public.payroll_runs for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads lines" on public.payroll_lines for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Finance reads reconciliations" on public.bank_reconciliations for select to authenticated using ((select public.has_permission('banking', 'view')));
create policy "Finance reads cash counts" on public.cash_counts for select to authenticated using ((select public.has_permission('banking', 'view')));
create policy "Finance reads posting errors" on public.posting_errors for select to authenticated using ((select public.has_permission('sales', 'view')));

do $$
declare
  f text;
begin
  foreach f in array array[
    '_journal_balanced()', '_post_journal(date, text, text, text, text, jsonb, uuid, text)', '_gl_stock_movement()', '_gl_batch_status()',
    '_gl_milk_collection()', '_order_tax(uuid)', '_post_order_sale(uuid)', '_gl_order()', '_gl_dispatch_collection()', '_post_expense(uuid)',
    '_payroll_recalc(uuid)', '_payroll_totals(uuid)', '_account_balance(text, date)', '_check_money_account(text)', '_inventory_account(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'fin_post_purchase_invoice(jsonb, jsonb, text)', 'fin_cancel_purchase_invoice(uuid, text)', 'fin_supplier_return(uuid, jsonb, text, text)',
    'fin_pay_supplier(uuid, numeric, date, text, text, text, jsonb, text)', 'fin_receive_customer_payment(uuid, numeric, date, text, text, text, text)',
    'fin_credit_note(uuid, numeric, text, text, text)', 'fin_record_expense(date, text, numeric, text, text, text, text, numeric, text, text, text)',
    'fin_decide_expense(uuid, boolean, text)', 'pay_save_employee(jsonb)', 'pay_record_advance(uuid, numeric, date, text, text)', 'pay_create_run(date)',
    'pay_update_line(uuid, numeric, numeric, numeric, numeric, numeric, text)', 'pay_approve_run(uuid)', 'pay_mark_paid(uuid, date, text, text)',
    'fin_transfer(text, text, numeric, date, text, text)', 'fin_reconcile(bigint[], date, text)', 'fin_cash_count(text, numeric, date, text, boolean)',
    'fin_manual_journal(date, text, jsonb, text)', 'fin_reverse_entry(uuid, text)', 'fin_trial_balance(date)', 'fin_profit_and_loss(date, date)',
    'fin_account_ledger(text, date, date)', 'fin_receivables()', 'fin_payables()', 'fin_cash_flow(date, date)', 'fin_gst_summary(date, date)',
    'fin_product_margins(date, date)', 'inv_valuation()', 'ops_dashboard(date, date)', 'fin_retry_postings()', 'fin_money_balances(date)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._jl(text, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public._ist_date(timestamptz) from public, anon;
grant execute on function public._ist_date(timestamptz) to authenticated;
revoke execute on function public._order_party(public.orders) from public, anon, authenticated;

-- ===== 20261010140000_ops_subscriptions =====
-- Milk subscriptions.
--
-- A subscription is the customer's standing instruction. Each delivery day gets its own record
-- (subscription_deliveries) with separate lines for the regular milk, one-off extra milk and one-off
-- add-on products, priced when scheduled. Customers change a day's delivery only until the cut-off
-- (business setting, India time, the day before). After the cut-off the day is locked into a normal
-- order, which then goes through allocation, dispatch, invoicing and accounting like any other order.

-- Price list with effective dates; history is kept so past deliveries keep their price.
create table public.item_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items,
  price numeric(12, 2) not null check (price >= 0),
  effective_from date not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (item_id, effective_from)
);

create function public.item_price_on(p_item_id uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select price from public.item_prices where item_id = p_item_id and effective_from <= p_date order by effective_from desc limit 1),
    (select sale_price from public.items where id = p_item_id))
$$;

-- Deliveries on or after this date can still be changed.
create function public.sub_first_open_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (now() at time zone 'Asia/Kolkata')::time < (public.setting('subscriptions.cutoff_time') #>> '{}')::time then public.ist_today() + 1
    else public.ist_today() + 2
  end
$$;

create function public._sub_assert_open(p_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_date < public.sub_first_open_date() then
    raise exception 'Changes for % closed at % on %. Please contact us and we''ll do our best.',
      to_char(p_date, 'DD Mon'), public.setting('subscriptions.cutoff_time') #>> '{}', to_char(p_date - 1, 'DD Mon')
      using errcode = '55000';
  end if;
end;
$$;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references public.items,
  qty_units integer not null check (qty_units between 1 and 20),
  frequency text not null default 'daily' check (frequency in ('daily', 'alternate_days', 'mon_to_sat', 'custom')),
  days_of_week integer[] check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]),
  slot text not null default 'morning' check (slot in ('morning', 'evening')),
  customer_name text not null,
  phone text not null check (phone ~ '^[0-9]{10}$'),
  address text not null,
  city text not null default 'Prayagraj',
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  pause_from date,
  pause_until date,
  payment_preference text not null default 'pay_on_delivery' check (payment_preference in ('pay_on_delivery', 'monthly_bill', 'prepaid')),
  bottle_arrangement text not null default 'returnable_glass' check (bottle_arrangement in ('returnable_glass', 'no_bottle')),
  instructions text,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (frequency <> 'custom' or cardinality(days_of_week) > 0),
  check (pause_until is null or pause_from is null or pause_until >= pause_from)
);
create index subscriptions_user_idx on public.subscriptions (user_id);
create index subscriptions_status_idx on public.subscriptions (status);

create table public.subscription_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  delivery_date date not null,
  slot text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'skipped', 'paused', 'locked', 'dispatched', 'delivered', 'failed', 'cancelled')),
  customer_name text not null,
  phone text not null,
  address text not null,
  city text not null,
  pincode text not null,
  order_id uuid references public.orders,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, delivery_date)
);
create index subscription_deliveries_date_idx on public.subscription_deliveries (delivery_date, status);
create index subscription_deliveries_user_idx on public.subscription_deliveries (user_id, delivery_date);

create table public.subscription_delivery_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.subscription_deliveries on delete cascade,
  item_id uuid not null references public.items,
  line_type text not null check (line_type in ('subscription', 'extra', 'addon')),
  qty integer not null check (qty > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unique (delivery_id, item_id, line_type)
);

create table public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions on delete cascade,
  delivery_date date,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  action text not null,
  details jsonb
);
create index subscription_events_sub_idx on public.subscription_events (subscription_id);
create trigger subscription_events_append_only before update or delete on public.subscription_events
  for each row execute function public.reject_change();

create table public.subscription_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.bottle_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  delivery_id uuid references public.subscription_deliveries,
  at timestamptz not null default now(),
  issued integer not null default 0 check (issued >= 0),
  returned integer not null default 0 check (returned >= 0),
  damaged integer not null default 0 check (damaged >= 0),
  note text,
  recorded_by uuid default auth.uid()
);
create index bottle_ledger_user_idx on public.bottle_ledger (user_id);
create trigger bottle_ledger_append_only before update or delete on public.bottle_ledger
  for each row execute function public.reject_change();

create function public._sub_runs_on(s public.subscriptions, p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case s.frequency
    when 'daily' then true
    when 'alternate_days' then (p_date - s.start_date) % 2 = 0
    when 'mon_to_sat' then extract(dow from p_date) <> 0
    when 'custom' then extract(dow from p_date)::int = any (s.days_of_week)
  end
$$;

-- Bring a subscription's open deliveries in line with its current settings.
create function public._sub_schedule(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  d date;
  first_open date := public.sub_first_open_date();
  last_day date := public.ist_today() + public.setting_num('subscriptions.schedule_days', 14)::int;
  did uuid;
  want boolean;
  paused boolean;
  existing public.subscription_deliveries;
begin
  select * into s from public.subscriptions where id = p_subscription_id for update;
  d := greatest(s.start_date, first_open);
  while d <= last_day loop
    want := s.status <> 'cancelled' and d >= s.start_date and public._sub_runs_on(s, d);
    paused := s.pause_from is not null and d >= s.pause_from and (s.pause_until is null or d <= s.pause_until);
    select * into existing from public.subscription_deliveries where subscription_id = s.id and delivery_date = d for update;
    if existing.id is null then
      if want then
        insert into public.subscription_deliveries (subscription_id, user_id, delivery_date, slot, status, customer_name, phone, address, city, pincode)
        values (s.id, s.user_id, d, s.slot, case when paused then 'paused' else 'scheduled' end, s.customer_name, s.phone, s.address, s.city, s.pincode)
        returning id into did;
        insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
        values (did, s.item_id, 'subscription', s.qty_units, public.item_price_on(s.item_id, d));
      end if;
    elsif existing.status in ('scheduled', 'paused', 'cancelled') then
      update public.subscription_deliveries set
        status = case when not want then 'cancelled' when paused then 'paused' else 'scheduled' end,
        slot = s.slot, customer_name = s.customer_name, phone = s.phone, address = s.address, city = s.city, pincode = s.pincode, updated_at = now()
      where id = existing.id;
      update public.subscription_delivery_lines set qty = s.qty_units, item_id = s.item_id
      where delivery_id = existing.id and line_type = 'subscription';
      if not found and want then
        insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
        values (existing.id, s.item_id, 'subscription', s.qty_units, public.item_price_on(s.item_id, d));
      end if;
    end if;
    -- Skipped days stay skipped until the customer resumes them.
    d := d + 1;
  end loop;
end;
$$;

create function public._sub_own(p_subscription_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
begin
  select * into s from public.subscriptions where id = p_subscription_id for update;
  if not found or (s.user_id <> auth.uid() and not public.has_permission('subscriptions', 'edit')) then
    raise exception 'Subscription not found';
  end if;
  return s;
end;
$$;

create function public._sub_delivery(p_subscription_id uuid, p_date date)
returns public.subscription_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.subscription_deliveries;
begin
  perform public._sub_schedule(p_subscription_id);
  select * into d from public.subscription_deliveries where subscription_id = p_subscription_id and delivery_date = p_date for update;
  if not found then
    raise exception 'There is no delivery on % for this subscription', to_char(p_date, 'DD Mon');
  end if;
  return d;
end;
$$;

-- Customer actions ----------------------------------------------------------------------
create function public.sub_create(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  it public.items;
  start date := coalesce((p ->> 'start_date')::date, public.sub_first_open_date());
  pin text := trim(coalesce(p ->> 'pincode', ''));
  phone text := right(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g'), 10);
begin
  if auth.uid() is null then
    raise exception 'Please sign in';
  end if;
  if not coalesce((public.setting('subscriptions.enabled') #>> '{}')::boolean, false) and not public.has_permission('subscriptions', 'edit') then
    raise exception 'Milk subscriptions have not opened yet. Join the interest list and we''ll let you know.';
  end if;
  select i.* into it from public.items i join public.products pr on pr.id = i.product_id
  where i.id = (p ->> 'item_id')::uuid and i.is_active and pr.is_active and pr.is_subscribable;
  if not found then
    raise exception 'Choose a milk product';
  end if;
  if start < public.sub_first_open_date() then
    raise exception 'The earliest start date is %', to_char(public.sub_first_open_date(), 'DD Mon YYYY');
  end if;
  if not exists (select 1 from jsonb_array_elements(public.setting('delivery.areas')) a where pin like (a ->> 'pincode_prefix') || '%') then
    raise exception 'We don''t deliver to pincode % yet', pin;
  end if;
  insert into public.subscriptions (user_id, item_id, qty_units, frequency, days_of_week, slot, customer_name, phone, address, city, pincode,
    start_date, payment_preference, bottle_arrangement, instructions)
  values (auth.uid(), it.id, (p ->> 'qty_units')::int, coalesce(p ->> 'frequency', 'daily'),
    case when p ? 'days_of_week' then array(select jsonb_array_elements_text(p -> 'days_of_week')::int) end,
    coalesce(p ->> 'slot', 'morning'), trim(p ->> 'customer_name'), phone, trim(p ->> 'address'), coalesce(nullif(trim(p ->> 'city'), ''), 'Prayagraj'), pin,
    start, coalesce(p ->> 'payment_preference', 'pay_on_delivery'), coalesce(p ->> 'bottle_arrangement', 'returnable_glass'),
    nullif(trim(coalesce(p ->> 'instructions', '')), ''))
  returning id into sid;
  perform public._sub_schedule(sid);
  insert into public.subscription_events (subscription_id, action, details) values (sid, 'created', p);
  return sid;
end;
$$;

create function public.sub_skip(p_subscription_id uuid, p_date date, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
begin
  perform public._sub_assert_open(p_date);
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'scheduled' then
    raise exception 'That delivery is % and cannot be skipped', d.status;
  end if;
  update public.subscription_deliveries set status = 'skipped', skip_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now() where id = d.id;
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_date, 'skipped', jsonb_build_object('reason', p_reason));
end;
$$;

create function public.sub_unskip(p_subscription_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
begin
  perform public._sub_assert_open(p_date);
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'skipped' then
    raise exception 'That delivery is not skipped';
  end if;
  update public.subscription_deliveries set status = 'scheduled', skip_reason = null, updated_at = now() where id = d.id;
  insert into public.subscription_events (subscription_id, delivery_date, action) values (s.id, p_date, 'unskipped');
end;
$$;

-- Extra milk for one day only; the regular quantity does not change. 0 removes the extra.
create function public.sub_set_extra(p_subscription_id uuid, p_date date, p_extra_units integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
begin
  perform public._sub_assert_open(p_date);
  if p_extra_units is null or p_extra_units < 0 or p_extra_units > 20 then
    raise exception 'Extra quantity must be between 0 and 20';
  end if;
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'scheduled' then
    raise exception 'That delivery is %; resume it first', d.status;
  end if;
  delete from public.subscription_delivery_lines where delivery_id = d.id and line_type = 'extra';
  if p_extra_units > 0 then
    insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
    values (d.id, s.item_id, 'extra', p_extra_units, public.item_price_on(s.item_id, p_date));
  end if;
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_date, 'extra', jsonb_build_object('units', p_extra_units));
end;
$$;

-- One-off products added to a day's delivery. p_items = [{item_id, qty}] replaces that day's add-ons.
create function public.sub_set_addons(p_subscription_id uuid, p_date date, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
  e jsonb;
  it public.items;
  avail numeric;
  booked numeric;
begin
  perform public._sub_assert_open(p_date);
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'scheduled' then
    raise exception 'That delivery is %; resume it first', d.status;
  end if;
  delete from public.subscription_delivery_lines where delivery_id = d.id and line_type = 'addon';
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    continue when coalesce((e ->> 'qty')::int, 0) = 0;
    select i.* into it from public.items i join public.products pr on pr.id = i.product_id
    where i.id = (e ->> 'item_id')::uuid and i.is_active and pr.is_active and pr.show_in_app;
    if not found then
      raise exception 'That product is not available in the app';
    end if;
    if (e ->> 'qty')::int < 0 or (e ->> 'qty')::int > 50 then
      raise exception 'Choose a quantity between 1 and 50';
    end if;
    -- Stock check: free stock today, less what other customers already booked for that day.
    select coalesce(sum(l.qty_on_hand - l.qty_reserved), 0) into avail from public.stock_lots l
    where l.item_id = it.id and l.status = 'available' and (l.expiry_date is null or l.expiry_date >= p_date);
    select coalesce(sum(x.qty), 0) into booked from public.subscription_delivery_lines x
    join public.subscription_deliveries y on y.id = x.delivery_id
    where x.item_id = it.id and y.delivery_date = p_date and y.status = 'scheduled' and y.id <> d.id;
    if (e ->> 'qty')::int > avail - booked then
      raise exception 'Only % of % available for %', greatest(avail - booked, 0)::int, it.name, to_char(p_date, 'DD Mon') using errcode = '23514';
    end if;
    insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
    values (d.id, it.id, 'addon', (e ->> 'qty')::int, public.item_price_on(it.id, p_date));
  end loop;
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_date, 'addons', p_items);
end;
$$;

create function public.sub_pause(p_subscription_id uuid, p_from date, p_until date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if s.status = 'cancelled' then
    raise exception 'This subscription is cancelled';
  end if;
  perform public._sub_assert_open(p_from);
  if p_until is not null and p_until < p_from then
    raise exception 'The pause must end on or after it starts';
  end if;
  update public.subscriptions set status = 'paused', pause_from = p_from, pause_until = p_until, updated_at = now() where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_from, 'paused', jsonb_build_object('until', p_until));
end;
$$;

create function public.sub_resume(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if s.status = 'cancelled' then
    raise exception 'This subscription is cancelled; start a new one';
  end if;
  -- Days before the cut-off stay as they are.
  update public.subscriptions set status = 'active',
    pause_until = case when pause_from is not null and pause_from < public.sub_first_open_date() then public.sub_first_open_date() - 1 end,
    pause_from = case when pause_from is not null and pause_from < public.sub_first_open_date() then pause_from end,
    updated_at = now()
  where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action) values (s.id, 'resumed');
end;
$$;

create function public.sub_cancel(p_subscription_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if s.status = 'cancelled' then
    raise exception 'Already cancelled';
  end if;
  update public.subscriptions set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now() where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action, details) values (s.id, 'cancelled', jsonb_build_object('reason', p_reason));
end;
$$;

-- Change the regular quantity from the next open delivery onwards.
create function public.sub_change_quantity(p_subscription_id uuid, p_qty_units integer)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if p_qty_units is null or p_qty_units < 1 or p_qty_units > 20 then
    raise exception 'Quantity must be between 1 and 20';
  end if;
  update public.subscriptions set qty_units = p_qty_units, updated_at = now() where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action, details) values (s.id, 'quantity', jsonb_build_object('from', s.qty_units, 'to', p_qty_units));
  return public.sub_first_open_date();
end;
$$;

create function public.sub_change_address(p_subscription_id uuid, p jsonb)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  pin text := trim(coalesce(p ->> 'pincode', s.pincode));
begin
  if not exists (select 1 from jsonb_array_elements(public.setting('delivery.areas')) a where pin like (a ->> 'pincode_prefix') || '%') then
    raise exception 'We don''t deliver to pincode % yet', pin;
  end if;
  update public.subscriptions set address = coalesce(nullif(trim(p ->> 'address'), ''), address), city = coalesce(nullif(trim(p ->> 'city'), ''), city),
    pincode = pin, slot = coalesce(p ->> 'slot', slot), instructions = case when p ? 'instructions' then nullif(trim(p ->> 'instructions'), '') else instructions end,
    updated_at = now()
  where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action, details) values (s.id, 'address', p);
  return public.sub_first_open_date();
end;
$$;

-- Everything the customer's subscription screen needs.
create function public.sub_my_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r record;
begin
  if uid is null then
    raise exception 'Please sign in';
  end if;
  for r in select id from public.subscriptions where user_id = uid and status <> 'cancelled' loop
    perform public._sub_schedule(r.id);
  end loop;
  return jsonb_build_object(
    'enabled', coalesce((public.setting('subscriptions.enabled') #>> '{}')::boolean, false),
    'cutoff_time', public.setting('subscriptions.cutoff_time') #>> '{}',
    'first_open_date', public.sub_first_open_date(),
    'bottle_deposit', public.setting_num('subscriptions.bottle_deposit', 0),
    'bottle_damage_charge', public.setting_num('subscriptions.bottle_damage_charge', 0),
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status, 'item_id', s.item_id, 'item_name', i.name, 'unit_label', i.net_qty || ' ' || coalesce(pr.base_unit, i.unit),
        'qty_units', s.qty_units, 'frequency', s.frequency, 'days_of_week', s.days_of_week, 'slot', s.slot,
        'address', s.address, 'city', s.city, 'pincode', s.pincode, 'start_date', s.start_date, 'pause_from', s.pause_from, 'pause_until', s.pause_until,
        'payment_preference', s.payment_preference, 'bottle_arrangement', s.bottle_arrangement, 'instructions', s.instructions,
        'price_today', public.item_price_on(s.item_id, public.sub_first_open_date()),
        'price_changes', (select coalesce(jsonb_agg(jsonb_build_object('price', ip.price, 'from', ip.effective_from) order by ip.effective_from), '[]')
           from public.item_prices ip where ip.item_id = s.item_id and ip.effective_from > public.ist_today()),
        'monthly_estimate', round(public.item_price_on(s.item_id, public.sub_first_open_date()) * s.qty_units *
           case s.frequency when 'daily' then 30 when 'alternate_days' then 15 when 'mon_to_sat' then 26 else coalesce(cardinality(s.days_of_week), 0) * 30 / 7.0 end, 0)
      ) order by s.created_at), '[]')
      from public.subscriptions s join public.items i on i.id = s.item_id left join public.products pr on pr.id = i.product_id
      where s.user_id = uid and s.status <> 'cancelled'),
    'upcoming', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'subscription_id', d.subscription_id, 'date', d.delivery_date, 'slot', d.slot, 'status', d.status,
        'can_change', d.delivery_date >= public.sub_first_open_date() and d.status in ('scheduled', 'skipped'),
        'order_id', d.order_id,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', i.name, 'type', l.line_type, 'qty', l.qty, 'unit_price', l.unit_price)
            order by l.line_type desc, i.name), '[]') from public.subscription_delivery_lines l join public.items i on i.id = l.item_id where l.delivery_id = d.id),
        'total', (select coalesce(sum(l.qty * l.unit_price), 0) from public.subscription_delivery_lines l where l.delivery_id = d.id)
      ) order by d.delivery_date), '[]')
      from public.subscription_deliveries d where d.user_id = uid and d.delivery_date >= public.ist_today() and d.delivery_date <= public.ist_today() + 14),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('date', d.delivery_date, 'status', d.status,
        'total', (select coalesce(sum(l.qty * l.unit_price), 0) from public.subscription_delivery_lines l where l.delivery_id = d.id)) order by d.delivery_date desc), '[]')
      from (select * from public.subscription_deliveries where user_id = uid and delivery_date < public.ist_today() order by delivery_date desc limit 30) d),
    'bottles_outstanding', (select coalesce(sum(issued - returned - damaged), 0) from public.bottle_ledger where user_id = uid),
    'balance_due', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l where l.account_code = '1100' and l.party_id = uid::text),
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('message', message, 'at', created_at) order by created_at desc), '[]')
      from (select * from public.subscription_notices where user_id = uid order by created_at desc limit 5) n)
  );
end;
$$;

-- Price changes for subscription products: future dates only, existing open deliveries repriced, customers told.
create function public.cat_set_item_price(p_item_id uuid, p_price numeric, p_effective_from date, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.items;
  subscribable boolean;
  n integer;
begin
  perform public.require_permission('catalog', 'edit');
  select * into it from public.items where id = p_item_id;
  if not found or p_price is null or p_price < 0 then
    raise exception 'Choose an item and a valid price';
  end if;
  select coalesce(pr.is_subscribable, false) into subscribable from public.products pr where pr.id = it.product_id;
  if subscribable and p_effective_from < public.sub_first_open_date() then
    raise exception 'Subscription prices can change from % at the earliest, so no locked delivery changes price', public.sub_first_open_date();
  end if;
  insert into public.item_prices (item_id, price, effective_from, note) values (p_item_id, p_price, p_effective_from, p_note)
  on conflict (item_id, effective_from) do update set price = excluded.price, note = excluded.note, created_by = auth.uid(), created_at = now();
  if p_effective_from <= public.ist_today() then
    update public.items set sale_price = p_price, updated_at = now() where id = p_item_id;
  end if;
  update public.subscription_delivery_lines l set unit_price = p_price
  from public.subscription_deliveries d
  where d.id = l.delivery_id and l.item_id = p_item_id and d.status in ('scheduled', 'skipped', 'paused') and d.delivery_date >= p_effective_from
    and not exists (select 1 from public.item_prices x where x.item_id = p_item_id and x.effective_from > p_effective_from and x.effective_from <= d.delivery_date);
  get diagnostics n = row_count;
  if subscribable then
    insert into public.subscription_notices (user_id, message)
    select distinct s.user_id, format('The price of %s changes to ₹%s from %s.', it.name, p_price, to_char(p_effective_from, 'DD Mon YYYY'))
    from public.subscriptions s where s.item_id = p_item_id and s.status <> 'cancelled';
  end if;
  perform public.write_audit('price.set', 'items', p_item_id::text, jsonb_build_object('price', p_price, 'from', p_effective_from, 'deliveries_repriced', n), p_note);
end;
$$;

-- What a signed-in customer can subscribe to and add to a delivery, with the price for the next open day.
create function public.sub_catalogue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := public.sub_first_open_date();
begin
  if auth.uid() is null then
    raise exception 'Please sign in';
  end if;
  return jsonb_build_object(
    'first_open_date', d,
    'milk', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'unit_label', i.net_qty || ' ' || pr.base_unit,
        'price', public.item_price_on(i.id, d)) order by pr.sort_order, i.net_qty), '[]')
      from public.items i join public.products pr on pr.id = i.product_id
      where i.is_active and pr.is_active and pr.is_subscribable and public.item_price_on(i.id, d) is not null),
    'addons', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'brand', pr.brand, 'category', pr.category,
        'price', public.item_price_on(i.id, d),
        'in_stock', exists (select 1 from public.stock_lots l where l.item_id = i.id and l.status = 'available' and l.qty_on_hand > l.qty_reserved
          and (l.expiry_date is null or l.expiry_date >= d))) order by pr.sort_order, pr.name, i.net_qty), '[]')
      from public.items i join public.products pr on pr.id = i.product_id
      where i.is_active and pr.is_active and pr.show_in_app and not pr.is_subscribable and public.item_price_on(i.id, d) is not null)
  );
end;
$$;

-- Staff: demand and day locking --------------------------------------------------------------
create function public.sub_daily_demand(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform public.require_permission('subscriptions', 'view');
  for r in select id from public.subscriptions where status <> 'cancelled' loop
    perform public._sub_schedule(r.id);
  end loop;
  return jsonb_build_object(
    'date', p_date,
    'locked', p_date < public.sub_first_open_date(),
    'deliveries', (select count(*) from public.subscription_deliveries where delivery_date = p_date and status in ('scheduled', 'locked', 'dispatched', 'delivered')),
    'skipped', (select count(*) from public.subscription_deliveries where delivery_date = p_date and status = 'skipped'),
    'paused', (select count(*) from public.subscription_deliveries where delivery_date = p_date and status = 'paused'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item', i.name, 'code', i.code, 'qty', q.qty, 'regular', q.regular, 'extra', q.extra, 'addon', q.addon) order by i.name), '[]')
      from (select l.item_id, sum(l.qty) qty, sum(l.qty) filter (where l.line_type = 'subscription') regular,
              sum(l.qty) filter (where l.line_type = 'extra') extra, sum(l.qty) filter (where l.line_type = 'addon') addon
            from public.subscription_delivery_lines l join public.subscription_deliveries d on d.id = l.delivery_id
            where d.delivery_date = p_date and d.status in ('scheduled', 'locked', 'dispatched', 'delivered') group by l.item_id) q
      join public.items i on i.id = q.item_id),
    'by_area', (select coalesce(jsonb_agg(jsonb_build_object('pincode', pincode, 'slot', slot, 'deliveries', n) order by pincode, slot), '[]')
      from (select pincode, slot, count(*) n from public.subscription_deliveries where delivery_date = p_date and status in ('scheduled', 'locked', 'dispatched', 'delivered') group by pincode, slot) a)
  );
end;
$$;

-- Turn a day's deliveries into orders once its cut-off has passed (or earlier, by an approver).
create function public.sub_lock_day(p_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  s public.subscriptions;
  oid uuid;
  l record;
  v_subtotal integer;
  n integer := 0;
begin
  perform public.require_permission('dispatch', 'create');
  if p_date >= public.sub_first_open_date() then
    perform public.require_permission('dispatch', 'approve');   -- locking before the cut-off is an exception
  end if;
  for d in select * from public.subscription_deliveries where delivery_date = p_date and status = 'scheduled' and order_id is null for update loop
    select * into s from public.subscriptions where id = d.subscription_id;
    v_subtotal := (select coalesce(sum(round(qty * unit_price)), 0)::int from public.subscription_delivery_lines where delivery_id = d.id);
    if v_subtotal = 0 then
      continue;
    end if;
    insert into public.orders (user_id, customer_name, phone, address, city, pincode, notes, payment_method, payment_status, status,
      subtotal, delivery_fee, discount, total, source, delivery_date, delivery_slot, milk_subscriber, email)
    values (d.user_id, d.customer_name, d.phone, d.address, d.city, d.pincode, s.instructions, 'cod', 'cod', 'received',
      v_subtotal, 0, 0, v_subtotal, 'subscription', d.delivery_date, d.slot, true, (select email from public.profiles where id = d.user_id))
    returning id into oid;
    for l in select x.*, i.name, i.code, i.hsn, i.gst_rate, i.unit, i.net_qty from public.subscription_delivery_lines x join public.items i on i.id = x.item_id
             where x.delivery_id = d.id order by x.line_type desc loop
      insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity, hsn, gst_rate, item_id)
      values (oid, lower(l.code), l.name || case l.line_type when 'extra' then ' (extra)' when 'addon' then ' (add-on)' else '' end,
        coalesce(l.net_qty::text || ' ', '') || l.unit, round(l.unit_price)::int, l.qty, l.hsn, coalesce(l.gst_rate, 0), l.item_id);
    end loop;
    perform public.assign_invoice_number(oid);
    update public.subscription_deliveries set status = 'locked', order_id = oid, updated_at = now() where id = d.id;
    insert into public.order_events (order_id, status, note) values (oid, 'confirmed', 'Milk subscription delivery for ' || to_char(p_date, 'DD Mon'));
    n := n + 1;
  end loop;
  perform public.write_audit('subscriptions.lock_day', 'subscription_deliveries', p_date::text, jsonb_build_object('orders', n));
  return n;
end;
$$;

-- Keep delivery records in step with their orders.
create function public._sub_delivery_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'subscription' and new.fulfilment_status is distinct from old.fulfilment_status then
    update public.subscription_deliveries set status = case new.fulfilment_status
        when 'dispatched' then 'dispatched' when 'out_for_delivery' then 'dispatched' when 'partially_dispatched' then 'dispatched'
        when 'delivered' then 'delivered' when 'partially_delivered' then 'delivered'
        when 'delivery_failed' then 'failed' when 'returned' then 'failed' when 'cancelled' then 'cancelled'
        else status end, updated_at = now()
    where order_id = new.id;
  end if;
  return null;
end;
$$;
create trigger orders_subscription_sync after update of fulfilment_status on public.orders
  for each row execute function public._sub_delivery_sync();

create function public.sub_record_bottles(p_user_id uuid, p_issued integer, p_returned integer, p_damaged integer default 0,
  p_delivery_id uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge numeric := public.setting_num('subscriptions.bottle_damage_charge', 0) * coalesce(p_damaged, 0);
  bid uuid := gen_random_uuid();
begin
  perform public.require_permission('dispatch', 'edit');
  insert into public.bottle_ledger (id, user_id, delivery_id, issued, returned, damaged, note)
  values (bid, p_user_id, p_delivery_id, coalesce(p_issued, 0), coalesce(p_returned, 0), coalesce(p_damaged, 0), p_note);
  if charge > 0 then
    perform public._post_journal(public.ist_today(), 'bottle', bid::text, 'Damaged / lost bottle charge', 'bottle:' || bid,
      jsonb_build_array(public._jl('1100', charge, 'customer', p_user_id::text), public._jl('4100', -charge)), null, p_note);
  end if;
end;
$$;

-- Subscribers count for benefits once their subscription is active.
create function public.is_active_milk_subscriber(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.subscriptions where user_id = p_user_id and status = 'active')
    or exists (select 1 from public.milk_interest where user_id = p_user_id and status = 'active')
$$;

-- Access rules ------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['item_prices', 'subscriptions', 'subscription_deliveries', 'subscription_delivery_lines', 'subscription_events',
    'subscription_notices', 'bottle_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "Staff read prices" on public.item_prices for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('subscriptions', 'view')));
create policy "Customers read own subscriptions" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('subscriptions', 'view')));
create policy "Customers read own deliveries" on public.subscription_deliveries for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('subscriptions', 'view')) or (select public.has_permission('dispatch', 'view')));
create policy "Customers read own delivery lines" on public.subscription_delivery_lines for select to authenticated
  using (exists (select 1 from public.subscription_deliveries d where d.id = delivery_id and d.user_id = (select auth.uid()))
    or (select public.has_permission('subscriptions', 'view')) or (select public.has_permission('dispatch', 'view')));
create policy "Customers read own subscription history" on public.subscription_events for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = (select auth.uid())) or (select public.has_permission('subscriptions', 'view')));
create policy "Customers read own notices" on public.subscription_notices for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers read own bottles" on public.bottle_ledger for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('subscriptions', 'view')) or (select public.has_permission('dispatch', 'view')));

do $$
declare
  f text;
begin
  foreach f in array array['_sub_assert_open(date)', '_sub_runs_on(public.subscriptions, date)', '_sub_schedule(uuid)', '_sub_own(uuid)',
    '_sub_delivery(uuid, date)', '_sub_delivery_sync()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['item_price_on(uuid, date)', 'sub_first_open_date()', 'sub_create(jsonb)', 'sub_skip(uuid, date, text)', 'sub_unskip(uuid, date)',
    'sub_set_extra(uuid, date, integer)', 'sub_set_addons(uuid, date, jsonb)', 'sub_pause(uuid, date, date)', 'sub_resume(uuid)', 'sub_cancel(uuid, text)',
    'sub_change_quantity(uuid, integer)', 'sub_change_address(uuid, jsonb)', 'sub_my_overview()', 'sub_catalogue()', 'cat_set_item_price(uuid, numeric, date, text)',
    'sub_daily_demand(date)', 'sub_lock_day(date)', 'sub_record_bottles(uuid, integer, integer, integer, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- Used by the storefront's server (secret key) when pricing an order.
revoke execute on function public.is_active_milk_subscriber(uuid) from public, anon, authenticated;
grant execute on function public.is_active_milk_subscriber(uuid) to service_role;

-- Staff working on subscriptions can read the interest list collected on the website.
create policy "Subscription staff read milk interest" on public.milk_interest for select to authenticated
  using ((select public.has_permission('subscriptions', 'view')));

-- Final rights for the public API roles, exactly as the tested migrations leave them.
grant select, update, usage on sequence public.audit_log_id_seq, public.batch_corrections_id_seq, public.batch_events_id_seq, public.journal_lines_id_seq, public.order_events_id_seq, public.orders_order_number_seq, public.posting_errors_id_seq, public.stock_movements_id_seq, public.subscription_events_id_seq to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.addresses, public.invoice_counters, public.memberships, public.milk_interest, public.reward_ledger, public.staff_emails, public.support_requests, public.wishlist to anon;
grant delete, references, select, trigger, truncate on table public.profiles to anon;
grant references, select, trigger on table public.order_items, public.orders to anon;
grant select, update, usage on sequence public.audit_log_id_seq, public.batch_corrections_id_seq, public.batch_events_id_seq, public.journal_lines_id_seq, public.order_events_id_seq, public.orders_order_number_seq, public.posting_errors_id_seq, public.stock_movements_id_seq, public.subscription_events_id_seq to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.addresses, public.invoice_counters, public.memberships, public.milk_interest, public.reward_ledger, public.staff_emails, public.support_requests, public.v_batch_materials, public.v_dispatch_queue, public.v_order_line_fulfilment, public.v_stock_summary, public.wishlist to authenticated;
grant delete, references, select, trigger, truncate on table public.profiles to authenticated;
grant references, select, trigger on table public.audit_log, public.bank_accounts, public.bank_reconciliations, public.batch_corrections, public.batch_events, public.batch_materials, public.batch_packaging, public.batch_qc_results, public.bottle_ledger, public.business_settings, public.cash_counts, public.categories, public.dispatch_lines, public.dispatches, public.doc_counters, public.employee_advances, public.employees, public.expense_categories, public.expenses, public.item_prices, public.items, public.journal_entries, public.journal_lines, public.ledger_accounts, public.milk_collections, public.ops_actions, public.ops_modules, public.ops_request_keys, public.ops_role_permissions, public.ops_roles, public.ops_staff_invites, public.ops_user_roles, public.order_allocations, public.order_events, public.order_items, public.orders, public.packaging_bom, public.packaging_configs, public.payment_allocations, public.payments, public.payroll_lines, public.payroll_runs, public.posting_errors, public.production_batches, public.products, public.purchase_invoice_lines, public.purchase_invoices, public.quality_parameters, public.recipe_lines, public.recipes, public.stock_lots, public.stock_movements, public.subscription_deliveries, public.subscription_delivery_lines, public.subscription_events, public.subscription_notices, public.subscriptions, public.suppliers, public.units to authenticated;
grant execute on function public.financial_year(date), public.ist_today(), public.touch_updated_at() to anon;
grant execute on function public._ist_date(timestamp with time zone), public._text(jsonb,text), public.cat_activate_recipe(uuid), public.cat_save_item(jsonb), public.cat_save_packaging_config(jsonb,jsonb), public.cat_save_product(jsonb), public.cat_save_quality_parameter(jsonb), public.cat_save_recipe_draft(uuid,numeric,jsonb,integer,text,uuid), public.cat_save_supplier(jsonb), public.cat_set_item_price(uuid,numeric,date,text), public.disp_allocate_order(uuid), public.disp_create_staff_order(jsonb,jsonb,text,integer,text,date,text), public.disp_dispatch_order(uuid,jsonb,text,timestamp with time zone,text,text), public.disp_hold_order(uuid,boolean,text), public.disp_release_allocation(uuid,text), public.disp_set_stage(uuid,text,text), public.disp_update_delivery(uuid,text,text,numeric,text,jsonb,boolean), public.fin_account_ledger(text,date,date), public.fin_cancel_purchase_invoice(uuid,text), public.fin_cash_count(text,numeric,date,text,boolean), public.fin_cash_flow(date,date), public.fin_credit_note(uuid,numeric,text,text,text), public.fin_decide_expense(uuid,boolean,text), public.fin_gst_summary(date,date), public.fin_manual_journal(date,text,jsonb,text), public.fin_money_balances(date), public.fin_pay_supplier(uuid,numeric,date,text,text,text,jsonb,text), public.fin_payables(), public.fin_post_purchase_invoice(jsonb,jsonb,text), public.fin_product_margins(date,date), public.fin_profit_and_loss(date,date), public.fin_receivables(), public.fin_receive_customer_payment(uuid,numeric,date,text,text,text,text), public.fin_reconcile(bigint[],date,text), public.fin_record_expense(date,text,numeric,text,text,text,text,numeric,text,text,text), public.fin_retry_postings(), public.fin_reverse_entry(uuid,text), public.fin_supplier_return(uuid,jsonb,text,text), public.fin_transfer(text,text,numeric,date,text,text), public.fin_trial_balance(date), public.financial_year(date), public.has_permission(text,text), public.inv_adjust_stock(uuid,numeric,text,text,text), public.inv_receive_opening_stock(uuid,numeric,numeric,date,text,text,text), public.inv_reverse_movement(bigint,text), public.inv_set_lot_status(uuid,text,text), public.inv_valuation(), public.ist_today(), public.item_price_on(uuid,date), public.my_permissions(), public.ops_audit_log(date,date,text,text,integer), public.ops_create_role(text,text,text), public.ops_dashboard(date,date), public.ops_invite_staff(text,text[],text), public.ops_log_export(text,integer,jsonb), public.ops_login_history(uuid,integer), public.ops_reset_user_sessions(uuid,text), public.ops_set_role_permissions(text,jsonb,text), public.ops_set_user_active(uuid,boolean,text), public.ops_set_user_roles(uuid,text[],text), public.ops_staff_directory(), public.ops_update_setting(text,jsonb), public.pay_approve_run(uuid), public.pay_create_run(date), public.pay_mark_paid(uuid,date,text,text), public.pay_record_advance(uuid,numeric,date,text,text), public.pay_save_employee(jsonb), public.pay_update_line(uuid,numeric,numeric,numeric,numeric,numeric,text), public.proc_cancel_collection(uuid,text), public.proc_record_collection(uuid,date,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text,text), public.prod_batch_trace(uuid), public.prod_cancel_batch(uuid,text,text), public.prod_close_batch(uuid,text), public.prod_complete_batch(uuid,numeric,numeric,numeric,numeric,numeric,text,jsonb), public.prod_complete_packaging(uuid,numeric,text,text), public.prod_correct_output(uuid,text,numeric,text), public.prod_create_batch(uuid,date,numeric,text,uuid,text,text,text,text,text), public.prod_issue_material(uuid,uuid,numeric,uuid,text,text), public.prod_record_packaging(uuid,uuid,integer,integer,integer,text,date,text,text), public.prod_record_qc(uuid,jsonb,text,text), public.prod_release_batch(uuid), public.prod_return_material(uuid,uuid,numeric,text,text), public.prod_reverse_packaging(uuid,text), public.prod_start_batch(uuid), public.require_permission(text,text), public.setting(text), public.setting_num(text,numeric), public.sub_cancel(uuid,text), public.sub_catalogue(), public.sub_change_address(uuid,jsonb), public.sub_change_quantity(uuid,integer), public.sub_create(jsonb), public.sub_daily_demand(date), public.sub_first_open_date(), public.sub_lock_day(date), public.sub_my_overview(), public.sub_pause(uuid,date,date), public.sub_record_bottles(uuid,integer,integer,integer,uuid,text), public.sub_resume(uuid), public.sub_set_addons(uuid,date,jsonb), public.sub_set_extra(uuid,date,integer), public.sub_skip(uuid,date,text), public.sub_unskip(uuid,date), public.touch_updated_at() to authenticated;
grant execute on function public.financial_year(date), public.ist_today(), public.touch_updated_at() to public;
-- Back to Supabase's normal defaults for new objects.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres grant execute on functions to public;

commit;

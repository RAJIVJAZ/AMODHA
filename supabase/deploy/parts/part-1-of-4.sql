-- Part 1 of 4 of the one-time live update (same content as ../2026-10-10-ops-live-remaining.sql).
-- Run the parts in order in the Supabase SQL Editor. Each part is one transaction: if it fails, nothing in it is applied.

begin;
set local lock_timeout = '15s';

-- ONE-TIME LIVE DEPLOYMENT: completes the business-app database on the live Supabase project.
--
-- The live project already has the first part of 20261010100000_ops_foundation.sql (permission tables,
-- settings) plus its access rules, applied on 10 Oct 2026. This file is everything after that point:
-- the rest of the six 20261010* migrations, in order, minus the access policies that already exist.
-- Fresh environments use supabase/migrations/ instead; do not run this file anywhere else.
--
-- It runs as a single transaction: if any statement fails, nothing is changed.
-- Backup of all existing data: schema backup_20261010 (taken before any change).


-- ===== ops_foundation_part2of3 =====
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

-- ===== ops_foundation_part3of3 =====
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

-- ===== ops_inventory_manufacturing_part1of8 =====
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

-- ===== ops_inventory_manufacturing_part2of8 =====
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

-- ===== ops_inventory_manufacturing_part3of8 =====
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

-- ===== ops_inventory_manufacturing_part4of8 =====
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

-- ===== ops_inventory_manufacturing_part5of8 =====
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

commit;

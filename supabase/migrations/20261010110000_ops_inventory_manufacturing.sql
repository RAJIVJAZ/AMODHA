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

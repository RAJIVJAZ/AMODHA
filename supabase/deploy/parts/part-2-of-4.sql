-- Part 2 of 4 of the one-time live update (same content as ../2026-10-10-ops-live-remaining.sql).
-- Run the parts in order in the Supabase SQL Editor. Each part is one transaction: if it fails, nothing in it is applied.

begin;
set local lock_timeout = '15s';

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

commit;

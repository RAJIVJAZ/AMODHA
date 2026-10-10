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

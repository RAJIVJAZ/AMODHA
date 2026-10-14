-- Part 2 of 6 — B2B wholesale: order workflow and customer master
-- Run in the Supabase SQL Editor, in order (1 → 6). Each part must finish with "Success" before the next.
-- Source: supabase/migrations/20261013100000_b2b_sales_wholesale.sql (lines 1019–2116)

-- Order workflow -------------------------------------------------------------------------------------
-- Quote for the apps' review screen (no writes).
create function public.b2b_quote(p_customer_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  perform public._b2b_require_access(p_customer_id);
  select * into c from public.b2b_customers where id = p_customer_id;
  if c.status not in ('approved', 'suspended') and public._b2b_access(p_customer_id) <> 'staff' then
    raise exception 'Wholesale prices are shown once the customer is approved' using errcode = '42501';
  end if;
  return public._b2b_quote(p_customer_id, p_lines)
    || jsonb_build_object('credit', case when public._b2b_can_see_money(p_customer_id) then public._b2b_credit(p_customer_id) end);
end;
$$;

-- Place a B2B order: from the Wholesale app (the customer), the Sales app (the assigned salesperson)
-- or by staff. Lines: [{item_id, qty}]. The same idempotency key returns the same order, so a double
-- tap or a retried request on a weak connection can never create two orders.
create function public.b2b_place_order(p_customer_id uuid, p_lines jsonb, p_payment_method text default null,
  p_requested_delivery_date date default null, p_notes text default null, p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  sp public.salespeople;
  channel text;
  method text;
  oid uuid := gen_random_uuid();
  existing public.orders;
  q jsonb;
  reasons text[];
  needs_confirmation boolean := false;
  stage text;
  earliest date;
  no text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if p_key is not null and length(p_key) >= 8 then
    select * into existing from public.orders where request_key = p_key;
    if found then
      if public._b2b_access(existing.b2b_customer_id) is null then
        raise exception 'This entry was already saved (duplicate submission ignored)' using errcode = '23505';
      end if;
      return jsonb_build_object('order_id', existing.id, 'order_no', existing.b2b_order_no, 'status', public.b2b_order_status(existing.id),
        'total', existing.total, 'approval_reasons', existing.approval_reasons, 'duplicate', true);
    end if;
  end if;

  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found' using errcode = '42501';
  end if;

  -- Which channel is this?
  if public._b2b_my_customer_id() = c.id then
    channel := 'b2b_app';
  else
    sp := public._b2b_salesperson();
    if sp.id is not null and c.assigned_salesperson = sp.id and public.has_permission('field_sales', 'create') then
      channel := 'sales_rep';
    elsif public.has_permission('b2b_customers', 'view') and public.has_permission('dispatch', 'create') then
      channel := 'staff';
    else
      raise exception 'Customer not found' using errcode = '42501';
    end if;
  end if;

  if c.status = 'suspended' then
    raise exception 'This account is on hold. Please contact Mithai Wallah.' using errcode = '42501';
  end if;
  if c.status <> 'approved' then
    raise exception 'Orders can be placed once the customer is approved (now: %)', c.status using errcode = '42501';
  end if;

  method := coalesce(nullif(p_payment_method, ''), c.payment_terms);
  if method not in ('credit', 'cod', 'advance') then
    raise exception 'Payment must be credit, cash on delivery or advance';
  end if;
  if method = 'credit' and not (c.payment_terms = 'credit' and c.credit_status = 'approved') then
    raise exception 'This customer has no approved credit; choose cash on delivery or advance payment';
  end if;
  if method = 'cod' and c.payment_terms = 'advance' then
    raise exception 'This customer pays in advance';
  end if;

  q := public._b2b_quote(c.id, p_lines);
  earliest := public.ist_today() + public.setting_num('b2b.min_lead_days', 1)::int;
  if p_requested_delivery_date is not null and p_requested_delivery_date < earliest then
    raise exception 'The earliest delivery date we can take is %', to_char(earliest, 'DD Mon YYYY');
  end if;

  needs_confirmation := channel = 'sales_rep' and coalesce((public.setting('b2b.sales_rep_orders_need_confirmation') #>> '{}')::boolean, false);
  stage := case when needs_confirmation then 'awaiting_confirmation' else 'submitted' end;
  no := public.next_doc_number('b2b_order', 'MW-B2B', to_char(public.ist_today(), 'YYYY'), 5);

  insert into public.orders (id, customer_name, phone, email, address, city, pincode, notes, payment_method, payment_status, status,
    subtotal, delivery_fee, discount, total, source, created_by, b2b_customer_id, b2b_order_no, salesperson_id, account_salesperson_id,
    customer_confirmation, requested_delivery_date, request_key, fulfilment_status)
  values (oid, c.shop_name, c.mobile, c.email, coalesce(nullif(c.delivery_address, ''), c.business_address, c.locality, c.city),
    c.city, coalesce(c.pincode, '211001'), nullif(trim(coalesce(p_notes, '')), ''), method,
    case method when 'credit' then 'credit' when 'cod' then 'cod' else 'pending' end, 'received',
    0, 0, 0, 0, channel, auth.uid(), c.id, no, case when channel = 'sales_rep' then sp.id end, c.assigned_salesperson,
    case when needs_confirmation then 'pending' else 'not_required' end, p_requested_delivery_date,
    case when p_key is not null and length(p_key) >= 8 then p_key end, stage);

  q := public._b2b_write_lines(oid, c.id, p_lines);
  reasons := public._b2b_review_reasons(oid, q);
  update public.orders set approval_reasons = reasons where id = oid;

  insert into public.order_events (order_id, status, note) values (oid, stage,
    case channel when 'sales_rep' then 'Placed by ' || sp.full_name || ' (Mithai Wallah Sales)'
      when 'b2b_app' then 'Placed in the Wholesale app' else 'Entered by Mithai Wallah staff' end
    || case when 'stock_shortage' = any (reasons) then ' · some items are pending stock or production' else '' end);
  delete from public.b2b_drafts where customer_id = c.id and user_id = auth.uid();
  perform public.write_audit('order.b2b_create', 'orders', oid::text,
    jsonb_build_object('order_no', no, 'channel', channel, 'customer', c.customer_code, 'lines', q -> 'lines', 'total', q -> 'total',
      'payment', method, 'approval_reasons', reasons));
  return jsonb_build_object('order_id', oid, 'order_no', no, 'status', public.b2b_order_status(oid), 'total', (q ->> 'total')::numeric,
    'approval_reasons', reasons, 'shortages', q -> 'shortages', 'needs_confirmation', needs_confirmation);
end;
$$;

-- Lines of an earlier order, to start a new one. Prices and availability are NOT copied: the app sends
-- these lines through b2b_quote, which prices them today and checks every rule again.
create function public.b2b_reorder_lines(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.b2b_customer_id is null or public._b2b_access(o.b2b_customer_id) is null then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  return jsonb_build_object('customer_id', o.b2b_customer_id, 'lines',
    (select coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'qty', oi.quantity, 'name', oi.product_name) order by oi.product_name), '[]')
     from public.order_items oi where oi.order_id = o.id and oi.item_id is not null));
end;
$$;

-- The shop confirms (or declines) an order a salesperson placed for it. Staff with approval rights can
-- record a confirmation given by phone, with a note saying so.
create function public.b2b_confirm_order(p_order_id uuid, p_confirm boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  a text;
begin
  o := public._order_lock(p_order_id);
  a := public._b2b_access(o.b2b_customer_id);
  if a is null or (a <> 'customer' and not public.has_permission('b2b_customers', 'approve')) then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  if a <> 'customer' and coalesce(trim(p_note), '') = '' then
    raise exception 'Say how the customer confirmed (for example: by phone with the owner)';
  end if;
  if o.customer_confirmation <> 'pending' then
    raise exception 'This order is not waiting for confirmation';
  end if;
  update public.orders set customer_confirmation = case when p_confirm then 'confirmed' else 'rejected' end,
    confirmed_by = auth.uid(), confirmed_at = now(),
    cancel_reason = case when p_confirm then cancel_reason else coalesce(nullif(trim(p_note), ''), 'Declined by the customer') end
  where id = o.id;
  if p_confirm then
    insert into public.order_events (order_id, status, note) values (o.id, 'customer_confirmed', nullif(trim(coalesce(p_note, '')), ''));
    perform public._order_set_fulfilment(o.id, 'submitted', 'Waiting for operations to accept');
  else
    update public.orders set status = 'cancelled' where id = o.id;
    insert into public.order_events (order_id, status, note) values (o.id, 'cancelled', coalesce(nullif(trim(p_note), ''), 'Declined by the customer'));
  end if;
  perform public.write_audit(case when p_confirm then 'order.customer_confirm' else 'order.customer_decline' end, 'orders', o.id::text,
    jsonb_build_object('by', a), p_note);
end;
$$;

-- Operations take the order on: check the approvals it needs, set the delivery date they can meet and
-- reserve stock. Whatever cannot be reserved shows up as pending stock / production.
create function public.b2b_accept_order(p_order_id uuid, p_delivery_date date default null, p_note text default null, p_allocate boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  paid numeric;
  res jsonb := '{}';
begin
  perform public.require_permission('dispatch', 'approve');
  o := public._order_lock(p_order_id);
  if o.b2b_customer_id is null then
    raise exception 'Only B2B orders are accepted here';
  end if;
  if o.fulfilment_status = 'awaiting_confirmation' then
    raise exception 'The customer has not confirmed this order yet';
  end if;
  if o.fulfilment_status <> 'submitted' then
    raise exception 'This order is already %', public._b2b_stage_label(o.fulfilment_status);
  end if;
  if o.on_hold then
    raise exception 'This order is on hold: %', coalesce(o.hold_reason, 'no reason given');
  end if;
  if 'credit_limit' = any (o.approval_reasons) or 'overdue_invoices' = any (o.approval_reasons) then
    -- Going over the credit limit, or ordering with overdue invoices, needs finance approval.
    perform public.require_permission('sales', 'approve');
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Give a reason for approving this order over the credit limit / with overdue invoices';
    end if;
    update public.orders set credit_approved_by = auth.uid(), credit_approved_at = now() where id = o.id;
  end if;
  if 'advance_payment' = any (o.approval_reasons) then
    select coalesce(sum(pa.amount), 0) into paid from public.payment_allocations pa where pa.doc_type = 'order' and pa.doc_id = o.id;
    if paid < o.total then
      raise exception 'Advance payment not received yet: ₹% of ₹% recorded by finance', paid, o.total;
    end if;
  end if;
  if p_delivery_date is not null and p_delivery_date < public.ist_today() then
    raise exception 'The delivery date cannot be in the past';
  end if;
  update public.orders set delivery_date = coalesce(p_delivery_date, requested_delivery_date, delivery_date),
    accepted_by = auth.uid(), accepted_at = now(), ops_manager = coalesce(ops_manager, auth.uid())
  where id = o.id;
  perform public._order_set_fulfilment(o.id, 'confirmed', coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Accepted by operations'));
  if p_allocate then
    res := public.disp_allocate_order(o.id);
    if jsonb_array_length(res -> 'shortages') > 0 then
      insert into public.order_events (order_id, status, note) values (o.id, 'pending_stock', 'Some items will be made or restocked before dispatch');
    end if;
  end if;
  perform public.write_audit('order.b2b_accept', 'orders', o.id::text,
    jsonb_build_object('reasons', o.approval_reasons, 'delivery_date', coalesce(p_delivery_date, o.requested_delivery_date), 'allocation', res), p_note);
  return res;
end;
$$;

-- Controlled amendment. Before fulfilment starts: the salesperson who placed it, or staff. Once stock
-- is reserved or picking has started: operations approval. Never after anything has been dispatched
-- (use a return and credit note). The order goes back to operations to accept again; the original
-- and revised lines, the person, the time and the reason are kept.
create function public.b2b_amend_order(p_order_id uuid, p_lines jsonb, p_reason text, p_requested_delivery_date date default null,
  p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  sp public.salespeople;
  a record;
  before_doc jsonb;
  after_doc jsonb;
  q jsonb;
  reasons text[];
  needs_confirmation boolean;
  stage text;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the change';
  end if;
  o := public._order_lock(p_order_id);
  if o.b2b_customer_id is null then
    raise exception 'Only B2B orders are amended here';
  end if;
  if exists (select 1 from public.order_allocations x where x.order_id = o.id and x.qty_dispatched > 0) then
    raise exception 'Goods have already been dispatched on this order; record a return and credit note instead';
  end if;
  if o.fulfilment_status in ('submitted', 'awaiting_confirmation') then
    sp := public._b2b_salesperson();
    if not (public.has_permission('b2b_customers', 'edit') or public.has_permission('dispatch', 'edit')
            or coalesce(sp.id is not null and o.salesperson_id = sp.id and public.has_permission('field_sales', 'create'), false)) then
      raise exception 'You cannot change this order' using errcode = '42501';
    end if;
  elsif o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch') then
    perform public.require_permission('dispatch', 'approve');
  else
    raise exception 'This order is % and can no longer be changed', public._b2b_stage_label(o.fulfilment_status);
  end if;

  select jsonb_build_object('total', o.total, 'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
    'requested_delivery_date', o.requested_delivery_date, 'notes', o.notes,
    'lines', coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'name', oi.product_name, 'qty', oi.quantity, 'unit_price', oi.unit_price) order by oi.product_name), '[]'))
  into before_doc from public.order_items oi where oi.order_id = o.id;

  -- Free any stock reserved for the old lines.
  for a in select * from public.order_allocations x where x.order_id = o.id and x.qty - x.qty_dispatched - x.qty_released > 0 for update loop
    update public.stock_lots set qty_reserved = qty_reserved - (a.qty - a.qty_dispatched - a.qty_released) where id = a.lot_id;
    update public.order_allocations set qty_released = qty - qty_dispatched where id = a.id;
  end loop;
  delete from public.order_items where order_id = o.id;

  q := public._b2b_write_lines(o.id, o.b2b_customer_id, p_lines);
  update public.orders set requested_delivery_date = coalesce(p_requested_delivery_date, requested_delivery_date),
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes), amendment_count = amendment_count + 1,
    accepted_at = null, accepted_by = null, credit_approved_at = null, credit_approved_by = null
  where id = o.id;
  reasons := public._b2b_review_reasons(o.id, q);
  needs_confirmation := o.source = 'sales_rep' and coalesce((public.setting('b2b.sales_rep_orders_need_confirmation') #>> '{}')::boolean, false)
    and public._b2b_access(o.b2b_customer_id) <> 'customer';
  stage := case when needs_confirmation then 'awaiting_confirmation' else 'submitted' end;
  update public.orders set approval_reasons = reasons, customer_confirmation = case when needs_confirmation then 'pending' else customer_confirmation end
  where id = o.id;

  select jsonb_build_object('total', total, 'subtotal', subtotal, 'delivery_fee', delivery_fee, 'requested_delivery_date', requested_delivery_date, 'notes', notes,
    'lines', q -> 'lines') into after_doc from public.orders where id = o.id;
  insert into public.order_amendments (order_id, amendment_no, reason, before, after) values (o.id, o.amendment_count + 1, trim(p_reason), before_doc, after_doc);
  insert into public.order_events (order_id, status, note) values (o.id, 'amended', trim(p_reason));
  perform public._order_set_fulfilment(o.id, stage, 'Back with operations after the change');
  perform public.write_audit('order.b2b_amend', 'orders', o.id::text, jsonb_build_object('before', before_doc, 'after', after_doc), p_reason);
  return jsonb_build_object('order_id', o.id, 'total', (q ->> 'total')::numeric, 'approval_reasons', reasons, 'status', public.b2b_order_status(o.id));
end;
$$;

-- Cancel. Customers and their salesperson can cancel until operations accept the order; after that it
-- needs operations approval, and never once goods are dispatched (returns and credit notes then).
-- Reserved stock is released by the existing cancellation trigger.
create function public.b2b_cancel_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  a text;
  sp public.salespeople;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  o := public._order_lock(p_order_id);
  a := public._b2b_access(o.b2b_customer_id);
  if o.b2b_customer_id is null or a is null then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  if o.fulfilment_status in ('cancelled', 'delivered', 'returned') then
    raise exception 'This order is already %', public._b2b_stage_label(o.fulfilment_status);
  end if;
  if exists (select 1 from public.order_allocations x where x.order_id = o.id and x.qty_dispatched > 0) then
    raise exception 'Goods have already been dispatched; record a return and credit note instead';
  end if;
  if o.fulfilment_status in ('submitted', 'awaiting_confirmation') then
    sp := public._b2b_salesperson();
    if not (a = 'customer' or public.has_permission('b2b_customers', 'edit') or public.has_permission('dispatch', 'approve')
            or coalesce(sp.id is not null and o.salesperson_id = sp.id, false)) then
      raise exception 'You cannot cancel this order' using errcode = '42501';
    end if;
  else
    perform public.require_permission('dispatch', 'approve');
  end if;
  update public.orders set status = 'cancelled', cancel_reason = trim(p_reason) where id = o.id;
  insert into public.order_events (order_id, status, note) values (o.id, 'cancelled', trim(p_reason));
  perform public.write_audit('order.b2b_cancel', 'orders', o.id::text, jsonb_build_object('by', a, 'stage', o.fulfilment_status), p_reason);
end;
$$;

-- Priority and the operations manager responsible (any order).
create function public.ops_set_order_priority(p_order_id uuid, p_priority text, p_manager uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('dispatch', 'approve');
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Unknown priority';
  end if;
  if p_manager is not null and not public.exists_staff(p_manager) then
    raise exception 'Choose a staff member';
  end if;
  perform public._order_lock(p_order_id);
  update public.orders set priority = p_priority, ops_manager = coalesce(p_manager, ops_manager) where id = p_order_id;
  perform public.write_audit('order.priority', 'orders', p_order_id::text, jsonb_build_object('priority', p_priority, 'manager', p_manager));
end;
$$;

create function public.exists_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.ops_active
    and (p.is_admin or exists (select 1 from public.ops_user_roles r where r.user_id = p.id)))
$$;

-- Packing: record what was actually packed. Any difference from what was to be picked needs a
-- documented exception. Moves the order to 'packed'.
create function public.ops_record_packing(p_order_id uuid, p_lines jsonb, p_exception_reason text default null, p_checklist jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  f record;
  packed numeric;
  differs boolean := false;
  n integer := 0;
begin
  perform public.require_permission('dispatch', 'edit');
  o := public._order_lock(p_order_id);
  if o.fulfilment_status not in ('processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched') then
    raise exception 'Reserve stock before packing (the order is %)', replace(o.fulfilment_status, '_', ' ');
  end if;
  for f in select * from public.v_order_line_fulfilment where order_id = o.id loop
    select (e ->> 'qty_packed')::numeric into packed from jsonb_array_elements(coalesce(p_lines, '[]')) e
    where (e ->> 'order_item_id')::uuid = f.order_item_id;
    continue when packed is null;
    if packed < 0 then
      raise exception 'Packed quantity cannot be negative';
    end if;
    if packed > f.reserved then
      raise exception '% %: only % reserved, so % cannot be packed', f.product_name, f.pack_label, f.reserved, packed using errcode = '23514';
    end if;
    if packed <> f.reserved or f.reserved + f.dispatched <> f.ordered then
      differs := true;
    end if;
    insert into public.order_packing (order_id, order_item_id, product, qty_ordered, qty_to_pick, qty_packed, exception_reason, checklist)
    values (o.id, f.order_item_id, f.product_name || ' ' || f.pack_label, f.ordered, f.reserved, packed, nullif(trim(coalesce(p_exception_reason, '')), ''), p_checklist);
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'Enter the packed quantities';
  end if;
  if differs and coalesce(trim(p_exception_reason), '') = '' then
    raise exception 'Packed quantities differ from the order: record the exception (what is short and why)';
  end if;
  perform public._order_set_fulfilment(o.id, 'packed', case when differs then 'Packed with exception: ' || trim(p_exception_reason) else 'Packed and checked' end);
  perform public.write_audit('order.packed', 'orders', o.id::text, jsonb_build_object('lines', p_lines, 'checklist', p_checklist), p_exception_reason);
end;
$$;

-- Customer master -------------------------------------------------------------------------------------
-- Possible duplicates of a new customer: same mobile / WhatsApp / GSTIN, or the same shop name in the
-- same city. Only the code, name, area and status are shown, so a salesperson can pick the right record.
create function public.b2b_find_matches(p_mobile text, p_gstin text default null, p_shop_name text default null, p_city text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text := public._b2b_clean_phone(p_mobile);
  g text := upper(nullif(trim(coalesce(p_gstin, '')), ''));
  n text := lower(regexp_replace(trim(coalesce(p_shop_name, '')), '\s+', ' ', 'g'));
  sp public.salespeople := public._b2b_salesperson();
begin
  if not (public.has_permission('b2b_customers', 'view') or sp.id is not null) then
    raise exception 'You do not have permission to search customers' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'customer_code', c.customer_code, 'shop_name', c.shop_name, 'locality', c.locality, 'city', c.city, 'status', c.status,
      'match', case when m is not null and (c.mobile = m or c.whatsapp = m) then 'mobile' when g is not null and c.gstin = g then 'gstin' else 'name' end,
      'mine', sp.id is not null and c.assigned_salesperson = sp.id) order by c.shop_name), '[]')
    from public.b2b_customers c
    where c.status <> 'rejected'
      and ((m is not null and (c.mobile = m or c.whatsapp = m))
        or (g is not null and c.gstin = g)
        or (length(n) > 2 and lower(regexp_replace(trim(c.shop_name), '\s+', ' ', 'g')) = n and lower(c.city) = lower(coalesce(nullif(trim(p_city), ''), c.city)))));
end;
$$;

-- The salesperson whose territory covers this city / locality (for self-registered shops).
create function public._b2b_territory_salesperson(p_city text, p_locality text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.salespeople s
  join public.sales_territories t on t.code = any (s.territories) and t.is_active
  where s.is_active and lower(t.city) = lower(coalesce(p_city, ''))
    and (cardinality(t.localities) = 0 or lower(coalesce(p_locality, '')) = any (select lower(x) from unnest(t.localities) x))
  order by cardinality(t.localities) desc, s.created_at
  limit 1
$$;

create function public._b2b_customer_from_json(p jsonb, c inout public.b2b_customers, p_full boolean)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p ? 'shop_name' then c.shop_name := nullif(trim(p ->> 'shop_name'), ''); end if;
  if p ? 'owner_name' then c.owner_name := nullif(trim(p ->> 'owner_name'), ''); end if;
  if p ? 'whatsapp' then c.whatsapp := public._b2b_clean_phone(p ->> 'whatsapp'); end if;
  if p ? 'email' then c.email := lower(nullif(trim(p ->> 'email'), '')); end if;
  if p ? 'alternate_contact' then c.alternate_contact := nullif(trim(p ->> 'alternate_contact'), ''); end if;
  if p ? 'business_address' then c.business_address := nullif(trim(p ->> 'business_address'), ''); end if;
  if p ? 'delivery_address' then c.delivery_address := nullif(trim(p ->> 'delivery_address'), ''); end if;
  if p ? 'locality' then c.locality := nullif(trim(p ->> 'locality'), ''); end if;
  if p ? 'city' then c.city := coalesce(nullif(trim(p ->> 'city'), ''), 'Prayagraj'); end if;
  if p ? 'pincode' then c.pincode := nullif(trim(p ->> 'pincode'), ''); end if;
  if p ? 'customer_type' then c.customer_type := coalesce(nullif(p ->> 'customer_type', ''), 'sweet_shop'); end if;
  if p ? 'expected_monthly_value' then c.expected_monthly_value := nullif(p ->> 'expected_monthly_value', '')::numeric; end if;
  if p ? 'preferred_products' then c.preferred_products := nullif(trim(p ->> 'preferred_products'), ''); end if;
  if p ? 'business_notes' then c.business_notes := nullif(trim(p ->> 'business_notes'), ''); end if;
  if p ? 'photo_url' then c.photo_url := nullif(trim(p ->> 'photo_url'), ''); end if;
  if p ? 'preferred_channel' then c.preferred_channel := coalesce(nullif(p ->> 'preferred_channel', ''), 'phone'); end if;
  if p_full then
    if p ? 'mobile' then c.mobile := public._b2b_clean_phone(p ->> 'mobile'); end if;
    if p ? 'gstin' then c.gstin := upper(nullif(trim(p ->> 'gstin'), '')); end if;
  end if;
end;
$$;

create function public._b2b_check_required(c public.b2b_customers)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f text;
  v jsonb := to_jsonb(c);
  labels jsonb := '{"shop_name": "shop name", "owner_name": "owner or contact name", "mobile": "10-digit mobile number", "business_address": "business address",
    "delivery_address": "delivery address", "city": "city", "locality": "locality", "customer_type": "customer type",
    "expected_monthly_value": "expected monthly purchase", "gstin": "GSTIN", "email": "email", "pincode": "pincode", "whatsapp": "WhatsApp number"}';
begin
  for f in select jsonb_array_elements_text(coalesce(public.setting('b2b.required_fields'), '[]')) union select unnest(array['shop_name', 'owner_name', 'mobile']) loop
    if coalesce(v ->> f, '') = '' then
      raise exception 'Enter the %', coalesce(labels ->> f, replace(f, '_', ' '));
    end if;
  end loop;
end;
$$;

-- Which fields the "add customer" forms must ask for (administrator's setting).
create function public.b2b_required_fields()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.setting('b2b.required_fields'), '[]'::jsonb)
$$;

-- ADD NEW B2B CUSTOMER (salesperson or staff). Always starts as a lead: no wholesale prices, credit or
-- app access until approved. Exact mobile / GSTIN matches are refused (use the existing record); a
-- same-name shop in the same city must be confirmed as a different business.
create function public.b2b_create_customer(p jsonb, p_confirm_not_duplicate boolean default false, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  sp public.salespeople := public._b2b_salesperson();
  dup jsonb;
  d jsonb;
begin
  if not (public.has_permission('b2b_customers', 'create') or (sp.id is not null and public.has_permission('field_sales', 'create'))) then
    raise exception 'You do not have permission to add customers' using errcode = '42501';
  end if;
  perform public._claim_request_key(p_key, 'b2b_create_customer');
  c.id := gen_random_uuid();
  c.city := 'Prayagraj';
  c.customer_type := 'sweet_shop';
  c.preferred_channel := 'phone';
  c := public._b2b_customer_from_json(p, c, true);
  if c.mobile is null or c.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  if c.gstin is not null and c.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN does not look right (15 characters, e.g. 09ABCDE1234F1Z5)';
  end if;
  perform public._b2b_check_required(c);

  dup := public.b2b_find_matches(c.mobile, c.gstin, c.shop_name, c.city);
  for d in select * from jsonb_array_elements(dup) loop
    if d ->> 'match' in ('mobile', 'gstin') then
      raise exception 'This shop is already a customer: % % (%, %). Use that record instead of adding a new one.',
        d ->> 'customer_code', d ->> 'shop_name', coalesce(d ->> 'locality', d ->> 'city'), d ->> 'status' using errcode = '23505';
    end if;
  end loop;
  if jsonb_array_length(dup) > 0 and not coalesce(p_confirm_not_duplicate, false) then
    raise exception 'A shop called "%" already exists in % (%). If this is a different business, confirm and save again.',
      dup -> 0 ->> 'shop_name', dup -> 0 ->> 'city', dup -> 0 ->> 'customer_code' using errcode = '23505';
  end if;

  c.customer_code := public.next_doc_number('b2b_customer', 'MW', 'C', 5);
  c.status := 'lead';
  c.source := case when sp.id is not null and not public.has_permission('b2b_customers', 'create') then 'sales_rep'
                   when p ->> 'source' = 'import' then 'import' when sp.id is not null then 'sales_rep' else 'admin' end;
  c.acquired_by := sp.id;
  c.assigned_salesperson := case when public.has_permission('b2b_customers', 'edit') and nullif(p ->> 'assigned_salesperson', '') is not null
    then (p ->> 'assigned_salesperson')::uuid else sp.id end;
  c.acquired_at := now();
  c.created_by := auth.uid();
  c.created_at := now();
  c.updated_at := now();
  c.price_category := 'standard';
  c.payment_terms := 'cod';
  c.credit_days := 0;
  c.credit_limit := 0;
  c.credit_status := 'none';
  c.mobile_verified := false;
  c.marketing_consent := false;
  c.consent_channels := '{}';
  c.callback_requested := false;
  insert into public.b2b_customers select c.*;
  perform public.write_audit('b2b_customer.create', 'b2b_customers', c.id::text,
    jsonb_build_object('code', c.customer_code, 'shop', c.shop_name, 'mobile', c.mobile, 'by_salesperson', sp.id, 'possible_duplicates', dup));
  return c.id;
end;
$$;

-- Self-registration from the Wholesale app (the person has already verified their phone or email with
-- a one-time code). An existing customer is never duplicated or opened: the request to link to it waits
-- for staff to check it.
create function public.b2b_register(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  dup jsonb;
  u record;
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if exists (select 1 from public.b2b_customer_users where user_id = auth.uid() and status in ('pending', 'active')) then
    raise exception 'You have already registered; we will be in touch';
  end if;
  if (select count(*) from public.audit_log where actor = auth.uid() and action like 'b2b_customer.register%' and at > now() - interval '1 day') >= 3 then
    raise exception 'Too many registration attempts today. Please call us.' using errcode = '54000';
  end if;
  c.id := gen_random_uuid();
  c.city := 'Prayagraj';
  c.customer_type := 'sweet_shop';
  c.preferred_channel := 'phone';
  c := public._b2b_customer_from_json(p, c, true);
  if c.mobile is null or c.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  if c.gstin is not null and c.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN does not look right (15 characters, e.g. 09ABCDE1234F1Z5)';
  end if;
  if coalesce(c.business_address, '') = '' or coalesce(c.locality, '') = '' then
    raise exception 'Enter your business address and locality';
  end if;
  perform public._b2b_check_required(c);
  select u2.phone, u2.phone_confirmed_at, u2.email into u from auth.users u2 where u2.id = auth.uid();

  select coalesce(jsonb_agg(x), '[]') into dup from jsonb_array_elements(
    (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'match', case when b.mobile = c.mobile or b.whatsapp = c.mobile then 'mobile' else 'gstin' end)), '[]')
     from public.b2b_customers b where b.status <> 'rejected' and (b.mobile = c.mobile or b.whatsapp = c.mobile or (c.gstin is not null and b.gstin = c.gstin)))) x;
  if jsonb_array_length(dup) > 0 then
    insert into public.b2b_customer_users (user_id, customer_id, status, request_note)
    values (auth.uid(), (dup -> 0 ->> 'id')::uuid, 'pending',
      'Registered as ' || c.shop_name || ' / ' || c.owner_name || ', mobile ' || c.mobile || ' — matches an existing customer by ' || (dup -> 0 ->> 'match') || '; check before giving access');
    perform public.write_audit('b2b_customer.register_link_request', 'b2b_customers', dup -> 0 ->> 'id', jsonb_build_object('mobile', c.mobile, 'shop', c.shop_name));
    return jsonb_build_object('status', 'link_requested');
  end if;

  c.customer_code := public.next_doc_number('b2b_customer', 'MW', 'C', 5);
  c.status := 'lead';
  c.source := 'self_registration';
  c.mobile_verified := u.phone_confirmed_at is not null and public._b2b_clean_phone(u.phone) = c.mobile;
  c.email := coalesce(c.email, lower(u.email));
  c.assigned_salesperson := public._b2b_territory_salesperson(c.city, c.locality);
  c.acquired_at := now();
  c.created_by := auth.uid();
  c.created_at := now();
  c.updated_at := now();
  c.price_category := 'standard';
  c.payment_terms := 'cod';
  c.credit_days := 0;
  c.credit_limit := 0;
  c.credit_status := 'none';
  -- The shop may tick "send me offers" while registering; nothing is assumed otherwise.
  c.consent_channels := case when jsonb_typeof(p -> 'consent_channels') = 'array'
    then array(select x from jsonb_array_elements_text(p -> 'consent_channels') x where x in ('whatsapp', 'sms', 'email')) else '{}' end;
  c.marketing_consent := cardinality(c.consent_channels) > 0;
  c.consent_source := case when c.marketing_consent then 'wholesale_registration' end;
  c.consent_at := case when c.marketing_consent then now() end;
  c.callback_requested := false;
  insert into public.b2b_customers select c.*;
  if c.marketing_consent then
    insert into public.b2b_consent_log (customer_id, consent, channels, source) values (c.id, true, c.consent_channels, 'wholesale_registration');
  end if;
  insert into public.b2b_customer_users (user_id, customer_id, status) values (auth.uid(), c.id, 'pending');
  perform public.write_audit('b2b_customer.register', 'b2b_customers', c.id::text, jsonb_build_object('code', c.customer_code, 'shop', c.shop_name, 'mobile', c.mobile));
  return jsonb_build_object('status', 'pending_approval', 'customer_code', c.customer_code);
end;
$$;

-- Approve or reject a lead. Approval opens the Wholesale app to the people who registered it.
create function public.b2b_decide_customer(p_customer_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  perform public.require_permission('b2b_customers', 'approve');
  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if c.status <> 'lead' then
    raise exception 'Only leads waiting for approval can be decided (this customer is %)', c.status;
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for rejecting';
  end if;
  update public.b2b_customers set status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = auth.uid(), approved_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = c.id;
  -- People who registered this business themselves get access with the approval.
  update public.b2b_customer_users set status = case when p_approve then 'active' else 'revoked' end, decided_by = auth.uid(), decided_at = now()
  where customer_id = c.id and status = 'pending' and request_note is null;
  insert into public.b2b_notifications (customer_id, title, body)
  values (c.id, case when p_approve then 'Your wholesale account is approved' else 'Your wholesale registration was not approved' end, p_note);
  perform public.write_audit(case when p_approve then 'b2b_customer.approve' else 'b2b_customer.reject' end, 'b2b_customers', c.id::text,
    jsonb_build_object('code', c.customer_code), p_note);
end;
$$;

-- Contact and profile details. Salespeople can update the shops assigned to them, but not the
-- verified mobile number or GSTIN.
create function public.b2b_update_customer(p_customer_id uuid, p jsonb, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  before_row jsonb;
  a text := public._b2b_require_access(p_customer_id);
  full_edit boolean := public.has_permission('b2b_customers', 'edit');
  dup jsonb;
begin
  if not (full_edit or (a = 'salesperson' and public.has_permission('field_sales', 'create'))) then
    raise exception 'You cannot change this customer' using errcode = '42501';
  end if;
  select * into c from public.b2b_customers where id = p_customer_id for update;
  before_row := to_jsonb(c);
  c := public._b2b_customer_from_json(p, c, full_edit);
  if c.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  if c.gstin is not null and c.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN does not look right';
  end if;
  if c.mobile is distinct from before_row ->> 'mobile' or c.gstin is distinct from before_row ->> 'gstin' then
    select coalesce(jsonb_agg(x), '[]') into dup from jsonb_array_elements(public.b2b_find_matches(c.mobile, c.gstin)) x where (x ->> 'id')::uuid <> c.id;
    if jsonb_array_length(dup) > 0 then
      raise exception 'That mobile number or GSTIN belongs to % %', dup -> 0 ->> 'customer_code', dup -> 0 ->> 'shop_name' using errcode = '23505';
    end if;
    if c.mobile is distinct from before_row ->> 'mobile' then
      c.mobile_verified := false;
    end if;
  end if;
  if p ? 'next_follow_up' then
    c.next_follow_up := nullif(p ->> 'next_follow_up', '')::date;
  end if;
  update public.b2b_customers set shop_name = c.shop_name, owner_name = c.owner_name, mobile = c.mobile, mobile_verified = c.mobile_verified,
    whatsapp = c.whatsapp, email = c.email, alternate_contact = c.alternate_contact, business_address = c.business_address,
    delivery_address = c.delivery_address, locality = c.locality, city = c.city, pincode = c.pincode, gstin = c.gstin,
    customer_type = c.customer_type, expected_monthly_value = c.expected_monthly_value, preferred_products = c.preferred_products,
    business_notes = c.business_notes, photo_url = c.photo_url, preferred_channel = c.preferred_channel, next_follow_up = c.next_follow_up
  where id = c.id;
  perform public.write_audit('b2b_customer.update', 'b2b_customers', c.id::text,
    jsonb_build_object('from', before_row - 'updated_at', 'to', to_jsonb(c) - 'updated_at'), p_reason);
end;
$$;

-- Commercial terms. Price category: pricing or customer approvers. Payment terms, credit limit and
-- credit status: finance approvers only (salespeople can never raise a credit limit).
create function public.b2b_set_terms(p_customer_id uuid, p jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if p ? 'price_category' and p ->> 'price_category' is distinct from c.price_category then
    if not (public.has_permission('pricing', 'approve') or public.has_permission('b2b_customers', 'approve')) then
      raise exception 'You do not have permission to change price categories' using errcode = '42501';
    end if;
    if not exists (select 1 from public.price_categories where code = p ->> 'price_category' and is_active) then
      raise exception 'Unknown price category';
    end if;
    update public.b2b_customers set price_category = p ->> 'price_category' where id = c.id;
  end if;
  if p ?| array['payment_terms', 'credit_days', 'credit_limit', 'credit_status'] then
    perform public.require_permission('sales', 'approve');
    update public.b2b_customers set
      payment_terms = coalesce(nullif(p ->> 'payment_terms', ''), payment_terms),
      credit_days = coalesce(nullif(p ->> 'credit_days', '')::int, credit_days),
      credit_limit = coalesce(nullif(p ->> 'credit_limit', '')::numeric, credit_limit),
      credit_status = coalesce(nullif(p ->> 'credit_status', ''), credit_status),
      credit_approved_by = auth.uid(), credit_approved_at = now()
    where id = c.id;
    if exists (select 1 from public.b2b_customers where id = c.id and payment_terms = 'credit' and credit_status = 'approved' and credit_limit <= 0) then
      raise exception 'Set a credit limit above zero for a credit customer';
    end if;
  end if;
  perform public.write_audit('b2b_customer.terms', 'b2b_customers', c.id::text,
    jsonb_build_object('from', jsonb_build_object('price_category', c.price_category, 'payment_terms', c.payment_terms, 'credit_days', c.credit_days,
      'credit_limit', c.credit_limit, 'credit_status', c.credit_status), 'to', p), p_reason);
end;
$$;

-- Suspend, reactivate or mark inactive.
create function public.b2b_set_status(p_customer_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  perform public.require_permission('b2b_customers', 'approve');
  if p_status not in ('approved', 'suspended', 'inactive') then
    raise exception 'Status must be approved (active), suspended or inactive';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found or c.status in ('lead', 'rejected') then
    raise exception 'Approve the customer first';
  end if;
  update public.b2b_customers set status = p_status where id = c.id;
  perform public.write_audit('b2b_customer.status', 'b2b_customers', c.id::text, jsonb_build_object('from', c.status, 'to', p_status), p_reason);
end;
$$;

create function public.b2b_assign_customers(p_customer_ids uuid[], p_salesperson_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not (public.has_permission('b2b_customers', 'edit') or public.has_permission('sales_team', 'edit')) then
    raise exception 'You do not have permission to assign customers' using errcode = '42501';
  end if;
  if p_salesperson_id is not null and not exists (select 1 from public.salespeople where id = p_salesperson_id and is_active) then
    raise exception 'Choose an active salesperson';
  end if;
  perform public.write_audit('b2b_customer.assign', 'b2b_customers', c.id::text,
    jsonb_build_object('from', c.assigned_salesperson, 'to', p_salesperson_id), p_reason)
  from public.b2b_customers c where c.id = any (p_customer_ids) and c.assigned_salesperson is distinct from p_salesperson_id;
  update public.b2b_customers set assigned_salesperson = p_salesperson_id where id = any (p_customer_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- App logins ---------------------------------------------------------------------------------------
create function public.b2b_grant_login(p_customer_id uuid, p_contact text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  contact text := lower(trim(coalesce(p_contact, '')));
  v_phone text;
  uid uuid;
begin
  perform public.require_permission('b2b_customers', 'approve');
  select * into c from public.b2b_customers where id = p_customer_id;
  if not found or c.status not in ('approved', 'suspended') then
    raise exception 'Approve the customer before giving app access';
  end if;
  if contact !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    v_phone := public._b2b_clean_phone(contact);
    if v_phone is null or v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Enter an email address or a 10-digit mobile number';
    end if;
    contact := v_phone;
    select id into uid from public.profiles where phone = v_phone limit 1;
  else
    select id into uid from public.profiles where email = contact limit 1;
  end if;
  if uid is not null then
    if exists (select 1 from public.b2b_customer_users where user_id = uid and customer_id <> c.id and status in ('pending', 'active')) then
      raise exception 'That person already uses the app for another customer';
    end if;
    insert into public.b2b_customer_users (user_id, customer_id, status, decided_by, decided_at)
    values (uid, c.id, 'active', auth.uid(), now())
    on conflict (user_id, customer_id) do update set status = 'active', decided_by = auth.uid(), decided_at = now();
    perform public.write_audit('b2b_login.grant', 'b2b_customers', c.id::text, jsonb_build_object('user', uid, 'contact', contact));
    return 'granted';
  end if;
  insert into public.b2b_login_invites (contact, customer_id) values (contact, c.id)
  on conflict (contact) do update set customer_id = excluded.customer_id, invited_by = auth.uid(), invited_at = now(), accepted_at = null;
  perform public.write_audit('b2b_login.invite', 'b2b_customers', c.id::text, jsonb_build_object('contact', contact));
  return 'invited';
end;
$$;

create function public.b2b_decide_login(p_user_id uuid, p_customer_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('b2b_customers', 'approve');
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason';
  end if;
  if p_approve and not exists (select 1 from public.b2b_customers where id = p_customer_id and status in ('approved', 'suspended')) then
    raise exception 'Approve the customer before giving app access';
  end if;
  update public.b2b_customer_users set status = case when p_approve then 'active' else 'revoked' end, decided_by = auth.uid(), decided_at = now()
  where user_id = p_user_id and customer_id = p_customer_id and status <> case when p_approve then 'active' else 'revoked' end;
  if not found then
    raise exception 'No such login request';
  end if;
  perform public.write_audit(case when p_approve then 'b2b_login.approve' else 'b2b_login.revoke' end, 'b2b_customers', p_customer_id::text,
    jsonb_build_object('user', p_user_id), p_note);
end;
$$;

-- CRM ----------------------------------------------------------------------------------------------
-- Visits, calls, notes, complaints. Sets the next follow-up date shown in the reminders.
create function public.b2b_log_activity(p_customer_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  sp public.salespeople := public._b2b_salesperson();
  aid uuid;
  kind text := coalesce(nullif(p ->> 'kind', ''), 'visit');
  fu date := nullif(p ->> 'follow_up_date', '')::date;
begin
  if not (public.has_permission('b2b_customers', 'edit') or (a = 'salesperson' and public.has_permission('field_sales', 'create'))
          or (a = 'staff' and public.has_permission('field_sales', 'create'))) then
    raise exception 'You cannot record activity for this customer' using errcode = '42501';
  end if;
  if fu is not null and fu < public.ist_today() then
    raise exception 'The follow-up date cannot be in the past';
  end if;
  if coalesce(p ->> 'latitude', '') <> '' and not coalesce((p ->> 'location_consent')::boolean, false) then
    raise exception 'Location is only saved when you choose to add it';
  end if;
  insert into public.b2b_activities (customer_id, salesperson_id, kind, occurred_at, outcome, products_discussed, requirements, sample_request,
    price_enquiry, opportunity_value, objections, next_action, follow_up_date, notes, latitude, longitude)
  values (p_customer_id, sp.id, kind, coalesce(nullif(p ->> 'occurred_at', '')::timestamptz, now()), nullif(p ->> 'outcome', ''),
    nullif(trim(coalesce(p ->> 'products_discussed', '')), ''), nullif(trim(coalesce(p ->> 'requirements', '')), ''),
    nullif(trim(coalesce(p ->> 'sample_request', '')), ''), nullif(trim(coalesce(p ->> 'price_enquiry', '')), ''),
    nullif(p ->> 'opportunity_value', '')::numeric, nullif(trim(coalesce(p ->> 'objections', '')), ''),
    nullif(trim(coalesce(p ->> 'next_action', '')), ''), fu, nullif(trim(coalesce(p ->> 'notes', '')), ''),
    nullif(p ->> 'latitude', '')::numeric, nullif(p ->> 'longitude', '')::numeric)
  returning id into aid;
  update public.b2b_customers set
    next_follow_up = case when fu is not null then fu when coalesce((p ->> 'clear_follow_up')::boolean, false) then null else next_follow_up end,
    last_visit_at = case when kind = 'visit' then now() else last_visit_at end,
    callback_requested = case when kind = 'callback_request' then true when kind in ('call', 'visit') then false else callback_requested end
  where id = p_customer_id;
  return aid;
end;
$$;

-- Marketing consent: recorded only from the customer or with a stated source; opt-out always wins.
create function public.b2b_record_consent(p_customer_id uuid, p_consent boolean, p_channels text[] default null, p_source text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  src text;
  chans text[] := coalesce(p_channels, '{}');
begin
  if a = 'customer' then
    src := 'wholesale_app';
  else
    if not (public.has_permission('marketing', 'create') or public.has_permission('b2b_customers', 'edit') or a = 'salesperson') then
      raise exception 'You cannot record consent for this customer' using errcode = '42501';
    end if;
    src := nullif(trim(coalesce(p_source, '')), '');
    if src is null then
      raise exception 'Say how the customer gave or withdrew consent (e.g. "asked at visit, 12 Oct", "WhatsApp STOP reply")';
    end if;
  end if;
  if exists (select 1 from unnest(chans) x where x not in ('whatsapp', 'sms', 'email')) then
    raise exception 'Channels are whatsapp, sms and email';
  end if;
  if p_consent and cardinality(chans) = 0 then
    raise exception 'Choose at least one channel the customer agreed to';
  end if;
  update public.b2b_customers set marketing_consent = p_consent, consent_channels = case when p_consent then chans else '{}' end,
    consent_source = src, consent_at = now(), opted_out_at = case when p_consent then null else now() end
  where id = p_customer_id;
  insert into public.b2b_consent_log (customer_id, consent, channels, source, note) values (p_customer_id, p_consent, case when p_consent then chans else '{}' end, src, p_note);
  -- An opt-out also takes the customer off every campaign not sent yet.
  if not p_consent then
    update public.marketing_recipients r set status = 'skipped_opted_out'
    from public.marketing_campaigns mc where mc.id = r.campaign_id and r.customer_id = p_customer_id and r.status = 'queued' and mc.status <> 'sent';
  end if;
  perform public.write_audit(case when p_consent then 'consent.given' else 'consent.withdrawn' end, 'b2b_customers', p_customer_id::text,
    jsonb_build_object('channels', chans, 'source', src), p_note);
end;
$$;

-- Quick-order drafts ---------------------------------------------------------------------------------
create function public.b2b_save_draft(p_customer_id uuid, p_lines jsonb, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._b2b_require_access(p_customer_id);
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]')) > 200 then
    raise exception 'A draft can hold up to 200 lines';
  end if;
  insert into public.b2b_drafts (customer_id, user_id, lines, notes, updated_at)
  values (p_customer_id, auth.uid(),
    (select coalesce(jsonb_agg(jsonb_build_object('item_id', e ->> 'item_id', 'qty', (e ->> 'qty')::numeric)), '[]') from jsonb_array_elements(coalesce(p_lines, '[]')) e
     where coalesce(e ->> 'item_id', '') <> ''), nullif(trim(coalesce(p_notes, '')), ''), now())
  on conflict (customer_id, user_id) do update set lines = excluded.lines, notes = excluded.notes, updated_at = now();
end;
$$;

create function public.b2b_get_draft(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._b2b_require_access(p_customer_id);
  return (select jsonb_build_object('lines', d.lines, 'notes', d.notes, 'updated_at', d.updated_at)
          from public.b2b_drafts d where d.customer_id = p_customer_id and d.user_id = auth.uid());
end;
$$;

create function public.b2b_mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.b2b_notifications set status = 'read', read_at = now()
  where customer_id = public._b2b_my_customer_id() and channel = 'in_app' and status = 'unread'
$$;


-- Part 4 of 6 — B2B wholesale: operations, finance, reports, marketing, access rules
-- Run in the Supabase SQL Editor, in order (1 → 6). Each part must finish with "Success" before the next.
-- Source: supabase/migrations/20261013100000_b2b_sales_wholesale.sql (lines 2927–end)

-- Operations --------------------------------------------------------------------------------------------
-- B2B AND RETAIL ORDER OPERATIONS: one queue for every order, whatever its source.
create function public.ops_order_queue(p_filter text default 'action', p_search text default null, p_from date default null, p_to date default null,
  p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := lower(trim(coalesce(p_search, '')));
begin
  perform public.require_permission('dispatch', 'view');
  return (select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]') from (
    select jsonb_build_object(
      'sort', case o.priority when 'urgent' then '0' when 'high' then '1' when 'normal' then '2' else '3' end
        || to_char(coalesce(o.delivery_date, o.requested_delivery_date, public._ist_date(o.created_at)), 'YYYYMMDD') || lpad(o.order_number::text, 10, '0'),
      'id', o.id, 'order_no', coalesce(o.b2b_order_no, '#' || o.order_number), 'order_number', o.order_number, 'source', o.source,
      'channel', case o.source when 'sales_rep' then 'SALES_REP' when 'b2b_app' then 'B2B_CUSTOMER_APP' when 'staff' then 'ADMIN_ENTRY'
        when 'subscription' then 'SUBSCRIPTION' else 'STOREFRONT' end,
      'is_b2b', o.b2b_customer_id is not null, 'customer_name', o.customer_name, 'customer_code', c.customer_code, 'customer_id', o.b2b_customer_id,
      'phone', o.phone, 'salesperson', coalesce(sp.full_name, asp.full_name), 'entered_by_salesperson', sp.full_name,
      'created_at', o.created_at, 'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
      'requested_delivery_date', o.requested_delivery_date, 'delivery_date', o.delivery_date, 'stage', o.fulfilment_status,
      'status_label', case when o.b2b_customer_id is not null then public.b2b_order_status(o.id) else public._b2b_stage_label(o.fulfilment_status) end,
      'priority', o.priority, 'ops_manager', coalesce(pm.full_name, pm.email), 'on_hold', o.on_hold, 'approval_reasons', o.approval_reasons,
      'confirmation', o.customer_confirmation, 'invoice_number', o.invoice_number,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', f.product_name, 'pack', f.pack_label, 'ordered', f.ordered, 'reserved', f.reserved,
          'dispatched', f.dispatched, 'free_stock', case when f.item_id is not null then public._b2b_free_stock(f.item_id) end) order by f.product_name), '[]')
        from public.v_order_line_fulfilment f where f.order_id = o.id),
      'stock_ok', (select coalesce(bool_and(f.reserved + f.dispatched >= f.ordered
          or (f.item_id is not null and public._b2b_free_stock(f.item_id) >= f.ordered - f.reserved - f.dispatched)), true)
        from public.v_order_line_fulfilment f where f.order_id = o.id),
      'fully_reserved', (select coalesce(bool_and(f.reserved + f.dispatched >= f.ordered), true) from public.v_order_line_fulfilment f where f.order_id = o.id)
    ) as x
    from public.orders o
    left join public.b2b_customers c on c.id = o.b2b_customer_id
    left join public.salespeople sp on sp.id = o.salesperson_id
    left join public.salespeople asp on asp.id = o.account_salesperson_id
    left join public.profiles pm on pm.id = o.ops_manager
    where (p_from is null or public._ist_date(o.created_at) >= p_from) and (p_to is null or public._ist_date(o.created_at) <= p_to)
      and (q = '' or lower(o.customer_name) like '%' || q || '%' or o.phone like '%' || q || '%' or lower(coalesce(o.b2b_order_no, '')) like '%' || q || '%'
        or o.order_number::text = q or lower(coalesce(c.customer_code, '')) like '%' || q || '%')
      and case coalesce(p_filter, 'action')
        when 'action' then o.fulfilment_status in ('submitted', 'confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched', 'delivery_failed')
        when 'new' then o.fulfilment_status in ('submitted', 'confirmed') and o.accepted_at is null
        when 'sales_rep' then o.source = 'sales_rep' and o.fulfilment_status not in ('delivered', 'cancelled', 'returned')
        when 'b2b_app' then o.source = 'b2b_app' and o.fulfilment_status not in ('delivered', 'cancelled', 'returned')
        when 'retail' then o.b2b_customer_id is null and o.fulfilment_status not in ('delivered', 'cancelled', 'returned', 'awaiting_payment')
        when 'awaiting_confirmation' then o.fulfilment_status in ('awaiting_confirmation', 'submitted')
        when 'awaiting_stock' then o.fulfilment_status in ('confirmed', 'processing')
          and exists (select 1 from public.v_order_line_fulfilment f where f.order_id = o.id and f.reserved + f.dispatched < f.ordered)
        when 'awaiting_manufacturing' then o.fulfilment_status in ('confirmed', 'processing')
          and exists (select 1 from public.v_order_line_fulfilment f where f.order_id = o.id and f.reserved + f.dispatched < f.ordered
            and (f.item_id is null or public._b2b_free_stock(f.item_id) < f.ordered - f.reserved - f.dispatched))
        when 'awaiting_packing' then o.fulfilment_status in ('processing', 'picking')
          and not exists (select 1 from public.v_order_line_fulfilment f where f.order_id = o.id and f.reserved + f.dispatched < f.ordered)
        when 'ready' then o.fulfilment_status in ('packed', 'ready_for_dispatch')
        when 'dispatched' then o.fulfilment_status in ('partially_dispatched', 'dispatched', 'out_for_delivery', 'partially_delivered')
        when 'delivered' then o.fulfilment_status = 'delivered'
        when 'cancelled' then o.fulfilment_status in ('cancelled', 'returned')
        else true end
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 300), 1), 1000)) t);
end;
$$;

-- Packing slip: what to pick, from which lots / batches, and what has been packed.
create function public.ops_packing_slip(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  perform public.require_permission('dispatch', 'view');
  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  return jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'order_no', coalesce(o.b2b_order_no, '#' || o.order_number), 'created_at', o.created_at, 'source', o.source,
      'customer_name', o.customer_name, 'phone', o.phone, 'address', o.address, 'city', o.city, 'pincode', o.pincode, 'notes', o.notes,
      'delivery_date', coalesce(o.delivery_date, o.requested_delivery_date), 'stage', o.fulfilment_status, 'priority', o.priority,
      'customer_code', (select customer_code from public.b2b_customers where id = o.b2b_customer_id),
      'owner_name', (select owner_name from public.b2b_customers where id = o.b2b_customer_id)),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'order_item_id', f.order_item_id, 'name', f.product_name, 'pack', f.pack_label, 'sku', i.code, 'pack_size', pc.name,
        'ordered', f.ordered, 'to_pick', f.reserved, 'dispatched', f.dispatched,
        'lots', (select coalesce(jsonb_agg(jsonb_build_object('lot_code', l.lot_code, 'batch_no', b.batch_no, 'batch_id', b.id, 'expiry_date', l.expiry_date,
            'qty', a.qty - a.qty_dispatched - a.qty_released) order by l.expiry_date), '[]')
          from public.order_allocations a join public.stock_lots l on l.id = a.lot_id left join public.production_batches b on b.id = l.batch_id
          where a.order_item_id = f.order_item_id and a.qty - a.qty_dispatched - a.qty_released > 0),
        'last_packed', (select p.qty_packed from public.order_packing p where p.order_item_id = f.order_item_id order by p.packed_at desc limit 1))
        order by f.product_name, f.pack_label), '[]')
      from public.v_order_line_fulfilment f left join public.items i on i.id = f.item_id left join public.packaging_configs pc on pc.id = i.packaging_config_id
      where f.order_id = o.id),
    'packing', (select coalesce(jsonb_agg(jsonb_build_object('at', p.packed_at, 'product', p.product, 'to_pick', p.qty_to_pick, 'packed', p.qty_packed,
        'exception', p.exception_reason, 'by', coalesce(pr.full_name, pr.email)) order by p.packed_at desc), '[]')
      from public.order_packing p left join public.profiles pr on pr.id = p.packed_by where p.order_id = o.id)
  );
end;
$$;

-- Production planning: confirmed demand against stock. Only orders operations have accepted count as
-- demand; submitted / unconfirmed orders are shown separately and never drive production on their own.
create function public.ops_production_requirements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('production', 'view') or public.has_permission('dispatch', 'view')) then
    raise exception 'You do not have permission to see production requirements' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]') from (
    select jsonb_build_object(
      'sort', coalesce(to_char(d.earliest, 'YYYYMMDD'), '99999999') || p.name || i.name,
      'item_id', i.id, 'sku', i.code, 'name', i.name, 'product_id', p.id, 'product', p.name, 'pack', pc.name,
      'net_qty', coalesce(pc.net_qty, i.net_qty), 'net_unit', coalesce(pc.net_unit, p.base_unit), 'unit', i.unit,
      'confirmed_demand', d.confirmed, 'reserved', d.reserved, 'still_to_reserve', d.open_need,
      'free_stock', public._b2b_free_stock(i.id),
      'additional_required', greatest(d.open_need - public._b2b_free_stock(i.id), 0),
      'additional_required_base', greatest(d.open_need - public._b2b_free_stock(i.id), 0) * coalesce(pc.net_qty, i.net_qty, 1),
      'unconfirmed_demand', d.unconfirmed,
      'earliest_delivery', d.earliest, 'orders', d.orders,
      'in_production_base', (select coalesce(sum(b.planned_qty), 0) from public.production_batches b where b.product_id = p.id
        and b.status in ('planned', 'materials_issued', 'in_production', 'production_completed', 'awaiting_qc', 'qc_approved', 'packaging', 'packaging_completed')),
      'shelf_life_days', coalesce(i.shelf_life_days, p.shelf_life_days), 'lead_days', i.b2b_lead_days,
      'priority', case when d.earliest is null then 'normal' when d.earliest <= public.ist_today() + 1 then 'urgent'
        when d.earliest <= public.ist_today() + 3 then 'high' else 'normal' end,
      'start_by', case when d.earliest is not null then d.earliest - greatest(i.b2b_lead_days, 1) end
    ) as x
    from (
      select f.item_id,
        sum(f.ordered - f.dispatched) filter (where o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')) as confirmed,
        sum(f.reserved) filter (where o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')) as reserved,
        sum(greatest(f.ordered - f.reserved - f.dispatched, 0)) filter (where o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')) as open_need,
        sum(f.ordered) filter (where o.fulfilment_status in ('submitted', 'awaiting_confirmation')) as unconfirmed,
        min(coalesce(o.delivery_date, o.requested_delivery_date)) filter (where o.fulfilment_status not in ('submitted', 'awaiting_confirmation')) as earliest,
        count(distinct o.id) as orders
      from public.v_order_line_fulfilment f join public.orders o on o.id = f.order_id
      where f.item_id is not null and o.on_hold = false
        and o.fulfilment_status in ('submitted', 'awaiting_confirmation', 'confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')
      group by f.item_id
    ) d
    join public.items i on i.id = d.item_id
    join public.products p on p.id = i.product_id
    left join public.packaging_configs pc on pc.id = i.packaging_config_id
  ) t);
end;
$$;

-- Batch → stock → orders → customers.
create function public.ops_batch_customers(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('production', 'view') or public.has_permission('dispatch', 'view')) then
    raise exception 'You do not have permission to trace batches' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'dispatch_no', d.dispatch_no, 'dispatched_at', d.dispatched_at, 'dispatch_status', d.status, 'order_id', o.id,
      'order_no', coalesce(o.b2b_order_no, '#' || o.order_number), 'customer', o.customer_name, 'customer_code', c.customer_code,
      'phone', o.phone, 'sku', i.code, 'item', i.name, 'lot_code', l.lot_code, 'qty', dl.qty, 'qty_returned', dl.qty_returned)
      order by d.dispatched_at), '[]')
    from public.dispatch_lines dl
    join public.dispatches d on d.id = dl.dispatch_id
    join public.orders o on o.id = d.order_id
    join public.items i on i.id = dl.item_id
    join public.stock_lots l on l.id = dl.lot_id
    left join public.b2b_customers c on c.id = o.b2b_customer_id
    where dl.batch_id = p_batch_id);
end;
$$;

-- Finance -----------------------------------------------------------------------------------------------
-- A payment from a B2B customer: one receipt, one journal entry, settled against the order named (an
-- advance) or the oldest open invoices.
create function public.b2b_receive_payment(p_customer_id uuid, p_amount numeric, p_paid_on date, p_method text, p_account_code text,
  p_reference text default null, p_order_id uuid default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  pid uuid := gen_random_uuid();
  no text;
  eid uuid;
  left_to_allocate numeric := p_amount;
  inv record;
  take numeric;
begin
  perform public.require_permission('sales', 'create');
  perform public._claim_request_key(p_key, 'b2b_receive_payment');
  perform public._check_money_account(p_account_code);
  select * into c from public.b2b_customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount received';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other') then
    raise exception 'Choose how the money was received';
  end if;
  if p_order_id is not null and not exists (select 1 from public.orders where id = p_order_id and b2b_customer_id = c.id) then
    raise exception 'That order is not this customer''s';
  end if;
  no := public.next_doc_number('receipt', 'MW-RCT', public.financial_year(p_paid_on), 5);
  eid := public._post_journal(p_paid_on, 'payment', pid::text, 'Receipt ' || no || ' · ' || c.shop_name || ' (' || c.customer_code || ')', 'payment:' || pid,
    jsonb_build_array(public._jl(p_account_code, p_amount), public._jl('1100', -p_amount, 'customer', 'b2b:' || c.id)));
  insert into public.payments (id, payment_no, direction, party_type, party_id, party_name, amount, paid_on, method, account_code, reference, entry_id)
  values (pid, no, 'in', 'customer', 'b2b:' || c.id, c.shop_name, p_amount, p_paid_on, p_method, p_account_code, nullif(trim(coalesce(p_reference, '')), ''), eid);
  if p_order_id is not null then
    insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, 'order', p_order_id, p_amount);
  else
    -- Settle the oldest invoiced orders that still have an unpaid amount recorded against them.
    for inv in
      select o.id, o.total - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.doc_type = 'order' and pa.doc_id = o.id), 0) as unpaid
      from public.orders o
      where o.b2b_customer_id = c.id and o.invoice_number is not null and o.status <> 'cancelled'
      order by o.invoice_date, o.order_number
    loop
      exit when left_to_allocate <= 0;
      continue when inv.unpaid <= 0;
      take := least(inv.unpaid, left_to_allocate);
      insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, 'order', inv.id, take);
      left_to_allocate := left_to_allocate - take;
    end loop;
  end if;
  perform public.write_audit('payment.b2b_customer', 'payments', pid::text,
    jsonb_build_object('no', no, 'customer', c.customer_code, 'amount', p_amount, 'order', p_order_id));
  return pid;
end;
$$;

-- Customer ledger and statement: invoices, receipts, credit notes and refunds from the ledger, the
-- open invoices and the balance. Read-only for everyone, including the customer.
create function public.b2b_statement(p_customer_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  d1 date := coalesce(p_from, public.ist_today() - 90);
  d2 date := coalesce(p_to, public.ist_today());
  opening numeric;
begin
  if not (a = 'customer' or (a = 'staff' and public.has_permission('sales', 'view')) or (a <> 'customer' and public._b2b_can_see_money(p_customer_id))) then
    raise exception 'You do not have permission to see this customer''s account' using errcode = '42501';
  end if;
  select coalesce(sum(l.debit - l.credit), 0) into opening from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id and e.entry_date < d1;
  return jsonb_build_object(
    'from', d1, 'to', d2, 'opening', opening,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('date', x.entry_date, 'entry_no', x.entry_no, 'kind', x.kind, 'memo', x.memo,
        'debit', x.debit, 'credit', x.credit, 'balance', opening + x.running, 'order_id', x.order_id) order by x.entry_date, x.entry_no), '[]')
      from (select e.entry_date, e.entry_no, e.memo, l.debit, l.credit,
              case e.source_type when 'order' then case when e.posting_key like 'sale-cancel:%' then 'cancellation' when e.posting_key like 'receipt:%' then 'payment' else 'invoice' end
                when 'payment' then 'payment' when 'dispatch' then 'payment' when 'credit_note' then 'credit_note' when 'refund' then 'refund' else e.source_type end as kind,
              case when e.source_type = 'order' then e.source_id::uuid end as order_id,
              sum(l.debit - l.credit) over (order by e.entry_date, e.entry_no) as running
            from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
            where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id and e.entry_date between d1 and d2) x),
    'closing', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
      where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id and e.entry_date <= d2),
    'open_invoices', (select coalesce(jsonb_agg(to_jsonb(i) order by i.invoice_date), '[]') from public._b2b_open_invoices(p_customer_id) i),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('payment_no', p.payment_no, 'paid_on', p.paid_on, 'amount', p.amount, 'method', p.method,
        'reference', p.reference) order by p.paid_on desc), '[]')
      from public.payments p where p.party_type = 'customer' and p.party_id = 'b2b:' || p_customer_id and p.direction = 'in'),
    'credit', public._b2b_credit(p_customer_id)
  );
end;
$$;

-- Reports -------------------------------------------------------------------------------------------------
-- Per salesperson. Orders they entered (SALES_REP) are attributed to them; direct orders from their
-- accounts are shown separately and never counted as their entries. Each order counts once.
create function public.b2b_sales_performance(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('sales_team', 'view') or public.has_permission('reports', 'view')) then
    raise exception 'You do not have permission to see sales performance' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(x order by (x ->> 'rep_sales')::numeric desc), '[]') from (
    select jsonb_build_object(
      'salesperson_id', s.id, 'name', s.full_name, 'employee_code', s.employee_code, 'active', s.is_active, 'territories', s.territories,
      'leads_added', (select count(*) from public.b2b_customers c where c.acquired_by = s.id and public._ist_date(c.acquired_at) between p_from and p_to),
      'customers_acquired', (select count(*) from public.b2b_customers c where c.acquired_by = s.id and c.status in ('approved', 'suspended', 'inactive')
        and public._ist_date(c.approved_at) between p_from and p_to),
      'conversion_pct', (select case when count(*) > 0 then round(100.0 * count(*) filter (where c.status in ('approved', 'suspended', 'inactive')) / count(*), 1) end
        from public.b2b_customers c where c.acquired_by = s.id and public._ist_date(c.acquired_at) between p_from and p_to),
      'assigned_customers', (select count(*) from public.b2b_customers c where c.assigned_salesperson = s.id and c.status = 'approved'),
      'rep_orders', r.orders, 'rep_sales', r.sales,
      'rep_avg_order', case when r.orders > 0 then round(r.sales / r.orders, 2) end,
      'direct_orders_from_accounts', r.direct_orders, 'direct_sales_from_accounts', r.direct_sales,
      'repeat_customers', r.repeat_customers,
      'retained_customers', (select count(distinct o.b2b_customer_id) from public.orders o where o.account_salesperson_id = s.id and o.status <> 'cancelled'
        and public._ist_date(o.created_at) between p_from and p_to
        and exists (select 1 from public.orders o2 where o2.b2b_customer_id = o.b2b_customer_id and o2.status <> 'cancelled' and public._ist_date(o2.created_at) < p_from)),
      'visits', (select count(*) from public.b2b_activities v where v.salesperson_id = s.id and v.kind = 'visit' and public._ist_date(v.occurred_at) between p_from and p_to),
      'outstanding', case when public.has_permission('sales', 'view') then (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l
        where l.account_code = '1100' and l.party_id in (select 'b2b:' || c.id from public.b2b_customers c where c.assigned_salesperson = s.id)) end,
      'target', (select coalesce(sum(t.target_value), 0) from public.sales_targets t where t.salesperson_id = s.id
        and t.month between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date),
      'incentive_pct', s.incentive_pct, 'incentive_basis', s.incentive_basis,
      'incentive', round(s.incentive_pct / 100 * case when s.incentive_basis = 'account_sales' then r.sales + r.direct_sales else r.sales end, 2)
    ) as x
    from public.salespeople s
    cross join lateral (
      select
        count(*) filter (where o.salesperson_id = s.id) as orders,
        coalesce(sum(o.total) filter (where o.salesperson_id = s.id), 0) as sales,
        count(*) filter (where o.source = 'b2b_app' and o.account_salesperson_id = s.id) as direct_orders,
        coalesce(sum(o.total) filter (where o.source = 'b2b_app' and o.account_salesperson_id = s.id), 0) as direct_sales,
        (select count(*) from (select o3.b2b_customer_id from public.orders o3 where o3.salesperson_id = s.id and o3.status <> 'cancelled'
          and public._ist_date(o3.created_at) between p_from and p_to group by o3.b2b_customer_id having count(*) > 1) z) as repeat_customers
      from public.orders o
      where o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to
        and (o.salesperson_id = s.id or o.account_salesperson_id = s.id)
    ) r
  ) t);
end;
$$;

-- B2B sales by channel, product, area and day (each order once; cancelled excluded).
create function public.b2b_sales_breakdown(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('sales_team', 'view') or public.has_permission('reports', 'view') or public.has_permission('b2b_customers', 'view')) then
    raise exception 'You do not have permission to see sales reports' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'orders', x.n, 'sales', x.v) order by x.v desc), '[]') from (
      select o.source, count(*) as n, sum(o.total) as v from public.orders o
      where o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to group by o.source) x),
    'by_product', (select coalesce(jsonb_agg(jsonb_build_object('product', x.product, 'sku', x.sku, 'qty', x.qty, 'sales', x.v) order by x.v desc), '[]') from (
      select coalesce(p.name, oi.product_name) as product, coalesce(i.code, oi.pack_label) as sku, sum(oi.quantity) as qty, sum(oi.unit_price * oi.quantity) as v
      from public.orders o join public.order_items oi on oi.order_id = o.id left join public.items i on i.id = oi.item_id left join public.products p on p.id = i.product_id
      where o.b2b_customer_id is not null and o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to
      group by 1, 2) x),
    'by_area', (select coalesce(jsonb_agg(jsonb_build_object('city', x.city, 'locality', x.locality, 'customers', x.customers, 'orders', x.n, 'sales', x.v) order by x.v desc), '[]') from (
      select c.city, coalesce(c.locality, '—') as locality, count(distinct c.id) as customers, count(*) as n, sum(o.total) as v
      from public.orders o join public.b2b_customers c on c.id = o.b2b_customer_id
      where o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to group by 1, 2) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'sales_rep', x.rep, 'b2b_app', x.app, 'other', x.other) order by x.d), '[]') from (
      select public._ist_date(o.created_at) as d,
        coalesce(sum(o.total) filter (where o.source = 'sales_rep'), 0) as rep,
        coalesce(sum(o.total) filter (where o.source = 'b2b_app'), 0) as app,
        coalesce(sum(o.total) filter (where o.b2b_customer_id is not null and o.source not in ('sales_rep', 'b2b_app')), 0) as other
      from public.orders o where o.b2b_customer_id is not null and o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to group by 1) x),
    'totals', (select jsonb_build_object('orders', count(*), 'sales', coalesce(sum(o.total), 0), 'customers', count(distinct o.b2b_customer_id),
        'avg_order', case when count(*) > 0 then round(sum(o.total) / count(*), 2) end)
      from public.orders o where o.b2b_customer_id is not null and o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to)
  );
end;
$$;

-- Marketing ---------------------------------------------------------------------------------------------
create function public.mkt_save_campaign(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.require_permission('marketing', 'create');
  if cid is not null then
    update public.marketing_campaigns set name = trim(p ->> 'name'), channel = p ->> 'channel', segment = coalesce(nullif(p ->> 'segment', ''), 'marketing_consent'),
      filters = coalesce(p -> 'filters', '{}'), message = trim(p ->> 'message')
    where id = cid and status = 'draft';
    if not found then
      raise exception 'Only draft campaigns can be changed';
    end if;
  else
    insert into public.marketing_campaigns (name, channel, segment, filters, message)
    values (trim(p ->> 'name'), p ->> 'channel', coalesce(nullif(p ->> 'segment', ''), 'marketing_consent'), coalesce(p -> 'filters', '{}'), trim(p ->> 'message'))
    returning id into cid;
  end if;
  perform public.write_audit('campaign.save', 'marketing_campaigns', cid::text, p);
  return cid;
end;
$$;

-- Approving a campaign fixes its recipients: customers in the segment who agreed to that channel and
-- have not opted out. Everyone else is counted as excluded, never messaged.
create function public.mkt_approve_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mc public.marketing_campaigns;
  seg jsonb;
  n integer;
  no_consent integer;
  opted integer;
begin
  perform public.require_permission('marketing', 'approve');
  select * into mc from public.marketing_campaigns where id = p_campaign_id for update;
  if not found or mc.status <> 'draft' then
    raise exception 'Only draft campaigns can be approved';
  end if;
  seg := public.b2b_customer_list(null, coalesce(mc.filters, '{}') || jsonb_build_object('segment', case when mc.segment = 'all' then '' else mc.segment end), 2000);
  insert into public.marketing_recipients (campaign_id, customer_id)
  select mc.id, c.id from jsonb_array_elements(seg) e join public.b2b_customers c on c.id = (e ->> 'id')::uuid
  where c.marketing_consent and c.opted_out_at is null and mc.channel = any (c.consent_channels) and c.status in ('approved', 'suspended', 'inactive');
  get diagnostics n = row_count;
  select count(*) filter (where not c.marketing_consent and c.opted_out_at is null or (c.marketing_consent and not (mc.channel = any (c.consent_channels)))),
    count(*) filter (where c.opted_out_at is not null)
  into no_consent, opted
  from jsonb_array_elements(seg) e join public.b2b_customers c on c.id = (e ->> 'id')::uuid;
  update public.marketing_campaigns set status = 'approved', approved_by = auth.uid(), approved_at = now(), excluded_no_consent = no_consent, excluded_opted_out = opted
  where id = mc.id;
  perform public.write_audit('campaign.approve', 'marketing_campaigns', mc.id::text, jsonb_build_object('recipients', n, 'excluded_no_consent', no_consent, 'excluded_opted_out', opted));
  return jsonb_build_object('recipients', n, 'excluded_no_consent', no_consent, 'excluded_opted_out', opted);
end;
$$;

-- Recipients to hand to the messaging provider. Consent is checked again at this moment, so an opt-out
-- recorded after approval is always respected.
create function public.mkt_campaign_recipients(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mc public.marketing_campaigns;
  out jsonb;
begin
  perform public.require_permission('marketing', 'export');
  select * into mc from public.marketing_campaigns where id = p_campaign_id;
  if not found or mc.status not in ('approved', 'sent') then
    raise exception 'Approve the campaign first';
  end if;
  update public.marketing_recipients r set status = 'skipped_opted_out' from public.b2b_customers c
  where r.campaign_id = mc.id and c.id = r.customer_id and r.status = 'queued'
    and (not c.marketing_consent or c.opted_out_at is not null or not (mc.channel = any (c.consent_channels)));
  select coalesce(jsonb_agg(jsonb_build_object('customer_code', c.customer_code, 'shop_name', c.shop_name, 'owner_name', c.owner_name,
      'contact', case mc.channel when 'email' then c.email when 'whatsapp' then coalesce(c.whatsapp, c.mobile) else c.mobile end) order by c.shop_name), '[]')
  into out
  from public.marketing_recipients r join public.b2b_customers c on c.id = r.customer_id
  where r.campaign_id = mc.id and r.status in ('queued', 'sent');
  perform public.write_audit('campaign.export', 'marketing_campaigns', mc.id::text, jsonb_build_object('rows', jsonb_array_length(out)));
  return out;
end;
$$;

create function public.mkt_mark_sent(p_campaign_id uuid, p_provider_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('marketing', 'approve');
  perform public.mkt_campaign_recipients(p_campaign_id);
  update public.marketing_recipients set status = 'sent' where campaign_id = p_campaign_id and status = 'queued';
  update public.marketing_campaigns set status = 'sent', sent_at = now(), sent_by = auth.uid(), provider_reference = nullif(trim(coalesce(p_provider_reference, '')), '')
  where id = p_campaign_id and status = 'approved';
  if not found then
    raise exception 'Only approved campaigns can be marked sent';
  end if;
  perform public.write_audit('campaign.sent', 'marketing_campaigns', p_campaign_id::text, jsonb_build_object('reference', p_provider_reference));
end;
$$;

-- New accounts: staff invites (as before), salesperson records and Wholesale app invites ---------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.ops_staff_invites;
  b2b public.b2b_login_invites;
  v_phone text := nullif(right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10), '');
begin
  insert into public.profiles (id, phone, email, is_admin)
  values (new.id, v_phone, lower(new.email), exists (select 1 from public.staff_emails s where s.email = lower(new.email)));

  select * into invite from public.ops_staff_invites where email = lower(new.email) and accepted_at is null;
  if found then
    insert into public.ops_user_roles (user_id, role_key, granted_by)
    select new.id, r, invite.invited_by from unnest(invite.role_keys) r
    where exists (select 1 from public.ops_roles where key = r)
    on conflict do nothing;
    update public.ops_staff_invites set accepted_at = now() where email = invite.email;
  end if;

  update public.salespeople set user_id = new.id where email = lower(new.email) and user_id is null;

  select * into b2b from public.b2b_login_invites
  where accepted_at is null and (contact = lower(new.email) or contact = v_phone)
  order by invited_at desc limit 1;
  if found then
    insert into public.b2b_customer_users (user_id, customer_id, status, decided_by, decided_at)
    values (new.id, b2b.customer_id, 'active', b2b.invited_by, now()) on conflict do nothing;
    update public.b2b_login_invites set accepted_at = now() where contact = b2b.contact;
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Access rules ---------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sales_territories', 'salespeople', 'sales_targets', 'price_categories', 'b2b_customers', 'b2b_customer_users',
    'b2b_login_invites', 'b2b_activities', 'b2b_consent_log', 'b2b_item_access', 'wholesale_prices', 'price_requests', 'b2b_drafts',
    'b2b_notifications', 'marketing_campaigns', 'marketing_recipients', 'order_amendments', 'order_packing'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Staff screens read these directly; the two apps read through the functions above.
create policy "Sales staff read territories" on public.sales_territories for select to authenticated
  using ((select public.has_permission('sales_team', 'view')) or (select public.has_permission('b2b_customers', 'view')) or (select public.has_permission('field_sales', 'view')));
create policy "Sales staff read salespeople" on public.salespeople for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('sales_team', 'view')) or (select public.has_permission('b2b_customers', 'view'))
    or (select public.has_permission('dispatch', 'view')));
create policy "Sales staff read targets" on public.sales_targets for select to authenticated
  using ((select public.has_permission('sales_team', 'view')) or salesperson_id in (select id from public.salespeople where user_id = (select auth.uid())));
create policy "Staff read price categories" on public.price_categories for select to authenticated
  using ((select public.has_permission('pricing', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read B2B customers" on public.b2b_customers for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read app logins" on public.b2b_customer_users for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read login invites" on public.b2b_login_invites for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read activities" on public.b2b_activities for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Marketing reads consent log" on public.b2b_consent_log for select to authenticated
  using ((select public.has_permission('marketing', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Pricing reads item access" on public.b2b_item_access for select to authenticated
  using ((select public.has_permission('pricing', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Pricing reads prices" on public.wholesale_prices for select to authenticated
  using ((select public.has_permission('pricing', 'view')));
create policy "Pricing reads price requests" on public.price_requests for select to authenticated
  using ((select public.has_permission('pricing', 'view')) or requested_by = (select auth.uid()));
create policy "Customer staff read notifications" on public.b2b_notifications for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')) or customer_id = (select public._b2b_my_customer_id()));
create policy "Marketing reads campaigns" on public.marketing_campaigns for select to authenticated
  using ((select public.has_permission('marketing', 'view')));
create policy "Marketing reads recipients" on public.marketing_recipients for select to authenticated
  using ((select public.has_permission('marketing', 'view')));
create policy "Dispatch reads amendments" on public.order_amendments for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Dispatch reads packing" on public.order_packing for select to authenticated
  using ((select public.has_permission('dispatch', 'view')));
grant select on public.v_b2b_customer_stats to authenticated;
revoke all on public.v_b2b_customer_stats from anon;

do $$
declare
  f text;
begin
  -- Internal helpers: not callable through the API.
  foreach f in array array[
    '_b2b_access(uuid)', '_b2b_require_access(uuid)', '_b2b_can_see_money(uuid)', '_b2b_salesperson()',
    '_b2b_price(uuid, uuid, integer, date)', '_b2b_free_stock(uuid)', '_b2b_item_visible(uuid, uuid)', '_b2b_quote(uuid, jsonb, date)',
    '_b2b_credit(uuid, uuid)', '_b2b_open_invoices(uuid)', '_b2b_guard_unaccepted()', '_b2b_invoice_on_dispatch()', '_b2b_notify_event()',
    '_b2b_write_lines(uuid, uuid, jsonb)', '_b2b_review_reasons(uuid, jsonb)', '_b2b_territory_salesperson(text, text)',
    '_b2b_customer_from_json(jsonb, public.b2b_customers, boolean)', '_b2b_check_required(public.b2b_customers)',
    '_b2b_segments(public.b2b_customers, public.v_b2b_customer_stats, numeric)', '_b2b_clean_phone(text)', 'exists_staff(uuid)',
    'b2b_order_status(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Actions and readers: signed-in users only; each checks the caller itself.
  foreach f in array array[
    'b2b_quote(uuid, jsonb)', 'b2b_place_order(uuid, jsonb, text, date, text, text)', 'b2b_reorder_lines(uuid)', 'b2b_confirm_order(uuid, boolean, text)',
    'b2b_accept_order(uuid, date, text, boolean)', 'b2b_amend_order(uuid, jsonb, text, date, text)', 'b2b_cancel_order(uuid, text)',
    'ops_set_order_priority(uuid, text, uuid)', 'ops_record_packing(uuid, jsonb, text, jsonb)',
    'b2b_find_matches(text, text, text, text)', 'b2b_required_fields()', 'b2b_create_customer(jsonb, boolean, text)', 'b2b_register(jsonb)', 'b2b_decide_customer(uuid, boolean, text)',
    'b2b_update_customer(uuid, jsonb, text)', 'b2b_set_terms(uuid, jsonb, text)', 'b2b_set_status(uuid, text, text)', 'b2b_assign_customers(uuid[], uuid, text)',
    'b2b_grant_login(uuid, text)', 'b2b_decide_login(uuid, uuid, boolean, text)', 'b2b_log_activity(uuid, jsonb)',
    'b2b_record_consent(uuid, boolean, text[], text, text)', 'b2b_save_draft(uuid, jsonb, text)', 'b2b_get_draft(uuid)', 'b2b_mark_notifications_read()',
    'b2b_customer_list(text, jsonb, integer)', 'b2b_customer_profile(uuid)', 'b2b_catalogue(uuid)', 'b2b_me()', 'b2b_orders(uuid, text, integer)',
    'b2b_order_detail(uuid)', 'b2b_can_view_order(uuid)', 'fs_dashboard(date, date)', 'fs_request_price(uuid, uuid, numeric, integer, date, text)',
    'pr_decide_price_request(uuid, boolean, numeric, date, date, text)', 'pr_save_price(jsonb)', 'pr_end_price(uuid, text)',
    'pr_save_item_wholesale(uuid, jsonb)', 'pr_set_item_access(uuid, uuid, boolean)', 'pr_save_category(text, text, text, boolean)',
    'st_save_salesperson(jsonb)', 'st_save_territory(text, text, text, text[], boolean)', 'st_set_target(uuid, date, numeric, integer, integer)',
    'ops_order_queue(text, text, date, date, integer)', 'ops_packing_slip(uuid)', 'ops_production_requirements()', 'ops_batch_customers(uuid)',
    'b2b_receive_payment(uuid, numeric, date, text, text, text, uuid, text)', 'b2b_statement(uuid, date, date)',
    'b2b_sales_performance(date, date)', 'b2b_sales_breakdown(date, date)',
    'mkt_save_campaign(jsonb)', 'mkt_approve_campaign(uuid)', 'mkt_campaign_recipients(uuid)', 'mkt_mark_sent(uuid, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._b2b_stage_label(text) from public, anon;
-- Used by the notifications access rule; it only ever returns the caller's own customer.
revoke execute on function public._b2b_my_customer_id() from public, anon;
grant execute on function public._b2b_my_customer_id() to authenticated;
grant execute on function public._b2b_stage_label(text) to authenticated;

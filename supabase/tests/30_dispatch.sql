-- Acceptance tests 3 (dispatch), 10 (inventory integrity) and 11 (batch → customer traceability).
-- Uses the Milk Cake batch released in 20_manufacturing.sql: 40 × 500 g, 20 × 1 kg, 3 × 5 kg pouch.

-- A website order, saved the way the storefront saves it (slug + pack label; the SKU is linked automatically).
do $$
declare
  oid uuid;
begin
  insert into public.orders (customer_name, phone, email, address, city, pincode, payment_method, payment_status, status, subtotal, delivery_fee, discount, total, user_id)
  values ('Test Customer', '9876543210', 'cust@test.local', '12 Civil Lines', 'Prayagraj', '211001', 'cod', 'cod', 'received', 3000, 0, 0, 3000, test.id('cust'))
  returning id into oid;
  insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity) values
    (oid, 'milk-cake', 'Milk Cake', '500 g', 340, 5),
    (oid, 'milk-cake', 'Milk Cake', '1 kg', 650, 2);
  perform test.put('order1', oid);
  perform test.eq('website order lines linked to SKUs', (select count(*)::int from public.order_items where order_id = oid and item_id is not null), 2);
  perform test.eq('new COD order is confirmed for fulfilment', (select fulfilment_status from public.orders where id = oid), 'confirmed');
end $$;

-- TEST 3: allocate and dispatch two pack sizes ------------------------------------------
do $$
declare
  res jsonb;
begin
  perform test.login('pm@test.local');
  res := public.disp_allocate_order(test.id('order1'));
  perform test.eq('no shortage for order 1', jsonb_array_length(res -> 'shortages'), 0);
  perform test.put('dispatch1', public.disp_dispatch_order(test.id('order1'), null, 'Vikas', now() + interval '2 hours', 'Ring the bell'));
end $$;
reset role;

do $$
begin
  perform test.eq('500 g stock after dispatch', (select on_hand from public.v_stock_summary where item_id = test.id('mc500')), 35.000);
  perform test.eq('1 kg stock after dispatch', (select on_hand from public.v_stock_summary where item_id = test.id('mc1k')), 18.000);
  perform test.eq('5 kg pouches untouched', (select on_hand from public.v_stock_summary where item_id = test.id('mc5k')), 3.000);
  perform test.eq('dispatch lines record the source batch', (select count(*)::int from public.dispatch_lines where dispatch_id = test.id('dispatch1') and batch_id = test.id('batch1')), 2);
  perform test.eq('order dispatched', (select fulfilment_status from public.orders where id = test.id('order1')), 'dispatched');
  perform test.eq('customer sees out for delivery', (select status::text from public.orders where id = test.id('order1')), 'out_for_delivery');
  perform test.eq('batch now partially dispatched', (select status from public.production_batches where id = test.id('batch1')), 'partially_dispatched');
  perform test.eq('materials are not deducted again at dispatch', (select on_hand from public.v_stock_summary where item_id = test.id('sugar')), 51.000);
  perform test.eq('no reservation left', (select sum(qty_reserved) from public.stock_lots where batch_id = test.id('batch1')), 0.000);
end $$;

do $$
begin
  perform test.login('pm@test.local');
  perform public.disp_update_delivery(test.id('dispatch1'), 'delivered', 'Handed to customer', 3000, 'cash');
end $$;
reset role;
do $$
begin
  perform test.eq('order delivered', (select fulfilment_status from public.orders where id = test.id('order1')), 'delivered');
  perform test.eq('cash collection recorded', (select cash_collected from public.dispatches where id = test.id('dispatch1')), 3000.00);
end $$;

-- TEST 10: trying to dispatch more than the saleable stock ---------------------------------
do $$
declare
  oid uuid;
begin
  insert into public.orders (customer_name, phone, address, city, pincode, payment_method, payment_status, status, subtotal, delivery_fee, discount, total)
  values ('Big Order Ltd', '9000000001', 'Naini Industrial Area', 'Prayagraj', '211008', 'cod', 'cod', 'received', 34000, 0, 0, 34000)
  returning id into oid;
  insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity) values (oid, 'milk-cake', 'Milk Cake', '500 g', 340, 100);
  perform test.put('order2', oid);
end $$;

do $$
declare
  res jsonb;
  alloc uuid;
begin
  perform test.login('pm@test.local');
  res := public.disp_allocate_order(test.id('order2'));
  perform test.eq('shortage reported, not hidden', (res -> 'shortages' -> 0 ->> 'needed')::numeric, 65::numeric);
  select id into alloc from public.order_allocations where order_id = test.id('order2');
  perform test.fails('cannot dispatch 100 when only 35 exist',
    format('select public.disp_dispatch_order(%L, %L)', test.id('order2'), jsonb_build_array(jsonb_build_object('allocation_id', alloc, 'qty', 100))),
    'would exceed saleable stock');
  -- Partial dispatch of 10 boxes.
  perform test.put('dispatch2', public.disp_dispatch_order(test.id('order2'), jsonb_build_array(jsonb_build_object('allocation_id', alloc, 'qty', 10)), 'Vikas'));
end $$;
reset role;

do $$
begin
  perform test.eq('partial dispatch status', (select fulfilment_status from public.orders where id = test.id('order2')), 'partially_dispatched');
  perform test.eq('25 still reserved for order 2', (select sum(qty_reserved) from public.stock_lots where item_id = test.id('mc500')), 25.000);
  perform test.eq('nothing free for other customers', (select available from public.v_stock_summary where item_id = test.id('mc500')), 0.000);
end $$;

-- Another order cannot take stock reserved for someone else.
do $$
declare
  oid uuid;
  res jsonb;
begin
  insert into public.orders (customer_name, phone, address, city, pincode, payment_method, payment_status, status, subtotal, delivery_fee, discount, total)
  values ('Late Customer', '9000000002', 'George Town', 'Prayagraj', '211002', 'cod', 'cod', 'received', 340, 0, 0, 340)
  returning id into oid;
  insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity) values (oid, 'milk-cake', 'Milk Cake', '500 g', 340, 1);
  perform test.login('pm@test.local');
  res := public.disp_allocate_order(oid);
  perform test.eq('reserved stock is protected', (res -> 'shortages' -> 0 ->> 'needed')::numeric, 1::numeric);
end $$;
reset role;

-- Hold, release and a failed delivery that comes back into stock.
do $$
declare
  alloc uuid;
begin
  perform test.login('pm@test.local');
  perform public.disp_hold_order(test.id('order2'), true, 'Customer asked to wait for the rest');
  perform test.fails('held orders cannot be dispatched', format('select public.disp_dispatch_order(%L)', test.id('order2')), 'on hold');
  perform public.disp_hold_order(test.id('order2'), false, 'Customer confirmed');
  select id into alloc from public.order_allocations where order_id = test.id('order2');
  perform public.disp_release_allocation(alloc, 'Freeing stock for other orders');
  perform public.disp_update_delivery(test.id('dispatch2'), 'delivery_failed', 'Office closed', null, null, null, true);
end $$;
reset role;

do $$
begin
  perform test.eq('released + failed delivery back in stock', (select available from public.v_stock_summary where item_id = test.id('mc500')), 35.000);
  perform test.eq('order 2 shows failed delivery', (select fulfilment_status from public.orders where id = test.id('order2')), 'delivery_failed');
end $$;

-- TEST 11 (customer side): which orders received batch 1 -----------------------------------
do $$
declare
  t jsonb;
begin
  perform test.login('pm@test.local');
  t := public.prod_batch_trace(test.id('batch1'));
  perform test.eq('trace shows dispatches out of the batch', (select count(*)::int from jsonb_array_elements(t -> 'outgoing') x where x ->> 'movement' = 'dispatch'), 3);
end $$;
reset role;

do $$
begin
  perform test.eq('orders that received batch 1', (select count(distinct d.order_id)::int from public.dispatch_lines dl join public.dispatches d on d.id = dl.dispatch_id
    where dl.batch_id = test.id('batch1')), 2);
end $$;

-- Customers can follow their own order but not anyone else's.
do $$
begin
  perform test.login('cust@test.local');
  perform test.eq('customer sees own dispatch', (select count(*)::int from public.dispatches), 1);
  perform test.eq('customer sees only own orders', (select count(*)::int from public.orders), 1);
  perform test.fails('customer cannot allocate stock', format('select public.disp_allocate_order(%L)', test.id('order2')), 'permission');
end $$;
reset role;

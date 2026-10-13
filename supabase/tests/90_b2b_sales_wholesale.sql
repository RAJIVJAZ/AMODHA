-- B2B wholesale: the 12 mandatory acceptance tests for the Sales app, the Wholesale app and the shared
-- operations, finance and CRM behind them. Every step runs as the real role through the same database
-- functions the apps call. Uses the Milk Cake batch released in 20_manufacturing.sql.

-- People ---------------------------------------------------------------------------------------------
do $$
begin
  perform test.put('smgr', test.make_user('smgr@test.local', '{sales_manager}'));
  perform test.put('rep1', test.make_user('rep1@test.local'));
  perform test.put('rep2', test.make_user('rep2@test.local'));
  perform test.put('shop1', test.make_user('shop1@test.local'));
  perform test.put('shop2', test.make_user('shop2@test.local'));
end $$;

-- Set-up by the administrator and sales manager: territory, salespeople, wholesale catalogue, prices.
do $$
begin
  perform test.login('owner@test.local');
  perform public.st_save_territory('PRG-CIVIL', 'Civil Lines & Katra', 'Prayagraj', array['Civil Lines', 'Katra']);
  perform test.put('sp1', public.st_save_salesperson('{"email":"rep1@test.local","full_name":"Ravi Sales","employee_code":"MW-S01","phone":"9800000001","territories":["PRG-CIVIL"],"incentive_pct":2}'));
  perform test.put('sp2', public.st_save_salesperson('{"email":"rep2@test.local","full_name":"Suresh Sales","employee_code":"MW-S02","phone":"9800000002"}'));
  perform test.put('mc5k', (select id from public.items where code = 'MILK-CAKE-5KG-POUCH'));
  perform public.pr_save_item_wholesale(test.id('mc500'), '{"b2b_enabled":true,"b2b_min_qty":5,"b2b_qty_multiple":5,"b2b_lead_days":2}');
  perform public.pr_save_item_wholesale(test.id('mc1k'), '{"b2b_enabled":true,"b2b_lead_days":2}');
  perform public.pr_save_item_wholesale(test.id('mc5k'), '{"b2b_enabled":true,"b2b_restricted":true}');
  perform public.pr_save_price(jsonb_build_object('item_id', test.id('mc500'), 'scope', 'standard', 'price', 300));
  perform public.pr_save_price(jsonb_build_object('item_id', test.id('mc500'), 'scope', 'standard', 'price', 290, 'min_qty', 10));
  perform public.pr_save_price(jsonb_build_object('item_id', test.id('mc1k'), 'scope', 'standard', 'price', 580));
  perform public.pr_save_price(jsonb_build_object('item_id', test.id('mc1k'), 'scope', 'category', 'price_category', 'preferred', 'price', 560));
  perform public.pr_save_price(jsonb_build_object('item_id', test.id('mc5k'), 'scope', 'standard', 'price', 2800));
end $$;
reset role;

do $$
begin
  perform test.eq('salesperson gets the salesperson role (unique account)', (select count(*)::int from public.ops_user_roles where user_id = test.id('rep1') and role_key = 'salesperson'), 1);
  perform test.eq('salesperson record linked to their own login', (select user_id from public.salespeople where id = test.id('sp1')), test.id('rep1'));
end $$;

-- TEST 3: shared customer database, no duplicates ----------------------------------------------------
do $$
begin
  perform test.login('rep1@test.local');
  perform test.put('custA', public.b2b_create_customer('{"shop_name":"Gupta Sweets","owner_name":"Ramesh Gupta","mobile":"98111 00001","business_address":"12 Katra Road",
    "delivery_address":"12 Katra Road","locality":"Katra","city":"Prayagraj","pincode":"211002","customer_type":"sweet_shop","expected_monthly_value":40000}'));
  perform test.fails('same mobile number is refused (use the existing record)',
    $q$select public.b2b_create_customer('{"shop_name":"Gupta Mithai","owner_name":"R Gupta","mobile":"9811100001","business_address":"x","delivery_address":"x","locality":"Katra","city":"Prayagraj","customer_type":"sweet_shop","expected_monthly_value":1}')$q$,
    'already a customer');
  perform test.fails('same shop name in the same city must be confirmed as a different business',
    $q$select public.b2b_create_customer('{"shop_name":"Gupta Sweets","owner_name":"Other","mobile":"9811100099","business_address":"x","delivery_address":"x","locality":"Chowk","city":"Prayagraj","customer_type":"sweet_shop","expected_monthly_value":1}')$q$,
    'already exists');
  perform test.fails('required fields are enforced',
    $q$select public.b2b_create_customer('{"shop_name":"New Shop","owner_name":"Owner","mobile":"9811100098"}')$q$, 'Enter the');
  perform test.eq('new customer starts as a lead', public.b2b_customer_profile(test.id('custA')) -> 'customer' ->> 'status', 'lead');
  perform test.fails('a lead cannot be ordered for',
    format('select public.b2b_place_order(%L, %L)', test.id('custA'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 1))), 'approved');
  perform test.fails('a salesperson cannot approve customers', format('select public.b2b_decide_customer(%L, true)', test.id('custA')), 'permission');
end $$;
reset role;

do $$
begin
  perform test.login('smgr@test.local');
  perform public.b2b_decide_customer(test.id('custA'), true, 'Visited and verified');
  perform test.eq('grant app login to the shop owner', public.b2b_grant_login(test.id('custA'), 'shop1@test.local'), 'granted');
  perform test.fails('a sales manager cannot set credit (finance only)',
    format('select public.b2b_set_terms(%L, %L, %L)', test.id('custA'), '{"payment_terms":"credit","credit_limit":50000,"credit_status":"approved","credit_days":15}', 'x'), 'permission');
end $$;
reset role;

do $$
begin
  perform test.login('rep1@test.local');
  perform test.fails('a salesperson cannot raise a credit limit',
    format('select public.b2b_set_terms(%L, %L, %L)', test.id('custA'), '{"credit_limit":999999}', 'please'), 'permission');
end $$;
reset role;

do $$
begin
  perform test.login('fin@test.local');
  perform public.b2b_set_terms(test.id('custA'), '{"payment_terms":"credit","credit_limit":8000,"credit_status":"approved","credit_days":15}', 'Two years of trade references');
  perform test.eq('finance sees the new customer', (select count(*)::int from jsonb_array_elements(public.b2b_customer_list('9811100001'))), 1);
end $$;
reset role;

do $$
begin
  perform test.login('pm@test.local');
  perform test.eq('operations see the same customer', (select count(*)::int from jsonb_array_elements(public.b2b_customer_list('Gupta Sweets'))), 1);
  reset role;
  perform test.login('smgr@test.local');
  perform test.eq('admin / CRM see the same customer', (public.b2b_customer_list('9811100001') -> 0 ->> 'customer_code') like 'MW-C-%', true);
  reset role;
  perform test.login('rep1@test.local');
  perform test.eq('assigned salesperson sees their customer', (select count(*)::int from jsonb_array_elements(public.b2b_customer_list(null))), 1);
  reset role;
  perform test.login('rep2@test.local');
  perform test.eq('another salesperson does not', (select count(*)::int from jsonb_array_elements(public.b2b_customer_list(null))), 0);
  perform test.fails('…and cannot open it', format('select public.b2b_customer_profile(%L)', test.id('custA')), 'not found');
  reset role;
  perform test.eq('exactly one customer record for the shop', (select count(*)::int from public.b2b_customers where mobile = '9811100001'), 1);
end $$;
reset role;

-- Self-registration in the Wholesale app; the territory picks the salesperson.
do $$
declare
  res jsonb;
begin
  perform test.login('shop2@test.local');
  res := public.b2b_register('{"shop_name":"Sharma Mithai Bhandar","owner_name":"Anil Sharma","mobile":"9811100002","business_address":"4 Civil Lines",
    "delivery_address":"4 Civil Lines","locality":"Civil Lines","city":"Prayagraj","customer_type":"mithai_retailer","expected_monthly_value":25000}');
  perform test.eq('registration waits for approval', res ->> 'status', 'pending_approval');
  perform test.eq('no app access before approval', public.b2b_me() ->> 'state', 'pending_approval');
  perform test.fails('no catalogue prices before approval', 'select public.b2b_catalogue()', 'approved customers');
end $$;
reset role;
select test.put('custB', (select customer_id from public.b2b_customer_users where user_id = test.id('shop2')));

do $$
begin
  perform test.eq('territory assigns the salesperson', (select assigned_salesperson from public.b2b_customers where id = test.id('custB')), test.id('sp1'));
  perform test.login('smgr@test.local');
  perform public.b2b_decide_customer(test.id('custB'), true, 'Called the owner');
  perform public.b2b_set_terms(test.id('custB'), '{"price_category":"preferred"}', 'Regular buyer');
  -- Customer-specific price for A, and the 5 kg pouch only for A.
  perform public.pr_save_price(jsonb_build_object('item_id', test.id('mc1k'), 'scope', 'customer', 'customer_id', test.id('custA'), 'price', 550));
  perform public.pr_set_item_access(test.id('custA'), test.id('mc5k'), true);
end $$;
reset role;

-- Someone registering with an existing shop's number never gets into that shop's account.
do $$
declare
  res jsonb;
begin
  perform test.put('shop3', test.make_user('shop3@test.local'));
  perform test.login('shop3@test.local');
  res := public.b2b_register('{"shop_name":"Gupta Sweets","owner_name":"Someone","mobile":"9811100001","business_address":"x","delivery_address":"x","locality":"Katra","city":"Prayagraj","customer_type":"sweet_shop","expected_monthly_value":1}');
  perform test.eq('existing number becomes a link request', res ->> 'status', 'link_requested');
  perform test.eq('…with no access to the existing account', public.b2b_me() ->> 'state', 'pending_approval');
  perform test.fails('…and no orders', format('select public.b2b_orders(%L)', test.id('custA')), 'not found');
end $$;
reset role;

-- TEST 4: customer-specific pricing and availability -------------------------------------------------
do $$
declare
  cat jsonb;
begin
  perform test.login('shop1@test.local');
  cat := public.b2b_catalogue();
  perform test.eq('shop A sees its negotiated 1 kg price', (select (e ->> 'price')::numeric from jsonb_array_elements(cat) e where e ->> 'item_id' = test.id('mc1k')::text), 550.00);
  perform test.eq('shop A sees the 5 kg pouch made available to it', (select count(*)::int from jsonb_array_elements(cat) e where e ->> 'item_id' = test.id('mc5k')::text), 1);
  perform test.eq('shop A sees the 500 g quantity break', (select (e -> 'breaks' -> 0 ->> 'price')::numeric from jsonb_array_elements(cat) e where e ->> 'item_id' = test.id('mc500')::text), 290.00);
  perform test.eq('catalogue never exposes cost', (select count(*)::int from jsonb_array_elements(cat) e where e ? 'standard_cost' or e ? 'unit_cost'), 0);
  reset role;
  perform test.login('shop2@test.local');
  cat := public.b2b_catalogue();
  perform test.eq('shop B sees its category price', (select (e ->> 'price')::numeric from jsonb_array_elements(cat) e where e ->> 'item_id' = test.id('mc1k')::text), 560.00);
  perform test.eq('shop B does not see the restricted pouch', (select count(*)::int from jsonb_array_elements(cat) e where e ->> 'item_id' = test.id('mc5k')::text), 0);
  perform test.fails('shop B cannot read shop A''s catalogue', format('select public.b2b_catalogue(%L)', test.id('custA')), 'not found');
  perform test.eq('shop B cannot read price rules directly', (select count(*)::int from public.wholesale_prices), 0);
end $$;
reset role;

-- TEST 1: salesperson order ------------------------------------------------------------------------
do $$
declare
  res jsonb;
  again jsonb;
begin
  perform test.login('rep1@test.local');
  perform test.fails('quantity rules are enforced (multiples of 5)',
    format('select public.b2b_place_order(%L, %L, %L)', test.id('custA'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc500'), 'qty', 7)), 'credit'), 'multiples of 5');
  res := public.b2b_place_order(test.id('custA'),
    jsonb_build_array(jsonb_build_object('item_id', test.id('mc500'), 'qty', 10, 'unit_price', 1), jsonb_build_object('item_id', test.id('mc1k'), 'qty', 2)),
    'credit', public.ist_today() + 2, 'Deliver before 10 am', 'rep1-order-key-0001');
  again := public.b2b_place_order(test.id('custA'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 2)), 'credit', null, null, 'rep1-order-key-0001');
  perform test.eq('a retried submission returns the same order', again ->> 'order_id', res ->> 'order_id');
  perform test.eq('order number format', (res ->> 'order_no') ~ '^MW-B2B-[0-9]{4}-[0-9]{5}$', true);
  perform test.put('orderA', (res ->> 'order_id')::uuid);
end $$;
reset role;

do $$
declare
  q jsonb;
  row jsonb;
begin
  perform test.eq('only one order was created', (select count(*)::int from public.orders where b2b_customer_id = test.id('custA')), 1);
  perform test.eq('price from the pricing engine, not the app (break price 290)', (select unit_price from public.order_items where order_id = test.id('orderA') and item_id = test.id('mc500')), 290);
  perform test.eq('customer-specific price applied', (select unit_price from public.order_items where order_id = test.id('orderA') and item_id = test.id('mc1k')), 550);
  perform test.eq('order total', (select total from public.orders where id = test.id('orderA')), 4000);
  perform test.eq('source is SALES_REP', (select source from public.orders where id = test.id('orderA')), 'sales_rep');
  perform test.eq('entered by the salesperson', (select salesperson_id from public.orders where id = test.id('orderA')), test.id('sp1'));
  perform test.eq('nothing is deducted from stock when an order is created', (select on_hand from public.v_stock_summary where item_id = test.id('mc500')), 35.000);
  perform test.eq('nothing reserved before operations accept it', (select reserved from public.v_stock_summary where item_id = test.id('mc500')), 0.000);
  perform test.login('pm@test.local');
  q := public.ops_order_queue('sales_rep');
  select e into row from jsonb_array_elements(q) e where e ->> 'id' = test.id('orderA')::text;
  perform test.eq('salesperson order is in the operations queue', row ->> 'channel', 'SALES_REP');
  perform test.eq('…with the salesperson', row ->> 'salesperson', 'Ravi Sales');
  perform test.fails('operations cannot allocate before accepting', format('select public.disp_allocate_order(%L)', test.id('orderA')), 'not been accepted');
end $$;
reset role;

-- TEST 2: direct B2B order, same queue ---------------------------------------------------------------
do $$
declare
  res jsonb;
begin
  perform test.login('shop2@test.local');
  perform test.fails('shop without credit cannot buy on credit',
    format('select public.b2b_place_order(%L, %L, %L)', test.id('custB'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 3)), 'credit'), 'no approved credit');
  perform test.fails('a delivery date operations cannot meet is refused',
    format('select public.b2b_place_order(%L, %L, %L, %L)', test.id('custB'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 3)), 'cod', public.ist_today()), 'earliest delivery');
  res := public.b2b_place_order(test.id('custB'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 3)), 'cod', null, null, 'shop2-order-key-0001');
  perform test.put('orderB', (res ->> 'order_id')::uuid);
end $$;
reset role;

do $$
declare
  q jsonb;
begin
  perform test.eq('direct order source is B2B_CUSTOMER_APP', (select source from public.orders where id = test.id('orderB')), 'b2b_app');
  perform test.eq('direct order is not attributed to a salesperson entry', (select salesperson_id from public.orders where id = test.id('orderB')), null::uuid);
  perform test.eq('…but keeps the account salesperson for CRM', (select account_salesperson_id from public.orders where id = test.id('orderB')), test.id('sp1'));
  perform test.eq('category price used', (select unit_price from public.order_items where order_id = test.id('orderB')), 560);
  perform test.login('pm@test.local');
  q := public.ops_order_queue('action');
  perform test.eq('both orders are in the one operations queue',
    (select count(*)::int from jsonb_array_elements(q) e where e ->> 'id' in (test.id('orderA')::text, test.id('orderB')::text)), 2);
  perform test.eq('direct order channel', (select e ->> 'channel' from jsonb_array_elements(q) e where e ->> 'id' = test.id('orderB')::text), 'B2B_CUSTOMER_APP');
end $$;
reset role;

-- TEST 12: amendment audit trail --------------------------------------------------------------------
do $$
begin
  perform test.login('rep2@test.local');
  perform test.fails('another salesperson cannot change the order',
    format('select public.b2b_amend_order(%L, %L, %L)', test.id('orderB'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 1)), 'x'), 'not found|cannot');
  reset role;
  perform test.login('smgr@test.local');
  perform test.fails('an amendment needs a reason',
    format('select public.b2b_amend_order(%L, %L, %L)', test.id('orderB'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 4)), ''), 'reason');
  perform public.b2b_amend_order(test.id('orderB'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 4)), 'Owner called to add one box');
end $$;
reset role;

do $$
declare
  m public.order_amendments;
begin
  select * into m from public.order_amendments where order_id = test.id('orderB');
  perform test.eq('original quantity kept', (m.before -> 'lines' -> 0 ->> 'qty')::int, 3);
  perform test.eq('revised quantity recorded', (m.after -> 'lines' -> 0 ->> 'qty')::numeric::int, 4);
  perform test.eq('original total kept', (m.before ->> 'total')::int, 1680);
  perform test.eq('revised total', (m.after ->> 'total')::int, 2240);
  perform test.eq('reason recorded', m.reason, 'Owner called to add one box');
  perform test.eq('who changed it', m.amended_by, test.id('smgr'));
  perform test.eq('when', m.amended_at is not null, true);
  perform test.eq('amendment is in the audit log', (select count(*)::int from public.audit_log where action = 'order.b2b_amend' and entity_id = test.id('orderB')::text), 1);
  perform test.fails('amendment records cannot be altered', format('update public.order_amendments set reason = %L where order_id = %L', 'x', test.id('orderB')), 'permanent');
end $$;

-- TEST 5: more than the stock ------------------------------------------------------------------------
do $$
declare
  res jsonb;
begin
  perform test.login('shop1@test.local');
  res := public.b2b_place_order(test.id('custA'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 500)), 'cod');
  perform test.eq('impossible quantity is flagged, not silently accepted', 'stock_shortage' = any (array(select jsonb_array_elements_text(res -> 'approval_reasons'))), true);
  perform test.eq('shortage reported to the customer', (res -> 'shortages' -> 0 ->> 'short')::numeric > 0, true);
  perform test.eq('customer sees it waiting for operations', res ->> 'status', 'Order submitted');
  perform test.put('orderBig', (res ->> 'order_id')::uuid);
end $$;
reset role;

do $$
declare
  res jsonb;
  plan jsonb;
begin
  perform test.login('pm@test.local');
  res := public.b2b_accept_order(test.id('orderBig'), public.ist_today() + 5, 'Back-order: make the rest');
  perform test.eq('allocation reports the shortage', jsonb_array_length(res -> 'shortages'), 1);
  perform test.eq('customer status shows pending stock / production', (public.b2b_order_detail(test.id('orderBig')) -> 'order' ->> 'status'), 'Pending stock or production');
  plan := public.ops_production_requirements();
  perform test.eq('production planner sees the extra quantity needed',
    (select (e ->> 'additional_required')::numeric > 0 from jsonb_array_elements(plan) e where e ->> 'item_id' = test.id('mc1k')::text), true);
  perform test.eq('unconfirmed orders are listed separately, not as demand',
    (select (e ->> 'unconfirmed_demand')::numeric from jsonb_array_elements(plan) e where e ->> 'item_id' = test.id('mc1k')::text), 6.000);
  -- Release it again so the other tests have stock.
  perform public.b2b_cancel_order(test.id('orderBig'), 'Customer will order in smaller lots');
end $$;
reset role;

do $$
begin
  perform test.eq('cancelling released every reservation', (select coalesce(sum(qty - qty_dispatched - qty_released), 0) from public.order_allocations where order_id = test.id('orderBig')), 0.000);
end $$;

-- TEST 6: operations processing end to end ---------------------------------------------------------
do $$
declare
  slip jsonb;
  lines jsonb;
begin
  perform test.login('pm@test.local');
  perform public.b2b_accept_order(test.id('orderA'), null, 'Within credit');
  perform test.eq('accepted and reserved', (public.b2b_order_detail(test.id('orderA')) -> 'order' ->> 'status'), 'Accepted by operations');
  perform public.disp_set_stage(test.id('orderA'), 'picking', 'Picking list printed');
  slip := public.ops_packing_slip(test.id('orderA'));
  perform test.eq('packing slip lists the packaging variants', jsonb_array_length(slip -> 'lines'), 2);
  perform test.eq('packing slip shows the source batch', (slip -> 'lines' -> 0 -> 'lots' -> 0 ->> 'batch_no') is not null, true);
  select jsonb_agg(jsonb_build_object('order_item_id', e ->> 'order_item_id', 'qty_packed', (e ->> 'to_pick')::numeric - case when e ->> 'sku' = 'MILK-CAKE-500G' then 1 else 0 end))
    into lines from jsonb_array_elements(slip -> 'lines') e;
  perform test.fails('a packing difference needs a documented exception',
    format('select public.ops_record_packing(%L, %L)', test.id('orderA'), lines), 'exception');
  select jsonb_agg(jsonb_build_object('order_item_id', e ->> 'order_item_id', 'qty_packed', (e ->> 'to_pick')::numeric)) into lines from jsonb_array_elements(slip -> 'lines') e;
  perform public.ops_record_packing(test.id('orderA'), lines, null, '{"labels":true,"seals":true,"count_checked":true}');
  perform test.eq('packed', (select fulfilment_status from public.orders where id = test.id('orderA')), 'packed');
  perform test.put('dispA', public.disp_dispatch_order(test.id('orderA'), null, 'Vikas', null, 'Gupta Sweets van'));
end $$;
reset role;

do $$
declare
  d jsonb;
begin
  perform test.eq('dispatch takes stock out of the reserved lots', (select on_hand from public.v_stock_summary where item_id = test.id('mc500')), 25.000);
  perform test.login('shop1@test.local');
  d := public.b2b_order_detail(test.id('orderA'));
  perform test.eq('customer sees Dispatched', d -> 'order' ->> 'status', 'Dispatched');
  perform test.eq('customer timeline shows every stage',
    (select array_agg(e.v ->> 'status' order by e.n) from jsonb_array_elements(d -> 'events') with ordinality as e(v, n)) @> array['submitted', 'confirmed', 'processing', 'picking', 'packed', 'dispatched'], true);
  perform test.eq('customer gets in-app updates without anyone copying them', (select count(*)::int from public.b2b_notifications where order_id = test.id('orderA') and channel = 'in_app') >= 6, true);
  reset role;
  perform test.login('rep1@test.local');
  perform test.eq('salesperson sees the same status', (select e ->> 'status' from jsonb_array_elements(public.b2b_orders()) e where e ->> 'id' = test.id('orderA')::text), 'Dispatched');
  reset role;
  perform test.login('pm@test.local');
  perform public.disp_update_delivery(test.id('dispA'), 'delivered', 'Received by owner');
  reset role;
  perform test.login('shop1@test.local');
  perform test.eq('customer sees Delivered', public.b2b_order_detail(test.id('orderA')) -> 'order' ->> 'status', 'Delivered');
end $$;
reset role;

-- TEST 7: batch traceability ----------------------------------------------------------------------
do $$
declare
  t jsonb;
begin
  perform test.login('pm@test.local');
  t := public.ops_batch_customers(test.id('batch1'));
  perform test.eq('batch traces to the B2B customer and order',
    (select count(*)::int from jsonb_array_elements(t) e where e ->> 'order_id' = test.id('orderA')::text and e ->> 'customer' = 'Gupta Sweets' and e ->> 'customer_code' like 'MW-C-%'), 2);
  perform test.eq('dispatched quantity traced', (select sum((e ->> 'qty')::numeric) from jsonb_array_elements(t) e where e ->> 'order_id' = test.id('orderA')::text), 12.000);
end $$;
reset role;

-- TEST 8: finance — credit order, invoice, part payment, no duplicates -------------------------------
do $$
declare
  s jsonb;
begin
  perform test.eq('invoiced when dispatched', (select invoice_number is not null from public.orders where id = test.id('orderA')), true);
  perform test.eq('one sale entry for the order', (select count(*)::int from public.journal_entries where posting_key = 'sale:' || test.id('orderA')), 1);
  perform test.eq('receivable on the customer''s own account', (select sum(debit - credit) from public.journal_lines where account_code = '1100' and party_id = 'b2b:' || test.id('custA')), 4000.00);
  perform test.eq('no cash receipt for an unpaid credit order', (select count(*)::int from public.journal_entries where posting_key = 'receipt:order:' || test.id('orderA')), 0);
  perform test.login('fin@test.local');
  perform public.b2b_receive_payment(test.id('custA'), 1500, public.ist_today(), 'upi', '1010', 'UPI ref 778', null, 'fin-receipt-key-0001');
  perform test.fails('the same receipt cannot post twice',
    format('select public.b2b_receive_payment(%L, 1500, %L, %L, %L, null, null, %L)', test.id('custA'), public.ist_today(), 'upi', '1010', 'fin-receipt-key-0001'), 'already saved');
  s := public.b2b_statement(test.id('custA'));
  perform test.eq('statement balance after part payment', (s ->> 'closing')::numeric, 2500.00);
  perform test.eq('open invoice shows what is still due', (s -> 'open_invoices' -> 0 ->> 'outstanding')::numeric, 2500.00);
  perform test.eq('available credit reflects the balance', (s -> 'credit' ->> 'available')::numeric, 5500.00);
  -- A second invoice trigger (e.g. a delivery update) must not post the sale again.
  perform public.fin_retry_postings();
end $$;
reset role;

do $$
begin
  perform test.eq('still exactly one sale entry', (select count(*)::int from public.journal_entries where posting_key = 'sale:' || test.id('orderA')), 1);
  perform test.eq('ledger still balanced for the customer', (select sum(debit - credit) from public.journal_lines where account_code = '1100' and party_id = 'b2b:' || test.id('custA')), 2500.00);
  perform test.login('shop1@test.local');
  perform test.eq('customer sees the same balance (finance is the source of truth)', (public.b2b_statement(test.id('custA')) ->> 'closing')::numeric, 2500.00);
  perform test.fails('customer cannot record payments', format('select public.b2b_receive_payment(%L, 2500, %L, %L, %L)', test.id('custA'), public.ist_today(), 'cash', '1000'), 'permission');
end $$;
reset role;

-- TEST 9: customer permissions ------------------------------------------------------------------------
do $$
begin
  perform test.login('shop2@test.local');
  perform test.fails('shop B cannot open shop A''s order', format('select public.b2b_order_detail(%L)', test.id('orderA')), 'not found');
  perform test.fails('shop B cannot read shop A''s statement', format('select public.b2b_statement(%L)', test.id('custA')), 'not found');
  perform test.fails('shop B cannot read shop A''s profile', format('select public.b2b_customer_profile(%L)', test.id('custA')), 'not found');
  perform test.fails('shop B cannot order for shop A',
    format('select public.b2b_place_order(%L, %L, %L)', test.id('custA'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 1)), 'cod'), 'not found');
  perform test.fails('shop B cannot cancel shop A''s order', format('select public.b2b_cancel_order(%L, %L)', test.id('orderA'), 'x'), 'not found');
  perform test.eq('direct table reads return nothing', (select count(*)::int from public.orders where b2b_customer_id = test.id('custA')), 0);
  perform test.eq('no other customers in the customer table', (select count(*)::int from public.b2b_customers), 0);
  perform test.eq('shop B lists only its own orders',
    (select bool_and(e ->> 'customer_id' = test.id('custB')::text) from jsonb_array_elements(public.b2b_orders()) e), true);
end $$;
reset role;

-- TEST 10: marketing consent ----------------------------------------------------------------------------
do $$
declare
  c1 uuid;
  c2 uuid;
  r jsonb;
begin
  perform test.eq('new customers are not opted in to marketing', (select marketing_consent from public.b2b_customers where id = test.id('custA')), false);
  perform test.login('smgr@test.local');
  c1 := public.mkt_save_campaign('{"name":"Diwali Milk Cake offer","channel":"whatsapp","segment":"all","message":"Order Diwali stock early this year"}');
  r := public.mkt_approve_campaign(c1);
  perform test.eq('customers without consent are never recipients', (r ->> 'recipients')::int, 0);
  perform test.eq('…and are counted as excluded', (r ->> 'excluded_no_consent')::int >= 2, true);
  reset role;
  perform test.login('shop2@test.local');
  perform public.b2b_record_consent(test.id('custB'), true, array['whatsapp']);
  reset role;
  perform test.login('smgr@test.local');
  c2 := public.mkt_save_campaign('{"name":"New Kunda launch","channel":"whatsapp","segment":"marketing_consent","message":"Try our new Kunda this week"}');
  r := public.mkt_approve_campaign(c2);
  perform test.eq('the consenting customer is a recipient', (r ->> 'recipients')::int, 1);
  perform test.fails('staff must record where consent came from', format('select public.b2b_record_consent(%L, true, array[%L])', test.id('custA'), 'sms'), 'Say how');
  reset role;
  perform test.login('shop2@test.local');
  perform public.b2b_record_consent(test.id('custB'), false, null, null, 'STOP');
  reset role;
  perform test.login('smgr@test.local');
  perform test.eq('an opt-out after approval is respected', jsonb_array_length(public.mkt_campaign_recipients(c2)), 0);
  perform test.eq('the opt-out is recorded with its date', (select opted_out_at is not null from public.b2b_customers where id = test.id('custB')), true);
  perform test.eq('consent history kept', (select count(*)::int from public.b2b_consent_log where customer_id = test.id('custB')), 2);
end $$;
reset role;

-- TEST 11: attribution and totals ------------------------------------------------------------------
do $$
declare
  perf jsonb;
  b jsonb;
  row jsonb;
begin
  perform test.login('smgr@test.local');
  perf := public.b2b_sales_performance(public.ist_today() - 1, public.ist_today());
  select e into row from jsonb_array_elements(perf) e where e ->> 'salesperson_id' = test.id('sp1')::text;
  perform test.eq('salesperson credited only with the order they entered', (row ->> 'rep_orders')::int, 1);
  perform test.eq('their entered sales', (row ->> 'rep_sales')::numeric, 4000::numeric);
  perform test.eq('direct order from their account shown separately', (row ->> 'direct_orders_from_accounts')::int, 1);
  perform test.eq('…with its value', (row ->> 'direct_sales_from_accounts')::numeric, 2240::numeric);
  perform test.eq('incentive on entered orders only (2%)', (row ->> 'incentive')::numeric, 80.00);
  perform test.eq('customers acquired', (row ->> 'customers_acquired')::int, 1);
  b := public.b2b_sales_breakdown(public.ist_today() - 1, public.ist_today());
  perform test.eq('totals count each order once (cancelled excluded)', (b -> 'totals' ->> 'sales')::numeric, 6240::numeric);
  perform test.eq('SALES_REP channel total', (select (e ->> 'sales')::numeric from jsonb_array_elements(b -> 'by_channel') e where e ->> 'source' = 'sales_rep'), 4000::numeric);
  perform test.eq('B2B_CUSTOMER_APP channel total', (select (e ->> 'sales')::numeric from jsonb_array_elements(b -> 'by_channel') e where e ->> 'source' = 'b2b_app'), 2240::numeric);
  reset role;
  perform test.login('rep1@test.local');
  perform test.eq('salesperson dashboard from real orders', (public.fs_dashboard() ->> 'orders_placed')::int, 1);
  perform test.eq('…direct orders from their accounts counted apart', (public.fs_dashboard() ->> 'direct_orders_from_my_accounts')::int, 1);
end $$;
reset role;

-- Customer confirmation, special prices and reorder --------------------------------------------------
do $$
declare
  res jsonb;
  pr uuid;
  re jsonb;
begin
  perform test.login('owner@test.local');
  perform public.ops_update_setting('b2b.sales_rep_orders_need_confirmation', 'true');
  reset role;
  perform test.login('rep1@test.local');
  res := public.b2b_place_order(test.id('custA'), jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 1)), 'cod');
  perform test.eq('salesperson order waits for the shop to confirm', res ->> 'status', 'Awaiting your confirmation');
  pr := public.fs_request_price(test.id('custA'), test.id('mc500'), 280, 10, null, 'Competitor sells at 280 for 10+');
  perform test.fails('salesperson cannot approve their own price request', format('select public.pr_decide_price_request(%L, true)', pr), 'permission');
  re := public.b2b_reorder_lines(test.id('orderA'));
  perform test.eq('reorder copies products and quantities', jsonb_array_length(re -> 'lines'), 2);
  perform test.eq('reorder never copies old prices', (select count(*)::int from jsonb_array_elements(re -> 'lines') e where e ? 'unit_price'), 0);
  reset role;
  perform test.login('pm@test.local');
  perform test.fails('operations cannot accept before the shop confirms', format('select public.b2b_accept_order(%L)', (res ->> 'order_id')), 'not confirmed');
  reset role;
  perform test.login('shop1@test.local');
  perform public.b2b_confirm_order((res ->> 'order_id')::uuid, true);
  perform test.eq('confirmed by the shop, back with operations', (public.b2b_order_detail((res ->> 'order_id')::uuid) -> 'order' ->> 'stage'), 'submitted');
  reset role;
  perform test.login('smgr@test.local');
  perform public.pr_decide_price_request(pr, true, 285, null, public.ist_today() + 30, 'Approved for one month');
  reset role;
  perform test.eq('approved special price applies to the customer', (select price from public._b2b_price(test.id('custA'), test.id('mc500'), 10)), 285.00);
  perform test.eq('…with the approver recorded', (select approved_by from public.wholesale_prices where price_request_id = pr), test.id('smgr'));
  perform test.eq('…and not for other customers', (select price from public._b2b_price(test.id('custB'), test.id('mc500'), 10)), 290.00);
  perform test.login('owner@test.local');
  perform public.ops_update_setting('b2b.sales_rep_orders_need_confirmation', 'false');
end $$;
reset role;

do $$
begin
  perform test.eq('no posting errors from B2B orders', (select count(*)::int from public.posting_errors where resolved_at is null), 0);
end $$;

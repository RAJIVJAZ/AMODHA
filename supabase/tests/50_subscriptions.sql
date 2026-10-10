-- Acceptance tests 4 (subscription), 5 (skip tomorrow), 6 (extra milk), 7 (add-on products), plus cut-off,
-- pause/resume, price changes, bottles and customer isolation.
-- Note: the live site signs customers in with an email one-time code; mobile OTP needs an SMS provider
-- (see the deployment notes). The test customer here stands in for a verified sign-in.

do $$
begin
  perform test.put('cust2', test.make_user('cust2@test.local'));
  perform test.login('owner@test.local');
  -- A cut-off of 23:59 makes "tomorrow" the next open delivery whenever the test runs.
  perform public.ops_update_setting('subscriptions.cutoff_time', '"23:59"');

  perform test.put('p_milk', public.cat_save_product('{"code":"FRESH-MILK","name":"Farm fresh cow milk","category":"milk","source":"purchased","brand":"Mithai Wallah","base_unit":"l","is_subscribable":true,"show_in_app":true,"qc_required":false,"gst_rate":0}'));
  perform test.put('milk1l', public.cat_save_item(jsonb_build_object('code', 'MILK-1L-GLASS', 'name', 'Fresh milk — 1 L glass bottle', 'item_type', 'purchased_good',
    'category', 'purchased_dairy', 'unit', 'bottle', 'product_id', test.id('p_milk'), 'net_qty', 1, 'sale_price', 100, 'gst_rate', 0, 'is_perishable', true, 'shelf_life_days', 2)));

  perform test.put('p_paneer', public.cat_save_product('{"code":"PANEER","name":"Paneer","category":"dairy","source":"purchased","base_unit":"kg","show_in_app":true,"gst_rate":5}'));
  perform test.put('paneer', public.cat_save_item(jsonb_build_object('code', 'PANEER-500G', 'name', 'Paneer 500 g', 'item_type', 'purchased_good', 'category', 'purchased_dairy',
    'unit', 'pack', 'product_id', test.id('p_paneer'), 'net_qty', 0.5, 'sale_price', 260, 'gst_rate', 5)));
  perform test.put('p_curd', public.cat_save_product('{"code":"CURD","name":"Curd","category":"dairy","source":"purchased","base_unit":"kg","show_in_app":true,"gst_rate":5}'));
  perform test.put('curd', public.cat_save_item(jsonb_build_object('code', 'CURD-500G', 'name', 'Curd 500 g', 'item_type', 'purchased_good', 'category', 'purchased_dairy',
    'unit', 'tub', 'product_id', test.id('p_curd'), 'net_qty', 0.5, 'sale_price', 75, 'gst_rate', 5)));
  perform test.put('p_wbutter', public.cat_save_product('{"code":"WHITE-BUTTER","name":"White butter","category":"dairy","source":"purchased","base_unit":"kg","show_in_app":true,"gst_rate":12}'));
  perform test.put('wbutter', public.cat_save_item(jsonb_build_object('code', 'WHITE-BUTTER-100G', 'name', 'White butter 100 g', 'item_type', 'purchased_good', 'category', 'purchased_dairy',
    'unit', 'pack', 'product_id', test.id('p_wbutter'), 'net_qty', 0.1, 'sale_price', 85, 'gst_rate', 12)));
  perform test.put('p_amul', public.cat_save_product('{"code":"AMUL-BUTTER","name":"Amul butter","category":"dairy","source":"purchased","brand":"Amul","base_unit":"kg","show_in_app":true,"gst_rate":12}'));
  perform test.put('amul', public.cat_save_item(jsonb_build_object('code', 'AMUL-BUTTER-100G', 'name', 'Amul butter 100 g', 'item_type', 'purchased_good', 'category', 'purchased_dairy',
    'unit', 'pack', 'product_id', test.id('p_amul'), 'net_qty', 0.1, 'sale_price', 60, 'gst_rate', 12)));
  perform test.put('p_bread', public.cat_save_product('{"code":"BREAD-WHITE","name":"White bread","category":"bakery_products","source":"purchased","brand":"Local bakery","base_unit":"pcs","show_in_app":true,"gst_rate":0}'));
  perform test.put('bread', public.cat_save_item(jsonb_build_object('code', 'BREAD-WHITE-400G', 'name', 'White bread 400 g', 'item_type', 'purchased_good', 'category', 'bakery',
    'unit', 'pack', 'product_id', test.id('p_bread'), 'net_qty', 1, 'sale_price', 45, 'gst_rate', 0)));
  perform test.put('p_eggs', public.cat_save_product('{"code":"EGGS","name":"Eggs","category":"eggs_breakfast","source":"purchased","base_unit":"pcs","show_in_app":true,"gst_rate":0}'));
  perform test.put('eggs', public.cat_save_item(jsonb_build_object('code', 'EGGS-6', 'name', 'Eggs — pack of 6', 'item_type', 'purchased_good', 'category', 'eggs',
    'unit', 'tray', 'product_id', test.id('p_eggs'), 'net_qty', 6, 'sale_price', 60, 'gst_rate', 0)));

  perform public.inv_receive_opening_stock(test.id('milk1l'), 50, 70);
  perform public.inv_receive_opening_stock(test.id('paneer'), 10, 200);
  perform public.inv_receive_opening_stock(test.id('curd'), 10, 55);
  perform public.inv_receive_opening_stock(test.id('wbutter'), 10, 65);
  perform public.inv_receive_opening_stock(test.id('amul'), 10, 52);
  perform public.inv_receive_opening_stock(test.id('bread'), 10, 36);
  perform public.inv_receive_opening_stock(test.id('eggs'), 10, 45);
end $$;
reset role;

-- TEST 4: a customer subscribes and sees the next delivery -------------------------------------
do $$
declare
  sub jsonb := jsonb_build_object('item_id', test.id('milk1l'), 'qty_units', 2, 'frequency', 'daily', 'slot', 'morning',
    'customer_name', 'Test Customer', 'phone', '9876543210', 'address', '12 Civil Lines', 'pincode', '211001', 'bottle_arrangement', 'returnable_glass');
begin
  perform test.login('cust@test.local');
  perform test.fails('subscriptions stay closed until launch', format('select public.sub_create(%L)', sub), 'not opened yet');
  reset role;
  perform test.login('owner@test.local');
  perform public.ops_update_setting('subscriptions.enabled', 'true');
  reset role;
  perform test.login('cust@test.local');
  perform test.fails('outside the delivery area', format('select public.sub_create(%L)', sub || '{"pincode":"110001"}'), 'don''t deliver');
  perform test.put('sub1', public.sub_create(sub));
end $$;
reset role;

do $$
declare
  ov jsonb;
  d date := public.sub_first_open_date();
begin
  perform test.put('cust_id', test.id('cust'));
  perform test.login('cust@test.local');
  ov := public.sub_my_overview();
  perform test.eq('next delivery is the first open day', (ov -> 'upcoming' -> 0 ->> 'date')::date, d);
  perform test.eq('next delivery has 2 litres', (ov -> 'upcoming' -> 0 -> 'lines' -> 0 ->> 'qty')::int, 2);
  perform test.eq('price shown is ₹100 / litre', (ov -> 'subscriptions' -> 0 ->> 'price_today')::numeric, 100.00);
  perform test.eq('monthly estimate shown', (ov -> 'subscriptions' -> 0 ->> 'monthly_estimate')::numeric, 6000::numeric);
  perform test.eq('two weeks of deliveries scheduled', jsonb_array_length(ov -> 'upcoming') >= 13, true);
end $$;
reset role;

-- TEST 5: skip tomorrow ----------------------------------------------------------------------
do $$
declare
  d date := public.sub_first_open_date();
begin
  perform test.login('cust@test.local');
  perform public.sub_skip(test.id('sub1'), d, 'Travelling');
end $$;
reset role;
do $$
declare
  d date := public.sub_first_open_date();
begin
  perform test.eq('tomorrow is skipped', (select status from public.subscription_deliveries where subscription_id = test.id('sub1') and delivery_date = d), 'skipped');
  perform test.eq('the day after is still scheduled', (select status from public.subscription_deliveries where subscription_id = test.id('sub1') and delivery_date = d + 1), 'scheduled');
  perform test.eq('subscription remains active', (select status from public.subscriptions where id = test.id('sub1')), 'active');
  perform test.eq('nothing charged for the skipped day', (select count(*)::int from public.orders o join public.subscription_deliveries x on x.order_id = o.id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d), 0);
end $$;

-- A delivery whose cut-off has passed cannot be changed.
do $$
declare
  did uuid;
begin
  insert into public.subscription_deliveries (subscription_id, user_id, delivery_date, slot, status, customer_name, phone, address, city, pincode)
  values (test.id('sub1'), test.id('cust'), public.ist_today(), 'morning', 'scheduled', 'Test Customer', '9876543210', '12 Civil Lines', 'Prayagraj', '211001')
  returning id into did;
  insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price) values (did, test.id('milk1l'), 'subscription', 2, 100);
  perform test.login('cust@test.local');
  perform test.fails('cannot skip after the cut-off', format('select public.sub_skip(%L, public.ist_today())', test.id('sub1')), 'closed at');
  perform test.fails('cannot add extra after the cut-off', format('select public.sub_set_extra(%L, public.ist_today(), 1)', test.id('sub1')), 'closed at');
end $$;
reset role;

-- TEST 6: one extra litre for one day only ----------------------------------------------------
do $$
declare
  d date := public.sub_first_open_date() + 1;
begin
  perform test.login('cust@test.local');
  perform public.sub_set_extra(test.id('sub1'), d, 1);
end $$;
reset role;
do $$
declare
  d date := public.sub_first_open_date() + 1;
begin
  perform test.eq('that day carries 3 litres', (select sum(l.qty)::int from public.subscription_delivery_lines l join public.subscription_deliveries x on x.id = l.delivery_id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d), 3);
  perform test.eq('the next day stays at 2 litres', (select sum(l.qty)::int from public.subscription_delivery_lines l join public.subscription_deliveries x on x.id = l.delivery_id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d + 1), 2);
  perform test.eq('the regular quantity is unchanged', (select qty_units from public.subscriptions where id = test.id('sub1')), 2);
end $$;

-- TEST 7: paneer, curd, bread, butter and eggs on the same delivery ---------------------------
do $$
declare
  d date := public.sub_first_open_date() + 1;
begin
  perform test.login('cust@test.local');
  perform test.fails('cannot add more eggs than in stock', format('select public.sub_set_addons(%L, %L, %L)', test.id('sub1'), d,
    jsonb_build_array(jsonb_build_object('item_id', test.id('eggs'), 'qty', 50))), 'only 10 of');
  perform public.sub_set_addons(test.id('sub1'), d, jsonb_build_array(
    jsonb_build_object('item_id', test.id('paneer'), 'qty', 1), jsonb_build_object('item_id', test.id('curd'), 'qty', 1),
    jsonb_build_object('item_id', test.id('wbutter'), 'qty', 1), jsonb_build_object('item_id', test.id('amul'), 'qty', 1),
    jsonb_build_object('item_id', test.id('bread'), 'qty', 2), jsonb_build_object('item_id', test.id('eggs'), 'qty', 1)));
end $$;
reset role;

do $$
declare
  d date := public.sub_first_open_date() + 1;
  oid uuid;
  res jsonb;
begin
  perform test.eq('add-ons do not become recurring', (select count(*)::int from public.subscription_delivery_lines l join public.subscription_deliveries x on x.id = l.delivery_id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d + 1 and l.line_type = 'addon'), 0);
  perform test.login('owner@test.local');
  perform test.eq('one delivery locked into one order', public.sub_lock_day(d), 1);
  reset role;
  select order_id into oid from public.subscription_deliveries where subscription_id = test.id('sub1') and delivery_date = d;
  perform test.put('sub_order', oid);
  perform test.eq('order total = milk 3 × 100 + add-ons', (select total from public.orders where id = oid), 300 + 260 + 75 + 85 + 60 + 2 * 45 + 60);
  perform test.eq('one order line per product and type', (select count(*)::int from public.order_items where order_id = oid), 8);
  perform test.eq('lines linked to stock items', (select count(*)::int from public.order_items where order_id = oid and item_id is null), 0);
  perform test.eq('subscription order is invoiced', (select invoice_number is not null from public.orders where id = oid), true);
  perform test.login('pm@test.local');
  res := public.disp_allocate_order(oid);
  perform test.eq('all items available and reserved', jsonb_array_length(res -> 'shortages'), 0);
  perform test.put('sub_dispatch', public.disp_dispatch_order(oid, null, 'Milk route 1'));
  perform public.disp_update_delivery(test.id('sub_dispatch'), 'delivered', 'Morning round', 930, 'upi');
  perform public.sub_record_bottles(test.id('cust'), 3, 0, 0, null, 'Three bottles left');
end $$;
reset role;

do $$
declare
  d date := public.sub_first_open_date() + 1;
begin
  perform test.eq('delivery record shows delivered', (select status from public.subscription_deliveries where subscription_id = test.id('sub1') and delivery_date = d), 'delivered');
  perform test.eq('milk stock reduced by 3', (select on_hand from public.v_stock_summary where item_id = test.id('milk1l')), 47.000);
  perform test.eq('bread stock reduced by 2', (select on_hand from public.v_stock_summary where item_id = test.id('bread')), 8.000);
  perform test.eq('eggs reduced by 1', (select on_hand from public.v_stock_summary where item_id = test.id('eggs')), 9.000);
  perform test.eq('customer balance settled', (select coalesce(sum(debit - credit), 0) from public.journal_lines where account_code = '1100' and party_id = test.id('cust')::text), 0.00);
end $$;

-- Pause, resume, quantity change and a price change -------------------------------------------
do $$
declare
  d date := public.sub_first_open_date();
begin
  perform test.login('cust@test.local');
  perform public.sub_pause(test.id('sub1'), d + 3, d + 4);
end $$;
reset role;
do $$
declare
  d date := public.sub_first_open_date();
begin
  perform test.eq('paused days', (select count(*)::int from public.subscription_deliveries where subscription_id = test.id('sub1') and status = 'paused'), 2);
  perform test.login('cust@test.local');
  perform public.sub_resume(test.id('sub1'));
  perform public.sub_change_quantity(test.id('sub1'), 3);
  reset role;
  perform test.eq('no paused days after resume', (select count(*)::int from public.subscription_deliveries where subscription_id = test.id('sub1') and status = 'paused'), 0);
  perform test.eq('new quantity applies to open days', (select l.qty from public.subscription_delivery_lines l join public.subscription_deliveries x on x.id = l.delivery_id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d + 2 and l.line_type = 'subscription'), 3);
  perform test.eq('locked day keeps its quantity', (select sum(l.qty)::int from public.subscription_delivery_lines l join public.subscription_deliveries x on x.id = l.delivery_id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d + 1 and l.line_type in ('subscription', 'extra')), 3);
  perform test.eq('skipped day stays skipped', (select status from public.subscription_deliveries where subscription_id = test.id('sub1') and delivery_date = d), 'skipped');
end $$;
reset role;

do $$
declare
  d date := public.sub_first_open_date();
begin
  perform test.login('owner@test.local');
  perform test.fails('price cannot change for a locked day', format('select public.cat_set_item_price(%L, 110, public.ist_today())', test.id('milk1l')), 'at the earliest');
  perform public.cat_set_item_price(test.id('milk1l'), 110, d + 5, 'Feed costs went up');
  reset role;
  perform test.eq('days before the change keep ₹100', (select l.unit_price from public.subscription_delivery_lines l join public.subscription_deliveries x on x.id = l.delivery_id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d + 4 and l.line_type = 'subscription'), 100.00);
  perform test.eq('days from the change are ₹110', (select l.unit_price from public.subscription_delivery_lines l join public.subscription_deliveries x on x.id = l.delivery_id
    where x.subscription_id = test.id('sub1') and x.delivery_date = d + 5 and l.line_type = 'subscription'), 110.00);
  perform test.eq('customer is told about the change', (select count(*)::int from public.subscription_notices where user_id = test.id('cust')), 1);
end $$;
reset role;

-- Customers only ever see their own subscription ---------------------------------------------
do $$
begin
  perform test.login('cust2@test.local');
  perform test.eq('another customer sees no subscriptions', (select count(*)::int from public.subscriptions), 0);
  perform test.eq('another customer sees no deliveries', (select count(*)::int from public.subscription_deliveries), 0);
  perform test.fails('another customer cannot skip it', format('select public.sub_skip(%L, public.sub_first_open_date() + 2)', test.id('sub1')), 'not found');
  perform test.eq('their overview is empty', jsonb_array_length(public.sub_my_overview() -> 'subscriptions'), 0);
end $$;
reset role;

do $$
declare
  ov jsonb;
begin
  perform test.login('cust@test.local');
  ov := public.sub_my_overview();
  perform test.eq('bottles outstanding shown to the customer', (ov ->> 'bottles_outstanding')::int, 3);
  perform test.fails('customer cannot change a delivered order', format('update public.orders set total = 1 where id = %L', test.id('sub_order')), 'permission denied');
  perform public.sub_cancel(test.id('sub1'), 'Moving house');
end $$;
reset role;
do $$
begin
  perform test.eq('cancelled subscription', (select status from public.subscriptions where id = test.id('sub1')), 'cancelled');
  perform test.eq('future open deliveries cancelled', (select count(*)::int from public.subscription_deliveries where subscription_id = test.id('sub1')
    and delivery_date >= public.sub_first_open_date() and status in ('scheduled', 'paused')), 0);
  perform test.eq('delivered history kept', (select count(*)::int from public.subscription_deliveries where subscription_id = test.id('sub1') and status = 'delivered'), 1);
end $$;

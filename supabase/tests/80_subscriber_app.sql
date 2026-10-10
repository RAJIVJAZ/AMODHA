-- Subscriber app: changing the delivery schedule, and the customer's monthly statement.

-- Chosen weekdays and delivery time -------------------------------------------------------------
do $$
declare
  sid uuid;
begin
  perform test.login('cust2@test.local');
  sid := public.sub_create(jsonb_build_object('item_id', test.id('milk1l'), 'qty_units', 1, 'frequency', 'daily', 'slot', 'morning',
    'customer_name', 'Second Customer', 'phone', '9811112222', 'address', '5 Tagore Town', 'pincode', '211002'));
  perform test.put('sub2', sid);
  perform test.fails('a chosen-days schedule needs at least one day', format('select public.sub_change_schedule(%L, %L, %L)', sid, 'custom', '{}'), 'at least one day');
  perform test.fails('an unknown schedule is rejected', format('select public.sub_change_schedule(%L, %L)', sid, 'weekly'), 'how often');
  perform test.fails('an unknown delivery time is rejected', format('select public.sub_change_schedule(%L, %L, null, %L)', sid, 'daily', 'night'), 'morning or evening');
  perform public.sub_change_schedule(sid, 'custom', array[5, 1, 3, 3], 'evening');
end $$;
reset role;

do $$
declare
  d date := public.sub_first_open_date();
begin
  perform test.eq('schedule saved (days sorted, no repeats)', (select frequency || ':' || array_to_string(days_of_week, ',') || ':' || slot
    from public.subscriptions where id = test.id('sub2')), 'custom:1,3,5:evening');
  perform test.eq('only Monday, Wednesday and Friday deliveries ahead', (select count(*)::int from public.subscription_deliveries
    where subscription_id = test.id('sub2') and delivery_date >= d and status = 'scheduled' and extract(dow from delivery_date)::int not in (1, 3, 5)), 0);
  perform test.eq('other days are cancelled, not deleted', (select count(*)::int from public.subscription_deliveries
    where subscription_id = test.id('sub2') and delivery_date >= d and extract(dow from delivery_date)::int not in (1, 3, 5) and status <> 'cancelled'), 0);
  perform test.eq('there are Monday, Wednesday and Friday deliveries', (select count(*)::int from public.subscription_deliveries
    where subscription_id = test.id('sub2') and status = 'scheduled') >= 4, true);
  perform test.eq('deliveries moved to the evening', (select count(*)::int from public.subscription_deliveries
    where subscription_id = test.id('sub2') and delivery_date >= d and status = 'scheduled' and slot <> 'evening'), 0);
  perform test.eq('schedule change is in the history', (select count(*)::int from public.subscription_events
    where subscription_id = test.id('sub2') and action = 'schedule'), 1);
end $$;

do $$
begin
  perform test.login('cust2@test.local');
  perform public.sub_change_schedule(test.id('sub2'), 'daily');
end $$;
reset role;

do $$
begin
  perform test.eq('back to daily brings the other days back', (select count(*)::int from public.subscription_deliveries
    where subscription_id = test.id('sub2') and delivery_date between public.sub_first_open_date() and public.ist_today() + 14 and status <> 'scheduled'), 0);
  perform test.eq('chosen days cleared for a daily schedule', (select days_of_week is null from public.subscriptions where id = test.id('sub2')), true);
  perform test.eq('delivery time kept when not changed', (select slot from public.subscriptions where id = test.id('sub2')), 'evening');
end $$;

do $$
begin
  perform test.login('cust@test.local');
  perform test.fails('another customer cannot change the schedule', format('select public.sub_change_schedule(%L, %L)', test.id('sub2'), 'mon_to_sat'), 'not found');
  perform test.fails('a cancelled subscription cannot be rescheduled', format('select public.sub_change_schedule(%L, %L)', test.id('sub1'), 'daily'), 'cancelled');
end $$;
reset role;

-- Monthly statement -----------------------------------------------------------------------------
do $$
declare
  dd date := (select delivery_date from public.subscription_deliveries where subscription_id = test.id('sub1') and status = 'delivered' limit 1);
  want_value numeric := (select sum(l.qty * l.unit_price) from public.subscription_deliveries d join public.subscription_delivery_lines l on l.delivery_id = d.id
    where d.subscription_id = test.id('sub1') and d.status = 'delivered');
  want_units numeric := (select sum(l.qty) from public.subscription_deliveries d join public.subscription_delivery_lines l on l.delivery_id = d.id
    where d.subscription_id = test.id('sub1') and d.status = 'delivered' and l.item_id = test.id('milk1l'));
  want_billed numeric := (select total from public.orders where id = test.id('sub_order'));
  want_balance numeric := (select coalesce(sum(debit - credit), 0) from public.journal_lines where account_code = '1100' and party_id = test.id('cust')::text);
  inv text := (select invoice_number from public.orders where id = test.id('sub_order'));
  st jsonb;
begin
  perform test.login('cust@test.local');
  st := public.sub_my_statement(dd);
  perform test.eq('statement is for the month asked', (st ->> 'month')::date, date_trunc('month', dd)::date);
  perform test.eq('the delivered day is listed with its tax invoice', (select count(*)::int from jsonb_array_elements(st -> 'days') x
    where x ->> 'status' = 'delivered' and x ->> 'invoice_number' = inv), 1);
  perform test.eq('delivered value', (st ->> 'delivered_value')::numeric, want_value);
  perform test.eq('litres of milk delivered', (st ->> 'milk_units_delivered')::numeric, want_units);
  perform test.eq('billed = the invoiced delivery', (st ->> 'billed')::numeric, want_billed);
  perform test.eq('balance matches the books', (st ->> 'balance_due')::numeric, want_balance);
  perform test.eq('the month is offered in the month list', (st -> 'months') ? date_trunc('month', dd)::date::text, true);
  reset role;
  perform test.login('cust2@test.local');
  st := public.sub_my_statement(dd);
  perform test.eq('another customer never sees that delivery', (select count(*)::int from jsonb_array_elements(st -> 'days') x where x ->> 'invoice_number' = inv), 0);
end $$;
reset role;

do $$
begin
  perform test.eq('statement needs sign-in', has_function_privilege('anon', 'public.sub_my_statement(date)', 'execute'), false);
  perform test.eq('schedule change needs sign-in', has_function_privilege('anon', 'public.sub_change_schedule(uuid, text, integer[], text)', 'execute'), false);
end $$;

-- The existing website keeps working on top of the new system, and staff can enter orders.

-- The storefront saves orders with the secret key (service role), exactly as src/lib/orders.ts does.
do $$
declare
  oid uuid;
begin
  set local role service_role;
  insert into public.orders (customer_name, phone, email, address, city, pincode, payment_method, payment_status, status, subtotal, delivery_fee, discount, total)
  values ('Web Buyer', '9822222222', 'web@test.local', 'Lukerganj', 'Prayagraj', '211001', 'cod', 'cod', 'received', 380, 69, 0, 449)
  returning id into oid;
  insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity, hsn, gst_rate)
  values (oid, 'kalakand', 'Kalakand', '500 g', 380, 1, '21069099', 5);
  perform public.assign_invoice_number(oid);                         -- sendOrderEmails
  update public.orders set status = 'preparing' where id = oid;     -- old /admin status menu
  reset role;
  perform test.eq('website order linked to its SKU', (select item_id is not null from public.order_items where order_id = oid), true);
  perform test.eq('old admin status menu still drives fulfilment', (select fulfilment_status from public.orders where id = oid), 'processing');
  perform test.eq('website order is in the books', (select count(*)::int from public.journal_entries where posting_key = 'sale:' || oid), 1);
  perform test.eq('no posting errors', (select count(*)::int from public.posting_errors), 0);
  perform test.put('web_order', oid);
end $$;

do $$
begin
  set local role service_role;
  update public.orders set status = 'cancelled' where id = test.id('web_order');
  reset role;
  perform test.eq('cancelling posts a credit note', (select count(*)::int from public.journal_entries where posting_key = 'sale-cancel:' || test.id('web_order')), 1);
  perform test.eq('net receivable after cancellation', (select coalesce(sum(debit - credit), 0) from public.journal_lines where account_code = '1100' and party_id = 'phone:9822222222'), 0.00);
end $$;

-- A phone order entered by staff.
do $$
declare
  oid uuid;
  res jsonb;
begin
  perform test.login('pm@test.local');
  oid := public.disp_create_staff_order(
    '{"name":"Phone Customer","phone":"98333 33333","address":"Allahpur","pincode":"211006"}',
    jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 2)), 'cod', 0, 'Call before coming');
  perform test.fails('staff cannot change prices without approval',
    format('select public.disp_create_staff_order(%L, %L, %L)', '{"name":"X","phone":"9833333333","address":"Y"}',
      jsonb_build_array(jsonb_build_object('item_id', test.id('mc1k'), 'qty', 1, 'unit_price', 1)), 'cod'), 'permission');
  res := public.disp_allocate_order(oid);
  perform test.eq('staff order allocated from batch stock', jsonb_array_length(res -> 'shortages'), 0);
  perform test.put('staff_order', oid);
end $$;
reset role;

do $$
begin
  perform test.eq('staff order priced from the item master', (select total from public.orders where id = test.id('staff_order')), 1300);
  perform test.eq('staff COD order is invoiced', (select invoice_number is not null from public.orders where id = test.id('staff_order')), true);
  perform test.eq('staff order is in the books', (select count(*)::int from public.journal_entries where posting_key = 'sale:' || test.id('staff_order')), 1);
end $$;

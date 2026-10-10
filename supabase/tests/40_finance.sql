-- Acceptance tests 8 (finance), 9 (finance access) and 12 (ledger correction), plus books-vs-stock checks.

-- TEST 8a: a supplier purchase that receives stock -----------------------------------------
do $$
begin
  perform test.login('fin@test.local');
  perform test.put('pur1', public.fin_post_purchase_invoice(
    jsonb_build_object('supplier_id', test.id('vendor'), 'invoice_no', 'PT/2026/889', 'invoice_date', public.ist_today(), 'freight', 100),
    jsonb_build_array(jsonb_build_object('item_id', test.id('sugar'), 'qty', 50, 'rate', 40, 'gst_rate', 5, 'supplier_lot', 'PT-L-12'))));
  perform test.fails('the same supplier invoice cannot be entered twice',
    format('select public.fin_post_purchase_invoice(%L, %L)',
      jsonb_build_object('supplier_id', test.id('vendor'), 'invoice_no', 'PT/2026/889', 'invoice_date', public.ist_today()),
      jsonb_build_array(jsonb_build_object('item_id', test.id('sugar'), 'qty', 1, 'rate', 40))), 'already recorded');
end $$;
reset role;

do $$
declare
  pi public.purchase_invoices;
  eid uuid;
begin
  select * into pi from public.purchase_invoices where id = test.id('pur1');
  perform test.eq('purchase total incl. GST and freight', pi.total, 2200.00);
  perform test.eq('sugar received into stock', (select on_hand from public.v_stock_summary where item_id = test.id('sugar')), 101.000);
  perform test.eq('landed cost includes freight, excludes recoverable GST', (select unit_cost from public.stock_lots where source_id = pi.id::text), 42.0000);
  select id into eid from public.journal_entries where posting_key = 'purchase:' || pi.id;
  perform test.eq('purchase posted once to inventory', (select sum(debit) from public.journal_lines where entry_id = eid and account_code = '1200'), 2100.00);
  perform test.eq('GST input recorded', (select sum(debit) from public.journal_lines where entry_id = eid and account_code in ('1300', '1301')), 100.00);
  perform test.eq('supplier payable recorded', (select sum(credit) from public.journal_lines where entry_id = eid and account_code = '2000'), 2200.00);
  perform test.eq('stock receipt did not post a second time', (select count(*)::int from public.journal_entries where source_type = 'stock_movement'
    and source_id in (select id::text from public.stock_movements where doc_type = 'purchase_invoice' and doc_id = pi.id::text)), 0);
end $$;

do $$
begin
  perform test.login('fin@test.local');
  perform public.fin_pay_supplier(test.id('vendor'), 2200, public.ist_today(), 'bank_transfer', '1010', 'UTR123456',
    jsonb_build_array(jsonb_build_object('doc_type', 'purchase_invoice', 'doc_id', test.id('pur1'), 'amount', 2200)));
  perform public.fin_pay_supplier(test.id('farmer'), 6000, public.ist_today(), 'cash', '1000', null,
    jsonb_build_array(jsonb_build_object('doc_type', 'milk_collection', 'doc_id', test.id('col1'), 'amount', 6000)));
end $$;
reset role;

do $$
begin
  perform test.eq('invoice fully paid', (select total - amount_paid from public.purchase_invoices where id = test.id('pur1')), 0.00);
  perform test.eq('farmer collection marked paid', (select payment_status from public.milk_collections where id = test.id('col1')), 'paid');
  perform test.eq('vendor owes nothing', (select coalesce(sum(credit - debit), 0) from public.journal_lines where account_code = '2000' and party_id = test.id('vendor')::text), 0.00);
  perform test.eq('farmer still owed for the evening collection', (select sum(credit - debit) from public.journal_lines where account_code = '2000' and party_id = test.id('farmer')::text), 6000.00);
end $$;

-- TEST 8b: a customer sale, recognised once when invoiced; cash collected on delivery -----------
do $$
declare
  o public.orders;
  t record;
begin
  perform public.assign_invoice_number(test.id('order1'));
  select * into o from public.orders where id = test.id('order1');
  select * into t from public._order_tax(o.id);
  perform test.eq('sale recognised ex-GST', (select sum(credit) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where e.posting_key = 'sale:' || o.id and l.account_code = '4000'), t.taxable_manufactured);
  perform test.near('taxable value ≈ total ÷ 1.05', t.taxable_manufactured, 3000 * 100 / 105.0, 0.02);
  perform test.eq('output GST recorded', (select sum(credit) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where e.posting_key = 'sale:' || o.id and l.account_code in ('2100', '2101')), 3000 - t.taxable_manufactured);
  perform test.eq('COD cash already collected → customer owes nothing', (select sum(debit - credit) from public.journal_lines where account_code = '1100'
    and party_id = test.id('cust')::text), 0.00);
  perform test.eq('cost of goods sold posted at dispatch', (select sum(debit) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where l.account_code = '5000' and e.source_type = 'stock_movement'
      and e.source_id in (select movement_id::text from public.dispatch_lines where dispatch_id = test.id('dispatch1'))),
    (select -sum(value) from public.stock_movements where doc_type = 'dispatch' and doc_id = test.id('dispatch1')::text));
end $$;

-- A repeated payment confirmation must not record the money twice.
do $$
declare
  oid uuid;
begin
  insert into public.orders (customer_name, phone, address, city, pincode, payment_method, payment_status, status, subtotal, delivery_fee, discount, total, razorpay_order_id)
  values ('Online Buyer', '9811111111', 'Katra', 'Prayagraj', '211002', 'online', 'pending', 'pending_payment', 650, 69, 0, 719, 'order_TEST1')
  returning id into oid;
  insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity, gst_rate) values (oid, 'milk-cake', 'Milk Cake', '1 kg', 650, 1, 5);
  perform test.put('order3', oid);
  perform test.eq('unpaid online order is not in the dispatch queue', (select fulfilment_status from public.orders where id = oid), 'awaiting_payment');
  update public.orders set payment_status = 'paid', status = 'received', razorpay_payment_id = 'pay_TEST1' where id = oid;     -- verify callback
  update public.orders set payment_status = 'paid', status = 'received' where id = oid;                                     -- webhook repeats it
  perform public.assign_invoice_number(oid);
  perform public.assign_invoice_number(oid);
  perform public._post_order_sale(oid);
  perform test.eq('paid order confirmed for fulfilment', (select fulfilment_status from public.orders where id = oid), 'confirmed');
  perform test.eq('exactly one sale entry', (select count(*)::int from public.journal_entries where source_type = 'order' and source_id = oid::text and posting_key like 'sale:%'), 1);
  perform test.eq('exactly one receipt entry', (select count(*)::int from public.journal_entries where posting_key = 'receipt:order:' || oid), 1);
  perform test.eq('gateway clearing holds the payment once', (select sum(debit) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where e.posting_key = 'receipt:order:' || oid and l.account_code = '1020'), 719.00);
end $$;

-- TEST 8c: expenses, with approval above the limit ---------------------------------------------
do $$
begin
  perform test.login('fin@test.local');
  perform test.put('exp1', public.fin_record_expense(public.ist_today(), 'electricity', 3000, 'UPPCL', 'September bill', '1010', 'bank_transfer'));
  perform test.put('exp2', public.fin_record_expense(public.ist_today(), 'boiler', 8000, 'Shiv Engineering', 'Boiler tube repair', '1000', 'cash'));
  perform test.fails('the person who recorded a large expense cannot approve it', format('select public.fin_decide_expense(%L, true)', test.id('exp2')), 'someone else|permission');
end $$;
reset role;
do $$
begin
  perform test.eq('small expense posted straight away', (select status from public.expenses where id = test.id('exp1')), 'approved');
  perform test.eq('large expense waits for approval', (select status from public.expenses where id = test.id('exp2')), 'pending_approval');
  perform test.eq('pending expense not in the books yet', (select count(*)::int from public.journal_entries where posting_key = 'expense:' || test.id('exp2')), 0);
  perform test.login('owner@test.local');
  perform public.fin_decide_expense(test.id('exp2'), true, 'Necessary repair');
end $$;
reset role;
do $$
begin
  perform test.eq('approved expense posted once', (select count(*)::int from public.journal_entries where posting_key = 'expense:' || test.id('exp2')), 1);
end $$;

-- TEST 8d: salary with an advance recovered ----------------------------------------------------
do $$
declare
  rid uuid;
  lid uuid;
begin
  perform test.login('fin@test.local');
  perform test.put('emp1', public.pay_save_employee(jsonb_build_object('employee_code', 'E-001', 'full_name', 'Suresh Kumar', 'department', 'Production',
    'designation', 'Supervisor', 'joining_date', '2026-01-01', 'pay_type', 'monthly', 'monthly_salary', 15000,
    'salary_components', jsonb_build_array(jsonb_build_object('name', 'Attendance bonus', 'kind', 'earning', 'amount', 500)))));
  perform public.pay_record_advance(test.id('emp1'), 2000, public.ist_today(), '1000', 'Festival advance');
  rid := public.pay_create_run(date_trunc('month', public.ist_today())::date);
  perform test.put('run1', rid);
  select id into lid from public.payroll_lines where run_id = rid and employee_id = test.id('emp1');
  perform public.pay_update_line(lid, (select days_in_period from public.payroll_lines where id = lid), 0, 0, 1000, 0, 'Recover half the advance');
  perform public.pay_approve_run(rid);
  perform public.pay_mark_paid(rid, public.ist_today(), '1010', 'NEFT batch 77');
end $$;
reset role;

do $$
declare
  l public.payroll_lines;
begin
  select * into l from public.payroll_lines where run_id = test.id('run1') and employee_id = test.id('emp1');
  perform test.eq('gross pay = salary + configured bonus', l.gross, 15500.00);
  perform test.eq('net pay after advance recovery', l.net_pay, 14500.00);
  perform test.eq('salary expense posted', (select sum(debit) from public.journal_lines l2 join public.journal_entries e on e.id = l2.entry_id
    where e.posting_key = 'payroll:' || test.id('run1') and l2.account_code = '6200'), 15500.00);
  perform test.eq('advance balance after recovery', (select sum(debit - credit) from public.journal_lines where account_code = '1150' and party_id = test.id('emp1')::text), 1000.00);
  perform test.eq('salaries payable cleared when paid', (select sum(credit - debit) from public.journal_lines where account_code = '2200'), 0.00);
end $$;

-- Books agree with stock -------------------------------------------------------------------
do $$
begin
  perform test.eq('every journal entry balances', (select sum(debit) = sum(credit) from public.journal_lines), true);
  perform test.near('raw material ledger = raw material stock value', public._account_balance('1200'),
    (select sum(l.qty_on_hand * l.unit_cost) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type = 'raw_material'), 1.00);
  perform test.near('packaging ledger = packaging stock value', public._account_balance('1210'),
    (select sum(l.qty_on_hand * l.unit_cost) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type = 'packaging'), 1.00);
  perform test.near('finished goods ledger = finished goods stock value', public._account_balance('1220'),
    (select sum(l.qty_on_hand * l.unit_cost) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type = 'finished_good'), 1.00);
  perform test.eq('released batch leaves nothing in work in progress', (select coalesce(sum(debit - credit), 0) from public.journal_lines
    where account_code = '1250' and party_type = 'batch' and party_id = test.id('batch1')::text), 0.00);
end $$;

do $$
declare
  pl jsonb;
begin
  perform test.login('fin@test.local');
  pl := public.fin_profit_and_loss(public.ist_today() - 1, public.ist_today());
  perform test.eq('P&L separates sales from cash received', (pl ? 'net_sales') and (pl ? 'cash_received') and (pl ? 'operating_profit'), true);
  perform test.eq('expenses incurred = 3000 + 8000', (pl ->> 'expenses_incurred')::numeric, 11000::numeric);
  perform test.near('gross profit = sales − cost of goods sold', (pl ->> 'gross_profit')::numeric, (pl ->> 'net_sales')::numeric - (pl ->> 'cost_of_goods_sold')::numeric, 0.01);
end $$;
reset role;

-- TEST 9: who can see what -------------------------------------------------------------------
do $$
declare
  d jsonb;
begin
  perform test.login('pm@test.local');
  perform test.eq('production manager sees no employees', (select count(*)::int from public.employees), 0);
  perform test.eq('production manager sees no payroll', (select count(*)::int from public.payroll_lines), 0);
  perform test.eq('production manager sees no journal', (select count(*)::int from public.journal_lines), 0);
  perform test.fails('production manager cannot run payroll', format('select public.pay_create_run(%L)', date_trunc('month', public.ist_today() + 40)::date), 'permission');
  perform test.fails('production manager cannot open the P&L', 'select public.fin_profit_and_loss(current_date, current_date)', 'permission');
  d := public.ops_dashboard();
  perform test.eq('dashboard shows production figures', d ? 'active_batches', true);
  perform test.eq('dashboard hides money figures from production', (d ? 'profit') or (d ? 'monthly_salary_commitment') or (d ? 'cash_and_bank'), false);
end $$;
reset role;

do $$
declare
  d jsonb;
begin
  perform test.login('fin@test.local');
  perform test.eq('finance sees payroll', (select count(*)::int from public.payroll_lines) > 0, true);
  perform test.fails('finance cannot change production output', format('select public.prod_correct_output(%L, %L, 1, %L)', test.id('batch2'), 'finished_qty', 'x'), 'permission');
  perform test.fails('finance cannot edit a batch directly', format('update public.production_batches set finished_qty = 1 where id = %L', test.id('batch1')), 'permission denied');
  perform test.fails('finance cannot rewrite a posted entry', 'update public.journal_lines set debit = 0', 'permission denied');
  d := public.ops_dashboard();
  perform test.eq('dashboard shows finance its figures', (d ? 'profit') and (d ? 'monthly_salary_commitment'), true);
end $$;
reset role;

do $$
begin
  perform test.login('cust@test.local');
  perform test.eq('customer sees no supplier invoices', (select count(*)::int from public.purchase_invoices), 0);
  perform test.eq('customer sees no payments', (select count(*)::int from public.payments), 0);
  perform test.fails('customer cannot post a journal', format('select public.fin_manual_journal(current_date, %L, %L)', 'x', '[]'), 'permission');
end $$;
reset role;

-- TEST 12 (finance): an approved entry is corrected by a linked reversal ---------------------------
do $$
declare
  eid uuid;
  rid uuid;
begin
  perform test.login('owner@test.local');
  eid := public.fin_manual_journal(public.ist_today(), 'Owner introduced capital', jsonb_build_array(
    jsonb_build_object('account', '1010', 'debit', 50000), jsonb_build_object('account', '3000', 'credit', 50000)));
  perform test.put('je1', eid);
  rid := public.fin_reverse_entry(eid, 'Amount was 5,000 not 50,000');
  perform test.put('je1r', rid);
  perform test.fails('an entry cannot be reversed twice', format('select public.fin_reverse_entry(%L, %L)', eid, 'again'), 'already been reversed');
  perform test.fails('a sale is corrected through its order, not by reversal',
    format('select public.fin_reverse_entry(%L, %L)', (select id from public.journal_entries where posting_key = 'sale:' || test.id('order1')), 'x'),
    'correct it through that document');
end $$;
reset role;

do $$
declare
  r public.journal_entries;
begin
  select * into r from public.journal_entries where id = test.id('je1r');
  perform test.eq('original entry is kept', (select count(*)::int from public.journal_entries where id = test.id('je1')), 1);
  perform test.eq('reversal links to the original', r.reversal_of, test.id('je1'));
  perform test.eq('reversal keeps the reason', r.reason, 'Amount was 5,000 not 50,000');
  perform test.eq('reversal records who and when', r.posted_by = test.id('owner') and r.posted_at is not null, true);
  perform test.eq('net effect on the bank is zero', (select sum(debit - credit) from public.journal_lines where entry_id in (test.id('je1'), test.id('je1r')) and account_code = '1010'), 0.00);
  perform test.eq('audit log has the reversal', (select count(*)::int from public.audit_log where action = 'journal.reverse' and reason = 'Amount was 5,000 not 50,000'), 1);
end $$;

do $$
begin
  perform test.fails('even the owner cannot delete a journal entry', format('delete from public.journal_entries where id = %L', test.id('je1')), 'permanent');
end $$;

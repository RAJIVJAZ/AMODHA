-- Part 4 of 4 of the one-time live update (same content as ../2026-10-10-ops-live-remaining.sql).
-- Run the parts in order in the Supabase SQL Editor. Each part is one transaction: if it fails, nothing in it is applied.

begin;
set local lock_timeout = '15s';

create function public.fin_trial_balance(p_to date default null)
returns table (account_code text, name text, type text, debit numeric, credit numeric, balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return query
  select a.code, a.name, a.type, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0), coalesce(sum(l.debit - l.credit), 0)
  from public.ledger_accounts a
  left join public.journal_lines l on l.account_code = a.code
    and exists (select 1 from public.journal_entries e where e.id = l.entry_id and (p_to is null or e.entry_date <= p_to))
  group by a.code
  having coalesce(sum(l.debit), 0) <> 0 or coalesce(sum(l.credit), 0) <> 0
  order by a.code;
end;
$$;

-- Profit and loss, with cash received, purchases and expenses shown separately from profit.
create function public.fin_profit_and_loss(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rows jsonb;
  revenue numeric;
  cogs numeric;
  opex numeric;
begin
  perform public.require_permission('reports', 'view');
  with mv as (
    select a.code, a.name, a.type, a.subtype, sum(l.credit - l.debit) as net
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id join public.ledger_accounts a on a.code = l.account_code
    where e.entry_date between p_from and p_to and a.type in ('income', 'expense')
    group by a.code
  )
  select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'type', type, 'subtype', subtype,
      'amount', case when type = 'income' then net else -net end) order by code),
    coalesce(sum(net) filter (where type = 'income'), 0),
    coalesce(-sum(net) filter (where type = 'expense' and subtype = 'cogs'), 0),
    coalesce(-sum(net) filter (where type = 'expense' and subtype <> 'cogs'), 0)
  into rows, revenue, cogs, opex
  from mv;
  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'lines', coalesce(rows, '[]'),
    'net_sales', revenue, 'cost_of_goods_sold', cogs, 'gross_profit', revenue - cogs,
    'operating_expenses', opex, 'operating_profit', revenue - cogs - opex,
    'cash_received', (select coalesce(sum(l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where e.entry_date between p_from and p_to and l.account_code in (select account_code from public.bank_accounts)
         and e.source_type in ('order', 'dispatch', 'payment') and l.debit > 0),
    'inventory_purchased', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where e.entry_date between p_from and p_to and e.source_type in ('purchase_invoice', 'milk_collection', 'supplier_return')
         and l.account_code in ('1200', '1210', '1220', '1230', '1240')),
    'expenses_incurred', (select coalesce(sum(amount), 0) from public.expenses where status = 'approved' and expense_date between p_from and p_to),
    'note', 'Net sales exclude GST. Profit is sales less cost of goods sold and expenses — not the cash received.'
  );
end;
$$;

create function public.fin_account_ledger(p_code text, p_from date, p_to date)
returns table (entry_date date, entry_no text, memo text, party text, debit numeric, credit numeric, running_balance numeric, line_id bigint, reconciled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  opening numeric;
begin
  if not (public.has_permission('reports', 'view') or public.has_permission('banking', 'view')) then
    perform public.require_permission('reports', 'view');
  end if;
  if p_code in ('6200', '2200', '1150', '2210') then
    perform public.require_permission('payroll', 'view');
  end if;
  opening := public._account_balance(p_code, p_from - 1);
  return query
  select e.entry_date, e.entry_no, e.memo, l.party_type || coalesce(':' || l.party_id, ''), l.debit, l.credit,
    opening + sum(l.debit - l.credit) over (order by e.entry_date, e.posted_at, l.id), l.id,
    exists (select 1 from public.bank_reconciliations br where br.journal_line_id = l.id)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = p_code and e.entry_date between p_from and p_to
  order by e.entry_date, e.posted_at, l.id;
end;
$$;

create function public.fin_receivables()
returns table (party_id text, customer text, phone text, balance numeric, last_activity date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('sales', 'view');
  return query
  select l.party_id,
    (select o.customer_name from public.orders o where public._order_party(o) = l.party_id order by o.created_at desc limit 1),
    (select o.phone from public.orders o where public._order_party(o) = l.party_id order by o.created_at desc limit 1),
    sum(l.debit - l.credit), max(e.entry_date)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = '1100'
  group by l.party_id
  having sum(l.debit - l.credit) <> 0
  order by 4 desc;
end;
$$;

create function public.fin_payables()
returns table (supplier_id uuid, supplier text, balance numeric, overdue numeric, next_due date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('purchases', 'view');
  return query
  select s.id, s.name,
    coalesce((select sum(l.credit - l.debit) from public.journal_lines l where l.account_code = '2000' and l.party_type = 'supplier' and l.party_id = s.id::text), 0),
    coalesce((select sum(pi.total - pi.amount_paid) from public.purchase_invoices pi where pi.supplier_id = s.id and pi.status = 'posted' and pi.due_date < public.ist_today()), 0),
    (select min(pi.due_date) from public.purchase_invoices pi where pi.supplier_id = s.id and pi.status = 'posted' and pi.total > pi.amount_paid)
  from public.suppliers s
  where exists (select 1 from public.journal_lines l where l.account_code = '2000' and l.party_type = 'supplier' and l.party_id = s.id::text)
  order by 3 desc;
end;
$$;

create function public.fin_cash_flow(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_permission('reports', 'view');
  with money as (
    select e.id, e.source_type, l.debit - l.credit as amount
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where e.entry_date between p_from and p_to and l.account_code in (select account_code from public.bank_accounts) and e.source_type <> 'transfer'
  )
  select jsonb_build_object(
    'opening', (select coalesce(sum(public._account_balance(account_code, p_from - 1)), 0) from public.bank_accounts),
    'closing', (select coalesce(sum(public._account_balance(account_code, p_to)), 0) from public.bank_accounts),
    'inflows', coalesce((select jsonb_object_agg(source_type, s) from (select source_type, sum(amount) s from money where amount > 0 group by source_type) x), '{}'),
    'outflows', coalesce((select jsonb_object_agg(source_type, s) from (select source_type, -sum(amount) s from money where amount < 0 group by source_type) x), '{}'),
    'net_change', (select coalesce(sum(amount), 0) from money)
  ) into result;
  return result;
end;
$$;

create function public.fin_gst_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return jsonb_build_object(
    'output_cgst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2100' and e.entry_date between p_from and p_to),
    'output_sgst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2101' and e.entry_date between p_from and p_to),
    'output_igst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2102' and e.entry_date between p_from and p_to),
    'input_cgst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1300' and e.entry_date between p_from and p_to),
    'input_sgst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1301' and e.entry_date between p_from and p_to),
    'input_igst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1302' and e.entry_date between p_from and p_to),
    'note', 'Summary from the books for your accountant; file GST returns from verified invoice registers.'
  );
end;
$$;

-- Sales, cost and margin per SKU from dispatches.
create function public.fin_product_margins(p_from date, p_to date)
returns table (item_id uuid, code text, name text, units_dispatched numeric, sales_value numeric, cost_value numeric, gross_margin numeric, margin_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return query
  with lines as (
    select dl.item_id, dl.qty - dl.qty_returned as qty,
      -- Ex-GST selling price of the order line.
      oi.unit_price * 100 / (100 + coalesce(oi.gst_rate, i.gst_rate, 0)) as unit_net,
      -m.unit_cost as unit_cost
    from public.dispatch_lines dl
    join public.dispatches d on d.id = dl.dispatch_id
    join public.order_items oi on oi.id = dl.order_item_id
    join public.items i on i.id = dl.item_id
    join public.stock_movements m on m.id = dl.movement_id
    where public._ist_date(d.dispatched_at) between p_from and p_to
  )
  select i.id, i.code, i.name, sum(l.qty), round(sum(l.qty * l.unit_net), 2), round(sum(l.qty * -l.unit_cost), 2),
    round(sum(l.qty * l.unit_net) - sum(l.qty * -l.unit_cost), 2),
    round((sum(l.qty * l.unit_net) - sum(l.qty * -l.unit_cost)) / nullif(sum(l.qty * l.unit_net), 0) * 100, 1)
  from lines l join public.items i on i.id = l.item_id
  group by i.id
  order by 6 desc;
end;
$$;

create function public.inv_valuation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('inventory', 'view') or public.has_permission('reports', 'view')) then
    perform public.require_permission('inventory', 'view');
  end if;
  return jsonb_build_object(
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('item_type', item_type, 'value', v, 'ledger', public._account_balance(acct))), '[]')
      from (select i.item_type, case i.item_type when 'raw_material' then '1200' when 'packaging' then '1210' when 'finished_good' then '1220'
              when 'purchased_good' then '1230' else '1240' end as acct, round(sum(l.qty_on_hand * l.unit_cost), 2) as v
            from public.stock_lots l join public.items i on i.id = l.item_id where l.qty_on_hand > 0 group by i.item_type) x),
    'work_in_progress', public._account_balance('1250'),
    'total', (select coalesce(round(sum(qty_on_hand * unit_cost), 2), 0) from public.stock_lots)
  );
end;
$$;

-- Dashboard figures. Financial figures appear only for people allowed to see them.
create function public.ops_dashboard(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f date := coalesce(p_from, public.ist_today());
  t date := coalesce(p_to, public.ist_today());
  m date := date_trunc('month', public.ist_today())::date;
  result jsonb := '{}';
begin
  perform public.require_permission('dashboard', 'view');
  result := jsonb_build_object('from', f, 'to', t);
  if public.has_permission('dispatch', 'view') or public.has_permission('sales', 'view') then
    result := result || jsonb_build_object(
      'orders', (select count(*) from public.orders where public._ist_date(created_at) between f and t and status <> 'pending_payment'),
      'orders_pending', (select count(*) from public.orders where fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch')),
      'orders_awaiting_dispatch', (select count(*) from public.orders where fulfilment_status in ('ready_for_dispatch', 'packed', 'partially_dispatched')),
      'deliveries_completed', (select count(*) from public.dispatches where status = 'delivered' and public._ist_date(delivered_at) between f and t),
      'orders_on_hold', (select count(*) from public.orders where on_hold),
      'new_customers', (select count(*) from public.profiles p where public._ist_date(p.created_at) between f and t and not p.is_admin
          and not exists (select 1 from public.ops_user_roles ur where ur.user_id = p.id)));
  end if;
  if public.has_permission('production', 'view') or public.has_permission('procurement', 'view') then
    result := result || jsonb_build_object(
      'milk_procured_litres', (select coalesce(sum(qty_accepted), 0) from public.milk_collections where status = 'posted' and collected_on between f and t),
      'production_output', (select coalesce(jsonb_agg(jsonb_build_object('product', p.name, 'unit', p.base_unit, 'qty', x.q)), '[]')
          from (select product_id, sum(finished_qty) q from public.production_batches where completed_at is not null and public._ist_date(completed_at) between f and t group by product_id) x
          join public.products p on p.id = x.product_id),
      'active_batches', (select count(*) from public.production_batches where status in ('planned', 'materials_issued', 'in_production', 'production_completed', 'packaging', 'qc_approved')),
      'batches_awaiting_qc', (select count(*) from public.production_batches where status = 'awaiting_qc'),
      'batches_awaiting_release', (select count(*) from public.production_batches where status = 'packaging_completed'));
  end if;
  if public.has_permission('inventory', 'view') then
    result := result || jsonb_build_object(
      'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'available', available, 'reorder_level', reorder_level, 'unit', unit) order by name), '[]')
          from public.v_stock_summary where is_active and reorder_level > 0 and available <= reorder_level),
      'near_expiry_lots', (select count(*) from public.stock_lots where qty_on_hand > 0 and expiry_date between public.ist_today() and public.ist_today() + public.setting_num('inventory.expiry_alert_days', 3)::int),
      'expired_lots', (select count(*) from public.stock_lots where qty_on_hand > 0 and expiry_date < public.ist_today()),
      'raw_material_value', (select coalesce(round(sum(l.qty_on_hand * l.unit_cost), 2), 0) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type in ('raw_material', 'packaging', 'consumable')),
      'finished_goods_value', (select coalesce(round(sum(l.qty_on_hand * l.unit_cost), 2), 0) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type in ('finished_good', 'purchased_good')));
  end if;
  if public.has_permission('reports', 'view') then
    result := result || jsonb_build_object(
      'sales_period', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code in ('4000', '4010', '4095') and e.entry_date between f and t),
      'sales_month', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code in ('4000', '4010', '4095') and e.entry_date >= m),
      'purchases_period', (select coalesce(sum(total), 0) from public.purchase_invoices where status = 'posted' and invoice_date between f and t)
          + (select coalesce(sum(amount), 0) from public.milk_collections where status = 'posted' and collected_on between f and t),
      'expenses_period', (select coalesce(sum(amount), 0) from public.expenses where status = 'approved' and expense_date between f and t),
      'cash_and_bank', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'balance', public._account_balance(account_code))), '[]') from public.bank_accounts where is_active),
      'receivables', public._account_balance('1100'),
      'payables', -public._account_balance('2000'),
      'profit', public.fin_profit_and_loss(f, t) - 'lines');
  end if;
  if public.has_permission('payroll', 'view') then
    result := result || jsonb_build_object(
      'monthly_salary_commitment', (select coalesce(sum(coalesce(monthly_salary, daily_rate * 26)), 0) from public.employees where is_active));
  end if;
  if public.has_permission('subscriptions', 'view') then
    result := result || jsonb_build_object(
      'milk_interest', (select count(*) from public.milk_interest where status <> 'cancelled'),
      'active_subscribers', (select count(distinct user_id) from public.subscriptions where status = 'active'),
      'subscription_deliveries_period', (select count(*) from public.subscription_deliveries where status = 'delivered' and delivery_date between f and t),
      'subscription_revenue_period', (select coalesce(sum(o.total), 0) from public.orders o where o.source = 'subscription' and o.status <> 'cancelled'
          and o.delivery_date between f and t));
  end if;
  return result;
end;
$$;

-- Existing invoiced orders enter the books.
do $$
declare
  r record;
begin
  for r in select id from public.orders where invoice_number is not null and status <> 'cancelled' loop
    perform public._post_order_sale(r.id);
  end loop;
end $$;

-- Access rules ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ledger_accounts', 'journal_entries', 'journal_lines', 'purchase_invoices', 'purchase_invoice_lines', 'bank_accounts',
    'payments', 'payment_allocations', 'expense_categories', 'expenses', 'employees', 'employee_advances', 'payroll_runs', 'payroll_lines',
    'bank_reconciliations', 'cash_counts', 'posting_errors'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ===== ops_finance_part8of8 =====
create policy "Finance reads accounts" on public.ledger_accounts for select to authenticated
  using ((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'view'))
    or (select public.has_permission('expenses', 'view')) or (select public.has_permission('sales', 'view')));
-- Journal lines of payroll accounts are visible only to payroll users.
create policy "Finance reads journal entries" on public.journal_entries for select to authenticated
  using ((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')));
create policy "Finance reads journal lines" on public.journal_lines for select to authenticated
  using (((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')))
    and (account_code not in ('6200', '2200', '1150', '2210') or (select public.has_permission('payroll', 'view'))));
create policy "Buyers read purchase invoices" on public.purchase_invoices for select to authenticated using ((select public.has_permission('purchases', 'view')));
create policy "Buyers read purchase lines" on public.purchase_invoice_lines for select to authenticated using ((select public.has_permission('purchases', 'view')));
create policy "Finance reads bank accounts" on public.bank_accounts for select to authenticated
  using ((select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'edit')) or (select public.has_permission('expenses', 'create'))
    or (select public.has_permission('payroll', 'create')) or (select public.has_permission('payroll', 'approve')) or (select public.has_permission('sales', 'create'))
    or (select public.has_permission('dispatch', 'edit')));
create policy "Finance reads payments" on public.payments for select to authenticated
  using ((select public.has_permission('banking', 'view')) or ((select public.has_permission('purchases', 'view')) and party_type = 'supplier')
    or ((select public.has_permission('sales', 'view')) and party_type = 'customer'));
create policy "Finance reads payment allocations" on public.payment_allocations for select to authenticated
  using ((select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'view')) or (select public.has_permission('sales', 'view')));
create policy "Staff read expense categories" on public.expense_categories for select to authenticated using ((select public.has_permission('expenses', 'view')));
create policy "Finance reads expenses" on public.expenses for select to authenticated using ((select public.has_permission('expenses', 'view')));
create policy "Payroll reads employees" on public.employees for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads advances" on public.employee_advances for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads runs" on public.payroll_runs for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads lines" on public.payroll_lines for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Finance reads reconciliations" on public.bank_reconciliations for select to authenticated using ((select public.has_permission('banking', 'view')));
create policy "Finance reads cash counts" on public.cash_counts for select to authenticated using ((select public.has_permission('banking', 'view')));
create policy "Finance reads posting errors" on public.posting_errors for select to authenticated using ((select public.has_permission('sales', 'view')));

do $$
declare
  f text;
begin
  foreach f in array array[
    '_journal_balanced()', '_post_journal(date, text, text, text, text, jsonb, uuid, text)', '_gl_stock_movement()', '_gl_batch_status()',
    '_gl_milk_collection()', '_order_tax(uuid)', '_post_order_sale(uuid)', '_gl_order()', '_gl_dispatch_collection()', '_post_expense(uuid)',
    '_payroll_recalc(uuid)', '_payroll_totals(uuid)', '_account_balance(text, date)', '_check_money_account(text)', '_inventory_account(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'fin_post_purchase_invoice(jsonb, jsonb, text)', 'fin_cancel_purchase_invoice(uuid, text)', 'fin_supplier_return(uuid, jsonb, text, text)',
    'fin_pay_supplier(uuid, numeric, date, text, text, text, jsonb, text)', 'fin_receive_customer_payment(uuid, numeric, date, text, text, text, text)',
    'fin_credit_note(uuid, numeric, text, text, text)', 'fin_record_expense(date, text, numeric, text, text, text, text, numeric, text, text, text)',
    'fin_decide_expense(uuid, boolean, text)', 'pay_save_employee(jsonb)', 'pay_record_advance(uuid, numeric, date, text, text)', 'pay_create_run(date)',
    'pay_update_line(uuid, numeric, numeric, numeric, numeric, numeric, text)', 'pay_approve_run(uuid)', 'pay_mark_paid(uuid, date, text, text)',
    'fin_transfer(text, text, numeric, date, text, text)', 'fin_reconcile(bigint[], date, text)', 'fin_cash_count(text, numeric, date, text, boolean)',
    'fin_manual_journal(date, text, jsonb, text)', 'fin_reverse_entry(uuid, text)', 'fin_trial_balance(date)', 'fin_profit_and_loss(date, date)',
    'fin_account_ledger(text, date, date)', 'fin_receivables()', 'fin_payables()', 'fin_cash_flow(date, date)', 'fin_gst_summary(date, date)',
    'fin_product_margins(date, date)', 'inv_valuation()', 'ops_dashboard(date, date)', 'fin_retry_postings()', 'fin_money_balances(date)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._jl(text, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public._ist_date(timestamptz) from public, anon;
grant execute on function public._ist_date(timestamptz) to authenticated;
revoke execute on function public._order_party(public.orders) from public, anon, authenticated;

-- ===== ops_subscriptions_part1of4 =====
-- Milk subscriptions.
--
-- A subscription is the customer's standing instruction. Each delivery day gets its own record
-- (subscription_deliveries) with separate lines for the regular milk, one-off extra milk and one-off
-- add-on products, priced when scheduled. Customers change a day's delivery only until the cut-off
-- (business setting, India time, the day before). After the cut-off the day is locked into a normal
-- order, which then goes through allocation, dispatch, invoicing and accounting like any other order.

-- Price list with effective dates; history is kept so past deliveries keep their price.
create table public.item_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items,
  price numeric(12, 2) not null check (price >= 0),
  effective_from date not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (item_id, effective_from)
);

create function public.item_price_on(p_item_id uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select price from public.item_prices where item_id = p_item_id and effective_from <= p_date order by effective_from desc limit 1),
    (select sale_price from public.items where id = p_item_id))
$$;

-- Deliveries on or after this date can still be changed.
create function public.sub_first_open_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (now() at time zone 'Asia/Kolkata')::time < (public.setting('subscriptions.cutoff_time') #>> '{}')::time then public.ist_today() + 1
    else public.ist_today() + 2
  end
$$;

create function public._sub_assert_open(p_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_date < public.sub_first_open_date() then
    raise exception 'Changes for % closed at % on %. Please contact us and we''ll do our best.',
      to_char(p_date, 'DD Mon'), public.setting('subscriptions.cutoff_time') #>> '{}', to_char(p_date - 1, 'DD Mon')
      using errcode = '55000';
  end if;
end;
$$;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references public.items,
  qty_units integer not null check (qty_units between 1 and 20),
  frequency text not null default 'daily' check (frequency in ('daily', 'alternate_days', 'mon_to_sat', 'custom')),
  days_of_week integer[] check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]),
  slot text not null default 'morning' check (slot in ('morning', 'evening')),
  customer_name text not null,
  phone text not null check (phone ~ '^[0-9]{10}$'),
  address text not null,
  city text not null default 'Prayagraj',
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  pause_from date,
  pause_until date,
  payment_preference text not null default 'pay_on_delivery' check (payment_preference in ('pay_on_delivery', 'monthly_bill', 'prepaid')),
  bottle_arrangement text not null default 'returnable_glass' check (bottle_arrangement in ('returnable_glass', 'no_bottle')),
  instructions text,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (frequency <> 'custom' or cardinality(days_of_week) > 0),
  check (pause_until is null or pause_from is null or pause_until >= pause_from)
);
create index subscriptions_user_idx on public.subscriptions (user_id);
create index subscriptions_status_idx on public.subscriptions (status);

create table public.subscription_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  delivery_date date not null,
  slot text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'skipped', 'paused', 'locked', 'dispatched', 'delivered', 'failed', 'cancelled')),
  customer_name text not null,
  phone text not null,
  address text not null,
  city text not null,
  pincode text not null,
  order_id uuid references public.orders,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, delivery_date)
);
create index subscription_deliveries_date_idx on public.subscription_deliveries (delivery_date, status);
create index subscription_deliveries_user_idx on public.subscription_deliveries (user_id, delivery_date);

create table public.subscription_delivery_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.subscription_deliveries on delete cascade,
  item_id uuid not null references public.items,
  line_type text not null check (line_type in ('subscription', 'extra', 'addon')),
  qty integer not null check (qty > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unique (delivery_id, item_id, line_type)
);

create table public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions on delete cascade,
  delivery_date date,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  action text not null,
  details jsonb
);
create index subscription_events_sub_idx on public.subscription_events (subscription_id);
create trigger subscription_events_append_only before update or delete on public.subscription_events
  for each row execute function public.reject_change();

create table public.subscription_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.bottle_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  delivery_id uuid references public.subscription_deliveries,
  at timestamptz not null default now(),
  issued integer not null default 0 check (issued >= 0),
  returned integer not null default 0 check (returned >= 0),
  damaged integer not null default 0 check (damaged >= 0),
  note text,
  recorded_by uuid default auth.uid()
);
create index bottle_ledger_user_idx on public.bottle_ledger (user_id);
create trigger bottle_ledger_append_only before update or delete on public.bottle_ledger
  for each row execute function public.reject_change();

create function public._sub_runs_on(s public.subscriptions, p_date date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case s.frequency
    when 'daily' then true
    when 'alternate_days' then (p_date - s.start_date) % 2 = 0
    when 'mon_to_sat' then extract(dow from p_date) <> 0
    when 'custom' then extract(dow from p_date)::int = any (s.days_of_week)
  end
$$;

-- Bring a subscription's open deliveries in line with its current settings.
create function public._sub_schedule(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  d date;
  first_open date := public.sub_first_open_date();
  last_day date := public.ist_today() + public.setting_num('subscriptions.schedule_days', 14)::int;
  did uuid;
  want boolean;
  paused boolean;
  existing public.subscription_deliveries;
begin
  select * into s from public.subscriptions where id = p_subscription_id for update;
  d := greatest(s.start_date, first_open);
  while d <= last_day loop
    want := s.status <> 'cancelled' and d >= s.start_date and public._sub_runs_on(s, d);
    paused := s.pause_from is not null and d >= s.pause_from and (s.pause_until is null or d <= s.pause_until);
    select * into existing from public.subscription_deliveries where subscription_id = s.id and delivery_date = d for update;
    if existing.id is null then
      if want then
        insert into public.subscription_deliveries (subscription_id, user_id, delivery_date, slot, status, customer_name, phone, address, city, pincode)
        values (s.id, s.user_id, d, s.slot, case when paused then 'paused' else 'scheduled' end, s.customer_name, s.phone, s.address, s.city, s.pincode)
        returning id into did;
        insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
        values (did, s.item_id, 'subscription', s.qty_units, public.item_price_on(s.item_id, d));
      end if;
    elsif existing.status in ('scheduled', 'paused', 'cancelled') then
      update public.subscription_deliveries set
        status = case when not want then 'cancelled' when paused then 'paused' else 'scheduled' end,
        slot = s.slot, customer_name = s.customer_name, phone = s.phone, address = s.address, city = s.city, pincode = s.pincode, updated_at = now()
      where id = existing.id;
      update public.subscription_delivery_lines set qty = s.qty_units, item_id = s.item_id
      where delivery_id = existing.id and line_type = 'subscription';
      if not found and want then
        insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
        values (existing.id, s.item_id, 'subscription', s.qty_units, public.item_price_on(s.item_id, d));
      end if;
    end if;
    -- Skipped days stay skipped until the customer resumes them.
    d := d + 1;
  end loop;
end;
$$;

create function public._sub_own(p_subscription_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
begin
  select * into s from public.subscriptions where id = p_subscription_id for update;
  if not found or (s.user_id <> auth.uid() and not public.has_permission('subscriptions', 'edit')) then
    raise exception 'Subscription not found';
  end if;
  return s;
end;
$$;

create function public._sub_delivery(p_subscription_id uuid, p_date date)
returns public.subscription_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.subscription_deliveries;
begin
  perform public._sub_schedule(p_subscription_id);
  select * into d from public.subscription_deliveries where subscription_id = p_subscription_id and delivery_date = p_date for update;
  if not found then
    raise exception 'There is no delivery on % for this subscription', to_char(p_date, 'DD Mon');
  end if;
  return d;
end;
$$;

-- Customer actions ----------------------------------------------------------------------
create function public.sub_create(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  it public.items;
  start date := coalesce((p ->> 'start_date')::date, public.sub_first_open_date());
  pin text := trim(coalesce(p ->> 'pincode', ''));
  phone text := right(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g'), 10);
begin
  if auth.uid() is null then
    raise exception 'Please sign in';
  end if;
  if not coalesce((public.setting('subscriptions.enabled') #>> '{}')::boolean, false) and not public.has_permission('subscriptions', 'edit') then
    raise exception 'Milk subscriptions have not opened yet. Join the interest list and we''ll let you know.';
  end if;
  select i.* into it from public.items i join public.products pr on pr.id = i.product_id
  where i.id = (p ->> 'item_id')::uuid and i.is_active and pr.is_active and pr.is_subscribable;
  if not found then
    raise exception 'Choose a milk product';
  end if;
  if start < public.sub_first_open_date() then
    raise exception 'The earliest start date is %', to_char(public.sub_first_open_date(), 'DD Mon YYYY');
  end if;
  if not exists (select 1 from jsonb_array_elements(public.setting('delivery.areas')) a where pin like (a ->> 'pincode_prefix') || '%') then
    raise exception 'We don''t deliver to pincode % yet', pin;
  end if;
  insert into public.subscriptions (user_id, item_id, qty_units, frequency, days_of_week, slot, customer_name, phone, address, city, pincode,
    start_date, payment_preference, bottle_arrangement, instructions)
  values (auth.uid(), it.id, (p ->> 'qty_units')::int, coalesce(p ->> 'frequency', 'daily'),
    case when p ? 'days_of_week' then array(select jsonb_array_elements_text(p -> 'days_of_week')::int) end,
    coalesce(p ->> 'slot', 'morning'), trim(p ->> 'customer_name'), phone, trim(p ->> 'address'), coalesce(nullif(trim(p ->> 'city'), ''), 'Prayagraj'), pin,
    start, coalesce(p ->> 'payment_preference', 'pay_on_delivery'), coalesce(p ->> 'bottle_arrangement', 'returnable_glass'),
    nullif(trim(coalesce(p ->> 'instructions', '')), ''))
  returning id into sid;
  perform public._sub_schedule(sid);
  insert into public.subscription_events (subscription_id, action, details) values (sid, 'created', p);
  return sid;
end;
$$;

-- ===== ops_subscriptions_part2of4 =====
create function public.sub_skip(p_subscription_id uuid, p_date date, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
begin
  perform public._sub_assert_open(p_date);
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'scheduled' then
    raise exception 'That delivery is % and cannot be skipped', d.status;
  end if;
  update public.subscription_deliveries set status = 'skipped', skip_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now() where id = d.id;
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_date, 'skipped', jsonb_build_object('reason', p_reason));
end;
$$;

create function public.sub_unskip(p_subscription_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
begin
  perform public._sub_assert_open(p_date);
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'skipped' then
    raise exception 'That delivery is not skipped';
  end if;
  update public.subscription_deliveries set status = 'scheduled', skip_reason = null, updated_at = now() where id = d.id;
  insert into public.subscription_events (subscription_id, delivery_date, action) values (s.id, p_date, 'unskipped');
end;
$$;

-- Extra milk for one day only; the regular quantity does not change. 0 removes the extra.
create function public.sub_set_extra(p_subscription_id uuid, p_date date, p_extra_units integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
begin
  perform public._sub_assert_open(p_date);
  if p_extra_units is null or p_extra_units < 0 or p_extra_units > 20 then
    raise exception 'Extra quantity must be between 0 and 20';
  end if;
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'scheduled' then
    raise exception 'That delivery is %; resume it first', d.status;
  end if;
  delete from public.subscription_delivery_lines where delivery_id = d.id and line_type = 'extra';
  if p_extra_units > 0 then
    insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
    values (d.id, s.item_id, 'extra', p_extra_units, public.item_price_on(s.item_id, p_date));
  end if;
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_date, 'extra', jsonb_build_object('units', p_extra_units));
end;
$$;

-- One-off products added to a day's delivery. p_items = [{item_id, qty}] replaces that day's add-ons.
create function public.sub_set_addons(p_subscription_id uuid, p_date date, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  d public.subscription_deliveries;
  e jsonb;
  it public.items;
  avail numeric;
  booked numeric;
begin
  perform public._sub_assert_open(p_date);
  d := public._sub_delivery(s.id, p_date);
  if d.status <> 'scheduled' then
    raise exception 'That delivery is %; resume it first', d.status;
  end if;
  delete from public.subscription_delivery_lines where delivery_id = d.id and line_type = 'addon';
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    continue when coalesce((e ->> 'qty')::int, 0) = 0;
    select i.* into it from public.items i join public.products pr on pr.id = i.product_id
    where i.id = (e ->> 'item_id')::uuid and i.is_active and pr.is_active and pr.show_in_app;
    if not found then
      raise exception 'That product is not available in the app';
    end if;
    if (e ->> 'qty')::int < 0 or (e ->> 'qty')::int > 50 then
      raise exception 'Choose a quantity between 1 and 50';
    end if;
    -- Stock check: free stock today, less what other customers already booked for that day.
    select coalesce(sum(l.qty_on_hand - l.qty_reserved), 0) into avail from public.stock_lots l
    where l.item_id = it.id and l.status = 'available' and (l.expiry_date is null or l.expiry_date >= p_date);
    select coalesce(sum(x.qty), 0) into booked from public.subscription_delivery_lines x
    join public.subscription_deliveries y on y.id = x.delivery_id
    where x.item_id = it.id and y.delivery_date = p_date and y.status = 'scheduled' and y.id <> d.id;
    if (e ->> 'qty')::int > avail - booked then
      raise exception 'Only % of % available for %', greatest(avail - booked, 0)::int, it.name, to_char(p_date, 'DD Mon') using errcode = '23514';
    end if;
    insert into public.subscription_delivery_lines (delivery_id, item_id, line_type, qty, unit_price)
    values (d.id, it.id, 'addon', (e ->> 'qty')::int, public.item_price_on(it.id, p_date));
  end loop;
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_date, 'addons', p_items);
end;
$$;

create function public.sub_pause(p_subscription_id uuid, p_from date, p_until date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if s.status = 'cancelled' then
    raise exception 'This subscription is cancelled';
  end if;
  perform public._sub_assert_open(p_from);
  if p_until is not null and p_until < p_from then
    raise exception 'The pause must end on or after it starts';
  end if;
  update public.subscriptions set status = 'paused', pause_from = p_from, pause_until = p_until, updated_at = now() where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, delivery_date, action, details) values (s.id, p_from, 'paused', jsonb_build_object('until', p_until));
end;
$$;

create function public.sub_resume(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if s.status = 'cancelled' then
    raise exception 'This subscription is cancelled; start a new one';
  end if;
  -- Days before the cut-off stay as they are.
  update public.subscriptions set status = 'active',
    pause_until = case when pause_from is not null and pause_from < public.sub_first_open_date() then public.sub_first_open_date() - 1 end,
    pause_from = case when pause_from is not null and pause_from < public.sub_first_open_date() then pause_from end,
    updated_at = now()
  where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action) values (s.id, 'resumed');
end;
$$;

create function public.sub_cancel(p_subscription_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if s.status = 'cancelled' then
    raise exception 'Already cancelled';
  end if;
  update public.subscriptions set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now() where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action, details) values (s.id, 'cancelled', jsonb_build_object('reason', p_reason));
end;
$$;

-- Change the regular quantity from the next open delivery onwards.
create function public.sub_change_quantity(p_subscription_id uuid, p_qty_units integer)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
begin
  if p_qty_units is null or p_qty_units < 1 or p_qty_units > 20 then
    raise exception 'Quantity must be between 1 and 20';
  end if;
  update public.subscriptions set qty_units = p_qty_units, updated_at = now() where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action, details) values (s.id, 'quantity', jsonb_build_object('from', s.qty_units, 'to', p_qty_units));
  return public.sub_first_open_date();
end;
$$;

create function public.sub_change_address(p_subscription_id uuid, p jsonb)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  pin text := trim(coalesce(p ->> 'pincode', s.pincode));
begin
  if not exists (select 1 from jsonb_array_elements(public.setting('delivery.areas')) a where pin like (a ->> 'pincode_prefix') || '%') then
    raise exception 'We don''t deliver to pincode % yet', pin;
  end if;
  update public.subscriptions set address = coalesce(nullif(trim(p ->> 'address'), ''), address), city = coalesce(nullif(trim(p ->> 'city'), ''), city),
    pincode = pin, slot = coalesce(p ->> 'slot', slot), instructions = case when p ? 'instructions' then nullif(trim(p ->> 'instructions'), '') else instructions end,
    updated_at = now()
  where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action, details) values (s.id, 'address', p);
  return public.sub_first_open_date();
end;
$$;

-- Everything the customer's subscription screen needs.
create function public.sub_my_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r record;
begin
  if uid is null then
    raise exception 'Please sign in';
  end if;
  for r in select id from public.subscriptions where user_id = uid and status <> 'cancelled' loop
    perform public._sub_schedule(r.id);
  end loop;
  return jsonb_build_object(
    'enabled', coalesce((public.setting('subscriptions.enabled') #>> '{}')::boolean, false),
    'cutoff_time', public.setting('subscriptions.cutoff_time') #>> '{}',
    'first_open_date', public.sub_first_open_date(),
    'bottle_deposit', public.setting_num('subscriptions.bottle_deposit', 0),
    'bottle_damage_charge', public.setting_num('subscriptions.bottle_damage_charge', 0),
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status, 'item_id', s.item_id, 'item_name', i.name, 'unit_label', i.net_qty || ' ' || coalesce(pr.base_unit, i.unit),
        'qty_units', s.qty_units, 'frequency', s.frequency, 'days_of_week', s.days_of_week, 'slot', s.slot,
        'address', s.address, 'city', s.city, 'pincode', s.pincode, 'start_date', s.start_date, 'pause_from', s.pause_from, 'pause_until', s.pause_until,
        'payment_preference', s.payment_preference, 'bottle_arrangement', s.bottle_arrangement, 'instructions', s.instructions,
        'price_today', public.item_price_on(s.item_id, public.sub_first_open_date()),
        'price_changes', (select coalesce(jsonb_agg(jsonb_build_object('price', ip.price, 'from', ip.effective_from) order by ip.effective_from), '[]')
           from public.item_prices ip where ip.item_id = s.item_id and ip.effective_from > public.ist_today()),
        'monthly_estimate', round(public.item_price_on(s.item_id, public.sub_first_open_date()) * s.qty_units *
           case s.frequency when 'daily' then 30 when 'alternate_days' then 15 when 'mon_to_sat' then 26 else coalesce(cardinality(s.days_of_week), 0) * 30 / 7.0 end, 0)
      ) order by s.created_at), '[]')
      from public.subscriptions s join public.items i on i.id = s.item_id left join public.products pr on pr.id = i.product_id
      where s.user_id = uid and s.status <> 'cancelled'),
    'upcoming', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'subscription_id', d.subscription_id, 'date', d.delivery_date, 'slot', d.slot, 'status', d.status,
        'can_change', d.delivery_date >= public.sub_first_open_date() and d.status in ('scheduled', 'skipped'),
        'order_id', d.order_id,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_id', l.item_id, 'name', i.name, 'type', l.line_type, 'qty', l.qty, 'unit_price', l.unit_price)
            order by l.line_type desc, i.name), '[]') from public.subscription_delivery_lines l join public.items i on i.id = l.item_id where l.delivery_id = d.id),
        'total', (select coalesce(sum(l.qty * l.unit_price), 0) from public.subscription_delivery_lines l where l.delivery_id = d.id)
      ) order by d.delivery_date), '[]')
      from public.subscription_deliveries d where d.user_id = uid and d.delivery_date >= public.ist_today() and d.delivery_date <= public.ist_today() + 14),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('date', d.delivery_date, 'status', d.status,
        'total', (select coalesce(sum(l.qty * l.unit_price), 0) from public.subscription_delivery_lines l where l.delivery_id = d.id)) order by d.delivery_date desc), '[]')
      from (select * from public.subscription_deliveries where user_id = uid and delivery_date < public.ist_today() order by delivery_date desc limit 30) d),
    'bottles_outstanding', (select coalesce(sum(issued - returned - damaged), 0) from public.bottle_ledger where user_id = uid),
    'balance_due', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l where l.account_code = '1100' and l.party_id = uid::text),
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('message', message, 'at', created_at) order by created_at desc), '[]')
      from (select * from public.subscription_notices where user_id = uid order by created_at desc limit 5) n)
  );
end;
$$;

-- Price changes for subscription products: future dates only, existing open deliveries repriced, customers told.

-- ===== ops_subscriptions_part3of4 =====
create function public.cat_set_item_price(p_item_id uuid, p_price numeric, p_effective_from date, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.items;
  subscribable boolean;
  n integer;
begin
  perform public.require_permission('catalog', 'edit');
  select * into it from public.items where id = p_item_id;
  if not found or p_price is null or p_price < 0 then
    raise exception 'Choose an item and a valid price';
  end if;
  select coalesce(pr.is_subscribable, false) into subscribable from public.products pr where pr.id = it.product_id;
  if subscribable and p_effective_from < public.sub_first_open_date() then
    raise exception 'Subscription prices can change from % at the earliest, so no locked delivery changes price', public.sub_first_open_date();
  end if;
  insert into public.item_prices (item_id, price, effective_from, note) values (p_item_id, p_price, p_effective_from, p_note)
  on conflict (item_id, effective_from) do update set price = excluded.price, note = excluded.note, created_by = auth.uid(), created_at = now();
  if p_effective_from <= public.ist_today() then
    update public.items set sale_price = p_price, updated_at = now() where id = p_item_id;
  end if;
  update public.subscription_delivery_lines l set unit_price = p_price
  from public.subscription_deliveries d
  where d.id = l.delivery_id and l.item_id = p_item_id and d.status in ('scheduled', 'skipped', 'paused') and d.delivery_date >= p_effective_from
    and not exists (select 1 from public.item_prices x where x.item_id = p_item_id and x.effective_from > p_effective_from and x.effective_from <= d.delivery_date);
  get diagnostics n = row_count;
  if subscribable then
    insert into public.subscription_notices (user_id, message)
    select distinct s.user_id, format('The price of %s changes to ₹%s from %s.', it.name, p_price, to_char(p_effective_from, 'DD Mon YYYY'))
    from public.subscriptions s where s.item_id = p_item_id and s.status <> 'cancelled';
  end if;
  perform public.write_audit('price.set', 'items', p_item_id::text, jsonb_build_object('price', p_price, 'from', p_effective_from, 'deliveries_repriced', n), p_note);
end;
$$;

-- What a signed-in customer can subscribe to and add to a delivery, with the price for the next open day.
create function public.sub_catalogue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := public.sub_first_open_date();
begin
  if auth.uid() is null then
    raise exception 'Please sign in';
  end if;
  return jsonb_build_object(
    'first_open_date', d,
    'milk', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'unit_label', i.net_qty || ' ' || pr.base_unit,
        'price', public.item_price_on(i.id, d)) order by pr.sort_order, i.net_qty), '[]')
      from public.items i join public.products pr on pr.id = i.product_id
      where i.is_active and pr.is_active and pr.is_subscribable and public.item_price_on(i.id, d) is not null),
    'addons', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'brand', pr.brand, 'category', pr.category,
        'price', public.item_price_on(i.id, d),
        'in_stock', exists (select 1 from public.stock_lots l where l.item_id = i.id and l.status = 'available' and l.qty_on_hand > l.qty_reserved
          and (l.expiry_date is null or l.expiry_date >= d))) order by pr.sort_order, pr.name, i.net_qty), '[]')
      from public.items i join public.products pr on pr.id = i.product_id
      where i.is_active and pr.is_active and pr.show_in_app and not pr.is_subscribable and public.item_price_on(i.id, d) is not null)
  );
end;
$$;

-- Staff: demand and day locking --------------------------------------------------------------
create function public.sub_daily_demand(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform public.require_permission('subscriptions', 'view');
  for r in select id from public.subscriptions where status <> 'cancelled' loop
    perform public._sub_schedule(r.id);
  end loop;
  return jsonb_build_object(
    'date', p_date,
    'locked', p_date < public.sub_first_open_date(),
    'deliveries', (select count(*) from public.subscription_deliveries where delivery_date = p_date and status in ('scheduled', 'locked', 'dispatched', 'delivered')),
    'skipped', (select count(*) from public.subscription_deliveries where delivery_date = p_date and status = 'skipped'),
    'paused', (select count(*) from public.subscription_deliveries where delivery_date = p_date and status = 'paused'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item', i.name, 'code', i.code, 'qty', q.qty, 'regular', q.regular, 'extra', q.extra, 'addon', q.addon) order by i.name), '[]')
      from (select l.item_id, sum(l.qty) qty, sum(l.qty) filter (where l.line_type = 'subscription') regular,
              sum(l.qty) filter (where l.line_type = 'extra') extra, sum(l.qty) filter (where l.line_type = 'addon') addon
            from public.subscription_delivery_lines l join public.subscription_deliveries d on d.id = l.delivery_id
            where d.delivery_date = p_date and d.status in ('scheduled', 'locked', 'dispatched', 'delivered') group by l.item_id) q
      join public.items i on i.id = q.item_id),
    'by_area', (select coalesce(jsonb_agg(jsonb_build_object('pincode', pincode, 'slot', slot, 'deliveries', n) order by pincode, slot), '[]')
      from (select pincode, slot, count(*) n from public.subscription_deliveries where delivery_date = p_date and status in ('scheduled', 'locked', 'dispatched', 'delivered') group by pincode, slot) a)
  );
end;
$$;

-- Turn a day's deliveries into orders once its cut-off has passed (or earlier, by an approver).
create function public.sub_lock_day(p_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  s public.subscriptions;
  oid uuid;
  l record;
  v_subtotal integer;
  n integer := 0;
begin
  perform public.require_permission('dispatch', 'create');
  if p_date >= public.sub_first_open_date() then
    perform public.require_permission('dispatch', 'approve');   -- locking before the cut-off is an exception
  end if;
  for d in select * from public.subscription_deliveries where delivery_date = p_date and status = 'scheduled' and order_id is null for update loop
    select * into s from public.subscriptions where id = d.subscription_id;
    v_subtotal := (select coalesce(sum(round(qty * unit_price)), 0)::int from public.subscription_delivery_lines where delivery_id = d.id);
    if v_subtotal = 0 then
      continue;
    end if;
    insert into public.orders (user_id, customer_name, phone, address, city, pincode, notes, payment_method, payment_status, status,
      subtotal, delivery_fee, discount, total, source, delivery_date, delivery_slot, milk_subscriber, email)
    values (d.user_id, d.customer_name, d.phone, d.address, d.city, d.pincode, s.instructions, 'cod', 'cod', 'received',
      v_subtotal, 0, 0, v_subtotal, 'subscription', d.delivery_date, d.slot, true, (select email from public.profiles where id = d.user_id))
    returning id into oid;
    for l in select x.*, i.name, i.code, i.hsn, i.gst_rate, i.unit, i.net_qty from public.subscription_delivery_lines x join public.items i on i.id = x.item_id
             where x.delivery_id = d.id order by x.line_type desc loop
      insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity, hsn, gst_rate, item_id)
      values (oid, lower(l.code), l.name || case l.line_type when 'extra' then ' (extra)' when 'addon' then ' (add-on)' else '' end,
        coalesce(l.net_qty::text || ' ', '') || l.unit, round(l.unit_price)::int, l.qty, l.hsn, coalesce(l.gst_rate, 0), l.item_id);
    end loop;
    perform public.assign_invoice_number(oid);
    update public.subscription_deliveries set status = 'locked', order_id = oid, updated_at = now() where id = d.id;
    insert into public.order_events (order_id, status, note) values (oid, 'confirmed', 'Milk subscription delivery for ' || to_char(p_date, 'DD Mon'));
    n := n + 1;
  end loop;
  perform public.write_audit('subscriptions.lock_day', 'subscription_deliveries', p_date::text, jsonb_build_object('orders', n));
  return n;
end;
$$;

-- Keep delivery records in step with their orders.
create function public._sub_delivery_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'subscription' and new.fulfilment_status is distinct from old.fulfilment_status then
    update public.subscription_deliveries set status = case new.fulfilment_status
        when 'dispatched' then 'dispatched' when 'out_for_delivery' then 'dispatched' when 'partially_dispatched' then 'dispatched'
        when 'delivered' then 'delivered' when 'partially_delivered' then 'delivered'
        when 'delivery_failed' then 'failed' when 'returned' then 'failed' when 'cancelled' then 'cancelled'
        else status end, updated_at = now()
    where order_id = new.id;
  end if;
  return null;
end;
$$;
create trigger orders_subscription_sync after update of fulfilment_status on public.orders
  for each row execute function public._sub_delivery_sync();

create function public.sub_record_bottles(p_user_id uuid, p_issued integer, p_returned integer, p_damaged integer default 0,
  p_delivery_id uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge numeric := public.setting_num('subscriptions.bottle_damage_charge', 0) * coalesce(p_damaged, 0);
  bid uuid := gen_random_uuid();
begin
  perform public.require_permission('dispatch', 'edit');
  insert into public.bottle_ledger (id, user_id, delivery_id, issued, returned, damaged, note)
  values (bid, p_user_id, p_delivery_id, coalesce(p_issued, 0), coalesce(p_returned, 0), coalesce(p_damaged, 0), p_note);
  if charge > 0 then
    perform public._post_journal(public.ist_today(), 'bottle', bid::text, 'Damaged / lost bottle charge', 'bottle:' || bid,
      jsonb_build_array(public._jl('1100', charge, 'customer', p_user_id::text), public._jl('4100', -charge)), null, p_note);
  end if;
end;
$$;

-- Subscribers count for benefits once their subscription is active.
create function public.is_active_milk_subscriber(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.subscriptions where user_id = p_user_id and status = 'active')
    or exists (select 1 from public.milk_interest where user_id = p_user_id and status = 'active')
$$;

-- Access rules ------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['item_prices', 'subscriptions', 'subscription_deliveries', 'subscription_delivery_lines', 'subscription_events',
    'subscription_notices', 'bottle_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "Staff read prices" on public.item_prices for select to authenticated
  using ((select public.has_permission('catalog', 'view')) or (select public.has_permission('subscriptions', 'view')));
create policy "Customers read own subscriptions" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('subscriptions', 'view')));
create policy "Customers read own deliveries" on public.subscription_deliveries for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('subscriptions', 'view')) or (select public.has_permission('dispatch', 'view')));

-- ===== ops_subscriptions_part4of4 =====
create policy "Customers read own delivery lines" on public.subscription_delivery_lines for select to authenticated
  using (exists (select 1 from public.subscription_deliveries d where d.id = delivery_id and d.user_id = (select auth.uid()))
    or (select public.has_permission('subscriptions', 'view')) or (select public.has_permission('dispatch', 'view')));
create policy "Customers read own subscription history" on public.subscription_events for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = (select auth.uid())) or (select public.has_permission('subscriptions', 'view')));
create policy "Customers read own notices" on public.subscription_notices for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers read own bottles" on public.bottle_ledger for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('subscriptions', 'view')) or (select public.has_permission('dispatch', 'view')));

do $$
declare
  f text;
begin
  foreach f in array array['_sub_assert_open(date)', '_sub_runs_on(public.subscriptions, date)', '_sub_schedule(uuid)', '_sub_own(uuid)',
    '_sub_delivery(uuid, date)', '_sub_delivery_sync()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['item_price_on(uuid, date)', 'sub_first_open_date()', 'sub_create(jsonb)', 'sub_skip(uuid, date, text)', 'sub_unskip(uuid, date)',
    'sub_set_extra(uuid, date, integer)', 'sub_set_addons(uuid, date, jsonb)', 'sub_pause(uuid, date, date)', 'sub_resume(uuid)', 'sub_cancel(uuid, text)',
    'sub_change_quantity(uuid, integer)', 'sub_change_address(uuid, jsonb)', 'sub_my_overview()', 'sub_catalogue()', 'cat_set_item_price(uuid, numeric, date, text)',
    'sub_daily_demand(date)', 'sub_lock_day(date)', 'sub_record_bottles(uuid, integer, integer, integer, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- Used by the storefront's server (secret key) when pricing an order.
revoke execute on function public.is_active_milk_subscriber(uuid) from public, anon, authenticated;
grant execute on function public.is_active_milk_subscriber(uuid) to service_role;

-- Staff working on subscriptions can read the interest list collected on the website.
create policy "Subscription staff read milk interest" on public.milk_interest for select to authenticated
  using ((select public.has_permission('subscriptions', 'view')));

-- Final rights for the public API roles, exactly as the tested migrations leave them.
grant select, update, usage on sequence public.audit_log_id_seq, public.batch_corrections_id_seq, public.batch_events_id_seq, public.journal_lines_id_seq, public.order_events_id_seq, public.orders_order_number_seq, public.posting_errors_id_seq, public.stock_movements_id_seq, public.subscription_events_id_seq to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.addresses, public.invoice_counters, public.memberships, public.milk_interest, public.reward_ledger, public.staff_emails, public.support_requests, public.wishlist to anon;
grant delete, references, select, trigger, truncate on table public.profiles to anon;
grant references, select, trigger on table public.order_items, public.orders to anon;
grant select, update, usage on sequence public.audit_log_id_seq, public.batch_corrections_id_seq, public.batch_events_id_seq, public.journal_lines_id_seq, public.order_events_id_seq, public.orders_order_number_seq, public.posting_errors_id_seq, public.stock_movements_id_seq, public.subscription_events_id_seq to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.addresses, public.invoice_counters, public.memberships, public.milk_interest, public.reward_ledger, public.staff_emails, public.support_requests, public.v_batch_materials, public.v_dispatch_queue, public.v_order_line_fulfilment, public.v_stock_summary, public.wishlist to authenticated;
grant delete, references, select, trigger, truncate on table public.profiles to authenticated;
grant references, select, trigger on table public.audit_log, public.bank_accounts, public.bank_reconciliations, public.batch_corrections, public.batch_events, public.batch_materials, public.batch_packaging, public.batch_qc_results, public.bottle_ledger, public.business_settings, public.cash_counts, public.categories, public.dispatch_lines, public.dispatches, public.doc_counters, public.employee_advances, public.employees, public.expense_categories, public.expenses, public.item_prices, public.items, public.journal_entries, public.journal_lines, public.ledger_accounts, public.milk_collections, public.ops_actions, public.ops_modules, public.ops_request_keys, public.ops_role_permissions, public.ops_roles, public.ops_staff_invites, public.ops_user_roles, public.order_allocations, public.order_events, public.order_items, public.orders, public.packaging_bom, public.packaging_configs, public.payment_allocations, public.payments, public.payroll_lines, public.payroll_runs, public.posting_errors, public.production_batches, public.products, public.purchase_invoice_lines, public.purchase_invoices, public.quality_parameters, public.recipe_lines, public.recipes, public.stock_lots, public.stock_movements, public.subscription_deliveries, public.subscription_delivery_lines, public.subscription_events, public.subscription_notices, public.subscriptions, public.suppliers, public.units to authenticated;
grant execute on function financial_year(date), ist_today(), touch_updated_at() to anon;
grant execute on function _ist_date(timestamp with time zone), _text(jsonb,text), cat_activate_recipe(uuid), cat_save_item(jsonb), cat_save_packaging_config(jsonb,jsonb), cat_save_product(jsonb), cat_save_quality_parameter(jsonb), cat_save_recipe_draft(uuid,numeric,jsonb,integer,text,uuid), cat_save_supplier(jsonb), cat_set_item_price(uuid,numeric,date,text), disp_allocate_order(uuid), disp_create_staff_order(jsonb,jsonb,text,integer,text,date,text), disp_dispatch_order(uuid,jsonb,text,timestamp with time zone,text,text), disp_hold_order(uuid,boolean,text), disp_release_allocation(uuid,text), disp_set_stage(uuid,text,text), disp_update_delivery(uuid,text,text,numeric,text,jsonb,boolean), fin_account_ledger(text,date,date), fin_cancel_purchase_invoice(uuid,text), fin_cash_count(text,numeric,date,text,boolean), fin_cash_flow(date,date), fin_credit_note(uuid,numeric,text,text,text), fin_decide_expense(uuid,boolean,text), fin_gst_summary(date,date), fin_manual_journal(date,text,jsonb,text), fin_money_balances(date), fin_pay_supplier(uuid,numeric,date,text,text,text,jsonb,text), fin_payables(), fin_post_purchase_invoice(jsonb,jsonb,text), fin_product_margins(date,date), fin_profit_and_loss(date,date), fin_receivables(), fin_receive_customer_payment(uuid,numeric,date,text,text,text,text), fin_reconcile(bigint[],date,text), fin_record_expense(date,text,numeric,text,text,text,text,numeric,text,text,text), fin_retry_postings(), fin_reverse_entry(uuid,text), fin_supplier_return(uuid,jsonb,text,text), fin_transfer(text,text,numeric,date,text,text), fin_trial_balance(date), financial_year(date), has_permission(text,text), inv_adjust_stock(uuid,numeric,text,text,text), inv_receive_opening_stock(uuid,numeric,numeric,date,text,text,text), inv_reverse_movement(bigint,text), inv_set_lot_status(uuid,text,text), inv_valuation(), ist_today(), item_price_on(uuid,date), my_permissions(), ops_audit_log(date,date,text,text,integer), ops_create_role(text,text,text), ops_dashboard(date,date), ops_invite_staff(text,text[],text), ops_log_export(text,integer,jsonb), ops_login_history(uuid,integer), ops_reset_user_sessions(uuid,text), ops_set_role_permissions(text,jsonb,text), ops_set_user_active(uuid,boolean,text), ops_set_user_roles(uuid,text[],text), ops_staff_directory(), ops_update_setting(text,jsonb), pay_approve_run(uuid), pay_create_run(date), pay_mark_paid(uuid,date,text,text), pay_record_advance(uuid,numeric,date,text,text), pay_save_employee(jsonb), pay_update_line(uuid,numeric,numeric,numeric,numeric,numeric,text), proc_cancel_collection(uuid,text), proc_record_collection(uuid,date,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text,text), prod_batch_trace(uuid), prod_cancel_batch(uuid,text,text), prod_close_batch(uuid,text), prod_complete_batch(uuid,numeric,numeric,numeric,numeric,numeric,text,jsonb), prod_complete_packaging(uuid,numeric,text,text), prod_correct_output(uuid,text,numeric,text), prod_create_batch(uuid,date,numeric,text,uuid,text,text,text,text,text), prod_issue_material(uuid,uuid,numeric,uuid,text,text), prod_record_packaging(uuid,uuid,integer,integer,integer,text,date,text,text), prod_record_qc(uuid,jsonb,text,text), prod_release_batch(uuid), prod_return_material(uuid,uuid,numeric,text,text), prod_reverse_packaging(uuid,text), prod_start_batch(uuid), require_permission(text,text), setting(text), setting_num(text,numeric), sub_cancel(uuid,text), sub_catalogue(), sub_change_address(uuid,jsonb), sub_change_quantity(uuid,integer), sub_create(jsonb), sub_daily_demand(date), sub_first_open_date(), sub_lock_day(date), sub_my_overview(), sub_pause(uuid,date,date), sub_record_bottles(uuid,integer,integer,integer,uuid,text), sub_resume(uuid), sub_set_addons(uuid,date,jsonb), sub_set_extra(uuid,date,integer), sub_skip(uuid,date,text), sub_unskip(uuid,date), touch_updated_at() to authenticated;
grant execute on function armor(bytea), armor(bytea,text[],text[]), crypt(text,text), dearmor(text), decrypt(bytea,bytea,text), decrypt_iv(bytea,bytea,bytea,text), digest(bytea,text), digest(text,text), encrypt(bytea,bytea,text), encrypt_iv(bytea,bytea,bytea,text), financial_year(date), gen_random_bytes(integer), gen_salt(text), gen_salt(text,integer), hmac(bytea,bytea,text), hmac(text,text,text), ist_today(), pgp_armor_headers(text), pgp_key_id(bytea), pgp_pub_decrypt(bytea,bytea), pgp_pub_decrypt(bytea,bytea,text), pgp_pub_decrypt(bytea,bytea,text,text), pgp_pub_decrypt_bytea(bytea,bytea), pgp_pub_decrypt_bytea(bytea,bytea,text), pgp_pub_decrypt_bytea(bytea,bytea,text,text), pgp_pub_encrypt(text,bytea), pgp_pub_encrypt(text,bytea,text), pgp_pub_encrypt_bytea(bytea,bytea), pgp_pub_encrypt_bytea(bytea,bytea,text), pgp_sym_decrypt(bytea,text), pgp_sym_decrypt(bytea,text,text), pgp_sym_decrypt_bytea(bytea,text), pgp_sym_decrypt_bytea(bytea,text,text), pgp_sym_encrypt(text,text), pgp_sym_encrypt(text,text,text), pgp_sym_encrypt_bytea(bytea,text), pgp_sym_encrypt_bytea(bytea,text,text), public.gen_random_uuid(), touch_updated_at() to public;
-- Back to Supabase's normal defaults for new objects.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres grant execute on functions to public;

commit;

-- Business-app screens: cash/bank balances, purchase account rules, audit log query, export logging,
-- role management and settings.

-- Cash and bank balances match the books -----------------------------------------------------
do $$
declare
  b record;
begin
  perform test.login('fin@test.local');
  for b in select * from public.fin_money_balances() loop
    perform test.eq('balance of ' || b.name || ' matches the ledger', b.balance,
      (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l where l.account_code = b.account_code));
  end loop;
  perform test.eq('bank lines not yet reconciled are reported', (select unreconciled is not null from public.fin_money_balances() where account_code = '1010'), true);
  perform test.eq('cash has no reconciliation figure', (select unreconciled is null from public.fin_money_balances() where account_code = '1000'), true);
end $$;
reset role;

do $$
begin
  perform test.login('pm@test.local');
  perform test.fails('production manager cannot see bank balances', 'select * from public.fin_money_balances()', 'permission');
end $$;
reset role;

-- Supplier bills cannot bypass stock, tax or money accounts ---------------------------------------
do $$
begin
  perform test.login('fin@test.local');
  perform test.fails('a bill line cannot post straight to inventory',
    format('select public.fin_post_purchase_invoice(%L, %L)',
      jsonb_build_object('supplier_id', test.id('vendor'), 'invoice_no', 'ACC-1', 'invoice_date', public.ist_today()),
      jsonb_build_array(jsonb_build_object('account_code', '1200', 'qty', 1, 'rate', 100))), 'expense / fixed-asset');
  perform test.fails('a bill line cannot post to cost of goods sold',
    format('select public.fin_post_purchase_invoice(%L, %L)',
      jsonb_build_object('supplier_id', test.id('vendor'), 'invoice_no', 'ACC-2', 'invoice_date', public.ist_today()),
      jsonb_build_array(jsonb_build_object('account_code', '5000', 'qty', 1, 'rate', 100))), 'expense / fixed-asset');
  perform test.put('pur_exp', public.fin_post_purchase_invoice(
    jsonb_build_object('supplier_id', test.id('vendor'), 'invoice_no', 'ACC-3', 'invoice_date', public.ist_today()),
    jsonb_build_array(jsonb_build_object('account_code', '6040', 'description', 'Boiler repair', 'qty', 1, 'rate', 1000, 'gst_rate', 18))));
end $$;
reset role;

do $$
begin
  perform test.eq('repair bill goes to the expense account', (select sum(l.debit) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where e.posting_key = 'purchase:' || test.id('pur_exp') and l.account_code = '6040'), 1000.00);
end $$;

-- Every change is in the audit log, with who made it ------------------------------------------
do $$
begin
  perform test.login('owner@test.local');
  perform test.eq('audit log names the person', (select actor_name from public.ops_audit_log(null, null, null, 'purchase.post', 50) limit 1) is not null, true);
  perform test.eq('audit log search finds the bill', (select count(*)::int from public.ops_audit_log(null, null, null, 'purchase.post', 50)) >= 1, true);
  perform public.ops_log_export('trial-balance', 12, '{"to": "2026-10-10"}');
  perform test.eq('exports are recorded', (select count(*)::int from public.audit_log where action = 'report.export' and entity_id = 'trial-balance'), 1);
end $$;
reset role;

do $$
begin
  perform test.login('pm@test.local');
  perform test.fails('audit log needs audit permission', 'select * from public.ops_audit_log()', 'permission');
end $$;
reset role;

do $$
begin
  perform test.login('cust@test.local');
  perform test.fails('a customer cannot record an export', $q$select public.ops_log_export('stock', 1)$q$, 'permission');
end $$;
reset role;

-- Roles and settings ------------------------------------------------------------------------------
do $$
declare
  qc uuid := (select id from auth.users where email = 'qc@test.local');
  before_count integer := (select count(*)::int from public.audit_log where action = 'setting.update' and entity_id = 'subscriptions.cutoff_time');
begin
  perform test.login('owner@test.local');
  perform public.ops_set_user_roles(qc, '{}', 'Left the company');
  perform test.eq('all roles can be removed', (select count(*)::int from public.ops_user_roles where user_id = qc), 0);
  perform public.ops_set_user_roles(qc, '{quality_inspector}', 'Rejoined');
  perform public.ops_update_setting('subscriptions.cutoff_time', '"21:00"');
  perform test.fails('a time setting must look like a time', $q$select public.ops_update_setting('subscriptions.cutoff_time', '"9pm"')$q$, 'time like');
  perform public.ops_update_setting('subscriptions.cutoff_time', '"20:00"');
  perform test.eq('setting changes are audited', (select count(*)::int from public.audit_log where action = 'setting.update' and entity_id = 'subscriptions.cutoff_time') - before_count, 2);
end $$;
reset role;

do $$
begin
  perform test.login('fin@test.local');
  perform test.fails('finance officer cannot change settings', $q$select public.ops_update_setting('finance.expense_approval_limit', '1')$q$, 'permission');
  perform test.fails('finance officer cannot change roles',
    format('select public.ops_set_user_roles(%L, %L)', test.id('fin'), '{admin}'), 'permission');
end $$;
reset role;

-- What a customer can subscribe to and add to a delivery ------------------------------------------
do $$
declare
  c jsonb;
begin
  perform test.login('cust2@test.local');
  c := public.sub_catalogue();
  perform test.eq('milk is offered for subscription', (select count(*)::int from jsonb_array_elements(c -> 'milk') m where m ->> 'item_id' = test.id('milk1l')::text), 1);
  perform test.eq('milk is not repeated as an add-on', (select count(*)::int from jsonb_array_elements(c -> 'addons') a where a ->> 'item_id' = test.id('milk1l')::text), 0);
  perform test.eq('paneer is offered as an add-on with its price', (select (a ->> 'price')::numeric from jsonb_array_elements(c -> 'addons') a where a ->> 'item_id' = test.id('paneer')::text), 260::numeric);
end $$;
reset role;

do $$
begin
  perform test.eq('the catalogue needs sign-in', has_function_privilege('anon', 'public.sub_catalogue()', 'execute'), false);
end $$;

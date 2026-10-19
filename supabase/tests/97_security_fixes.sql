-- Security fixes from the 2026-10-19 audit: each test tries the abuse and checks it is refused.

-- SEC-003: a subscription with a far-future start date (or no delivered milk) gives no subscriber benefits.
do $$
declare
  s public.subscriptions;
  uid uuid := test.make_user('futuresub@test.local');
  sid uuid := gen_random_uuid();
begin
  select * into s from public.subscriptions where id = test.id('sub1');
  insert into public.subscriptions
  select (jsonb_populate_record(s, jsonb_build_object('id', sid, 'user_id', uid, 'status', 'active',
    'start_date', public.ist_today() + 365, 'created_at', now(), 'updated_at', now()))).*;
  perform test.eq('future-dated subscription gives no discount', public.is_active_milk_subscriber(uid), false);
  update public.subscriptions set start_date = public.ist_today() - 3 where id = sid;
  perform test.eq('started but nothing delivered gives no discount', public.is_active_milk_subscriber(uid), false);
  insert into public.subscription_deliveries (subscription_id, user_id, delivery_date, slot, status, customer_name, phone, address, city, pincode)
  values (sid, uid, public.ist_today() - 1, 'morning', 'delivered', 'Future Sub', '9876500099', 'Civil Lines', 'Prayagraj', '211001');
  perform test.eq('a real subscriber with a delivery gets the benefits', public.is_active_milk_subscriber(uid), true);
end $$;

-- SEC-006: lowering and raising cash collected leaves the ledger equal to the final amount.
do $$
declare
  d uuid := test.id('dispatch1');
  before_total numeric;
  after_total numeric;
begin
  select coalesce(sum(l.debit - l.credit), 0) into before_total
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where e.source_type = 'dispatch' and e.source_id = d::text and l.account_code = '1000';
  perform test.eq('starting receipt equals cash collected', before_total, (select cash_collected from public.dispatches where id = d));
  update public.dispatches set cash_collected = 1 where id = d;
  update public.dispatches set cash_collected = 3000 where id = d;
  update public.dispatches set cash_collected = 1 where id = d;
  update public.dispatches set cash_collected = 3000 where id = d;
  update public.dispatches set cash_collected = 2500 where id = d;
  select coalesce(sum(l.debit - l.credit), 0) into after_total
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where e.source_type = 'dispatch' and e.source_id = d::text and l.account_code = '1000';
  perform test.eq('ledger follows corrections exactly (no inflated receipts)', after_total, 2500.00);
  perform test.eq('no posting errors', (select count(*)::int from public.posting_errors where source_type = 'dispatch_collection'), 0);
end $$;

-- SEC-007: credit notes for one order cannot add up to more than its total.
do $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = test.id('order1');
  perform test.login('owner@test.local');
  perform public.fin_credit_note(o.id, o.total - 10, 'Damaged in transit');
  perform test.fails('a second credit note cannot exceed what is left',
    format('select public.fin_credit_note(%L, 20, %L)', o.id, 'Again'), 'at most 10');
  perform public.fin_credit_note(o.id, 10, 'Remaining balance');
  perform test.fails('nothing left to credit', format('select public.fin_credit_note(%L, 1, %L)', o.id, 'Once more'), 'at most 0');
end $$;
reset role;

-- SEC-008: a switched-off staff member cannot be switched back on through salesperson approval.
do $$
begin
  perform test.put('exstaff', test.make_user('exstaff@test.local', '{production_manager}'));
  perform test.login('owner@test.local');
  perform public.ops_set_user_active(test.id('exstaff'), false, 'Left the company');
end $$;
reset role;

do $$
begin
  perform test.login('smgr@test.local');
  perform test.fails('sales manager cannot re-activate a dismissed staff member',
    $q$select public.st_save_salesperson('{"email":"exstaff@test.local","full_name":"Ex Staff","employee_code":"MW-S77","phone":"9876500077","territories":[]}')$q$,
    'switched off');
end $$;
reset role;

do $$
begin
  perform test.eq('still switched off', (select ops_active from public.profiles where id = test.id('exstaff')), false);
end $$;

-- SEC-009: a non-owner administrator cannot switch off an owner.
do $$
declare
  owner_id uuid := (select id from auth.users where email = 'owner@test.local');
begin
  perform test.make_user('admin2@test.local', '{admin}');
  perform test.login('admin2@test.local');
  perform test.fails('only an owner can switch off an owner',
    format('select public.ops_set_user_active(%L, false, %L)', owner_id, 'Takeover'), 'Only an owner');
end $$;
reset role;

-- SEC-011: a customer cannot use b2b_set_terms to write audit entries.
do $$
declare
  n int := (select count(*)::int from public.audit_log where action = 'b2b_customer.terms');
  cid uuid := (select id from public.b2b_customers limit 1);
begin
  perform test.login('shop1@test.local');
  perform test.fails('customer cannot change terms or write audit rows',
    format('select public.b2b_set_terms(%L, %L, %L)', cid, '{}', 'x'), 'permission');
  reset role;
  perform test.eq('no audit row written', (select count(*)::int from public.audit_log where action = 'b2b_customer.terms'), n);
end $$;
reset role;

-- SEC-010: the shop sees its own profile without the sales team's internal notes; the sales team still sees them.
do $$
begin
  update public.b2b_customers set business_notes = 'Slow payer, push for advance' where id = test.id('custA');
  perform test.login('shop1@test.local');
  perform test.eq('shop does not see internal notes', public.b2b_customer_profile(test.id('custA')) -> 'customer' ? 'business_notes', false);
  perform test.eq('shop still sees its own details', public.b2b_customer_profile(test.id('custA')) -> 'customer' ->> 'shop_name' is not null, true);
  reset role;
  perform test.login('smgr@test.local');
  perform test.eq('sales manager still sees notes', public.b2b_customer_profile(test.id('custA')) -> 'customer' ->> 'business_notes', 'Slow payer, push for advance');
end $$;
reset role;

-- SEC-009: a non-owner administrator cannot sign an owner out of every device.
do $$
declare
  owner_id uuid := (select id from auth.users where email = 'owner@test.local');
begin
  perform test.login('admin2@test.local');
  perform test.fails('only an owner can reset an owner''s sign-in',
    format('select public.ops_reset_user_sessions(%L, %L)', owner_id, 'x'), 'Only an owner');
end $$;
reset role;

-- SEC-015: bottle charges only for subscribers, deliveries must match the customer; unverified email cannot apply.
do $$
declare
  nosub uuid := test.make_user('nosub@test.local');
begin
  perform test.login('owner@test.local');
  perform test.fails('no bottle charge for a non-subscriber',
    format('select public.sub_record_bottles(%L, 0, 0, 2)', nosub), 'no milk subscription');
  perform test.fails('no negative bottle counts',
    format('select public.sub_record_bottles(%L, -1, 0, 0)', test.id('cust')), 'negative');
end $$;
reset role;

do $$
declare
  uid uuid := test.make_user('unverified@test.local');
begin
  update auth.users set email_confirmed_at = null where id = uid;
  perform test.login('unverified@test.local');
  perform test.fails('unverified email cannot apply to the sales team',
    $q$select public.fs_apply('{"full_name":"No Verify","phone":"9876512345"}')$q$, 'Sign in with your email');
end $$;
reset role;

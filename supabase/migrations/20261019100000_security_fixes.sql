-- Security fixes from the 2026-10-19 audit (SEC-003, SEC-006, SEC-007, SEC-008, and the Low items SEC-009 and
-- SEC-011). Safe to run more than once.

-- SEC-003: milk subscriber benefits (20% off sweets, free delivery) only for a subscription that has really
-- started: it is active, its start date has come, and at least one bottle has been delivered in the last 45 days.
-- A subscription created with a far-future start date no longer counts. Registrations the team marked active
-- (milk_interest, staff-only status) still count as before.
create or replace function public.is_active_milk_subscriber(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user_id and s.status = 'active' and s.start_date <= public.ist_today()
        and exists (select 1 from public.subscription_deliveries d
          where d.subscription_id = s.id and d.status = 'delivered' and d.delivery_date >= public.ist_today() - 45))
    or exists (select 1 from public.milk_interest where user_id = p_user_id and status = 'active')
$$;

-- SEC-006: cash collected on delivery can be corrected up or down; every change now posts exactly the
-- difference (a reduction posts a reversing receipt), so the ledger always equals the final amount.
-- Before, a reduction posted nothing and the next increase posted again.
create or replace function public._gl_dispatch_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  amt numeric := coalesce(new.cash_collected, 0) - coalesce(old.cash_collected, 0);
  cash_account text := case new.collection_method when 'cash' then '1000' else '1010' end;
begin
  if amt = 0 then
    return null;
  end if;
  select * into o from public.orders where id = new.order_id;
  begin
    if amt > 0 and coalesce(old.cash_collected, 0) = 0 then
      -- First recording: same posting key as before, so earlier postings are recognised.
      perform public._post_journal(public.ist_today(), 'dispatch', new.id::text, 'Collected on delivery ' || new.dispatch_no || ' · order #' || o.order_number,
        'receipt:dispatch:' || new.id || ':0',
        jsonb_build_array(public._jl(cash_account, amt), public._jl('1100', -amt, 'customer', public._order_party(o))));
    else
      perform public._post_journal(public.ist_today(), 'dispatch', new.id::text,
        'Correction of amount collected on ' || new.dispatch_no || ' · order #' || o.order_number || ' (' || coalesce(old.cash_collected, 0) || ' → ' || coalesce(new.cash_collected, 0) || ')',
        'receipt:dispatch:' || new.id || ':' || coalesce(old.cash_collected, 0) || '->' || coalesce(new.cash_collected, 0) || '@' || txid_current() || ':' || clock_timestamp(),
        jsonb_build_array(public._jl(cash_account, amt), public._jl('1100', -amt, 'customer', public._order_party(o))));
    end if;
  exception when others then
    insert into public.posting_errors (source_type, source_id, error) values ('dispatch_collection', new.id::text, sqlerrm);
  end;
  return null;
end;
$$;

-- SEC-007: credit notes for one order can never add up to more than the order total.
create or replace function public.fin_credit_note(p_order_id uuid, p_amount numeric, p_reason text, p_refund_account text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  rate numeric;
  taxable numeric;
  tax numeric;
  half numeric;
  cid uuid := gen_random_uuid();
  no text;
  party text;
  already numeric;
begin
  perform public.require_permission('sales', 'approve');
  perform public._claim_request_key(p_key, 'fin_credit_note');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into o from public.orders where id = p_order_id and invoice_number is not null for update;
  if not found then
    raise exception 'Credit notes are issued against an invoiced order';
  end if;
  select coalesce(sum((a.details ->> 'amount')::numeric), 0) into already
  from public.audit_log a
  where a.action = 'sales.credit_note' and a.entity = 'orders' and a.entity_id = o.id::text and a.result = 'success';
  if coalesce(p_amount, 0) <= 0 or p_amount > o.total - already then
    raise exception 'Credit note amount must be more than 0 and at most % (order total % less % already credited)',
      greatest(o.total - already, 0), o.total, already;
  end if;
  select coalesce(max(coalesce(oi.gst_rate, 0)), 0) into rate from public.order_items oi where oi.order_id = o.id;
  taxable := round(p_amount * 100 / (100 + rate), 2);
  tax := p_amount - taxable;
  half := round(tax / 2, 2);
  party := public._order_party(o);
  no := public.next_doc_number('credit_note', 'MW-CN', public.financial_year(public.ist_today()), 5);
  perform public._post_journal(public.ist_today(), 'credit_note', cid::text, 'Credit note ' || no || ' · order #' || o.order_number, 'credit-note:' || cid,
    jsonb_build_array(public._jl('4095', taxable), public._jl('2100', half), public._jl('2101', tax - half), public._jl('1100', -p_amount, 'customer', party)),
    null, p_reason);
  if p_refund_account is not null then
    perform public._check_money_account(p_refund_account);
    perform public._post_journal(public.ist_today(), 'refund', cid::text, 'Refund for ' || no, 'refund:' || cid,
      jsonb_build_array(public._jl('1100', p_amount, 'customer', party), public._jl(p_refund_account, -p_amount)), null, p_reason);
  end if;
  perform public.write_audit('sales.credit_note', 'orders', o.id::text, jsonb_build_object('no', no, 'amount', p_amount, 'refunded', p_refund_account is not null), p_reason);
  return cid;
end;
$$;

-- SEC-008 and SEC-009: switching staff access back on, or switching off an owner, is for administrators only.
-- - Approving a salesperson (sales_team permission) may switch on a profile only if that person holds no other
--   staff role and is not an owner, so a dismissed staff member cannot get their old access back that way.
-- - Only an owner can switch off another owner.
-- Changes made from the SQL editor or the service key (no signed-in user) are not restricted.
create or replace function public._guard_ops_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or new.ops_active is not distinct from old.ops_active then
    return new;
  end if;
  if new.ops_active and not public.has_permission('users', 'edit')
     and (coalesce(new.is_admin, false) or exists (select 1 from public.ops_user_roles r where r.user_id = new.id and r.role_key <> 'salesperson')) then
    raise exception 'This person''s staff access was switched off. An administrator must switch it back on in Users & roles first.'
      using errcode = '42501';
  end if;
  if not new.ops_active and coalesce(new.is_admin, false)
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Only an owner can switch off another owner''s account' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public._guard_ops_active() from public, anon, authenticated;
drop trigger if exists profiles_guard_ops_active on public.profiles;
create trigger profiles_guard_ops_active before update of ops_active on public.profiles
  for each row execute function public._guard_ops_active();

-- SEC-011: changing a customer's terms needs a pricing, customer-approval or sales-approval permission up front,
-- so nobody else can write audit entries or probe which customer ids exist.
create or replace function public.b2b_set_terms(p_customer_id uuid, p jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  if not (public.has_permission('pricing', 'approve') or public.has_permission('b2b_customers', 'approve') or public.has_permission('sales', 'approve')) then
    raise exception 'You do not have permission to change customer terms' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if p ? 'price_category' and p ->> 'price_category' is distinct from c.price_category then
    if not (public.has_permission('pricing', 'approve') or public.has_permission('b2b_customers', 'approve')) then
      raise exception 'You do not have permission to change price categories' using errcode = '42501';
    end if;
    if not exists (select 1 from public.price_categories where code = p ->> 'price_category' and is_active) then
      raise exception 'Unknown price category';
    end if;
    update public.b2b_customers set price_category = p ->> 'price_category' where id = c.id;
  end if;
  if p ?| array['payment_terms', 'credit_days', 'credit_limit', 'credit_status'] then
    perform public.require_permission('sales', 'approve');
    update public.b2b_customers set
      payment_terms = coalesce(nullif(p ->> 'payment_terms', ''), payment_terms),
      credit_days = coalesce(nullif(p ->> 'credit_days', '')::int, credit_days),
      credit_limit = coalesce(nullif(p ->> 'credit_limit', '')::numeric, credit_limit),
      credit_status = coalesce(nullif(p ->> 'credit_status', ''), credit_status),
      credit_approved_by = auth.uid(), credit_approved_at = now()
    where id = c.id;
    if exists (select 1 from public.b2b_customers where id = c.id and payment_terms = 'credit' and credit_status = 'approved' and credit_limit <= 0) then
      raise exception 'Set a credit limit above zero for a credit customer';
    end if;
  end if;
  perform public.write_audit('b2b_customer.terms', 'b2b_customers', c.id::text,
    jsonb_build_object('from', jsonb_build_object('price_category', c.price_category, 'payment_terms', c.payment_terms, 'credit_days', c.credit_days,
      'credit_limit', c.credit_limit, 'credit_status', c.credit_status), 'to', p), p_reason);
end;
$$;

-- LIVE UPDATE 2026-10-19 (2 of 2): low-severity security fixes. Run in Supabase -> SQL Editor AFTER
-- 2026-10-19-security-fixes.sql. Paste this whole file and click Run. Safe to run again.
-- Same content as supabase/migrations/20261019110000_security_fixes_low.sql.

-- Security audit 2026-10-19, Low findings: SEC-009 (rest), SEC-010, SEC-015 (part). Safe to run more than once.

-- SEC-009: only an owner can sign another owner out of every device.
create or replace function public.ops_reset_user_sessions(p_user_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_permission('users', 'edit');
  if exists (select 1 from public.profiles where id = p_user_id and is_admin)
     and not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Only an owner can reset another owner''s sign-in' using errcode = '42501';
  end if;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  perform public.write_audit('user.sessions_reset', 'profiles', p_user_id::text, jsonb_build_object('sessions_ended', n), p_reason);
  return n;
end;
$$;

-- SEC-010: wholesale customers no longer receive the sales team's internal fields about their shop.
create or replace function public.b2b_customer_profile(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  c public.b2b_customers;
  s public.v_b2b_customer_stats;
  money boolean := public._b2b_can_see_money(p_customer_id);
  sp public.salespeople;
  sp_self public.salespeople := public._b2b_salesperson();
  credit jsonb;
  bal numeric;
begin
  select * into c from public.b2b_customers where id = p_customer_id;
  select * into s from public.v_b2b_customer_stats where customer_id = p_customer_id;
  select * into sp from public.salespeople where id = c.assigned_salesperson;
  credit := case when money then public._b2b_credit(c.id) end;
  bal := coalesce((credit ->> 'balance')::numeric, 0);
  if a = 'salesperson' and not sp_self.can_view_credit and credit is not null then
    credit := credit - 'credit_limit' - 'available';
  end if;
  if a = 'salesperson' and not sp_self.can_view_outstanding and credit is not null then
    credit := credit - 'balance' - 'exposure' - 'overdue' - 'not_invoiced';
  end if;
  return jsonb_build_object(
    'access', a,
    'customer', to_jsonb(c) - 'created_by' - 'credit_approved_by' - 'approved_by'
      - case when money and (a <> 'salesperson' or sp_self.can_view_credit) then 'x' else 'credit_limit' end
      -- The shop itself does not see the sales team's internal notes and assessments.
      - case when a = 'customer' then array['business_notes', 'decision_note', 'expected_monthly_value', 'acquired_by', 'acquired_at',
          'assigned_salesperson', 'source', 'next_follow_up', 'last_visit_at'] else '{}'::text[] end,
    'salesperson', case when sp.id is not null then jsonb_build_object('id', sp.id, 'name', sp.full_name, 'phone', sp.phone, 'employee_code', sp.employee_code) end,
    'stats', jsonb_build_object('orders', s.orders, 'total_value', s.total_value, 'first_order_at', s.first_order_at, 'last_order_at', s.last_order_at,
      'avg_order_value', case when s.orders > 0 then round(s.total_value / s.orders, 2) end, 'orders_per_month', round(s.orders_180d / 6.0, 1),
      'open_orders', s.open_orders),
    'segments', public._b2b_segments(c, s, case when money then bal else 0 end),
    'credit', credit,
    'favourites', (select coalesce(jsonb_agg(x order by x.qty desc), '[]') from (
        select oi.item_id, max(oi.product_name) as name, sum(oi.quantity) as qty, count(distinct o.id) as times, max(o.created_at) as last_at
        from public.orders o join public.order_items oi on oi.order_id = o.id
        where o.b2b_customer_id = c.id and o.status <> 'cancelled' and oi.item_id is not null
        group by oi.item_id order by sum(oi.quantity) desc limit 8) x),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.b2b_order_no, 'created_at', o.created_at, 'total', o.total,
        'source', o.source, 'status', public.b2b_order_status(o.id), 'stage', o.fulfilment_status, 'items', (select count(*) from public.order_items oi where oi.order_id = o.id),
        'invoice_number', o.invoice_number, 'payment_method', o.payment_method) order by o.created_at desc), '[]')
      from (select * from public.orders where b2b_customer_id = c.id order by created_at desc limit 50) o),
    'activities', case when a <> 'customer' then (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'occurred_at', x.occurred_at,
        'outcome', x.outcome, 'products_discussed', x.products_discussed, 'requirements', x.requirements, 'sample_request', x.sample_request,
        'price_enquiry', x.price_enquiry, 'opportunity_value', x.opportunity_value, 'objections', x.objections, 'next_action', x.next_action,
        'follow_up_date', x.follow_up_date, 'notes', x.notes, 'by', coalesce(sx.full_name, pr.full_name, pr.email), 'has_location', x.latitude is not null)
        order by x.occurred_at desc), '[]')
      from (select * from public.b2b_activities where customer_id = c.id order by occurred_at desc limit 100) x
      left join public.salespeople sx on sx.id = x.salesperson_id left join public.profiles pr on pr.id = x.created_by) end,
    'price_requests', case when a <> 'customer' then (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'item', i.name, 'requested_price', r.requested_price,
        'current_price', r.current_price, 'status', r.status, 'approved_price', r.approved_price, 'requested_at', r.requested_at, 'decision_note', r.decision_note)
        order by r.requested_at desc), '[]')
      from public.price_requests r join public.items i on i.id = r.item_id where r.customer_id = c.id) end,
    'consent_log', case when a = 'staff' then (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'consent', l.consent, 'channels', l.channels, 'source', l.source, 'note', l.note)
        order by l.at desc), '[]') from public.b2b_consent_log l where l.customer_id = c.id) end,
    'logins', case when a = 'staff' then (select coalesce(jsonb_agg(jsonb_build_object('user_id', u.user_id, 'email', p.email, 'phone', p.phone, 'name', p.full_name,
        'status', u.status, 'request_note', u.request_note, 'created_at', u.created_at) order by u.created_at), '[]')
      from public.b2b_customer_users u join public.profiles p on p.id = u.user_id where u.customer_id = c.id) end,
    'invites', case when a = 'staff' then (select coalesce(jsonb_agg(jsonb_build_object('contact', i.contact, 'invited_at', i.invited_at, 'accepted_at', i.accepted_at)), '[]')
      from public.b2b_login_invites i where i.customer_id = c.id) end,
    'item_access', case when a = 'staff' then (select coalesce(jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'allowed', x.allowed)), '[]')
      from public.b2b_item_access x join public.items i on i.id = x.item_id where x.customer_id = c.id) end
  );
end;
$$;

-- SEC-015 (part): applying to the sales team needs a verified email address.
create or replace function public.fs_apply(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  aid uuid;
  ph text := public._b2b_clean_phone(p ->> 'phone');
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  select email, email_confirmed_at into u from auth.users where id = auth.uid();
  if u.email is null or u.email_confirmed_at is null then
    raise exception 'Sign in with your email address to apply';
  end if;
  if exists (select 1 from public.salespeople where (user_id = auth.uid() or email = lower(u.email)) and is_active) then
    raise exception 'You are already registered as a salesperson. Open the Sales app.';
  end if;
  if exists (select 1 from public.salesperson_applications where user_id = auth.uid() and status = 'pending') then
    raise exception 'Your application is already with the sales manager';
  end if;
  if (select count(*) from public.salesperson_applications where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many applications today. Please contact the office.' using errcode = '54000';
  end if;
  if coalesce(trim(p ->> 'full_name'), '') = '' or length(trim(p ->> 'full_name')) < 2 then
    raise exception 'Enter your full name';
  end if;
  if ph is null or ph !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  insert into public.salesperson_applications (user_id, email, full_name, phone, city, areas, experience)
  values (auth.uid(), lower(u.email), trim(p ->> 'full_name'), ph, coalesce(nullif(trim(p ->> 'city'), ''), 'Prayagraj'),
    left(nullif(trim(coalesce(p ->> 'areas', '')), ''), 300), left(nullif(trim(coalesce(p ->> 'experience', '')), ''), 1000))
  returning id into aid;
  perform public.write_audit('salesperson.apply', 'salesperson_applications', aid::text, jsonb_build_object('email', lower(u.email), 'phone', ph));
  return jsonb_build_object('status', 'pending');
end;
$$;

-- SEC-015 (part): bottle charges only for a milk subscriber, and a delivery given must be that customer's.
create or replace function public.sub_record_bottles(p_user_id uuid, p_issued integer, p_returned integer, p_damaged integer default 0,
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
  if least(coalesce(p_issued, 0), coalesce(p_returned, 0), coalesce(p_damaged, 0)) < 0 then
    raise exception 'Bottle counts cannot be negative';
  end if;
  if not exists (select 1 from public.subscriptions where user_id = p_user_id) then
    raise exception 'This customer has no milk subscription';
  end if;
  if p_delivery_id is not null and not exists (select 1 from public.subscription_deliveries where id = p_delivery_id and user_id = p_user_id) then
    raise exception 'That delivery belongs to a different customer';
  end if;
  insert into public.bottle_ledger (id, user_id, delivery_id, issued, returned, damaged, note)
  values (bid, p_user_id, p_delivery_id, coalesce(p_issued, 0), coalesce(p_returned, 0), coalesce(p_damaged, 0), p_note);
  if charge > 0 then
    perform public._post_journal(public.ist_today(), 'bottle', bid::text, 'Damaged / lost bottle charge', 'bottle:' || bid,
      jsonb_build_array(public._jl('1100', charge, 'customer', p_user_id::text), public._jl('4100', -charge)), null, p_note);
  end if;
end;
$$;

-- Part 3 of 5 — B2B wholesale: app read models, pricing and team admin
-- Run in the Supabase SQL Editor, in order (1 → 5). Each part must finish with "Success" before the next.
-- Source: supabase/migrations/20261013100000_b2b_sales_wholesale.sql (lines 2117–2926)

-- Read models for the apps --------------------------------------------------------------------------
-- Purchase figures per customer from actual orders (cancelled orders excluded).
create view public.v_b2b_customer_stats with (security_invoker = true) as
select
  c.id as customer_id,
  count(o.id) filter (where o.status <> 'cancelled') as orders,
  coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as total_value,
  min(o.created_at) filter (where o.status <> 'cancelled') as first_order_at,
  max(o.created_at) filter (where o.status <> 'cancelled') as last_order_at,
  count(o.id) filter (where o.status <> 'cancelled' and o.created_at > now() - interval '60 days') as orders_60d,
  coalesce(sum(o.total) filter (where o.status <> 'cancelled' and o.created_at > now() - interval '90 days'), 0) as value_90d,
  count(o.id) filter (where o.status <> 'cancelled' and o.created_at > now() - interval '180 days') as orders_180d,
  count(o.id) filter (where o.fulfilment_status in ('submitted', 'awaiting_confirmation', 'confirmed', 'processing', 'picking', 'packed',
    'ready_for_dispatch', 'partially_dispatched', 'dispatched', 'out_for_delivery')) as open_orders,
  bool_or(o.status <> 'cancelled' and extract(month from o.created_at at time zone 'Asia/Kolkata')::int in (
    select jsonb_array_elements_text(coalesce(public.setting('b2b.segments') -> 'festive_months', '[9,10,11]'))::int)) as festive_buyer
from public.b2b_customers c
left join public.orders o on o.b2b_customer_id = c.id
group by c.id;

-- Segments, calculated from the data every time (rules in the b2b.segments setting).
create function public._b2b_segments(c public.b2b_customers, s public.v_b2b_customer_stats, p_balance numeric)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg jsonb := coalesce(public.setting('b2b.segments'), '{}');
  out text[] := '{}';
  since_last integer := case when s.last_order_at is null then null else public.ist_today() - public._ist_date(s.last_order_at) end;
begin
  if c.status = 'lead' then out := array_append(out, 'new_lead'); end if;
  if c.status = 'approved' and c.approved_at > now() - make_interval(days => coalesce((cfg ->> 'new_days')::int, 30)) then out := array_append(out, 'newly_acquired'); end if;
  if c.status = 'approved' and since_last is not null and since_last <= coalesce((cfg ->> 'inactive_days')::int, 60) then out := array_append(out, 'active'); end if;
  if s.value_90d >= coalesce((cfg ->> 'high_volume_value_90d')::numeric, 50000) then out := array_append(out, 'high_volume'); end if;
  if s.orders_60d >= coalesce((cfg ->> 'frequent_orders_60d')::int, 4) then out := array_append(out, 'frequent'); end if;
  if c.status = 'approved' and since_last > coalesce((cfg ->> 'not_recent_days')::int, 21) and since_last <= coalesce((cfg ->> 'inactive_days')::int, 60) then
    out := array_append(out, 'not_ordered_recently');
  end if;
  if c.status in ('approved', 'inactive') and (since_last is null or since_last > coalesce((cfg ->> 'inactive_days')::int, 60)) then out := array_append(out, 'inactive'); end if;
  if c.next_follow_up is not null and c.next_follow_up <= public.ist_today() then out := array_append(out, 'needs_follow_up'); end if;
  if coalesce(p_balance, 0) > 0 then out := array_append(out, 'outstanding_payment'); end if;
  if coalesce(s.festive_buyer, false) then out := array_append(out, 'festive_buyer'); end if;
  if c.callback_requested then out := array_append(out, 'callback_requested'); end if;
  if c.marketing_consent and c.opted_out_at is null then out := array_append(out, 'marketing_consent'); end if;
  return out;
end;
$$;

-- The customer list for Admin, CRM, Finance and the Sales app. Salespeople see only their own shops;
-- money columns are filled only for people allowed to see them.
create function public.b2b_customer_list(p_search text default null, p_filters jsonb default '{}', p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  staff boolean := public.has_permission('b2b_customers', 'view');
  sp public.salespeople := public._b2b_salesperson();
  money_staff boolean := public.has_permission('sales', 'view') or public.has_permission('b2b_customers', 'edit');
  q text := lower(trim(coalesce(p_search, '')));
  f jsonb := coalesce(p_filters, '{}');
  result jsonb;
begin
  if not staff and sp.id is null then
    raise exception 'You do not have permission to view customers' using errcode = '42501';
  end if;
  with base as (
    select c, s, sp2.full_name as salesperson_name,
      (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l where l.account_code = '1100' and l.party_id = 'b2b:' || c.id) as balance
    from public.b2b_customers c
    join public.v_b2b_customer_stats s on s.customer_id = c.id
    left join public.salespeople sp2 on sp2.id = c.assigned_salesperson
    where (staff or c.assigned_salesperson = sp.id)
      and (q = '' or lower(c.shop_name) like '%' || q || '%' or lower(c.owner_name) like '%' || q || '%' or c.mobile like '%' || q || '%'
        or lower(c.customer_code) like '%' || q || '%' or lower(coalesce(c.locality, '')) like '%' || q || '%' or coalesce(c.whatsapp, '') like '%' || q || '%')
      and (coalesce(f ->> 'status', '') = '' or c.status = f ->> 'status')
      and (coalesce(f ->> 'city', '') = '' or lower(c.city) = lower(f ->> 'city'))
      and (coalesce(f ->> 'locality', '') = '' or lower(coalesce(c.locality, '')) like '%' || lower(f ->> 'locality') || '%')
      and (coalesce(f ->> 'customer_type', '') = '' or c.customer_type = f ->> 'customer_type')
      and (coalesce(f ->> 'salesperson', '') = '' or (f ->> 'salesperson' = 'none' and c.assigned_salesperson is null) or c.assigned_salesperson::text = f ->> 'salesperson')
      and (coalesce(f ->> 'last_order_before', '') = '' or s.last_order_at is null or public._ist_date(s.last_order_at) < (f ->> 'last_order_before')::date)
      and (coalesce(f ->> 'last_order_after', '') = '' or public._ist_date(s.last_order_at) >= (f ->> 'last_order_after')::date)
      and (coalesce(f ->> 'min_value', '') = '' or s.total_value >= (f ->> 'min_value')::numeric)
      and (coalesce(f ->> 'min_orders', '') = '' or s.orders >= (f ->> 'min_orders')::int)
      and (coalesce(f ->> 'product', '') = '' or exists (select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
        join public.items i on i.id = oi.item_id
        where o.b2b_customer_id = c.id and o.status <> 'cancelled' and (i.id::text = f ->> 'product' or i.product_id::text = f ->> 'product')))
  ), rows as (
    select b.*, public._b2b_segments(b.c, b.s, b.balance) as segments from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', (r.c).id, 'customer_code', (r.c).customer_code, 'shop_name', (r.c).shop_name, 'owner_name', (r.c).owner_name,
      'mobile', (r.c).mobile, 'whatsapp', (r.c).whatsapp, 'locality', (r.c).locality, 'city', (r.c).city, 'customer_type', (r.c).customer_type,
      'status', (r.c).status, 'source', (r.c).source, 'assigned_salesperson', (r.c).assigned_salesperson, 'salesperson_name', r.salesperson_name,
      'price_category', (r.c).price_category, 'payment_terms', (r.c).payment_terms, 'next_follow_up', (r.c).next_follow_up,
      'acquired_at', (r.c).acquired_at, 'marketing_consent', (r.c).marketing_consent and (r.c).opted_out_at is null,
      'orders', (r.s).orders, 'total_value', (r.s).total_value, 'last_order_at', (r.s).last_order_at, 'open_orders', (r.s).open_orders,
      'avg_order_value', case when (r.s).orders > 0 then round((r.s).total_value / (r.s).orders, 2) end,
      'orders_per_month', round((r.s).orders_180d / 6.0, 1),
      'balance', case when money_staff or (sp.id is not null and (sp.can_view_outstanding)) then r.balance end,
      'credit_limit', case when money_staff or (sp.id is not null and sp.can_view_credit) then (r.c).credit_limit end,
      'segments', r.segments)
      order by (r.c).shop_name), '[]')
  into result
  from (select * from rows where coalesce(f ->> 'segment', '') = '' or (f ->> 'segment') = any (segments) limit least(greatest(coalesce(p_limit, 200), 1), 2000)) r;
  return result;
end;
$$;

-- One customer: master record, figures, favourite products, orders and the CRM timeline.
create function public.b2b_customer_profile(p_customer_id uuid)
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
      - case when money and (a <> 'salesperson' or sp_self.can_view_credit) then 'x' else 'credit_limit' end,
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

-- Wholesale catalogue: only items approved for this customer, at this customer's prices. Never shows
-- cost, recipe or margin. Leads (not yet approved) see the catalogue without prices.
create function public.b2b_catalogue(p_customer_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cid uuid := p_customer_id;
  a text;
  st text;
  show_prices boolean;
  exact boolean;
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if cid is null then
    cid := public._b2b_my_customer_id();
  end if;
  if cid is null then
    if not ((public._b2b_salesperson()).id is not null
            or public.has_permission('b2b_customers', 'view') or public.has_permission('pricing', 'view')) then
      raise exception 'Wholesale catalogue is for approved customers' using errcode = '42501';
    end if;
    a := 'staff';
    show_prices := true;
  else
    a := public._b2b_require_access(cid);
    select status into st from public.b2b_customers where id = cid;
    show_prices := a in ('staff', 'salesperson') or st in ('approved', 'suspended');
  end if;
  exact := a in ('staff', 'salesperson');
  return (select coalesce(jsonb_agg(x order by x ->> 'sort', x ->> 'name'), '[]') from (
    select jsonb_build_object(
      'sort', lpad(coalesce(p.sort_order, 0)::text, 4, '0') || coalesce(p.name, ''),
      'item_id', i.id, 'code', i.code, 'name', i.name, 'product_id', p.id, 'product_code', p.code, 'product_name', p.name,
      'category', p.category, 'category_label', cat.label, 'image_url', p.image_url, 'storefront_slug', i.storefront_slug,
      'description', p.description, 'shelf_life_days', coalesce(i.shelf_life_days, p.shelf_life_days),
      'storage', coalesce(i.storage_conditions, p.storage_conditions),
      'pack', pc.name, 'pack_type', pc.pack_type, 'net_qty', coalesce(pc.net_qty, i.net_qty), 'net_unit', coalesce(pc.net_unit, p.base_unit), 'unit', i.unit,
      'hsn', i.hsn, 'gst_rate', coalesce(i.gst_rate, p.gst_rate, 0), 'min_qty', i.b2b_min_qty, 'multiple', i.b2b_qty_multiple, 'lead_days', i.b2b_lead_days,
      'price', case when show_prices then pr.price end,
      'list_price', case when show_prices then pr.list_price end,
      'price_source', case when show_prices then pr.source end,
      'breaks', case when show_prices then (
        select coalesce(jsonb_agg(jsonb_build_object('min_qty', b.min_qty, 'price', (select bp.price from public._b2b_price(cid, i.id, b.min_qty) bp))
          order by b.min_qty), '[]')
        from (select distinct wp.min_qty from public.wholesale_prices wp where wp.item_id = i.id and wp.min_qty > 1 and wp.ended_at is null
          and wp.valid_from <= public.ist_today() and (wp.valid_to is null or wp.valid_to >= public.ist_today())
          and (wp.scope in ('standard', 'promotion') or wp.customer_id = cid
            or wp.price_category = (select c2.price_category from public.b2b_customers c2 where c2.id = cid))) b) end,
      'offers', case when show_prices then (
        select coalesce(jsonb_agg(jsonb_build_object('price', wp.price, 'min_qty', wp.min_qty, 'valid_to', wp.valid_to, 'note', wp.note)), '[]')
        from public.wholesale_prices wp where wp.item_id = i.id and wp.scope = 'promotion' and wp.ended_at is null
          and wp.valid_from <= public.ist_today() and (wp.valid_to is null or wp.valid_to >= public.ist_today())
          and (wp.price_category is null or wp.price_category = (select c2.price_category from public.b2b_customers c2 where c2.id = cid))) end,
      'availability', case
        when public._b2b_free_stock(i.id) >= greatest(i.b2b_min_qty * 5, 10) then 'in_stock'
        when public._b2b_free_stock(i.id) > 0 then 'limited'
        else 'made_to_order' end,
      'available_qty', case when exact or i.b2b_stock_display = 'exact' then public._b2b_free_stock(i.id) end
    ) as x
    from public.items i
    join public.products p on p.id = i.product_id
    left join public.categories cat on cat.code = p.category
    left join public.packaging_configs pc on pc.id = i.packaging_config_id
    left join lateral (select * from public._b2b_price(cid, i.id, 1)) pr on true
    where i.is_active and p.is_active and i.b2b_enabled and i.item_type in ('finished_good', 'purchased_good')
      and (cid is null or public._b2b_item_visible(cid, i.id))
      and (pr.price is not null or not show_prices)
  ) t);
end;
$$;

-- The Wholesale app's account context.
create function public.b2b_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  c public.b2b_customers;
  sp public.salespeople;
  s public.v_b2b_customer_stats;
begin
  if auth.uid() is null then
    return jsonb_build_object('state', 'signed_out');
  end if;
  select cu.*, b.status as customer_status into link from public.b2b_customer_users cu join public.b2b_customers b on b.id = cu.customer_id
  where cu.user_id = auth.uid() and cu.status in ('pending', 'active') order by cu.status = 'active' desc limit 1;
  if not found then
    return jsonb_build_object('state', 'not_registered');
  end if;
  if link.status = 'pending' then
    return jsonb_build_object('state', 'pending_approval', 'link_request', link.request_note is not null);
  end if;
  if link.customer_status not in ('approved', 'suspended') then
    return jsonb_build_object('state', case when link.customer_status = 'lead' then 'pending_approval' else 'closed' end);
  end if;
  select * into c from public.b2b_customers where id = link.customer_id;
  select * into sp from public.salespeople where id = c.assigned_salesperson;
  select * into s from public.v_b2b_customer_stats where customer_id = c.id;
  return jsonb_build_object(
    'state', case when c.status = 'suspended' then 'suspended' else 'active' end,
    'customer', jsonb_build_object('id', c.id, 'customer_code', c.customer_code, 'shop_name', c.shop_name, 'owner_name', c.owner_name,
      'mobile', c.mobile, 'whatsapp', c.whatsapp, 'email', c.email, 'business_address', c.business_address, 'delivery_address', c.delivery_address,
      'locality', c.locality, 'city', c.city, 'pincode', c.pincode, 'gstin', c.gstin, 'customer_type', c.customer_type,
      'payment_terms', c.payment_terms, 'credit_days', c.credit_days, 'price_category', c.price_category,
      'marketing_consent', c.marketing_consent and c.opted_out_at is null, 'consent_channels', c.consent_channels, 'preferred_channel', c.preferred_channel),
    'salesperson', case when sp.id is not null then jsonb_build_object('name', sp.full_name, 'phone', sp.phone) end,
    'credit', public._b2b_credit(c.id),
    'stats', jsonb_build_object('orders', s.orders, 'total_value', s.total_value, 'last_order_at', s.last_order_at, 'open_orders', s.open_orders),
    'unread', (select count(*) from public.b2b_notifications n where n.customer_id = c.id and n.channel = 'in_app' and n.status = 'unread'),
    'support', public.setting('b2b.support_contact'),
    'payment_methods', case c.payment_terms when 'credit' then case when c.credit_status = 'approved' then '["credit", "cod", "advance"]'::jsonb else '["cod", "advance"]'::jsonb end
      when 'cod' then '["cod", "advance"]'::jsonb else '["advance"]'::jsonb end
  );
end;
$$;

-- Orders for the apps. Customers: their own; salespeople: their customers'; staff: any.
create function public.b2b_orders(p_customer_id uuid default null, p_scope text default null, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sp public.salespeople := public._b2b_salesperson();
  mine uuid := public._b2b_my_customer_id();
  staff boolean := public.has_permission('b2b_customers', 'view');
begin
  if p_customer_id is not null then
    perform public._b2b_require_access(p_customer_id);
  elsif mine is null and sp.id is null and not staff then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_no', o.b2b_order_no, 'created_at', o.created_at, 'customer_id', o.b2b_customer_id, 'shop_name', c.shop_name,
      'customer_code', c.customer_code, 'source', o.source, 'entered_by_me', o.salesperson_id = sp.id, 'total', o.total,
      'status', public.b2b_order_status(o.id), 'stage', o.fulfilment_status, 'confirmation', o.customer_confirmation,
      'requested_delivery_date', o.requested_delivery_date, 'delivery_date', o.delivery_date, 'payment_method', o.payment_method,
      'invoice_number', o.invoice_number,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'qty', oi.quantity)), '[]') from public.order_items oi where oi.order_id = o.id))
      order by o.created_at desc), '[]')
    from (select o2.* from public.orders o2
          where o2.b2b_customer_id is not null
            and (case
              when p_customer_id is not null then o2.b2b_customer_id = p_customer_id
              when mine is not null then o2.b2b_customer_id = mine
              when sp.id is not null and (p_scope = 'entered' or not staff) then
                case when p_scope = 'entered' then o2.salesperson_id = sp.id
                     else o2.b2b_customer_id in (select id from public.b2b_customers where assigned_salesperson = sp.id) or o2.salesperson_id = sp.id end
              else staff end)
          order by o2.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) o
    join public.b2b_customers c on c.id = o.b2b_customer_id);
end;
$$;

-- One order with its lines, tracking timeline, dispatches and amendments.
create function public.b2b_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
  a text;
  c public.b2b_customers;
  paid numeric;
begin
  select * into o from public.orders where id = p_order_id;
  a := public._b2b_access(o.b2b_customer_id);
  if o.id is null or o.b2b_customer_id is null or a is null then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  select * into c from public.b2b_customers where id = o.b2b_customer_id;
  select coalesce(sum(pa.amount), 0) into paid from public.payment_allocations pa where pa.doc_type = 'order' and pa.doc_id = o.id;
  return jsonb_build_object(
    'access', a,
    'order', jsonb_build_object('id', o.id, 'order_no', o.b2b_order_no, 'order_number', o.order_number, 'created_at', o.created_at, 'source', o.source,
      'status', public.b2b_order_status(o.id), 'stage', o.fulfilment_status, 'confirmation', o.customer_confirmation, 'on_hold', o.on_hold,
      'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
      'paid_recorded', paid, 'requested_delivery_date', o.requested_delivery_date, 'delivery_date', o.delivery_date, 'notes', o.notes,
      'invoice_number', o.invoice_number, 'invoice_date', o.invoice_date, 'amendment_count', o.amendment_count, 'cancel_reason', o.cancel_reason,
      'approval_reasons', case when a <> 'customer' then to_jsonb(o.approval_reasons) end, 'priority', o.priority,
      'delivery_address', o.address, 'city', o.city, 'pincode', o.pincode,
      'entered_by_me', coalesce(o.salesperson_id = (public._b2b_salesperson()).id, false),
      'entered_by', case when o.source = 'sales_rep' then (select full_name from public.salespeople where id = o.salesperson_id)
        when o.source = 'b2b_app' then 'Placed in the Wholesale app' else 'Mithai Wallah staff' end),
    'customer', jsonb_build_object('id', c.id, 'customer_code', c.customer_code, 'shop_name', c.shop_name, 'owner_name', c.owner_name, 'mobile', c.mobile,
      'gstin', c.gstin, 'business_address', c.business_address),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('order_item_id', oi.id, 'item_id', oi.item_id, 'name', oi.product_name, 'pack', oi.pack_label,
        'code', i.code, 'qty', oi.quantity, 'unit_price', oi.unit_price, 'list_price', oi.list_price, 'line_total', oi.unit_price * oi.quantity,
        'gst_rate', oi.gst_rate, 'dispatched', f.dispatched, 'reserved', f.reserved) order by oi.product_name), '[]')
      from public.order_items oi left join public.items i on i.id = oi.item_id left join public.v_order_line_fulfilment f on f.order_item_id = oi.id
      where oi.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'status', e.status, 'label', public._b2b_stage_label(e.status), 'note', e.note)
        order by e.at, e.id), '[]') from public.order_events e where e.order_id = o.id),
    'dispatches', (select coalesce(jsonb_agg(jsonb_build_object('dispatch_no', d.dispatch_no, 'status', d.status, 'dispatched_at', d.dispatched_at,
        'expected_at', d.expected_at, 'delivered_at', d.delivered_at, 'delivery_person', d.delivery_person) order by d.dispatched_at), '[]')
      from public.dispatches d where d.order_id = o.id),
    'amendments', case when a <> 'customer' then (select coalesce(jsonb_agg(jsonb_build_object('no', m.amendment_no, 'at', m.amended_at, 'reason', m.reason,
        'before', m.before, 'after', m.after, 'by', coalesce(p.full_name, p.email)) order by m.amendment_no), '[]')
      from public.order_amendments m left join public.profiles p on p.id = m.amended_by where m.order_id = o.id) end
  );
end;
$$;

-- Salesperson dashboard: every figure from actual order and CRM records.
create function public.fs_dashboard(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sp public.salespeople := public._b2b_salesperson();
  d1 date := coalesce(p_from, public.ist_today());
  d2 date := coalesce(p_to, public.ist_today());
  m1 date := date_trunc('month', public.ist_today())::date;
  t public.sales_targets;
  month_value numeric;
begin
  if sp.id is null then
    raise exception 'This account is not set up as a salesperson yet' using errcode = '42501';
  end if;
  select * into t from public.sales_targets where salesperson_id = sp.id and month = m1;
  -- Target achievement counts what the salesperson entered (or, if their incentive is on account sales, all their accounts' orders).
  select coalesce(sum(o.total), 0) into month_value from public.orders o
  where o.status <> 'cancelled' and o.created_at >= (m1::timestamp at time zone 'Asia/Kolkata')
    and (o.salesperson_id = sp.id or (sp.incentive_basis = 'account_sales' and o.account_salesperson_id = sp.id));
  return jsonb_build_object(
    'salesperson', jsonb_build_object('id', sp.id, 'name', sp.full_name, 'employee_code', sp.employee_code, 'territories', sp.territories,
      'can_view_outstanding', sp.can_view_outstanding),
    'period', jsonb_build_object('from', d1, 'to', d2),
    'assigned_customers', (select count(*) from public.b2b_customers where assigned_salesperson = sp.id and status in ('approved', 'suspended')),
    'new_leads', (select count(*) from public.b2b_customers where assigned_salesperson = sp.id and status = 'lead'),
    'leads_added', (select count(*) from public.b2b_customers where acquired_by = sp.id and public._ist_date(acquired_at) between d1 and d2),
    'orders_placed', (select count(*) from public.orders where salesperson_id = sp.id and status <> 'cancelled' and public._ist_date(created_at) between d1 and d2),
    'sales_value', (select coalesce(sum(total), 0) from public.orders where salesperson_id = sp.id and status <> 'cancelled' and public._ist_date(created_at) between d1 and d2),
    'direct_orders_from_my_accounts', (select count(*) from public.orders where account_salesperson_id = sp.id and source = 'b2b_app' and status <> 'cancelled'
      and public._ist_date(created_at) between d1 and d2),
    'awaiting_processing', (select count(*) from public.orders where (salesperson_id = sp.id or account_salesperson_id = sp.id)
      and fulfilment_status in ('submitted', 'awaiting_confirmation', 'confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch')),
    'dispatched', (select count(distinct o.id) from public.orders o join public.dispatches d on d.order_id = o.id
      where (o.salesperson_id = sp.id or o.account_salesperson_id = sp.id) and public._ist_date(d.dispatched_at) between d1 and d2),
    'delivered', (select count(distinct o.id) from public.orders o join public.dispatches d on d.order_id = o.id
      where (o.salesperson_id = sp.id or o.account_salesperson_id = sp.id) and d.status = 'delivered' and public._ist_date(d.delivered_at) between d1 and d2),
    'month_sales', month_value,
    'target', case when t.salesperson_id is not null then jsonb_build_object('value', t.target_value, 'orders', t.target_orders, 'new_customers', t.target_new_customers,
      'achieved_pct', case when t.target_value > 0 then round(month_value * 100 / t.target_value, 1) end) end,
    'outstanding', case when sp.can_view_outstanding then (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l
      where l.account_code = '1100' and l.party_id in (select 'b2b:' || id from public.b2b_customers where assigned_salesperson = sp.id)) end,
    'todays_visits', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'shop_name', c.shop_name, 'locality', c.locality, 'customer_code', c.customer_code,
        'next_follow_up', c.next_follow_up, 'status', c.status) order by c.next_follow_up, c.shop_name), '[]')
      from public.b2b_customers c where c.assigned_salesperson = sp.id and c.next_follow_up <= public.ist_today() and c.status not in ('rejected', 'inactive')),
    'not_ordered_recently', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'shop_name', c.shop_name, 'locality', c.locality,
        'last_order_at', s.last_order_at) order by s.last_order_at nulls first), '[]')
      from public.b2b_customers c join public.v_b2b_customer_stats s on s.customer_id = c.id
      where c.assigned_salesperson = sp.id and c.status = 'approved'
        and (s.last_order_at is null or s.last_order_at < now() - make_interval(days => coalesce((public.setting('b2b.segments') ->> 'not_recent_days')::int, 21)))),
    'recent_visits', (select coalesce(jsonb_agg(jsonb_build_object('customer_id', c.id, 'shop_name', c.shop_name, 'kind', x.kind, 'outcome', x.outcome,
        'occurred_at', x.occurred_at) order by x.occurred_at desc), '[]')
      from (select * from public.b2b_activities where salesperson_id = sp.id order by occurred_at desc limit 8) x
      join public.b2b_customers c on c.id = x.customer_id),
    'pending_price_requests', (select count(*) from public.price_requests where requested_by = auth.uid() and status = 'pending')
  );
end;
$$;

-- Price request from the field ---------------------------------------------------------------------
create function public.fs_request_price(p_customer_id uuid, p_item_id uuid, p_price numeric, p_min_qty integer default 1, p_valid_to date default null, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  rid uuid;
  cur numeric;
begin
  if not ((a = 'salesperson' and public.has_permission('field_sales', 'create')) or public.has_permission('b2b_customers', 'edit')) then
    raise exception 'You cannot request prices for this customer' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why the shop needs this price (volume, competitor rate…)';
  end if;
  if p_price is null or p_price < 0 or p_price <> round(p_price) then
    raise exception 'Enter the requested price in whole rupees';
  end if;
  if not public._b2b_item_visible(p_customer_id, p_item_id) then
    raise exception 'That product is not available for this customer';
  end if;
  select price into cur from public._b2b_price(p_customer_id, p_item_id, coalesce(p_min_qty, 1));
  insert into public.price_requests (customer_id, item_id, requested_price, current_price, min_qty, valid_to, reason)
  values (p_customer_id, p_item_id, p_price, cur, greatest(coalesce(p_min_qty, 1), 1), p_valid_to, trim(p_reason))
  returning id into rid;
  perform public.write_audit('price_request.create', 'price_requests', rid::text,
    jsonb_build_object('customer', p_customer_id, 'item', p_item_id, 'requested', p_price, 'current', cur), p_reason);
  return rid;
end;
$$;

create function public.pr_decide_price_request(p_request_id uuid, p_approve boolean, p_price numeric default null, p_valid_from date default null,
  p_valid_to date default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.price_requests;
  pid uuid;
  final_price numeric;
begin
  perform public.require_permission('pricing', 'approve');
  select * into r from public.price_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'This request has already been decided';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for declining';
  end if;
  final_price := coalesce(p_price, r.requested_price);
  if p_approve then
    if final_price < 0 or final_price <> round(final_price) then
      raise exception 'Enter the approved price in whole rupees';
    end if;
    insert into public.wholesale_prices (item_id, scope, customer_id, min_qty, price, valid_from, valid_to, note, source, price_request_id, approved_by, approved_at)
    values (r.item_id, 'customer', r.customer_id, r.min_qty, final_price, coalesce(p_valid_from, public.ist_today()), coalesce(p_valid_to, r.valid_to),
      'Special price approved for request', 'special_approval', r.id, auth.uid(), now())
    returning id into pid;
  end if;
  update public.price_requests set status = case when p_approve then 'approved' else 'rejected' end, approved_price = case when p_approve then final_price end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = r.id;
  perform public.write_audit(case when p_approve then 'price_request.approve' else 'price_request.reject' end, 'price_requests', r.id::text,
    jsonb_build_object('customer', r.customer_id, 'item', r.item_id, 'requested', r.requested_price, 'approved', case when p_approve then final_price end, 'price_rule', pid), p_note);
  return pid;
end;
$$;

-- Pricing administration -------------------------------------------------------------------------------
-- A new price rule. Standard and category prices: pricing editors. Customer prices and promotions:
-- pricing approvers (recorded as the approver). The rule it replaces is ended, never overwritten.
create function public.pr_save_price(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.wholesale_prices;
  old record;
  approver boolean;
begin
  perform public.require_permission('pricing', 'edit');
  r.id := gen_random_uuid();
  r.item_id := (p ->> 'item_id')::uuid;
  r.scope := coalesce(nullif(p ->> 'scope', ''), 'standard');
  r.price_category := nullif(p ->> 'price_category', '');
  r.customer_id := nullif(p ->> 'customer_id', '')::uuid;
  r.min_qty := coalesce(nullif(p ->> 'min_qty', '')::int, 1);
  r.price := (p ->> 'price')::numeric;
  r.valid_from := coalesce(nullif(p ->> 'valid_from', '')::date, public.ist_today());
  r.valid_to := nullif(p ->> 'valid_to', '')::date;
  r.note := nullif(trim(coalesce(p ->> 'note', '')), '');
  if r.price is null or r.price < 0 or r.price <> round(r.price) then
    raise exception 'Enter the price in whole rupees (GST included)';
  end if;
  if not exists (select 1 from public.items where id = r.item_id and item_type in ('finished_good', 'purchased_good')) then
    raise exception 'Choose a sellable product';
  end if;
  if r.scope in ('customer', 'promotion') then
    perform public.require_permission('pricing', 'approve');
    approver := true;
  end if;
  if r.scope = 'promotion' and r.valid_to is null then
    raise exception 'A promotion needs an end date';
  end if;
  if r.scope = 'customer' and not exists (select 1 from public.b2b_customers where id = r.customer_id) then
    raise exception 'Choose the customer';
  end if;
  if r.scope = 'category' and r.price_category is null then
    raise exception 'Choose the price category';
  end if;
  if r.scope in ('standard', 'customer') then
    r.price_category := null;
  end if;
  if r.scope <> 'customer' then
    r.customer_id := null;
  end if;
  -- End the rule this one replaces (same item, scope, target and quantity break).
  if r.scope <> 'promotion' then
    for old in select * from public.wholesale_prices w
      where w.item_id = r.item_id and w.scope = r.scope and w.min_qty = r.min_qty and w.ended_at is null
        and w.price_category is not distinct from r.price_category and w.customer_id is not distinct from r.customer_id
        and (w.valid_to is null or w.valid_to >= r.valid_from)
      for update
    loop
      if r.valid_from <= public.ist_today() or old.valid_from >= r.valid_from then
        update public.wholesale_prices set ended_at = now(), ended_by = auth.uid(), ended_reason = 'Replaced by a new price' where id = old.id;
      else
        update public.wholesale_prices set valid_to = r.valid_from - 1 where id = old.id;
      end if;
    end loop;
  end if;
  insert into public.wholesale_prices (id, item_id, scope, price_category, customer_id, min_qty, price, valid_from, valid_to, note, approved_by, approved_at)
  values (r.id, r.item_id, r.scope, r.price_category, r.customer_id, r.min_qty, r.price, r.valid_from, r.valid_to, r.note,
    case when approver then auth.uid() end, case when approver then now() end);
  perform public.write_audit('price.set', 'wholesale_prices', r.id::text, to_jsonb(r) - 'id');
  return r.id;
end;
$$;

create function public.pr_end_price(p_price_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.wholesale_prices;
begin
  perform public.require_permission('pricing', 'edit');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into w from public.wholesale_prices where id = p_price_id for update;
  if not found or w.ended_at is not null then
    raise exception 'Price rule not found or already ended';
  end if;
  if w.scope in ('customer', 'promotion') then
    perform public.require_permission('pricing', 'approve');
  end if;
  update public.wholesale_prices set ended_at = now(), ended_by = auth.uid(), ended_reason = trim(p_reason) where id = w.id;
  perform public.write_audit('price.end', 'wholesale_prices', w.id::text, to_jsonb(w), p_reason);
end;
$$;

-- Wholesale settings of a SKU (sell to B2B, minimums, lead time, stock display).
create function public.pr_save_item_wholesale(p_item_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.items;
begin
  if not (public.has_permission('pricing', 'edit') or public.has_permission('catalog', 'edit')) then
    raise exception 'You do not have permission to change wholesale settings' using errcode = '42501';
  end if;
  select * into it from public.items where id = p_item_id and item_type in ('finished_good', 'purchased_good') for update;
  if not found then
    raise exception 'Choose a sellable product';
  end if;
  update public.items set
    b2b_enabled = coalesce((p ->> 'b2b_enabled')::boolean, b2b_enabled),
    b2b_restricted = coalesce((p ->> 'b2b_restricted')::boolean, b2b_restricted),
    b2b_min_qty = coalesce(nullif(p ->> 'b2b_min_qty', '')::int, b2b_min_qty),
    b2b_qty_multiple = coalesce(nullif(p ->> 'b2b_qty_multiple', '')::int, b2b_qty_multiple),
    b2b_lead_days = coalesce(nullif(p ->> 'b2b_lead_days', '')::int, b2b_lead_days),
    b2b_stock_display = coalesce(nullif(p ->> 'b2b_stock_display', ''), b2b_stock_display)
  where id = it.id;
  perform public.write_audit('item.wholesale', 'items', it.id::text, jsonb_build_object('code', it.code, 'to', p));
end;
$$;

create function public.pr_set_item_access(p_customer_id uuid, p_item_id uuid, p_allowed boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('pricing', 'edit') or public.has_permission('b2b_customers', 'edit')) then
    raise exception 'You do not have permission to change product availability' using errcode = '42501';
  end if;
  if p_allowed is null then
    delete from public.b2b_item_access where customer_id = p_customer_id and item_id = p_item_id;
  else
    insert into public.b2b_item_access (customer_id, item_id, allowed) values (p_customer_id, p_item_id, p_allowed)
    on conflict (customer_id, item_id) do update set allowed = excluded.allowed, set_by = auth.uid(), set_at = now();
  end if;
  perform public.write_audit('item.customer_access', 'b2b_customers', p_customer_id::text, jsonb_build_object('item', p_item_id, 'allowed', p_allowed));
end;
$$;

create function public.pr_save_category(p_code text, p_label text, p_description text default null, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('pricing', 'edit');
  insert into public.price_categories (code, label, description, is_active) values (lower(trim(p_code)), trim(p_label), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_active, true))
  on conflict (code) do update set label = excluded.label, description = excluded.description, is_active = excluded.is_active;
  perform public.write_audit('price_category.save', 'price_categories', lower(trim(p_code)), jsonb_build_object('label', p_label, 'active', p_active));
end;
$$;

-- Sales team administration --------------------------------------------------------------------------
-- Create or update a salesperson. Gives the 'salesperson' role (now, or when they first sign in).
create function public.st_save_salesperson(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.salespeople;
  sid uuid := nullif(p ->> 'id', '')::uuid;
  uid uuid;
  before_row jsonb;
begin
  perform public.require_permission('sales_team', case when sid is null then 'create' else 'edit' end);
  if sid is not null then
    select * into s from public.salespeople where id = sid for update;
    if not found then
      raise exception 'Salesperson not found';
    end if;
    before_row := to_jsonb(s);
  else
    s.id := gen_random_uuid();
    s.email := lower(trim(coalesce(p ->> 'email', '')));
    if s.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception 'Enter the salesperson''s sign-in email';
    end if;
    s.is_active := true;
    s.can_view_outstanding := false;
    s.can_view_credit := false;
    s.incentive_pct := 0;
    s.incentive_basis := 'rep_orders';
    s.territories := '{}';
  end if;
  s.full_name := coalesce(nullif(trim(p ->> 'full_name'), ''), s.full_name);
  s.employee_code := upper(coalesce(nullif(trim(p ->> 'employee_code'), ''), s.employee_code));
  if p ? 'phone' then s.phone := public._b2b_clean_phone(p ->> 'phone'); end if;
  if p ? 'territories' then s.territories := array(select jsonb_array_elements_text(p -> 'territories')); end if;
  if p ? 'is_active' then s.is_active := (p ->> 'is_active')::boolean; end if;
  if p ? 'can_view_outstanding' then s.can_view_outstanding := (p ->> 'can_view_outstanding')::boolean; end if;
  if p ? 'can_view_credit' then s.can_view_credit := (p ->> 'can_view_credit')::boolean; end if;
  if p ? 'incentive_pct' then s.incentive_pct := coalesce(nullif(p ->> 'incentive_pct', '')::numeric, 0); end if;
  if p ? 'incentive_basis' then s.incentive_basis := coalesce(nullif(p ->> 'incentive_basis', ''), 'rep_orders'); end if;
  if exists (select 1 from unnest(s.territories) t where t not in (select code from public.sales_territories)) then
    raise exception 'Unknown territory';
  end if;
  if s.full_name is null or s.employee_code is null then
    raise exception 'Enter the name and employee code';
  end if;
  if sid is null then
    select id into uid from public.profiles where email = s.email;
    s.user_id := uid;
    insert into public.salespeople (id, user_id, email, employee_code, full_name, phone, territories, is_active, can_view_outstanding, can_view_credit,
      incentive_pct, incentive_basis)
    values (s.id, s.user_id, s.email, s.employee_code, s.full_name, s.phone, s.territories, s.is_active, s.can_view_outstanding, s.can_view_credit,
      s.incentive_pct, s.incentive_basis);
    if uid is not null then
      insert into public.ops_user_roles (user_id, role_key, granted_by) values (uid, 'salesperson', auth.uid()) on conflict do nothing;
      update public.profiles set ops_active = true, job_title = coalesce(job_title, 'Salesperson') where id = uid;
    else
      insert into public.ops_staff_invites (email, role_keys, invited_by) values (s.email, '{salesperson}', auth.uid())
      on conflict (email) do update set role_keys = (select array(select distinct x from unnest(public.ops_staff_invites.role_keys || '{salesperson}'::text[]) x)),
        accepted_at = null;
    end if;
  else
    update public.salespeople set full_name = s.full_name, employee_code = s.employee_code, phone = s.phone, territories = s.territories,
      is_active = s.is_active, can_view_outstanding = s.can_view_outstanding, can_view_credit = s.can_view_credit,
      incentive_pct = s.incentive_pct, incentive_basis = s.incentive_basis, updated_at = now()
    where id = s.id;
  end if;
  perform public.write_audit(case when sid is null then 'salesperson.create' else 'salesperson.update' end, 'salespeople', s.id::text,
    jsonb_build_object('from', before_row, 'to', to_jsonb(s)));
  return s.id;
end;
$$;

create function public.st_save_territory(p_code text, p_name text, p_city text default 'Prayagraj', p_localities text[] default '{}', p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('sales_team', 'edit');
  insert into public.sales_territories (code, name, city, localities, is_active)
  values (upper(trim(p_code)), trim(p_name), coalesce(nullif(trim(p_city), ''), 'Prayagraj'),
    array(select trim(x) from unnest(coalesce(p_localities, '{}')) x where trim(x) <> ''), coalesce(p_active, true))
  on conflict (code) do update set name = excluded.name, city = excluded.city, localities = excluded.localities, is_active = excluded.is_active;
  perform public.write_audit('territory.save', 'sales_territories', upper(trim(p_code)), jsonb_build_object('name', p_name, 'localities', p_localities));
end;
$$;

create function public.st_set_target(p_salesperson_id uuid, p_month date, p_value numeric, p_orders integer default 0, p_new_customers integer default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('sales_team', 'edit');
  insert into public.sales_targets (salesperson_id, month, target_value, target_orders, target_new_customers)
  values (p_salesperson_id, date_trunc('month', p_month)::date, coalesce(p_value, 0), coalesce(p_orders, 0), coalesce(p_new_customers, 0))
  on conflict (salesperson_id, month) do update set target_value = excluded.target_value, target_orders = excluded.target_orders,
    target_new_customers = excluded.target_new_customers, set_by = auth.uid(), set_at = now();
  perform public.write_audit('sales_target.set', 'salespeople', p_salesperson_id::text,
    jsonb_build_object('month', date_trunc('month', p_month)::date, 'value', p_value, 'orders', p_orders, 'new_customers', p_new_customers));
end;
$$;


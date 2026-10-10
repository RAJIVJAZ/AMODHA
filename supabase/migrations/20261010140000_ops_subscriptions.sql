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

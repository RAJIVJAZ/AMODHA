-- Milk subscriber app: change the delivery schedule, and a monthly statement for the customer.

-- Daily, alternate days, Monday to Saturday, or chosen weekdays (0 = Sunday … 6 = Saturday), and the
-- delivery time. Applies from the next day that can still be changed; earlier deliveries are already locked.
create function public.sub_change_schedule(p_subscription_id uuid, p_frequency text, p_days_of_week integer[] default null, p_slot text default null)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions := public._sub_own(p_subscription_id);
  v_days integer[];
begin
  if s.status = 'cancelled' then
    raise exception 'This subscription is cancelled; start a new one';
  end if;
  if coalesce(p_frequency, '') not in ('daily', 'alternate_days', 'mon_to_sat', 'custom') then
    raise exception 'Choose how often you want milk';
  end if;
  if p_frequency = 'custom' then
    select array_agg(distinct x order by x) into v_days from unnest(coalesce(p_days_of_week, '{}')) x where x between 0 and 6;
    if coalesce(cardinality(v_days), 0) = 0 then
      raise exception 'Choose at least one day of the week';
    end if;
  end if;
  if p_slot is not null and p_slot not in ('morning', 'evening') then
    raise exception 'Choose morning or evening delivery';
  end if;
  update public.subscriptions set frequency = p_frequency, days_of_week = v_days, slot = coalesce(p_slot, slot), updated_at = now()
  where id = s.id;
  perform public._sub_schedule(s.id);
  insert into public.subscription_events (subscription_id, action, details)
  values (s.id, 'schedule', jsonb_build_object(
    'from', jsonb_build_object('frequency', s.frequency, 'days', s.days_of_week, 'slot', s.slot),
    'to', jsonb_build_object('frequency', p_frequency, 'days', v_days, 'slot', coalesce(p_slot, s.slot))));
  return public.sub_first_open_date();
end;
$$;

-- The signed-in customer's month: every delivery with what it carried and cost, what was billed,
-- what was paid or credited in the month, and the balance on their account today.
create function public.sub_my_statement(p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m_start date := date_trunc('month', coalesce(p_month, public.ist_today()))::date;
  m_end date := (date_trunc('month', coalesce(p_month, public.ist_today())) + interval '1 month - 1 day')::date;
begin
  if uid is null then
    raise exception 'Please sign in';
  end if;
  return jsonb_build_object(
    'month', m_start,
    'months', (select coalesce(jsonb_agg(x order by x desc), '[]') from (
        select distinct date_trunc('month', delivery_date)::date as x from public.subscription_deliveries
        where user_id = uid and delivery_date <= public.ist_today() + 31) z),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
          'date', d.delivery_date, 'slot', d.slot, 'status', d.status, 'order_id', d.order_id, 'invoice_number', o.invoice_number,
          'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'type', l.line_type, 'qty', l.qty, 'unit_price', l.unit_price)
              order by l.line_type desc, i.name), '[]')
            from public.subscription_delivery_lines l join public.items i on i.id = l.item_id where l.delivery_id = d.id),
          'total', (select coalesce(sum(l.qty * l.unit_price), 0) from public.subscription_delivery_lines l where l.delivery_id = d.id))
        order by d.delivery_date, d.slot), '[]')
      from public.subscription_deliveries d left join public.orders o on o.id = d.order_id
      where d.user_id = uid and d.delivery_date between m_start and m_end),
    'delivered_value', (select coalesce(sum(l.qty * l.unit_price), 0)
      from public.subscription_deliveries d join public.subscription_delivery_lines l on l.delivery_id = d.id
      where d.user_id = uid and d.delivery_date between m_start and m_end and d.status = 'delivered'),
    'milk_units_delivered', (select coalesce(sum(l.qty), 0)
      from public.subscription_deliveries d join public.subscription_delivery_lines l on l.delivery_id = d.id
      join public.items i on i.id = l.item_id join public.products p on p.id = i.product_id
      where d.user_id = uid and d.delivery_date between m_start and m_end and d.status = 'delivered' and p.is_subscribable),
    'billed', (select coalesce(sum(o.total), 0) from public.orders o
      where o.user_id = uid and o.source = 'subscription' and o.delivery_date between m_start and m_end
        and o.invoice_number is not null and o.fulfilment_status not in ('cancelled', 'delivery_failed', 'returned')),
    'paid_or_credited', (select coalesce(sum(l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
      where l.account_code = '1100' and l.party_id = uid::text and l.credit > 0 and e.entry_date between m_start and m_end),
    'balance_due', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l where l.account_code = '1100' and l.party_id = uid::text)
  );
end;
$$;

revoke execute on function public.sub_change_schedule(uuid, text, integer[], text) from public, anon;
revoke execute on function public.sub_my_statement(date) from public, anon;
grant execute on function public.sub_change_schedule(uuid, text, integer[], text), public.sub_my_statement(date) to authenticated;

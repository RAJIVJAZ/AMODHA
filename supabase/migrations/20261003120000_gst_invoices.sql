-- GST tax invoices: a consecutive invoice number per financial year (e.g. MW/2026-27/00001),
-- assigned only when an order is confirmed, plus HSN code and GST rate on each order line.
alter table public.orders add column if not exists invoice_number text unique, add column if not exists invoice_date timestamptz;
alter table public.order_items add column if not exists hsn text, add column if not exists gst_rate numeric;

create table if not exists public.invoice_counters (financial_year text primary key, last_number integer not null default 0);
alter table public.invoice_counters enable row level security;

create or replace function public.assign_invoice_number(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing text;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  fy_start int := case when extract(month from today) >= 4 then extract(year from today)::int else extract(year from today)::int - 1 end;
  fy text := fy_start::text || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0');
  next_number int;
  invoice text;
begin
  select invoice_number into existing from public.orders where id = p_order_id for update;
  if not found then
    return null;
  end if;
  if existing is not null then
    return existing;
  end if;

  insert into public.invoice_counters (financial_year, last_number) values (fy, 1)
  on conflict (financial_year) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into next_number;

  invoice := 'MW/' || fy || '/' || lpad(next_number::text, 5, '0');
  update public.orders set invoice_number = invoice, invoice_date = now() where id = p_order_id;
  return invoice;
end;
$$;
revoke execute on function public.assign_invoice_number(uuid) from public, anon, authenticated;

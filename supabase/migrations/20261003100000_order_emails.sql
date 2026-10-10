-- When the order confirmation / invoice email went out, so it is only ever sent once.
alter table public.orders add column if not exists invoice_emailed_at timestamptz;

-- Why the last invoice / order alert email failed (shown in /admin), null when it went out.
alter table public.orders add column if not exists email_error text;

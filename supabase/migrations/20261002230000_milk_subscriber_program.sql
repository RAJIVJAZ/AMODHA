-- The paid membership is replaced by benefits for active milk subscribers.
-- public.memberships is no longer used by the site. It is empty; drop it when convenient:
--   drop table if exists public.memberships;

alter table public.milk_interest
  add column if not exists status text not null default 'interested' check (status in ('interested', 'active', 'paused', 'cancelled')),
  add column if not exists email text,
  add column if not exists monthly_litres numeric,
  add column if not exists preferred_time text,
  add column if not exists activated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index milk_interest_status_idx on public.milk_interest (status);

create trigger milk_interest_touch_updated_at
  before update on public.milk_interest
  for each row execute function public.touch_updated_at();

-- Orders placed by an active milk subscriber get priority handling.
alter table public.orders add column milk_subscriber boolean not null default false;

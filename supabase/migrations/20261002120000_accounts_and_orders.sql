-- Mithai Wallah: customer accounts, orders and dashboard data.
-- Customers can read their own rows. Orders, order status, memberships,
-- reward points and milk interest are written only by the server
-- (secret key), so customers can never change prices, statuses or points.

-- Profiles ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Customers read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Customers update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Only the name is editable by the customer; is_admin and phone are not.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Saved addresses --------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null default 'Home',
  address text not null,
  city text not null default 'Prayagraj',
  pincode text not null,
  created_at timestamptz not null default now()
);
create index addresses_user_id_idx on public.addresses (user_id);

alter table public.addresses enable row level security;

create policy "Customers manage their own addresses" on public.addresses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Orders -----------------------------------------------------------------
create type public.order_status as enum (
  'pending_payment', 'received', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity (start with 1001) unique,
  user_id uuid references auth.users on delete set null,
  customer_name text not null,
  phone text not null,
  email text,
  address text not null,
  city text not null,
  pincode text not null,
  notes text,
  payment_method text not null check (payment_method in ('online', 'cod')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cod')),
  status public.order_status not null default 'pending_payment',
  subtotal integer not null check (subtotal >= 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null check (total >= 0),
  first_order_offer boolean not null default false,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_id_idx on public.orders (user_id);
create index orders_phone_idx on public.orders (phone);
create index orders_created_at_idx on public.orders (created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  slug text not null,
  product_name text not null,
  pack_label text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0)
);
create index order_items_order_id_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Customers read their own orders" on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Customers read their own order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- Wishlist ---------------------------------------------------------------
create table public.wishlist (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table public.wishlist enable row level security;

create policy "Customers manage their own wishlist" on public.wishlist
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Support requests -------------------------------------------------------
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  order_number bigint,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  reply text,
  created_at timestamptz not null default now()
);
create index support_requests_user_id_idx on public.support_requests (user_id);

alter table public.support_requests enable row level security;

create policy "Customers read their own support requests" on public.support_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Customers open support requests" on public.support_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'open' and reply is null);

-- Memberships (sold in Phase 3) ------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  amount integer not null,
  razorpay_payment_id text,
  created_at timestamptz not null default now()
);
create index memberships_user_id_idx on public.memberships (user_id);

alter table public.memberships enable row level security;

create policy "Customers read their own membership" on public.memberships
  for select to authenticated using ((select auth.uid()) = user_id);

-- Reward points ----------------------------------------------------------
create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  points integer not null,
  reason text not null,
  order_id uuid references public.orders on delete set null,
  created_at timestamptz not null default now()
);
create index reward_ledger_user_id_idx on public.reward_ledger (user_id);
create index reward_ledger_order_id_idx on public.reward_ledger (order_id);

alter table public.reward_ledger enable row level security;

create policy "Customers read their own points" on public.reward_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

-- Fresh milk interest ----------------------------------------------------
create table public.milk_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  name text not null,
  phone text not null,
  address text not null,
  area text not null,
  daily_litres numeric,
  timing text,
  family_members integer,
  wants_subscription boolean,
  wants_a2 boolean,
  preferred_quantity text,
  notes text,
  created_at timestamptz not null default now()
);
create index milk_interest_user_id_idx on public.milk_interest (user_id);
create index milk_interest_phone_idx on public.milk_interest (phone);

alter table public.milk_interest enable row level security;

create policy "Customers read their own milk interest" on public.milk_interest
  for select to authenticated using ((select auth.uid()) = user_id);

-- The sign-up trigger function must not be callable through the public API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

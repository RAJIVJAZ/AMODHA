-- Part 1 of 5 — B2B wholesale: tables, permissions, pricing engine
-- Run in the Supabase SQL Editor, in order (1 → 5). Each part must finish with "Success" before the next.
-- Source: supabase/migrations/20261013100000_b2b_sales_wholesale.sql (lines 1–1018)

-- B2B wholesale: the field sales app (Mithai Wallah Sales), the wholesale customer app (Mithai Wallah
-- Wholesale) and the shared customer master, pricing engine, CRM and marketing consent behind them.
--
-- One system, not three. Both apps write into the same tables as the website and the staff screens:
--   * Customers   — public.b2b_customers is the single customer master (stable customer code).
--   * Orders      — every B2B order is a row in public.orders (source 'sales_rep' or 'b2b_app'), so
--                   allocation, picking, dispatch, batch traceability, invoicing and the ledger
--                   (dispatch and finance migrations) treat it exactly like any other order.
--   * Prices      — public.wholesale_prices, resolved only on the server by _b2b_price().
--   * Money       — the ledger stays the source of truth; B2B orders post to the customer's own
--                   receivable party ('b2b:<customer id>') and are invoiced when goods are dispatched.
--
-- Same security model as the rest of the business app: row-level security on, no direct writes, every
-- write through a SECURITY DEFINER function that checks the caller, works in one transaction and
-- writes the audit log. Customers and salespeople reach their data only through functions that check
-- that the customer is theirs.

-- Modules, roles and permissions -----------------------------------------------------------
insert into public.ops_modules (key, label, description, sort_order) values
  ('b2b_customers', 'B2B customers', 'Wholesale customer master, approvals, logins and CRM records', 18),
  ('field_sales', 'Field sales app', 'Salesperson app: assigned customers, visits, leads and orders', 19),
  ('pricing', 'Wholesale pricing', 'Wholesale price lists, customer prices, discounts and special price approvals', 20),
  ('sales_team', 'Sales team', 'Salespeople, territories, targets, incentives and sales performance', 21),
  ('marketing', 'Marketing & consent', 'Customer segments, marketing consent and approved campaigns', 22)
on conflict (key) do nothing;

insert into public.ops_role_permissions (role_key, module, action)
select 'admin', m.key, a.key from public.ops_modules m cross join public.ops_actions a
where m.key in ('b2b_customers', 'field_sales', 'pricing', 'sales_team', 'marketing')
on conflict do nothing;

insert into public.ops_roles (key, label, description, is_system) values
  ('salesperson', 'Salesperson (field sales)', 'Uses the Mithai Wallah Sales app for assigned sweet shops: leads, visits, orders and price requests. Cannot change prices or credit.', true),
  ('sales_manager', 'Sales manager', 'Runs the sales team and B2B customers: approvals, assignments, targets, prices and campaigns. No payroll or ledger access.', true)
on conflict (key) do nothing;

insert into public.ops_role_permissions (role_key, module, action)
select r, v.module, v.action
from (values
  ('salesperson', 'field_sales', 'view'), ('salesperson', 'field_sales', 'create'),
  ('sales_manager', 'dashboard', 'view'), ('sales_manager', 'catalog', 'view'), ('sales_manager', 'inventory', 'view'),
  ('sales_manager', 'dispatch', 'view'),
  ('sales_manager', 'b2b_customers', 'view'), ('sales_manager', 'b2b_customers', 'create'), ('sales_manager', 'b2b_customers', 'edit'),
  ('sales_manager', 'b2b_customers', 'approve'), ('sales_manager', 'b2b_customers', 'export'),
  ('sales_manager', 'field_sales', 'view'), ('sales_manager', 'field_sales', 'create'), ('sales_manager', 'field_sales', 'approve'),
  ('sales_manager', 'pricing', 'view'), ('sales_manager', 'pricing', 'create'), ('sales_manager', 'pricing', 'edit'), ('sales_manager', 'pricing', 'approve'),
  ('sales_manager', 'sales_team', 'view'), ('sales_manager', 'sales_team', 'create'), ('sales_manager', 'sales_team', 'edit'), ('sales_manager', 'sales_team', 'export'),
  ('sales_manager', 'marketing', 'view'), ('sales_manager', 'marketing', 'create'), ('sales_manager', 'marketing', 'approve'), ('sales_manager', 'marketing', 'export'),
  -- Finance: customer master (read, credit terms), prices (read), sales performance (read).
  ('finance_officer', 'b2b_customers', 'view'), ('finance_officer', 'b2b_customers', 'edit'), ('finance_officer', 'b2b_customers', 'export'),
  ('finance_officer', 'pricing', 'view'), ('finance_officer', 'sales_team', 'view'),
  -- Operations: who the customer is, to fulfil the order.
  ('production_manager', 'b2b_customers', 'view'),
  ('dispatch_staff', 'b2b_customers', 'view')
) as v (r, module, action)
on conflict do nothing;

-- Settings the administrator controls ------------------------------------------------------
insert into public.business_settings (key, value, label, description, category, value_type) values
  ('b2b.required_fields', '["shop_name", "owner_name", "mobile", "business_address", "delivery_address", "city", "locality", "customer_type", "expected_monthly_value"]',
    'B2B customer: required fields', 'Fields a salesperson must fill in when adding a new B2B customer (shop_name, owner_name and mobile are always required)', 'b2b', 'json'),
  ('b2b.sales_rep_orders_need_confirmation', 'false', 'Salesperson orders need customer confirmation',
    'When on, an order a salesperson places waits for the shop to confirm it in the Wholesale app (or for staff to record the confirmation)', 'b2b', 'boolean'),
  ('b2b.min_order_value', '0', 'B2B minimum order value (₹)', 'Orders below this cannot be placed; 0 for no minimum', 'b2b', 'number'),
  ('b2b.delivery_charge', '0', 'B2B delivery charge (₹ per order)', 'Added to each wholesale order; 0 for free delivery', 'b2b', 'number'),
  ('b2b.free_delivery_above', '0', 'B2B free delivery above (₹)', 'Orders at or above this value have no delivery charge; 0 to always charge', 'b2b', 'number'),
  ('b2b.min_lead_days', '1', 'Earliest B2B delivery (days ahead)', 'Customers and salespeople can request delivery from this many days ahead', 'b2b', 'number'),
  ('b2b.segments', '{"new_days": 30, "not_recent_days": 21, "inactive_days": 60, "high_volume_value_90d": 50000, "frequent_orders_60d": 4, "festive_months": [9, 10, 11]}',
    'Customer segment rules', 'Days and values used to group customers into segments', 'b2b', 'json'),
  ('b2b.support_contact', '{"phone": "", "whatsapp": "", "email": "support@mithaiwallah.shop"}', 'Wholesale support contact',
    'Shown in the Wholesale app', 'b2b', 'json')
on conflict (key) do nothing;

-- Sales team --------------------------------------------------------------------------------
create table public.sales_territories (
  code text primary key check (code ~ '^[A-Z0-9-]{2,30}$'),
  name text not null check (length(trim(name)) > 1),
  city text not null default 'Prayagraj',
  localities text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per salesperson. The account itself is a normal staff account (role 'salesperson'); the row
-- is linked to it by email the first time the person signs in.
create table public.salespeople (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  email text not null unique check (email = lower(email)),
  employee_code text not null unique check (employee_code ~ '^[A-Z0-9-]{2,20}$'),
  full_name text not null check (length(trim(full_name)) > 1),
  phone text check (phone ~ '^[6-9][0-9]{9}$'),
  territories text[] not null default '{}',
  is_active boolean not null default true,
  can_view_outstanding boolean not null default false,
  can_view_credit boolean not null default false,
  incentive_pct numeric(5, 2) not null default 0 check (incentive_pct between 0 and 50),
  incentive_basis text not null default 'rep_orders' check (incentive_basis in ('rep_orders', 'account_sales')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_targets (
  salesperson_id uuid not null references public.salespeople on delete cascade,
  month date not null check (extract(day from month) = 1),
  target_value numeric(14, 2) not null default 0 check (target_value >= 0),
  target_orders integer not null default 0 check (target_orders >= 0),
  target_new_customers integer not null default 0 check (target_new_customers >= 0),
  set_by uuid default auth.uid(),
  set_at timestamptz not null default now(),
  primary key (salesperson_id, month)
);

-- Customer master -----------------------------------------------------------------------------
create table public.price_categories (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.price_categories (code, label, description, sort_order) values
  ('standard', 'Standard wholesale', 'The standard wholesale price list', 1),
  ('preferred', 'Preferred shop', 'Regular shops with negotiated category prices', 2),
  ('distributor', 'Distributor', 'Wholesale distributors buying for resale', 3);

create table public.b2b_customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  shop_name text not null check (length(trim(shop_name)) > 1),
  owner_name text not null check (length(trim(owner_name)) > 1),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  mobile_verified boolean not null default false,
  whatsapp text check (whatsapp ~ '^[6-9][0-9]{9}$'),
  email text check (email = lower(email)),
  alternate_contact text,
  business_address text,
  delivery_address text,
  locality text,
  city text not null default 'Prayagraj',
  pincode text check (pincode ~ '^[1-9][0-9]{5}$'),
  gstin text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  customer_type text not null default 'sweet_shop' check (customer_type in (
    'sweet_shop', 'mithai_retailer', 'sweet_manufacturer', 'distributor', 'retail_food', 'other')),
  status text not null default 'lead' check (status in ('lead', 'approved', 'rejected', 'suspended', 'inactive')),
  source text not null default 'sales_rep' check (source in ('sales_rep', 'self_registration', 'admin', 'import')),
  assigned_salesperson uuid references public.salespeople on delete set null,
  acquired_by uuid references public.salespeople on delete set null,
  acquired_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  decision_note text,
  price_category text not null default 'standard' references public.price_categories,
  payment_terms text not null default 'cod' check (payment_terms in ('advance', 'cod', 'credit')),
  credit_days integer not null default 0 check (credit_days between 0 and 180),
  credit_limit numeric(14, 2) not null default 0 check (credit_limit >= 0),
  credit_status text not null default 'none' check (credit_status in ('none', 'approved', 'on_hold')),
  credit_approved_by uuid,
  credit_approved_at timestamptz,
  expected_monthly_value numeric(14, 2) check (expected_monthly_value >= 0),
  preferred_products text,
  business_notes text,
  photo_url text,
  next_follow_up date,
  last_visit_at timestamptz,
  -- Marketing consent: off unless the customer agreed (see b2b_consent_log for the history).
  marketing_consent boolean not null default false,
  consent_channels text[] not null default '{}',
  consent_source text,
  consent_at timestamptz,
  opted_out_at timestamptz,
  preferred_channel text not null default 'phone' check (preferred_channel in ('phone', 'whatsapp', 'sms', 'email', 'visit')),
  callback_requested boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Duplicate protection: one live customer per mobile number and per GSTIN.
create unique index b2b_customers_mobile_uidx on public.b2b_customers (mobile) where status <> 'rejected';
create unique index b2b_customers_gstin_uidx on public.b2b_customers (gstin) where gstin is not null and status <> 'rejected';
create index b2b_customers_salesperson_idx on public.b2b_customers (assigned_salesperson);
create index b2b_customers_status_idx on public.b2b_customers (status);
create index b2b_customers_city_idx on public.b2b_customers (city, locality);
create trigger b2b_customers_touch before update on public.b2b_customers for each row execute function public.touch_updated_at();

-- Who can sign in to the Wholesale app for a customer. A link is 'pending' until staff approve it, so
-- registering with someone else's mobile number never opens their account.
create table public.b2b_customer_users (
  user_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.b2b_customers on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  is_owner boolean not null default true,
  request_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, customer_id)
);
-- A person uses the app for one customer at a time.
create unique index b2b_customer_users_one_active on public.b2b_customer_users (user_id) where status in ('pending', 'active');
create index b2b_customer_users_customer_idx on public.b2b_customer_users (customer_id);

-- Login access given by staff before the person has an account; applied when they first sign in.
create table public.b2b_login_invites (
  contact text primary key check (contact = lower(contact)),
  customer_id uuid not null references public.b2b_customers on delete cascade,
  invited_by uuid default auth.uid(),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- CRM: visits, calls, notes and complaints on one timeline.
create table public.b2b_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.b2b_customers on delete cascade,
  salesperson_id uuid references public.salespeople on delete set null,
  kind text not null default 'visit' check (kind in ('visit', 'call', 'whatsapp', 'note', 'complaint', 'sample', 'callback_request')),
  occurred_at timestamptz not null default now(),
  outcome text check (outcome in ('order_placed', 'interested', 'follow_up', 'not_interested', 'sample_given', 'price_enquiry', 'complaint', 'no_contact', 'other')),
  products_discussed text,
  requirements text,
  sample_request text,
  price_enquiry text,
  opportunity_value numeric(14, 2) check (opportunity_value >= 0),
  objections text,
  next_action text,
  follow_up_date date,
  notes text,
  -- Optional, shown to the salesperson, captured only when they tap "add my location".
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index b2b_activities_customer_idx on public.b2b_activities (customer_id, occurred_at desc);
create index b2b_activities_salesperson_idx on public.b2b_activities (salesperson_id, occurred_at desc);
create trigger b2b_activities_append_only before update or delete on public.b2b_activities
  for each row execute function public.reject_change();

create table public.b2b_consent_log (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.b2b_customers on delete cascade,
  consent boolean not null,
  channels text[] not null default '{}',
  source text not null,
  note text,
  recorded_by uuid default auth.uid(),
  at timestamptz not null default now()
);
create index b2b_consent_log_customer_idx on public.b2b_consent_log (customer_id, at desc);
create trigger b2b_consent_log_append_only before update or delete on public.b2b_consent_log
  for each row execute function public.reject_change();

-- Wholesale catalogue and prices ------------------------------------------------------------------
alter table public.items
  add column if not exists b2b_enabled boolean not null default false,
  add column if not exists b2b_restricted boolean not null default false,
  add column if not exists b2b_min_qty integer not null default 1 check (b2b_min_qty >= 1),
  add column if not exists b2b_qty_multiple integer not null default 1 check (b2b_qty_multiple >= 1),
  add column if not exists b2b_lead_days integer not null default 1 check (b2b_lead_days >= 0),
  add column if not exists b2b_stock_display text not null default 'level' check (b2b_stock_display in ('level', 'exact', 'hidden'));

-- Customer-specific availability: allowed = false hides an item from that customer; for items marked
-- b2b_restricted, only customers with allowed = true see them.
create table public.b2b_item_access (
  customer_id uuid not null references public.b2b_customers on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  allowed boolean not null,
  set_by uuid default auth.uid(),
  set_at timestamptz not null default now(),
  primary key (customer_id, item_id)
);

-- Price rules. Scope: standard (everyone), category (a price category), customer (one customer),
-- promotion (everyone, or one category, for a period). min_qty gives quantity price breaks. The
-- price a customer pays for a line is the lowest rule that applies on the day for that quantity.
-- Rules are never edited: a new rule replaces an old one, which is ended (valid_to) with a reason.
create table public.wholesale_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items,
  scope text not null check (scope in ('standard', 'category', 'customer', 'promotion')),
  price_category text references public.price_categories,
  customer_id uuid references public.b2b_customers,
  min_qty integer not null default 1 check (min_qty >= 1),
  price numeric(12, 2) not null check (price >= 0 and price = round(price)),
  valid_from date not null default ((now() at time zone 'Asia/Kolkata')::date),
  valid_to date,
  note text,
  source text not null default 'price_list' check (source in ('price_list', 'special_approval')),
  price_request_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid,
  ended_reason text,
  check (valid_to is null or valid_to >= valid_from),
  check ((scope = 'category') = (price_category is not null and customer_id is null) or scope = 'promotion'),
  check ((scope = 'customer') = (customer_id is not null)),
  check (scope <> 'standard' or (price_category is null and customer_id is null)),
  check (scope <> 'promotion' or customer_id is null)
);
create index wholesale_prices_item_idx on public.wholesale_prices (item_id, scope);
create index wholesale_prices_customer_idx on public.wholesale_prices (customer_id) where customer_id is not null;

-- A salesperson asks for a special price; an approver decides.
create table public.price_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.b2b_customers,
  item_id uuid not null references public.items,
  requested_price numeric(12, 2) not null check (requested_price >= 0),
  current_price numeric(12, 2),
  min_qty integer not null default 1 check (min_qty >= 1),
  valid_to date,
  reason text not null,
  requested_by uuid default auth.uid(),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  approved_price numeric(12, 2),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);
create index price_requests_status_idx on public.price_requests (status, requested_at desc);

-- Saved quick-order drafts (one per customer per person).
create table public.b2b_drafts (
  customer_id uuid not null references public.b2b_customers on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lines jsonb not null default '[]',
  notes text,
  updated_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);

-- In-app notifications for the customer (and the queue for WhatsApp / SMS / email once a provider is connected).
create table public.b2b_notifications (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.b2b_customers on delete cascade,
  order_id uuid references public.orders on delete cascade,
  channel text not null default 'in_app' check (channel in ('in_app', 'whatsapp', 'sms', 'email')),
  title text not null,
  body text,
  status text not null default 'unread' check (status in ('unread', 'read', 'queued', 'sent', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index b2b_notifications_customer_idx on public.b2b_notifications (customer_id, created_at desc);

-- Marketing campaigns: only consenting, not-opted-out customers ever become recipients.
create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 2),
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  segment text not null,
  filters jsonb not null default '{}',
  message text not null check (length(trim(message)) > 5),
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  sent_by uuid,
  provider_reference text,
  excluded_no_consent integer not null default 0,
  excluded_opted_out integer not null default 0
);

create table public.marketing_recipients (
  campaign_id uuid not null references public.marketing_campaigns on delete cascade,
  customer_id uuid not null references public.b2b_customers on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped_opted_out', 'failed')),
  added_at timestamptz not null default now(),
  primary key (campaign_id, customer_id)
);

-- Orders: the same table for every channel ------------------------------------------------------
-- Sources: website / app (STOREFRONT), staff (ADMIN_ENTRY), subscription, sales_rep (SALES_REP),
-- b2b_app (B2B_CUSTOMER_APP).
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check check (source in ('website', 'app', 'subscription', 'staff', 'sales_rep', 'b2b_app'));

-- Two stages before operations take an order on: 'submitted' (being validated / waiting for approval)
-- and 'awaiting_confirmation' (a salesperson's order the shop has not confirmed yet).
alter table public.orders drop constraint if exists orders_fulfilment_status_check;
alter table public.orders add constraint orders_fulfilment_status_check check (fulfilment_status in (
  'submitted', 'awaiting_confirmation', 'awaiting_payment', 'confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch',
  'partially_dispatched', 'dispatched', 'out_for_delivery', 'partially_delivered', 'delivered', 'delivery_failed', 'returned', 'cancelled'));

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('online', 'cod', 'credit', 'advance'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (payment_status in ('pending', 'paid', 'failed', 'cod', 'credit'));

alter table public.orders
  add column if not exists b2b_customer_id uuid references public.b2b_customers,
  add column if not exists b2b_order_no text unique,
  add column if not exists salesperson_id uuid references public.salespeople,          -- the employee who entered it (SALES_REP orders only)
  add column if not exists account_salesperson_id uuid references public.salespeople,  -- the customer's salesperson when ordered (CRM, not entry)
  add column if not exists customer_confirmation text not null default 'not_required' check (customer_confirmation in ('not_required', 'pending', 'confirmed', 'rejected')),
  add column if not exists confirmed_by uuid,
  add column if not exists confirmed_at timestamptz,
  add column if not exists requested_delivery_date date,
  add column if not exists approval_reasons text[] not null default '{}',
  add column if not exists credit_approved_by uuid,
  add column if not exists credit_approved_at timestamptz,
  add column if not exists accepted_by uuid,
  add column if not exists accepted_at timestamptz,
  add column if not exists priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists ops_manager uuid references public.profiles (id) on delete set null,
  add column if not exists amendment_count integer not null default 0,
  add column if not exists request_key text unique,
  add column if not exists cancel_reason text;
create index if not exists orders_b2b_customer_idx on public.orders (b2b_customer_id, created_at desc);
create index if not exists orders_salesperson_idx on public.orders (salesperson_id);
create index if not exists orders_account_salesperson_idx on public.orders (account_salesperson_id);

alter table public.order_items
  add column if not exists list_price numeric(12, 2),
  add column if not exists price_source text,
  add column if not exists price_rule_id uuid;

-- Amendments keep the original and revised lines, who changed them, when and why.
create table public.order_amendments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  amendment_no integer not null,
  amended_by uuid default auth.uid(),
  amended_at timestamptz not null default now(),
  reason text not null,
  before jsonb not null,
  after jsonb not null,
  unique (order_id, amendment_no)
);
create trigger order_amendments_append_only before update or delete on public.order_amendments
  for each row execute function public.reject_change();

-- What was actually packed, line by line (each packing round is kept).
create table public.order_packing (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  order_item_id uuid not null,   -- kept as a plain id so the record survives a later amendment
  product text not null,
  qty_ordered numeric(14, 3) not null,
  qty_to_pick numeric(14, 3) not null,
  qty_packed numeric(14, 3) not null check (qty_packed >= 0),
  exception_reason text,
  checklist jsonb,
  packed_by uuid default auth.uid(),
  packed_at timestamptz not null default now()
);
create index order_packing_order_idx on public.order_packing (order_id, packed_at desc);
create trigger order_packing_append_only before update or delete on public.order_packing
  for each row execute function public.reject_change();

-- B2B orders post to the customer's own receivable account in the ledger.
create or replace function public._order_party(o public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when o.b2b_customer_id is not null then 'b2b:' || o.b2b_customer_id::text else coalesce(o.user_id::text, 'phone:' || o.phone) end
$$;
revoke execute on function public._order_party(public.orders) from public, anon, authenticated;

-- Who is asking ---------------------------------------------------------------------------------
-- The signed-in salesperson (active, with the field sales app permission), or null.
create function public._b2b_salesperson()
returns public.salespeople
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.salespeople s
  where s.user_id = auth.uid() and s.is_active and public.has_permission('field_sales', 'view')
$$;

-- The customer the signed-in person may use the Wholesale app for (active link), or null.
create function public._b2b_my_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cu.customer_id from public.b2b_customer_users cu
  join public.b2b_customers c on c.id = cu.customer_id
  where cu.user_id = auth.uid() and cu.status = 'active' and c.status in ('approved', 'suspended')
  limit 1
$$;

-- How the caller relates to a customer: 'staff' (B2B customer permission), 'salesperson' (their
-- assigned customer), 'customer' (their own business) or null (no access).
create function public._b2b_access(p_customer_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sp public.salespeople;
begin
  if auth.uid() is null or p_customer_id is null then
    return null;
  end if;
  if public.has_permission('b2b_customers', 'view') then
    return 'staff';
  end if;
  sp := public._b2b_salesperson();
  if sp.id is not null and exists (select 1 from public.b2b_customers where id = p_customer_id and assigned_salesperson = sp.id) then
    return 'salesperson';
  end if;
  if public._b2b_my_customer_id() = p_customer_id then
    return 'customer';
  end if;
  return null;
end;
$$;

create function public._b2b_require_access(p_customer_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_access(p_customer_id);
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if a is null then
    -- Same answer whether the customer exists or not, so ids can't be probed.
    raise exception 'Customer not found' using errcode = '42501';
  end if;
  return a;
end;
$$;

-- May the caller see this customer's credit limit and outstanding balance?
create function public._b2b_can_see_money(p_customer_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_access(p_customer_id);
  sp public.salespeople;
begin
  if a = 'customer' then
    return true;
  end if;
  if a = 'staff' then
    return public.has_permission('sales', 'view') or public.has_permission('b2b_customers', 'edit');
  end if;
  if a = 'salesperson' then
    sp := public._b2b_salesperson();
    return sp.can_view_outstanding or sp.can_view_credit;
  end if;
  return false;
end;
$$;

create function public._b2b_clean_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

-- Pricing engine ------------------------------------------------------------------------------------
-- The lowest price rule that applies to this customer, item and quantity on the day; list_price is the
-- standard wholesale price for a single unit. Prices are whole rupees and include GST, like every
-- other price in the system. Returns no row when the item has no wholesale price.
create function public._b2b_price(p_customer_id uuid, p_item_id uuid, p_qty integer, p_on date default null)
returns table (price numeric, list_price numeric, source text, rule_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := coalesce(p_on, public.ist_today());
  cat text;
begin
  select c.price_category into cat from public.b2b_customers c where c.id = p_customer_id;
  select wp.price into list_price
  from public.wholesale_prices wp
  where wp.item_id = p_item_id and wp.scope = 'standard' and wp.ended_at is null
    and wp.valid_from <= d and (wp.valid_to is null or wp.valid_to >= d)
  order by wp.min_qty, wp.price
  limit 1;
  select wp.price, case when wp.source = 'special_approval' then 'special_approval' else wp.scope end, wp.id
  into price, source, rule_id
  from public.wholesale_prices wp
  where wp.item_id = p_item_id and wp.ended_at is null
    and wp.valid_from <= d and (wp.valid_to is null or wp.valid_to >= d)
    and wp.min_qty <= greatest(coalesce(p_qty, 1), 1)
    and (wp.scope = 'standard'
      or (wp.scope = 'category' and wp.price_category = cat)
      or (wp.scope = 'customer' and wp.customer_id = p_customer_id)
      or (wp.scope = 'promotion' and (wp.price_category is null or wp.price_category = cat)))
  order by wp.price, wp.min_qty desc, wp.created_at desc
  limit 1;
  if price is null then
    return;
  end if;
  list_price := coalesce(list_price, price);
  return next;
end;
$$;

-- Saleable stock not yet reserved for other orders.
create function public._b2b_free_stock(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.qty_on_hand - l.qty_reserved), 0)
  from public.stock_lots l
  where l.item_id = p_item_id and l.status = 'available' and (l.expiry_date is null or l.expiry_date >= public.ist_today())
$$;

-- May this customer buy this item at all?
create function public._b2b_item_visible(p_customer_id uuid, p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.items i
    where i.id = p_item_id and i.is_active and i.b2b_enabled and i.item_type in ('finished_good', 'purchased_good')
      and not exists (select 1 from public.b2b_item_access a where a.customer_id = p_customer_id and a.item_id = i.id and not a.allowed)
      and (not i.b2b_restricted or exists (select 1 from public.b2b_item_access a where a.customer_id = p_customer_id and a.item_id = i.id and a.allowed))
  )
$$;

-- Validates and prices order lines for a customer. Never trusts a price from the app: only item_id and
-- qty are read. Problems are returned in 'errors' (one per bad line) rather than raised, so the apps
-- can show them next to the line; b2b_place_order raises the first one.
create function public._b2b_quote(p_customer_id uuid, p_lines jsonb, p_on date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  pr record;
  free numeric;
  out_lines jsonb := '[]';
  errors jsonb := '[]';
  shortages jsonb := '[]';
  subtotal numeric := 0;
  list_total numeric := 0;
  tax numeric := 0;
  line_total numeric;
  fee numeric;
  charge numeric := public.setting_num('b2b.delivery_charge', 0);
  free_above numeric := public.setting_num('b2b.free_delivery_above', 0);
  min_value numeric := public.setting_num('b2b.min_order_value', 0);
  lead integer := 0;
begin
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then
    raise exception 'Order lines must be a list';
  end if;
  for r in
    select x.item_id, sum(x.qty)::numeric as qty, i.id as found, i.code, i.name, i.unit, i.gst_rate, i.b2b_min_qty, i.b2b_qty_multiple, i.b2b_lead_days,
      pc.name as pack_name, coalesce(p.name, i.name) as product_name
    from (
      select (e ->> 'item_id')::uuid as item_id, coalesce((e ->> 'qty')::numeric, 0) as qty
      from jsonb_array_elements(coalesce(p_lines, '[]')) e
      where coalesce(e ->> 'item_id', '') <> ''
    ) x
    left join public.items i on i.id = x.item_id
    left join public.products p on p.id = i.product_id
    left join public.packaging_configs pc on pc.id = i.packaging_config_id
    group by x.item_id, i.id, p.name, pc.name
    having sum(x.qty) <> 0
    order by min(i.name)
  loop
    if r.found is null or not public._b2b_item_visible(p_customer_id, r.item_id) then
      errors := errors || jsonb_build_object('item_id', r.item_id, 'error', coalesce(r.name, 'This product') || ' is not available for this customer');
      continue;
    end if;
    if r.qty <= 0 or r.qty <> trunc(r.qty) then
      errors := errors || jsonb_build_object('item_id', r.item_id, 'error', r.name || ': enter a whole number above zero');
      continue;
    end if;
    if r.qty < r.b2b_min_qty then
      errors := errors || jsonb_build_object('item_id', r.item_id, 'error', r.name || ': minimum order is ' || r.b2b_min_qty || ' ' || r.unit);
      continue;
    end if;
    if r.qty % r.b2b_qty_multiple <> 0 then
      errors := errors || jsonb_build_object('item_id', r.item_id, 'error', r.name || ': order in multiples of ' || r.b2b_qty_multiple);
      continue;
    end if;
    select * into pr from public._b2b_price(p_customer_id, r.item_id, r.qty::int, p_on);
    if pr.price is null then
      errors := errors || jsonb_build_object('item_id', r.item_id, 'error', r.name || ' has no wholesale price yet');
      continue;
    end if;
    free := public._b2b_free_stock(r.item_id);
    line_total := pr.price * r.qty;
    subtotal := subtotal + line_total;
    list_total := list_total + pr.list_price * r.qty;
    tax := tax + round(line_total - line_total * 100 / (100 + coalesce(r.gst_rate, 0)), 2);
    if free < r.qty then
      shortages := shortages || jsonb_build_object('item_id', r.item_id, 'name', r.name, 'ordered', r.qty, 'available', greatest(free, 0), 'short', r.qty - greatest(free, 0));
      lead := greatest(lead, r.b2b_lead_days);
    end if;
    out_lines := out_lines || jsonb_build_object(
      'item_id', r.item_id, 'code', r.code, 'name', r.name, 'product_name', r.product_name, 'pack', r.pack_name, 'unit', r.unit,
      'qty', r.qty, 'unit_price', pr.price, 'list_price', pr.list_price, 'price_source', pr.source, 'rule_id', pr.rule_id,
      'line_total', line_total, 'savings', (pr.list_price - pr.price) * r.qty, 'gst_rate', coalesce(r.gst_rate, 0),
      'available', greatest(free, 0), 'in_stock', free >= r.qty);
  end loop;
  if jsonb_array_length(out_lines) = 0 and jsonb_array_length(errors) = 0 then
    errors := errors || jsonb_build_object('error', 'Add at least one product');
  end if;
  if jsonb_array_length(out_lines) > 0 and min_value > 0 and subtotal < min_value then
    errors := errors || jsonb_build_object('error', 'The minimum wholesale order is ₹' || min_value);
  end if;
  fee := case when charge > 0 and (free_above = 0 or subtotal < free_above) then charge else 0 end;
  return jsonb_build_object(
    'lines', out_lines, 'errors', errors, 'shortages', shortages,
    'subtotal', subtotal, 'list_total', list_total, 'savings', list_total - subtotal, 'delivery_fee', fee,
    'total', subtotal + fee, 'gst_included', tax,
    'earliest_delivery', public.ist_today() + greatest(public.setting_num('b2b.min_lead_days', 1)::int, lead),
    'stock_lead_days', lead);
end;
$$;

-- Credit position from the ledger (balance) plus orders not invoiced yet.
create function public._b2b_credit(p_customer_id uuid, p_exclude_order uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  bal numeric;
  pending numeric;
  overdue numeric;
begin
  select * into c from public.b2b_customers where id = p_customer_id;
  select coalesce(sum(l.debit - l.credit), 0) into bal from public.journal_lines l where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id;
  select coalesce(sum(o.total), 0) into pending from public.orders o
  where o.b2b_customer_id = p_customer_id and o.invoice_number is null and o.status <> 'cancelled'
    and o.fulfilment_status not in ('cancelled', 'returned') and o.id is distinct from p_exclude_order;
  select coalesce(sum(i.outstanding), 0) into overdue from public._b2b_open_invoices(p_customer_id) i where i.overdue;
  return jsonb_build_object(
    'payment_terms', c.payment_terms, 'credit_status', c.credit_status, 'credit_days', c.credit_days, 'credit_limit', c.credit_limit,
    'balance', bal, 'not_invoiced', pending, 'exposure', bal + pending,
    'available', case when c.credit_status = 'approved' then greatest(c.credit_limit - bal - pending, 0) else 0 end,
    'overdue', overdue);
end;
$$;

-- Invoices still open, oldest first. Payments and credit notes in the ledger settle the oldest invoices
-- first, so what is outstanding always adds up to the ledger balance.
create function public._b2b_open_invoices(p_customer_id uuid)
returns table (order_id uuid, order_no text, invoice_number text, invoice_date date, total numeric, outstanding numeric, due_date date, overdue boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bal numeric;
  invoiced numeric;
  settled numeric;
  r record;
  days integer;
begin
  select coalesce(sum(l.debit - l.credit), 0) into bal from public.journal_lines l where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id;
  select coalesce(sum(o.total), 0) into invoiced from public.orders o
  where o.b2b_customer_id = p_customer_id and o.invoice_number is not null and o.status <> 'cancelled';
  select c.credit_days into days from public.b2b_customers c where c.id = p_customer_id;
  settled := greatest(invoiced - greatest(bal, 0), 0);
  for r in
    select o.id, o.b2b_order_no, o.invoice_number, public._ist_date(o.invoice_date) as inv_date, o.total::numeric as total
    from public.orders o
    where o.b2b_customer_id = p_customer_id and o.invoice_number is not null and o.status <> 'cancelled'
    order by o.invoice_date, o.order_number
  loop
    order_id := r.id;
    order_no := r.b2b_order_no;
    invoice_number := r.invoice_number;
    invoice_date := r.inv_date;
    total := r.total;
    outstanding := greatest(r.total - settled, 0);
    settled := greatest(settled - r.total, 0);
    due_date := r.inv_date + coalesce(days, 0);
    overdue := outstanding > 0 and due_date < public.ist_today();
    if outstanding > 0 then
      return next;
    end if;
  end loop;
end;
$$;

-- What the customer and salesperson see. Derived from the central order every time, so nobody copies
-- statuses into a separate customer record.
create function public._b2b_stage_label(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'submitted' then 'Order submitted'
    when 'awaiting_confirmation' then 'Awaiting your confirmation'
    when 'awaiting_payment' then 'Awaiting payment'
    when 'confirmed' then 'Confirmed'
    when 'processing' then 'Accepted by operations'
    when 'picking' then 'Picking'
    when 'packed' then 'Packing'
    when 'ready_for_dispatch' then 'Ready for dispatch'
    when 'partially_dispatched' then 'Partly dispatched'
    when 'dispatched' then 'Dispatched'
    when 'out_for_delivery' then 'Out for delivery'
    when 'partially_delivered' then 'Partially delivered'
    when 'delivered' then 'Delivered'
    when 'delivery_failed' then 'Delivery rescheduled'
    when 'returned' then 'Returned'
    when 'cancelled' then 'Cancelled'
    when 'on_hold' then 'On hold'
    when 'hold_released' then 'Hold released'
    when 'amended' then 'Order amended'
    when 'customer_confirmed' then 'Confirmed by customer'
    when 'pending_stock' then 'Pending stock or production'
    else initcap(replace(p_stage, '_', ' '))
  end
$$;

create function public.b2b_order_status(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.fulfilment_status in ('confirmed', 'processing')
      and (select coalesce(sum(f.reserved + f.dispatched), 0) < coalesce(sum(f.ordered), 0) from public.v_order_line_fulfilment f where f.order_id = o.id)
      and o.accepted_at is not null
      then 'Pending stock or production'
    else public._b2b_stage_label(o.fulfilment_status)
  end
  from public.orders o where o.id = p_order_id
$$;

-- May the signed-in person open this B2B order's documents (tax invoice, order summary)?
create function public.b2b_can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public._b2b_access(o.b2b_customer_id) is not null from public.orders o where o.id = p_order_id and o.b2b_customer_id is not null), false)
$$;

-- Orders waiting for confirmation or approval cannot be allocated or dispatched yet.
create function public._b2b_guard_unaccepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st text;
begin
  select fulfilment_status into st from public.orders where id = new.order_id;
  if st in ('submitted', 'awaiting_confirmation') then
    raise exception 'This order has not been accepted by operations yet (%)', public._b2b_stage_label(st) using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger order_allocations_guard_unaccepted before insert on public.order_allocations
  for each row execute function public._b2b_guard_unaccepted();
create trigger dispatches_guard_unaccepted before insert on public.dispatches
  for each row execute function public._b2b_guard_unaccepted();

-- B2B orders are invoiced when goods first leave the factory (the GST time of supply for goods), which
-- posts the sale to the ledger through the existing invoice trigger — once, by its posting key.
create function public._b2b_invoice_on_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assign_invoice_number(new.id);
  return null;
end;
$$;
create trigger orders_b2b_invoice_on_dispatch after update of fulfilment_status on public.orders
  for each row
  when (new.b2b_customer_id is not null and new.invoice_number is null and new.status <> 'cancelled'
    and new.fulfilment_status in ('partially_dispatched', 'dispatched', 'out_for_delivery', 'partially_delivered', 'delivered'))
  execute function public._b2b_invoice_on_dispatch();

-- Every status change on a B2B order reaches the customer's app (and the outbound queue for the
-- channel they prefer, sent once a WhatsApp / SMS / email provider is connected).
create function public._b2b_notify_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  c public.b2b_customers;
  title text;
begin
  select * into o from public.orders where id = new.order_id;
  if o.b2b_customer_id is null then
    return null;
  end if;
  select * into c from public.b2b_customers where id = o.b2b_customer_id;
  title := o.b2b_order_no || ': ' || public._b2b_stage_label(new.status);
  insert into public.b2b_notifications (customer_id, order_id, channel, title, body) values (c.id, o.id, 'in_app', title, new.note);
  if new.status in ('submitted', 'awaiting_confirmation', 'confirmed', 'dispatched', 'delivered', 'cancelled')
     and c.preferred_channel in ('whatsapp', 'sms', 'email') then
    insert into public.b2b_notifications (customer_id, order_id, channel, title, body, status)
    values (c.id, o.id, c.preferred_channel, title, 'Order total ₹' || o.total, 'queued');
  end if;
  return null;
end;
$$;
create trigger order_events_b2b_notify after insert on public.order_events
  for each row execute function public._b2b_notify_event();

-- Writes priced lines onto an order (used by placing and amending). Returns the quote.
create function public._b2b_write_lines(p_order_id uuid, p_customer_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q jsonb := public._b2b_quote(p_customer_id, p_lines);
  l jsonb;
  it public.items;
begin
  if jsonb_array_length(q -> 'errors') > 0 then
    raise exception '%', q -> 'errors' -> 0 ->> 'error' using errcode = '23514';
  end if;
  for l in select * from jsonb_array_elements(q -> 'lines') loop
    select * into it from public.items where id = (l ->> 'item_id')::uuid;
    insert into public.order_items (order_id, slug, product_name, pack_label, unit_price, quantity, hsn, gst_rate, item_id, list_price, price_source, price_rule_id)
    values (p_order_id, coalesce(it.storefront_slug, lower(it.code)), it.name, coalesce(l ->> 'pack', it.storefront_pack, it.unit),
      (l ->> 'unit_price')::numeric::int, (l ->> 'qty')::numeric::int, it.hsn, it.gst_rate, it.id,
      (l ->> 'list_price')::numeric, l ->> 'price_source', (l ->> 'rule_id')::uuid);
  end loop;
  update public.orders set subtotal = (q ->> 'subtotal')::numeric::int, delivery_fee = (q ->> 'delivery_fee')::numeric::int, discount = 0,
    total = (q ->> 'total')::numeric::int
  where id = p_order_id;
  return q;
end;
$$;

-- Why an order needs a decision before operations take it on.
create function public._b2b_review_reasons(p_order_id uuid, p_quote jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
  c public.b2b_customers;
  cr jsonb;
  reasons text[] := '{}';
begin
  select * into o from public.orders where id = p_order_id;
  select * into c from public.b2b_customers where id = o.b2b_customer_id;
  if jsonb_array_length(p_quote -> 'shortages') > 0 then
    reasons := array_append(reasons, 'stock_shortage');
  end if;
  if o.payment_method = 'credit' then
    cr := public._b2b_credit(c.id, o.id);
    if (cr ->> 'exposure')::numeric + o.total > c.credit_limit then
      reasons := array_append(reasons, 'credit_limit');
    end if;
    if (cr ->> 'overdue')::numeric > 0 then
      reasons := array_append(reasons, 'overdue_invoices');
    end if;
  end if;
  if o.payment_method = 'advance' then
    reasons := array_append(reasons, 'advance_payment');
  end if;
  return reasons;
end;
$$;


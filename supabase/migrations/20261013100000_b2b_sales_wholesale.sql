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

-- Order workflow -------------------------------------------------------------------------------------
-- Quote for the apps' review screen (no writes).
create function public.b2b_quote(p_customer_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  perform public._b2b_require_access(p_customer_id);
  select * into c from public.b2b_customers where id = p_customer_id;
  if c.status not in ('approved', 'suspended') and public._b2b_access(p_customer_id) <> 'staff' then
    raise exception 'Wholesale prices are shown once the customer is approved' using errcode = '42501';
  end if;
  return public._b2b_quote(p_customer_id, p_lines)
    || jsonb_build_object('credit', case when public._b2b_can_see_money(p_customer_id) then public._b2b_credit(p_customer_id) end);
end;
$$;

-- Place a B2B order: from the Wholesale app (the customer), the Sales app (the assigned salesperson)
-- or by staff. Lines: [{item_id, qty}]. The same idempotency key returns the same order, so a double
-- tap or a retried request on a weak connection can never create two orders.
create function public.b2b_place_order(p_customer_id uuid, p_lines jsonb, p_payment_method text default null,
  p_requested_delivery_date date default null, p_notes text default null, p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  sp public.salespeople;
  channel text;
  method text;
  oid uuid := gen_random_uuid();
  existing public.orders;
  q jsonb;
  reasons text[];
  needs_confirmation boolean := false;
  stage text;
  earliest date;
  no text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if p_key is not null and length(p_key) >= 8 then
    select * into existing from public.orders where request_key = p_key;
    if found then
      if public._b2b_access(existing.b2b_customer_id) is null then
        raise exception 'This entry was already saved (duplicate submission ignored)' using errcode = '23505';
      end if;
      return jsonb_build_object('order_id', existing.id, 'order_no', existing.b2b_order_no, 'status', public.b2b_order_status(existing.id),
        'total', existing.total, 'approval_reasons', existing.approval_reasons, 'duplicate', true);
    end if;
  end if;

  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found' using errcode = '42501';
  end if;

  -- Which channel is this?
  if public._b2b_my_customer_id() = c.id then
    channel := 'b2b_app';
  else
    sp := public._b2b_salesperson();
    if sp.id is not null and c.assigned_salesperson = sp.id and public.has_permission('field_sales', 'create') then
      channel := 'sales_rep';
    elsif public.has_permission('b2b_customers', 'view') and public.has_permission('dispatch', 'create') then
      channel := 'staff';
    else
      raise exception 'Customer not found' using errcode = '42501';
    end if;
  end if;

  if c.status = 'suspended' then
    raise exception 'This account is on hold. Please contact Mithai Wallah.' using errcode = '42501';
  end if;
  if c.status <> 'approved' then
    raise exception 'Orders can be placed once the customer is approved (now: %)', c.status using errcode = '42501';
  end if;

  method := coalesce(nullif(p_payment_method, ''), c.payment_terms);
  if method not in ('credit', 'cod', 'advance') then
    raise exception 'Payment must be credit, cash on delivery or advance';
  end if;
  if method = 'credit' and not (c.payment_terms = 'credit' and c.credit_status = 'approved') then
    raise exception 'This customer has no approved credit; choose cash on delivery or advance payment';
  end if;
  if method = 'cod' and c.payment_terms = 'advance' then
    raise exception 'This customer pays in advance';
  end if;

  q := public._b2b_quote(c.id, p_lines);
  earliest := public.ist_today() + public.setting_num('b2b.min_lead_days', 1)::int;
  if p_requested_delivery_date is not null and p_requested_delivery_date < earliest then
    raise exception 'The earliest delivery date we can take is %', to_char(earliest, 'DD Mon YYYY');
  end if;

  needs_confirmation := channel = 'sales_rep' and coalesce((public.setting('b2b.sales_rep_orders_need_confirmation') #>> '{}')::boolean, false);
  stage := case when needs_confirmation then 'awaiting_confirmation' else 'submitted' end;
  no := public.next_doc_number('b2b_order', 'MW-B2B', to_char(public.ist_today(), 'YYYY'), 5);

  insert into public.orders (id, customer_name, phone, email, address, city, pincode, notes, payment_method, payment_status, status,
    subtotal, delivery_fee, discount, total, source, created_by, b2b_customer_id, b2b_order_no, salesperson_id, account_salesperson_id,
    customer_confirmation, requested_delivery_date, request_key, fulfilment_status)
  values (oid, c.shop_name, c.mobile, c.email, coalesce(nullif(c.delivery_address, ''), c.business_address, c.locality, c.city),
    c.city, coalesce(c.pincode, '211001'), nullif(trim(coalesce(p_notes, '')), ''), method,
    case method when 'credit' then 'credit' when 'cod' then 'cod' else 'pending' end, 'received',
    0, 0, 0, 0, channel, auth.uid(), c.id, no, case when channel = 'sales_rep' then sp.id end, c.assigned_salesperson,
    case when needs_confirmation then 'pending' else 'not_required' end, p_requested_delivery_date,
    case when p_key is not null and length(p_key) >= 8 then p_key end, stage);

  q := public._b2b_write_lines(oid, c.id, p_lines);
  reasons := public._b2b_review_reasons(oid, q);
  update public.orders set approval_reasons = reasons where id = oid;

  insert into public.order_events (order_id, status, note) values (oid, stage,
    case channel when 'sales_rep' then 'Placed by ' || sp.full_name || ' (Mithai Wallah Sales)'
      when 'b2b_app' then 'Placed in the Wholesale app' else 'Entered by Mithai Wallah staff' end
    || case when 'stock_shortage' = any (reasons) then ' · some items are pending stock or production' else '' end);
  delete from public.b2b_drafts where customer_id = c.id and user_id = auth.uid();
  perform public.write_audit('order.b2b_create', 'orders', oid::text,
    jsonb_build_object('order_no', no, 'channel', channel, 'customer', c.customer_code, 'lines', q -> 'lines', 'total', q -> 'total',
      'payment', method, 'approval_reasons', reasons));
  return jsonb_build_object('order_id', oid, 'order_no', no, 'status', public.b2b_order_status(oid), 'total', (q ->> 'total')::numeric,
    'approval_reasons', reasons, 'shortages', q -> 'shortages', 'needs_confirmation', needs_confirmation);
end;
$$;

-- Lines of an earlier order, to start a new one. Prices and availability are NOT copied: the app sends
-- these lines through b2b_quote, which prices them today and checks every rule again.
create function public.b2b_reorder_lines(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.b2b_customer_id is null or public._b2b_access(o.b2b_customer_id) is null then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  return jsonb_build_object('customer_id', o.b2b_customer_id, 'lines',
    (select coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'qty', oi.quantity, 'name', oi.product_name) order by oi.product_name), '[]')
     from public.order_items oi where oi.order_id = o.id and oi.item_id is not null));
end;
$$;

-- The shop confirms (or declines) an order a salesperson placed for it. Staff with approval rights can
-- record a confirmation given by phone, with a note saying so.
create function public.b2b_confirm_order(p_order_id uuid, p_confirm boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  a text;
begin
  o := public._order_lock(p_order_id);
  a := public._b2b_access(o.b2b_customer_id);
  if a is null or (a <> 'customer' and not public.has_permission('b2b_customers', 'approve')) then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  if a <> 'customer' and coalesce(trim(p_note), '') = '' then
    raise exception 'Say how the customer confirmed (for example: by phone with the owner)';
  end if;
  if o.customer_confirmation <> 'pending' then
    raise exception 'This order is not waiting for confirmation';
  end if;
  update public.orders set customer_confirmation = case when p_confirm then 'confirmed' else 'rejected' end,
    confirmed_by = auth.uid(), confirmed_at = now(),
    cancel_reason = case when p_confirm then cancel_reason else coalesce(nullif(trim(p_note), ''), 'Declined by the customer') end
  where id = o.id;
  if p_confirm then
    insert into public.order_events (order_id, status, note) values (o.id, 'customer_confirmed', nullif(trim(coalesce(p_note, '')), ''));
    perform public._order_set_fulfilment(o.id, 'submitted', 'Waiting for operations to accept');
  else
    update public.orders set status = 'cancelled' where id = o.id;
    insert into public.order_events (order_id, status, note) values (o.id, 'cancelled', coalesce(nullif(trim(p_note), ''), 'Declined by the customer'));
  end if;
  perform public.write_audit(case when p_confirm then 'order.customer_confirm' else 'order.customer_decline' end, 'orders', o.id::text,
    jsonb_build_object('by', a), p_note);
end;
$$;

-- Operations take the order on: check the approvals it needs, set the delivery date they can meet and
-- reserve stock. Whatever cannot be reserved shows up as pending stock / production.
create function public.b2b_accept_order(p_order_id uuid, p_delivery_date date default null, p_note text default null, p_allocate boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  paid numeric;
  res jsonb := '{}';
begin
  perform public.require_permission('dispatch', 'approve');
  o := public._order_lock(p_order_id);
  if o.b2b_customer_id is null then
    raise exception 'Only B2B orders are accepted here';
  end if;
  if o.fulfilment_status = 'awaiting_confirmation' then
    raise exception 'The customer has not confirmed this order yet';
  end if;
  if o.fulfilment_status <> 'submitted' then
    raise exception 'This order is already %', public._b2b_stage_label(o.fulfilment_status);
  end if;
  if o.on_hold then
    raise exception 'This order is on hold: %', coalesce(o.hold_reason, 'no reason given');
  end if;
  if 'credit_limit' = any (o.approval_reasons) or 'overdue_invoices' = any (o.approval_reasons) then
    -- Going over the credit limit, or ordering with overdue invoices, needs finance approval.
    perform public.require_permission('sales', 'approve');
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Give a reason for approving this order over the credit limit / with overdue invoices';
    end if;
    update public.orders set credit_approved_by = auth.uid(), credit_approved_at = now() where id = o.id;
  end if;
  if 'advance_payment' = any (o.approval_reasons) then
    select coalesce(sum(pa.amount), 0) into paid from public.payment_allocations pa where pa.doc_type = 'order' and pa.doc_id = o.id;
    if paid < o.total then
      raise exception 'Advance payment not received yet: ₹% of ₹% recorded by finance', paid, o.total;
    end if;
  end if;
  if p_delivery_date is not null and p_delivery_date < public.ist_today() then
    raise exception 'The delivery date cannot be in the past';
  end if;
  update public.orders set delivery_date = coalesce(p_delivery_date, requested_delivery_date, delivery_date),
    accepted_by = auth.uid(), accepted_at = now(), ops_manager = coalesce(ops_manager, auth.uid())
  where id = o.id;
  perform public._order_set_fulfilment(o.id, 'confirmed', coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Accepted by operations'));
  if p_allocate then
    res := public.disp_allocate_order(o.id);
    if jsonb_array_length(res -> 'shortages') > 0 then
      insert into public.order_events (order_id, status, note) values (o.id, 'pending_stock', 'Some items will be made or restocked before dispatch');
    end if;
  end if;
  perform public.write_audit('order.b2b_accept', 'orders', o.id::text,
    jsonb_build_object('reasons', o.approval_reasons, 'delivery_date', coalesce(p_delivery_date, o.requested_delivery_date), 'allocation', res), p_note);
  return res;
end;
$$;

-- Controlled amendment. Before fulfilment starts: the salesperson who placed it, or staff. Once stock
-- is reserved or picking has started: operations approval. Never after anything has been dispatched
-- (use a return and credit note). The order goes back to operations to accept again; the original
-- and revised lines, the person, the time and the reason are kept.
create function public.b2b_amend_order(p_order_id uuid, p_lines jsonb, p_reason text, p_requested_delivery_date date default null,
  p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  sp public.salespeople;
  a record;
  before_doc jsonb;
  after_doc jsonb;
  q jsonb;
  reasons text[];
  needs_confirmation boolean;
  stage text;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the change';
  end if;
  o := public._order_lock(p_order_id);
  if o.b2b_customer_id is null then
    raise exception 'Only B2B orders are amended here';
  end if;
  if exists (select 1 from public.order_allocations x where x.order_id = o.id and x.qty_dispatched > 0) then
    raise exception 'Goods have already been dispatched on this order; record a return and credit note instead';
  end if;
  if o.fulfilment_status in ('submitted', 'awaiting_confirmation') then
    sp := public._b2b_salesperson();
    if not (public.has_permission('b2b_customers', 'edit') or public.has_permission('dispatch', 'edit')
            or coalesce(sp.id is not null and o.salesperson_id = sp.id and public.has_permission('field_sales', 'create'), false)) then
      raise exception 'You cannot change this order' using errcode = '42501';
    end if;
  elsif o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch') then
    perform public.require_permission('dispatch', 'approve');
  else
    raise exception 'This order is % and can no longer be changed', public._b2b_stage_label(o.fulfilment_status);
  end if;

  select jsonb_build_object('total', o.total, 'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
    'requested_delivery_date', o.requested_delivery_date, 'notes', o.notes,
    'lines', coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'name', oi.product_name, 'qty', oi.quantity, 'unit_price', oi.unit_price) order by oi.product_name), '[]'))
  into before_doc from public.order_items oi where oi.order_id = o.id;

  -- Free any stock reserved for the old lines.
  for a in select * from public.order_allocations x where x.order_id = o.id and x.qty - x.qty_dispatched - x.qty_released > 0 for update loop
    update public.stock_lots set qty_reserved = qty_reserved - (a.qty - a.qty_dispatched - a.qty_released) where id = a.lot_id;
    update public.order_allocations set qty_released = qty - qty_dispatched where id = a.id;
  end loop;
  delete from public.order_items where order_id = o.id;

  q := public._b2b_write_lines(o.id, o.b2b_customer_id, p_lines);
  update public.orders set requested_delivery_date = coalesce(p_requested_delivery_date, requested_delivery_date),
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes), amendment_count = amendment_count + 1,
    accepted_at = null, accepted_by = null, credit_approved_at = null, credit_approved_by = null
  where id = o.id;
  reasons := public._b2b_review_reasons(o.id, q);
  needs_confirmation := o.source = 'sales_rep' and coalesce((public.setting('b2b.sales_rep_orders_need_confirmation') #>> '{}')::boolean, false)
    and public._b2b_access(o.b2b_customer_id) <> 'customer';
  stage := case when needs_confirmation then 'awaiting_confirmation' else 'submitted' end;
  update public.orders set approval_reasons = reasons, customer_confirmation = case when needs_confirmation then 'pending' else customer_confirmation end
  where id = o.id;

  select jsonb_build_object('total', total, 'subtotal', subtotal, 'delivery_fee', delivery_fee, 'requested_delivery_date', requested_delivery_date, 'notes', notes,
    'lines', q -> 'lines') into after_doc from public.orders where id = o.id;
  insert into public.order_amendments (order_id, amendment_no, reason, before, after) values (o.id, o.amendment_count + 1, trim(p_reason), before_doc, after_doc);
  insert into public.order_events (order_id, status, note) values (o.id, 'amended', trim(p_reason));
  perform public._order_set_fulfilment(o.id, stage, 'Back with operations after the change');
  perform public.write_audit('order.b2b_amend', 'orders', o.id::text, jsonb_build_object('before', before_doc, 'after', after_doc), p_reason);
  return jsonb_build_object('order_id', o.id, 'total', (q ->> 'total')::numeric, 'approval_reasons', reasons, 'status', public.b2b_order_status(o.id));
end;
$$;

-- Cancel. Customers and their salesperson can cancel until operations accept the order; after that it
-- needs operations approval, and never once goods are dispatched (returns and credit notes then).
-- Reserved stock is released by the existing cancellation trigger.
create function public.b2b_cancel_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  a text;
  sp public.salespeople;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  o := public._order_lock(p_order_id);
  a := public._b2b_access(o.b2b_customer_id);
  if o.b2b_customer_id is null or a is null then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  if o.fulfilment_status in ('cancelled', 'delivered', 'returned') then
    raise exception 'This order is already %', public._b2b_stage_label(o.fulfilment_status);
  end if;
  if exists (select 1 from public.order_allocations x where x.order_id = o.id and x.qty_dispatched > 0) then
    raise exception 'Goods have already been dispatched; record a return and credit note instead';
  end if;
  if o.fulfilment_status in ('submitted', 'awaiting_confirmation') then
    sp := public._b2b_salesperson();
    if not (a = 'customer' or public.has_permission('b2b_customers', 'edit') or public.has_permission('dispatch', 'approve')
            or coalesce(sp.id is not null and o.salesperson_id = sp.id, false)) then
      raise exception 'You cannot cancel this order' using errcode = '42501';
    end if;
  else
    perform public.require_permission('dispatch', 'approve');
  end if;
  update public.orders set status = 'cancelled', cancel_reason = trim(p_reason) where id = o.id;
  insert into public.order_events (order_id, status, note) values (o.id, 'cancelled', trim(p_reason));
  perform public.write_audit('order.b2b_cancel', 'orders', o.id::text, jsonb_build_object('by', a, 'stage', o.fulfilment_status), p_reason);
end;
$$;

-- Priority and the operations manager responsible (any order).
create function public.ops_set_order_priority(p_order_id uuid, p_priority text, p_manager uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('dispatch', 'approve');
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Unknown priority';
  end if;
  if p_manager is not null and not public.exists_staff(p_manager) then
    raise exception 'Choose a staff member';
  end if;
  perform public._order_lock(p_order_id);
  update public.orders set priority = p_priority, ops_manager = coalesce(p_manager, ops_manager) where id = p_order_id;
  perform public.write_audit('order.priority', 'orders', p_order_id::text, jsonb_build_object('priority', p_priority, 'manager', p_manager));
end;
$$;

create function public.exists_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.ops_active
    and (p.is_admin or exists (select 1 from public.ops_user_roles r where r.user_id = p.id)))
$$;

-- Packing: record what was actually packed. Any difference from what was to be picked needs a
-- documented exception. Moves the order to 'packed'.
create function public.ops_record_packing(p_order_id uuid, p_lines jsonb, p_exception_reason text default null, p_checklist jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  f record;
  packed numeric;
  differs boolean := false;
  n integer := 0;
begin
  perform public.require_permission('dispatch', 'edit');
  o := public._order_lock(p_order_id);
  if o.fulfilment_status not in ('processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched') then
    raise exception 'Reserve stock before packing (the order is %)', replace(o.fulfilment_status, '_', ' ');
  end if;
  for f in select * from public.v_order_line_fulfilment where order_id = o.id loop
    select (e ->> 'qty_packed')::numeric into packed from jsonb_array_elements(coalesce(p_lines, '[]')) e
    where (e ->> 'order_item_id')::uuid = f.order_item_id;
    continue when packed is null;
    if packed < 0 then
      raise exception 'Packed quantity cannot be negative';
    end if;
    if packed > f.reserved then
      raise exception '% %: only % reserved, so % cannot be packed', f.product_name, f.pack_label, f.reserved, packed using errcode = '23514';
    end if;
    if packed <> f.reserved or f.reserved + f.dispatched <> f.ordered then
      differs := true;
    end if;
    insert into public.order_packing (order_id, order_item_id, product, qty_ordered, qty_to_pick, qty_packed, exception_reason, checklist)
    values (o.id, f.order_item_id, f.product_name || ' ' || f.pack_label, f.ordered, f.reserved, packed, nullif(trim(coalesce(p_exception_reason, '')), ''), p_checklist);
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'Enter the packed quantities';
  end if;
  if differs and coalesce(trim(p_exception_reason), '') = '' then
    raise exception 'Packed quantities differ from the order: record the exception (what is short and why)';
  end if;
  perform public._order_set_fulfilment(o.id, 'packed', case when differs then 'Packed with exception: ' || trim(p_exception_reason) else 'Packed and checked' end);
  perform public.write_audit('order.packed', 'orders', o.id::text, jsonb_build_object('lines', p_lines, 'checklist', p_checklist), p_exception_reason);
end;
$$;

-- Customer master -------------------------------------------------------------------------------------
-- Possible duplicates of a new customer: same mobile / WhatsApp / GSTIN, or the same shop name in the
-- same city. Only the code, name, area and status are shown, so a salesperson can pick the right record.
create function public.b2b_find_matches(p_mobile text, p_gstin text default null, p_shop_name text default null, p_city text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text := public._b2b_clean_phone(p_mobile);
  g text := upper(nullif(trim(coalesce(p_gstin, '')), ''));
  n text := lower(regexp_replace(trim(coalesce(p_shop_name, '')), '\s+', ' ', 'g'));
  sp public.salespeople := public._b2b_salesperson();
begin
  if not (public.has_permission('b2b_customers', 'view') or sp.id is not null) then
    raise exception 'You do not have permission to search customers' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'customer_code', c.customer_code, 'shop_name', c.shop_name, 'locality', c.locality, 'city', c.city, 'status', c.status,
      'match', case when m is not null and (c.mobile = m or c.whatsapp = m) then 'mobile' when g is not null and c.gstin = g then 'gstin' else 'name' end,
      'mine', sp.id is not null and c.assigned_salesperson = sp.id) order by c.shop_name), '[]')
    from public.b2b_customers c
    where c.status <> 'rejected'
      and ((m is not null and (c.mobile = m or c.whatsapp = m))
        or (g is not null and c.gstin = g)
        or (length(n) > 2 and lower(regexp_replace(trim(c.shop_name), '\s+', ' ', 'g')) = n and lower(c.city) = lower(coalesce(nullif(trim(p_city), ''), c.city)))));
end;
$$;

-- The salesperson whose territory covers this city / locality (for self-registered shops).
create function public._b2b_territory_salesperson(p_city text, p_locality text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.salespeople s
  join public.sales_territories t on t.code = any (s.territories) and t.is_active
  where s.is_active and lower(t.city) = lower(coalesce(p_city, ''))
    and (cardinality(t.localities) = 0 or lower(coalesce(p_locality, '')) = any (select lower(x) from unnest(t.localities) x))
  order by cardinality(t.localities) desc, s.created_at
  limit 1
$$;

create function public._b2b_customer_from_json(p jsonb, c inout public.b2b_customers, p_full boolean)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p ? 'shop_name' then c.shop_name := nullif(trim(p ->> 'shop_name'), ''); end if;
  if p ? 'owner_name' then c.owner_name := nullif(trim(p ->> 'owner_name'), ''); end if;
  if p ? 'whatsapp' then c.whatsapp := public._b2b_clean_phone(p ->> 'whatsapp'); end if;
  if p ? 'email' then c.email := lower(nullif(trim(p ->> 'email'), '')); end if;
  if p ? 'alternate_contact' then c.alternate_contact := nullif(trim(p ->> 'alternate_contact'), ''); end if;
  if p ? 'business_address' then c.business_address := nullif(trim(p ->> 'business_address'), ''); end if;
  if p ? 'delivery_address' then c.delivery_address := nullif(trim(p ->> 'delivery_address'), ''); end if;
  if p ? 'locality' then c.locality := nullif(trim(p ->> 'locality'), ''); end if;
  if p ? 'city' then c.city := coalesce(nullif(trim(p ->> 'city'), ''), 'Prayagraj'); end if;
  if p ? 'pincode' then c.pincode := nullif(trim(p ->> 'pincode'), ''); end if;
  if p ? 'customer_type' then c.customer_type := coalesce(nullif(p ->> 'customer_type', ''), 'sweet_shop'); end if;
  if p ? 'expected_monthly_value' then c.expected_monthly_value := nullif(p ->> 'expected_monthly_value', '')::numeric; end if;
  if p ? 'preferred_products' then c.preferred_products := nullif(trim(p ->> 'preferred_products'), ''); end if;
  if p ? 'business_notes' then c.business_notes := nullif(trim(p ->> 'business_notes'), ''); end if;
  if p ? 'photo_url' then c.photo_url := nullif(trim(p ->> 'photo_url'), ''); end if;
  if p ? 'preferred_channel' then c.preferred_channel := coalesce(nullif(p ->> 'preferred_channel', ''), 'phone'); end if;
  if p_full then
    if p ? 'mobile' then c.mobile := public._b2b_clean_phone(p ->> 'mobile'); end if;
    if p ? 'gstin' then c.gstin := upper(nullif(trim(p ->> 'gstin'), '')); end if;
  end if;
end;
$$;

create function public._b2b_check_required(c public.b2b_customers)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f text;
  v jsonb := to_jsonb(c);
  labels jsonb := '{"shop_name": "shop name", "owner_name": "owner or contact name", "mobile": "10-digit mobile number", "business_address": "business address",
    "delivery_address": "delivery address", "city": "city", "locality": "locality", "customer_type": "customer type",
    "expected_monthly_value": "expected monthly purchase", "gstin": "GSTIN", "email": "email", "pincode": "pincode", "whatsapp": "WhatsApp number"}';
begin
  for f in select jsonb_array_elements_text(coalesce(public.setting('b2b.required_fields'), '[]')) union select unnest(array['shop_name', 'owner_name', 'mobile']) loop
    if coalesce(v ->> f, '') = '' then
      raise exception 'Enter the %', coalesce(labels ->> f, replace(f, '_', ' '));
    end if;
  end loop;
end;
$$;

-- Which fields the "add customer" forms must ask for (administrator's setting).
create function public.b2b_required_fields()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.setting('b2b.required_fields'), '[]'::jsonb)
$$;

-- ADD NEW B2B CUSTOMER (salesperson or staff). Always starts as a lead: no wholesale prices, credit or
-- app access until approved. Exact mobile / GSTIN matches are refused (use the existing record); a
-- same-name shop in the same city must be confirmed as a different business.
create function public.b2b_create_customer(p jsonb, p_confirm_not_duplicate boolean default false, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  sp public.salespeople := public._b2b_salesperson();
  dup jsonb;
  d jsonb;
begin
  if not (public.has_permission('b2b_customers', 'create') or (sp.id is not null and public.has_permission('field_sales', 'create'))) then
    raise exception 'You do not have permission to add customers' using errcode = '42501';
  end if;
  perform public._claim_request_key(p_key, 'b2b_create_customer');
  c.id := gen_random_uuid();
  c.city := 'Prayagraj';
  c.customer_type := 'sweet_shop';
  c.preferred_channel := 'phone';
  c := public._b2b_customer_from_json(p, c, true);
  if c.mobile is null or c.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  if c.gstin is not null and c.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN does not look right (15 characters, e.g. 09ABCDE1234F1Z5)';
  end if;
  perform public._b2b_check_required(c);

  dup := public.b2b_find_matches(c.mobile, c.gstin, c.shop_name, c.city);
  for d in select * from jsonb_array_elements(dup) loop
    if d ->> 'match' in ('mobile', 'gstin') then
      raise exception 'This shop is already a customer: % % (%, %). Use that record instead of adding a new one.',
        d ->> 'customer_code', d ->> 'shop_name', coalesce(d ->> 'locality', d ->> 'city'), d ->> 'status' using errcode = '23505';
    end if;
  end loop;
  if jsonb_array_length(dup) > 0 and not coalesce(p_confirm_not_duplicate, false) then
    raise exception 'A shop called "%" already exists in % (%). If this is a different business, confirm and save again.',
      dup -> 0 ->> 'shop_name', dup -> 0 ->> 'city', dup -> 0 ->> 'customer_code' using errcode = '23505';
  end if;

  c.customer_code := public.next_doc_number('b2b_customer', 'MW', 'C', 5);
  c.status := 'lead';
  c.source := case when sp.id is not null and not public.has_permission('b2b_customers', 'create') then 'sales_rep'
                   when p ->> 'source' = 'import' then 'import' when sp.id is not null then 'sales_rep' else 'admin' end;
  c.acquired_by := sp.id;
  c.assigned_salesperson := case when public.has_permission('b2b_customers', 'edit') and nullif(p ->> 'assigned_salesperson', '') is not null
    then (p ->> 'assigned_salesperson')::uuid else sp.id end;
  c.acquired_at := now();
  c.created_by := auth.uid();
  c.created_at := now();
  c.updated_at := now();
  c.price_category := 'standard';
  c.payment_terms := 'cod';
  c.credit_days := 0;
  c.credit_limit := 0;
  c.credit_status := 'none';
  c.mobile_verified := false;
  c.marketing_consent := false;
  c.consent_channels := '{}';
  c.callback_requested := false;
  insert into public.b2b_customers select c.*;
  perform public.write_audit('b2b_customer.create', 'b2b_customers', c.id::text,
    jsonb_build_object('code', c.customer_code, 'shop', c.shop_name, 'mobile', c.mobile, 'by_salesperson', sp.id, 'possible_duplicates', dup));
  return c.id;
end;
$$;

-- Self-registration from the Wholesale app (the person has already verified their phone or email with
-- a one-time code). An existing customer is never duplicated or opened: the request to link to it waits
-- for staff to check it.
create function public.b2b_register(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  dup jsonb;
  u record;
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if exists (select 1 from public.b2b_customer_users where user_id = auth.uid() and status in ('pending', 'active')) then
    raise exception 'You have already registered; we will be in touch';
  end if;
  if (select count(*) from public.audit_log where actor = auth.uid() and action like 'b2b_customer.register%' and at > now() - interval '1 day') >= 3 then
    raise exception 'Too many registration attempts today. Please call us.' using errcode = '54000';
  end if;
  c.id := gen_random_uuid();
  c.city := 'Prayagraj';
  c.customer_type := 'sweet_shop';
  c.preferred_channel := 'phone';
  c := public._b2b_customer_from_json(p, c, true);
  if c.mobile is null or c.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  if c.gstin is not null and c.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN does not look right (15 characters, e.g. 09ABCDE1234F1Z5)';
  end if;
  if coalesce(c.business_address, '') = '' or coalesce(c.locality, '') = '' then
    raise exception 'Enter your business address and locality';
  end if;
  perform public._b2b_check_required(c);
  select u2.phone, u2.phone_confirmed_at, u2.email into u from auth.users u2 where u2.id = auth.uid();

  select coalesce(jsonb_agg(x), '[]') into dup from jsonb_array_elements(
    (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'match', case when b.mobile = c.mobile or b.whatsapp = c.mobile then 'mobile' else 'gstin' end)), '[]')
     from public.b2b_customers b where b.status <> 'rejected' and (b.mobile = c.mobile or b.whatsapp = c.mobile or (c.gstin is not null and b.gstin = c.gstin)))) x;
  if jsonb_array_length(dup) > 0 then
    insert into public.b2b_customer_users (user_id, customer_id, status, request_note)
    values (auth.uid(), (dup -> 0 ->> 'id')::uuid, 'pending',
      'Registered as ' || c.shop_name || ' / ' || c.owner_name || ', mobile ' || c.mobile || ' — matches an existing customer by ' || (dup -> 0 ->> 'match') || '; check before giving access');
    perform public.write_audit('b2b_customer.register_link_request', 'b2b_customers', dup -> 0 ->> 'id', jsonb_build_object('mobile', c.mobile, 'shop', c.shop_name));
    return jsonb_build_object('status', 'link_requested');
  end if;

  c.customer_code := public.next_doc_number('b2b_customer', 'MW', 'C', 5);
  c.status := 'lead';
  c.source := 'self_registration';
  c.mobile_verified := u.phone_confirmed_at is not null and public._b2b_clean_phone(u.phone) = c.mobile;
  c.email := coalesce(c.email, lower(u.email));
  c.assigned_salesperson := public._b2b_territory_salesperson(c.city, c.locality);
  c.acquired_at := now();
  c.created_by := auth.uid();
  c.created_at := now();
  c.updated_at := now();
  c.price_category := 'standard';
  c.payment_terms := 'cod';
  c.credit_days := 0;
  c.credit_limit := 0;
  c.credit_status := 'none';
  -- The shop may tick "send me offers" while registering; nothing is assumed otherwise.
  c.consent_channels := case when jsonb_typeof(p -> 'consent_channels') = 'array'
    then array(select x from jsonb_array_elements_text(p -> 'consent_channels') x where x in ('whatsapp', 'sms', 'email')) else '{}' end;
  c.marketing_consent := cardinality(c.consent_channels) > 0;
  c.consent_source := case when c.marketing_consent then 'wholesale_registration' end;
  c.consent_at := case when c.marketing_consent then now() end;
  c.callback_requested := false;
  insert into public.b2b_customers select c.*;
  if c.marketing_consent then
    insert into public.b2b_consent_log (customer_id, consent, channels, source) values (c.id, true, c.consent_channels, 'wholesale_registration');
  end if;
  insert into public.b2b_customer_users (user_id, customer_id, status) values (auth.uid(), c.id, 'pending');
  perform public.write_audit('b2b_customer.register', 'b2b_customers', c.id::text, jsonb_build_object('code', c.customer_code, 'shop', c.shop_name, 'mobile', c.mobile));
  return jsonb_build_object('status', 'pending_approval', 'customer_code', c.customer_code);
end;
$$;

-- Approve or reject a lead. Approval opens the Wholesale app to the people who registered it.
create function public.b2b_decide_customer(p_customer_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  perform public.require_permission('b2b_customers', 'approve');
  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if c.status <> 'lead' then
    raise exception 'Only leads waiting for approval can be decided (this customer is %)', c.status;
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for rejecting';
  end if;
  update public.b2b_customers set status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = auth.uid(), approved_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = c.id;
  -- People who registered this business themselves get access with the approval.
  update public.b2b_customer_users set status = case when p_approve then 'active' else 'revoked' end, decided_by = auth.uid(), decided_at = now()
  where customer_id = c.id and status = 'pending' and request_note is null;
  insert into public.b2b_notifications (customer_id, title, body)
  values (c.id, case when p_approve then 'Your wholesale account is approved' else 'Your wholesale registration was not approved' end, p_note);
  perform public.write_audit(case when p_approve then 'b2b_customer.approve' else 'b2b_customer.reject' end, 'b2b_customers', c.id::text,
    jsonb_build_object('code', c.customer_code), p_note);
end;
$$;

-- Contact and profile details. Salespeople can update the shops assigned to them, but not the
-- verified mobile number or GSTIN.
create function public.b2b_update_customer(p_customer_id uuid, p jsonb, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  before_row jsonb;
  a text := public._b2b_require_access(p_customer_id);
  full_edit boolean := public.has_permission('b2b_customers', 'edit');
  dup jsonb;
begin
  if not (full_edit or (a = 'salesperson' and public.has_permission('field_sales', 'create'))) then
    raise exception 'You cannot change this customer' using errcode = '42501';
  end if;
  select * into c from public.b2b_customers where id = p_customer_id for update;
  before_row := to_jsonb(c);
  c := public._b2b_customer_from_json(p, c, full_edit);
  if c.mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  if c.gstin is not null and c.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN does not look right';
  end if;
  if c.mobile is distinct from before_row ->> 'mobile' or c.gstin is distinct from before_row ->> 'gstin' then
    select coalesce(jsonb_agg(x), '[]') into dup from jsonb_array_elements(public.b2b_find_matches(c.mobile, c.gstin)) x where (x ->> 'id')::uuid <> c.id;
    if jsonb_array_length(dup) > 0 then
      raise exception 'That mobile number or GSTIN belongs to % %', dup -> 0 ->> 'customer_code', dup -> 0 ->> 'shop_name' using errcode = '23505';
    end if;
    if c.mobile is distinct from before_row ->> 'mobile' then
      c.mobile_verified := false;
    end if;
  end if;
  if p ? 'next_follow_up' then
    c.next_follow_up := nullif(p ->> 'next_follow_up', '')::date;
  end if;
  update public.b2b_customers set shop_name = c.shop_name, owner_name = c.owner_name, mobile = c.mobile, mobile_verified = c.mobile_verified,
    whatsapp = c.whatsapp, email = c.email, alternate_contact = c.alternate_contact, business_address = c.business_address,
    delivery_address = c.delivery_address, locality = c.locality, city = c.city, pincode = c.pincode, gstin = c.gstin,
    customer_type = c.customer_type, expected_monthly_value = c.expected_monthly_value, preferred_products = c.preferred_products,
    business_notes = c.business_notes, photo_url = c.photo_url, preferred_channel = c.preferred_channel, next_follow_up = c.next_follow_up
  where id = c.id;
  perform public.write_audit('b2b_customer.update', 'b2b_customers', c.id::text,
    jsonb_build_object('from', before_row - 'updated_at', 'to', to_jsonb(c) - 'updated_at'), p_reason);
end;
$$;

-- Commercial terms. Price category: pricing or customer approvers. Payment terms, credit limit and
-- credit status: finance approvers only (salespeople can never raise a credit limit).
create function public.b2b_set_terms(p_customer_id uuid, p jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if p ? 'price_category' and p ->> 'price_category' is distinct from c.price_category then
    if not (public.has_permission('pricing', 'approve') or public.has_permission('b2b_customers', 'approve')) then
      raise exception 'You do not have permission to change price categories' using errcode = '42501';
    end if;
    if not exists (select 1 from public.price_categories where code = p ->> 'price_category' and is_active) then
      raise exception 'Unknown price category';
    end if;
    update public.b2b_customers set price_category = p ->> 'price_category' where id = c.id;
  end if;
  if p ?| array['payment_terms', 'credit_days', 'credit_limit', 'credit_status'] then
    perform public.require_permission('sales', 'approve');
    update public.b2b_customers set
      payment_terms = coalesce(nullif(p ->> 'payment_terms', ''), payment_terms),
      credit_days = coalesce(nullif(p ->> 'credit_days', '')::int, credit_days),
      credit_limit = coalesce(nullif(p ->> 'credit_limit', '')::numeric, credit_limit),
      credit_status = coalesce(nullif(p ->> 'credit_status', ''), credit_status),
      credit_approved_by = auth.uid(), credit_approved_at = now()
    where id = c.id;
    if exists (select 1 from public.b2b_customers where id = c.id and payment_terms = 'credit' and credit_status = 'approved' and credit_limit <= 0) then
      raise exception 'Set a credit limit above zero for a credit customer';
    end if;
  end if;
  perform public.write_audit('b2b_customer.terms', 'b2b_customers', c.id::text,
    jsonb_build_object('from', jsonb_build_object('price_category', c.price_category, 'payment_terms', c.payment_terms, 'credit_days', c.credit_days,
      'credit_limit', c.credit_limit, 'credit_status', c.credit_status), 'to', p), p_reason);
end;
$$;

-- Suspend, reactivate or mark inactive.
create function public.b2b_set_status(p_customer_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
begin
  perform public.require_permission('b2b_customers', 'approve');
  if p_status not in ('approved', 'suspended', 'inactive') then
    raise exception 'Status must be approved (active), suspended or inactive';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into c from public.b2b_customers where id = p_customer_id for update;
  if not found or c.status in ('lead', 'rejected') then
    raise exception 'Approve the customer first';
  end if;
  update public.b2b_customers set status = p_status where id = c.id;
  perform public.write_audit('b2b_customer.status', 'b2b_customers', c.id::text, jsonb_build_object('from', c.status, 'to', p_status), p_reason);
end;
$$;

create function public.b2b_assign_customers(p_customer_ids uuid[], p_salesperson_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not (public.has_permission('b2b_customers', 'edit') or public.has_permission('sales_team', 'edit')) then
    raise exception 'You do not have permission to assign customers' using errcode = '42501';
  end if;
  if p_salesperson_id is not null and not exists (select 1 from public.salespeople where id = p_salesperson_id and is_active) then
    raise exception 'Choose an active salesperson';
  end if;
  perform public.write_audit('b2b_customer.assign', 'b2b_customers', c.id::text,
    jsonb_build_object('from', c.assigned_salesperson, 'to', p_salesperson_id), p_reason)
  from public.b2b_customers c where c.id = any (p_customer_ids) and c.assigned_salesperson is distinct from p_salesperson_id;
  update public.b2b_customers set assigned_salesperson = p_salesperson_id where id = any (p_customer_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- App logins ---------------------------------------------------------------------------------------
create function public.b2b_grant_login(p_customer_id uuid, p_contact text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  contact text := lower(trim(coalesce(p_contact, '')));
  v_phone text;
  uid uuid;
begin
  perform public.require_permission('b2b_customers', 'approve');
  select * into c from public.b2b_customers where id = p_customer_id;
  if not found or c.status not in ('approved', 'suspended') then
    raise exception 'Approve the customer before giving app access';
  end if;
  if contact !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    v_phone := public._b2b_clean_phone(contact);
    if v_phone is null or v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Enter an email address or a 10-digit mobile number';
    end if;
    contact := v_phone;
    select id into uid from public.profiles where phone = v_phone limit 1;
  else
    select id into uid from public.profiles where email = contact limit 1;
  end if;
  if uid is not null then
    if exists (select 1 from public.b2b_customer_users where user_id = uid and customer_id <> c.id and status in ('pending', 'active')) then
      raise exception 'That person already uses the app for another customer';
    end if;
    insert into public.b2b_customer_users (user_id, customer_id, status, decided_by, decided_at)
    values (uid, c.id, 'active', auth.uid(), now())
    on conflict (user_id, customer_id) do update set status = 'active', decided_by = auth.uid(), decided_at = now();
    perform public.write_audit('b2b_login.grant', 'b2b_customers', c.id::text, jsonb_build_object('user', uid, 'contact', contact));
    return 'granted';
  end if;
  insert into public.b2b_login_invites (contact, customer_id) values (contact, c.id)
  on conflict (contact) do update set customer_id = excluded.customer_id, invited_by = auth.uid(), invited_at = now(), accepted_at = null;
  perform public.write_audit('b2b_login.invite', 'b2b_customers', c.id::text, jsonb_build_object('contact', contact));
  return 'invited';
end;
$$;

create function public.b2b_decide_login(p_user_id uuid, p_customer_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('b2b_customers', 'approve');
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason';
  end if;
  if p_approve and not exists (select 1 from public.b2b_customers where id = p_customer_id and status in ('approved', 'suspended')) then
    raise exception 'Approve the customer before giving app access';
  end if;
  update public.b2b_customer_users set status = case when p_approve then 'active' else 'revoked' end, decided_by = auth.uid(), decided_at = now()
  where user_id = p_user_id and customer_id = p_customer_id and status <> case when p_approve then 'active' else 'revoked' end;
  if not found then
    raise exception 'No such login request';
  end if;
  perform public.write_audit(case when p_approve then 'b2b_login.approve' else 'b2b_login.revoke' end, 'b2b_customers', p_customer_id::text,
    jsonb_build_object('user', p_user_id), p_note);
end;
$$;

-- CRM ----------------------------------------------------------------------------------------------
-- Visits, calls, notes, complaints. Sets the next follow-up date shown in the reminders.
create function public.b2b_log_activity(p_customer_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  sp public.salespeople := public._b2b_salesperson();
  aid uuid;
  kind text := coalesce(nullif(p ->> 'kind', ''), 'visit');
  fu date := nullif(p ->> 'follow_up_date', '')::date;
begin
  if not (public.has_permission('b2b_customers', 'edit') or (a = 'salesperson' and public.has_permission('field_sales', 'create'))
          or (a = 'staff' and public.has_permission('field_sales', 'create'))) then
    raise exception 'You cannot record activity for this customer' using errcode = '42501';
  end if;
  if fu is not null and fu < public.ist_today() then
    raise exception 'The follow-up date cannot be in the past';
  end if;
  if coalesce(p ->> 'latitude', '') <> '' and not coalesce((p ->> 'location_consent')::boolean, false) then
    raise exception 'Location is only saved when you choose to add it';
  end if;
  insert into public.b2b_activities (customer_id, salesperson_id, kind, occurred_at, outcome, products_discussed, requirements, sample_request,
    price_enquiry, opportunity_value, objections, next_action, follow_up_date, notes, latitude, longitude)
  values (p_customer_id, sp.id, kind, coalesce(nullif(p ->> 'occurred_at', '')::timestamptz, now()), nullif(p ->> 'outcome', ''),
    nullif(trim(coalesce(p ->> 'products_discussed', '')), ''), nullif(trim(coalesce(p ->> 'requirements', '')), ''),
    nullif(trim(coalesce(p ->> 'sample_request', '')), ''), nullif(trim(coalesce(p ->> 'price_enquiry', '')), ''),
    nullif(p ->> 'opportunity_value', '')::numeric, nullif(trim(coalesce(p ->> 'objections', '')), ''),
    nullif(trim(coalesce(p ->> 'next_action', '')), ''), fu, nullif(trim(coalesce(p ->> 'notes', '')), ''),
    nullif(p ->> 'latitude', '')::numeric, nullif(p ->> 'longitude', '')::numeric)
  returning id into aid;
  update public.b2b_customers set
    next_follow_up = case when fu is not null then fu when coalesce((p ->> 'clear_follow_up')::boolean, false) then null else next_follow_up end,
    last_visit_at = case when kind = 'visit' then now() else last_visit_at end,
    callback_requested = case when kind = 'callback_request' then true when kind in ('call', 'visit') then false else callback_requested end
  where id = p_customer_id;
  return aid;
end;
$$;

-- Marketing consent: recorded only from the customer or with a stated source; opt-out always wins.
create function public.b2b_record_consent(p_customer_id uuid, p_consent boolean, p_channels text[] default null, p_source text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  src text;
  chans text[] := coalesce(p_channels, '{}');
begin
  if a = 'customer' then
    src := 'wholesale_app';
  else
    if not (public.has_permission('marketing', 'create') or public.has_permission('b2b_customers', 'edit') or a = 'salesperson') then
      raise exception 'You cannot record consent for this customer' using errcode = '42501';
    end if;
    src := nullif(trim(coalesce(p_source, '')), '');
    if src is null then
      raise exception 'Say how the customer gave or withdrew consent (e.g. "asked at visit, 12 Oct", "WhatsApp STOP reply")';
    end if;
  end if;
  if exists (select 1 from unnest(chans) x where x not in ('whatsapp', 'sms', 'email')) then
    raise exception 'Channels are whatsapp, sms and email';
  end if;
  if p_consent and cardinality(chans) = 0 then
    raise exception 'Choose at least one channel the customer agreed to';
  end if;
  update public.b2b_customers set marketing_consent = p_consent, consent_channels = case when p_consent then chans else '{}' end,
    consent_source = src, consent_at = now(), opted_out_at = case when p_consent then null else now() end
  where id = p_customer_id;
  insert into public.b2b_consent_log (customer_id, consent, channels, source, note) values (p_customer_id, p_consent, case when p_consent then chans else '{}' end, src, p_note);
  -- An opt-out also takes the customer off every campaign not sent yet.
  if not p_consent then
    update public.marketing_recipients r set status = 'skipped_opted_out'
    from public.marketing_campaigns mc where mc.id = r.campaign_id and r.customer_id = p_customer_id and r.status = 'queued' and mc.status <> 'sent';
  end if;
  perform public.write_audit(case when p_consent then 'consent.given' else 'consent.withdrawn' end, 'b2b_customers', p_customer_id::text,
    jsonb_build_object('channels', chans, 'source', src), p_note);
end;
$$;

-- Quick-order drafts ---------------------------------------------------------------------------------
create function public.b2b_save_draft(p_customer_id uuid, p_lines jsonb, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._b2b_require_access(p_customer_id);
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]')) > 200 then
    raise exception 'A draft can hold up to 200 lines';
  end if;
  insert into public.b2b_drafts (customer_id, user_id, lines, notes, updated_at)
  values (p_customer_id, auth.uid(),
    (select coalesce(jsonb_agg(jsonb_build_object('item_id', e ->> 'item_id', 'qty', (e ->> 'qty')::numeric)), '[]') from jsonb_array_elements(coalesce(p_lines, '[]')) e
     where coalesce(e ->> 'item_id', '') <> ''), nullif(trim(coalesce(p_notes, '')), ''), now())
  on conflict (customer_id, user_id) do update set lines = excluded.lines, notes = excluded.notes, updated_at = now();
end;
$$;

create function public.b2b_get_draft(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._b2b_require_access(p_customer_id);
  return (select jsonb_build_object('lines', d.lines, 'notes', d.notes, 'updated_at', d.updated_at)
          from public.b2b_drafts d where d.customer_id = p_customer_id and d.user_id = auth.uid());
end;
$$;

create function public.b2b_mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.b2b_notifications set status = 'read', read_at = now()
  where customer_id = public._b2b_my_customer_id() and channel = 'in_app' and status = 'unread'
$$;

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

-- Operations --------------------------------------------------------------------------------------------
-- B2B AND RETAIL ORDER OPERATIONS: one queue for every order, whatever its source.
create function public.ops_order_queue(p_filter text default 'action', p_search text default null, p_from date default null, p_to date default null,
  p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := lower(trim(coalesce(p_search, '')));
begin
  perform public.require_permission('dispatch', 'view');
  return (select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]') from (
    select jsonb_build_object(
      'sort', case o.priority when 'urgent' then '0' when 'high' then '1' when 'normal' then '2' else '3' end
        || to_char(coalesce(o.delivery_date, o.requested_delivery_date, public._ist_date(o.created_at)), 'YYYYMMDD') || lpad(o.order_number::text, 10, '0'),
      'id', o.id, 'order_no', coalesce(o.b2b_order_no, '#' || o.order_number), 'order_number', o.order_number, 'source', o.source,
      'channel', case o.source when 'sales_rep' then 'SALES_REP' when 'b2b_app' then 'B2B_CUSTOMER_APP' when 'staff' then 'ADMIN_ENTRY'
        when 'subscription' then 'SUBSCRIPTION' else 'STOREFRONT' end,
      'is_b2b', o.b2b_customer_id is not null, 'customer_name', o.customer_name, 'customer_code', c.customer_code, 'customer_id', o.b2b_customer_id,
      'phone', o.phone, 'salesperson', coalesce(sp.full_name, asp.full_name), 'entered_by_salesperson', sp.full_name,
      'created_at', o.created_at, 'total', o.total, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
      'requested_delivery_date', o.requested_delivery_date, 'delivery_date', o.delivery_date, 'stage', o.fulfilment_status,
      'status_label', case when o.b2b_customer_id is not null then public.b2b_order_status(o.id) else public._b2b_stage_label(o.fulfilment_status) end,
      'priority', o.priority, 'ops_manager', coalesce(pm.full_name, pm.email), 'on_hold', o.on_hold, 'approval_reasons', o.approval_reasons,
      'confirmation', o.customer_confirmation, 'invoice_number', o.invoice_number,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', f.product_name, 'pack', f.pack_label, 'ordered', f.ordered, 'reserved', f.reserved,
          'dispatched', f.dispatched, 'free_stock', case when f.item_id is not null then public._b2b_free_stock(f.item_id) end) order by f.product_name), '[]')
        from public.v_order_line_fulfilment f where f.order_id = o.id),
      'stock_ok', (select coalesce(bool_and(f.reserved + f.dispatched >= f.ordered
          or (f.item_id is not null and public._b2b_free_stock(f.item_id) >= f.ordered - f.reserved - f.dispatched)), true)
        from public.v_order_line_fulfilment f where f.order_id = o.id),
      'fully_reserved', (select coalesce(bool_and(f.reserved + f.dispatched >= f.ordered), true) from public.v_order_line_fulfilment f where f.order_id = o.id)
    ) as x
    from public.orders o
    left join public.b2b_customers c on c.id = o.b2b_customer_id
    left join public.salespeople sp on sp.id = o.salesperson_id
    left join public.salespeople asp on asp.id = o.account_salesperson_id
    left join public.profiles pm on pm.id = o.ops_manager
    where (p_from is null or public._ist_date(o.created_at) >= p_from) and (p_to is null or public._ist_date(o.created_at) <= p_to)
      and (q = '' or lower(o.customer_name) like '%' || q || '%' or o.phone like '%' || q || '%' or lower(coalesce(o.b2b_order_no, '')) like '%' || q || '%'
        or o.order_number::text = q or lower(coalesce(c.customer_code, '')) like '%' || q || '%')
      and case coalesce(p_filter, 'action')
        when 'action' then o.fulfilment_status in ('submitted', 'confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched', 'delivery_failed')
        when 'new' then o.fulfilment_status in ('submitted', 'confirmed') and o.accepted_at is null
        when 'sales_rep' then o.source = 'sales_rep' and o.fulfilment_status not in ('delivered', 'cancelled', 'returned')
        when 'b2b_app' then o.source = 'b2b_app' and o.fulfilment_status not in ('delivered', 'cancelled', 'returned')
        when 'retail' then o.b2b_customer_id is null and o.fulfilment_status not in ('delivered', 'cancelled', 'returned', 'awaiting_payment')
        when 'awaiting_confirmation' then o.fulfilment_status in ('awaiting_confirmation', 'submitted')
        when 'awaiting_stock' then o.fulfilment_status in ('confirmed', 'processing')
          and exists (select 1 from public.v_order_line_fulfilment f where f.order_id = o.id and f.reserved + f.dispatched < f.ordered)
        when 'awaiting_manufacturing' then o.fulfilment_status in ('confirmed', 'processing')
          and exists (select 1 from public.v_order_line_fulfilment f where f.order_id = o.id and f.reserved + f.dispatched < f.ordered
            and (f.item_id is null or public._b2b_free_stock(f.item_id) < f.ordered - f.reserved - f.dispatched))
        when 'awaiting_packing' then o.fulfilment_status in ('processing', 'picking')
          and not exists (select 1 from public.v_order_line_fulfilment f where f.order_id = o.id and f.reserved + f.dispatched < f.ordered)
        when 'ready' then o.fulfilment_status in ('packed', 'ready_for_dispatch')
        when 'dispatched' then o.fulfilment_status in ('partially_dispatched', 'dispatched', 'out_for_delivery', 'partially_delivered')
        when 'delivered' then o.fulfilment_status = 'delivered'
        when 'cancelled' then o.fulfilment_status in ('cancelled', 'returned')
        else true end
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 300), 1), 1000)) t);
end;
$$;

-- Packing slip: what to pick, from which lots / batches, and what has been packed.
create function public.ops_packing_slip(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  perform public.require_permission('dispatch', 'view');
  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  return jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'order_no', coalesce(o.b2b_order_no, '#' || o.order_number), 'created_at', o.created_at, 'source', o.source,
      'customer_name', o.customer_name, 'phone', o.phone, 'address', o.address, 'city', o.city, 'pincode', o.pincode, 'notes', o.notes,
      'delivery_date', coalesce(o.delivery_date, o.requested_delivery_date), 'stage', o.fulfilment_status, 'priority', o.priority,
      'customer_code', (select customer_code from public.b2b_customers where id = o.b2b_customer_id),
      'owner_name', (select owner_name from public.b2b_customers where id = o.b2b_customer_id)),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'order_item_id', f.order_item_id, 'name', f.product_name, 'pack', f.pack_label, 'sku', i.code, 'pack_size', pc.name,
        'ordered', f.ordered, 'to_pick', f.reserved, 'dispatched', f.dispatched,
        'lots', (select coalesce(jsonb_agg(jsonb_build_object('lot_code', l.lot_code, 'batch_no', b.batch_no, 'batch_id', b.id, 'expiry_date', l.expiry_date,
            'qty', a.qty - a.qty_dispatched - a.qty_released) order by l.expiry_date), '[]')
          from public.order_allocations a join public.stock_lots l on l.id = a.lot_id left join public.production_batches b on b.id = l.batch_id
          where a.order_item_id = f.order_item_id and a.qty - a.qty_dispatched - a.qty_released > 0),
        'last_packed', (select p.qty_packed from public.order_packing p where p.order_item_id = f.order_item_id order by p.packed_at desc limit 1))
        order by f.product_name, f.pack_label), '[]')
      from public.v_order_line_fulfilment f left join public.items i on i.id = f.item_id left join public.packaging_configs pc on pc.id = i.packaging_config_id
      where f.order_id = o.id),
    'packing', (select coalesce(jsonb_agg(jsonb_build_object('at', p.packed_at, 'product', p.product, 'to_pick', p.qty_to_pick, 'packed', p.qty_packed,
        'exception', p.exception_reason, 'by', coalesce(pr.full_name, pr.email)) order by p.packed_at desc), '[]')
      from public.order_packing p left join public.profiles pr on pr.id = p.packed_by where p.order_id = o.id)
  );
end;
$$;

-- Production planning: confirmed demand against stock. Only orders operations have accepted count as
-- demand; submitted / unconfirmed orders are shown separately and never drive production on their own.
create function public.ops_production_requirements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('production', 'view') or public.has_permission('dispatch', 'view')) then
    raise exception 'You do not have permission to see production requirements' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(x order by x ->> 'sort'), '[]') from (
    select jsonb_build_object(
      'sort', coalesce(to_char(d.earliest, 'YYYYMMDD'), '99999999') || p.name || i.name,
      'item_id', i.id, 'sku', i.code, 'name', i.name, 'product_id', p.id, 'product', p.name, 'pack', pc.name,
      'net_qty', coalesce(pc.net_qty, i.net_qty), 'net_unit', coalesce(pc.net_unit, p.base_unit), 'unit', i.unit,
      'confirmed_demand', d.confirmed, 'reserved', d.reserved, 'still_to_reserve', d.open_need,
      'free_stock', public._b2b_free_stock(i.id),
      'additional_required', greatest(d.open_need - public._b2b_free_stock(i.id), 0),
      'additional_required_base', greatest(d.open_need - public._b2b_free_stock(i.id), 0) * coalesce(pc.net_qty, i.net_qty, 1),
      'unconfirmed_demand', d.unconfirmed,
      'earliest_delivery', d.earliest, 'orders', d.orders,
      'in_production_base', (select coalesce(sum(b.planned_qty), 0) from public.production_batches b where b.product_id = p.id
        and b.status in ('planned', 'materials_issued', 'in_production', 'production_completed', 'awaiting_qc', 'qc_approved', 'packaging', 'packaging_completed')),
      'shelf_life_days', coalesce(i.shelf_life_days, p.shelf_life_days), 'lead_days', i.b2b_lead_days,
      'priority', case when d.earliest is null then 'normal' when d.earliest <= public.ist_today() + 1 then 'urgent'
        when d.earliest <= public.ist_today() + 3 then 'high' else 'normal' end,
      'start_by', case when d.earliest is not null then d.earliest - greatest(i.b2b_lead_days, 1) end
    ) as x
    from (
      select f.item_id,
        sum(f.ordered - f.dispatched) filter (where o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')) as confirmed,
        sum(f.reserved) filter (where o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')) as reserved,
        sum(greatest(f.ordered - f.reserved - f.dispatched, 0)) filter (where o.fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')) as open_need,
        sum(f.ordered) filter (where o.fulfilment_status in ('submitted', 'awaiting_confirmation')) as unconfirmed,
        min(coalesce(o.delivery_date, o.requested_delivery_date)) filter (where o.fulfilment_status not in ('submitted', 'awaiting_confirmation')) as earliest,
        count(distinct o.id) as orders
      from public.v_order_line_fulfilment f join public.orders o on o.id = f.order_id
      where f.item_id is not null and o.on_hold = false
        and o.fulfilment_status in ('submitted', 'awaiting_confirmation', 'confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch', 'partially_dispatched')
      group by f.item_id
    ) d
    join public.items i on i.id = d.item_id
    join public.products p on p.id = i.product_id
    left join public.packaging_configs pc on pc.id = i.packaging_config_id
  ) t);
end;
$$;

-- Batch → stock → orders → customers.
create function public.ops_batch_customers(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('production', 'view') or public.has_permission('dispatch', 'view')) then
    raise exception 'You do not have permission to trace batches' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'dispatch_no', d.dispatch_no, 'dispatched_at', d.dispatched_at, 'dispatch_status', d.status, 'order_id', o.id,
      'order_no', coalesce(o.b2b_order_no, '#' || o.order_number), 'customer', o.customer_name, 'customer_code', c.customer_code,
      'phone', o.phone, 'sku', i.code, 'item', i.name, 'lot_code', l.lot_code, 'qty', dl.qty, 'qty_returned', dl.qty_returned)
      order by d.dispatched_at), '[]')
    from public.dispatch_lines dl
    join public.dispatches d on d.id = dl.dispatch_id
    join public.orders o on o.id = d.order_id
    join public.items i on i.id = dl.item_id
    join public.stock_lots l on l.id = dl.lot_id
    left join public.b2b_customers c on c.id = o.b2b_customer_id
    where dl.batch_id = p_batch_id);
end;
$$;

-- Finance -----------------------------------------------------------------------------------------------
-- A payment from a B2B customer: one receipt, one journal entry, settled against the order named (an
-- advance) or the oldest open invoices.
create function public.b2b_receive_payment(p_customer_id uuid, p_amount numeric, p_paid_on date, p_method text, p_account_code text,
  p_reference text default null, p_order_id uuid default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.b2b_customers;
  pid uuid := gen_random_uuid();
  no text;
  eid uuid;
  left_to_allocate numeric := p_amount;
  inv record;
  take numeric;
begin
  perform public.require_permission('sales', 'create');
  perform public._claim_request_key(p_key, 'b2b_receive_payment');
  perform public._check_money_account(p_account_code);
  select * into c from public.b2b_customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount received';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other') then
    raise exception 'Choose how the money was received';
  end if;
  if p_order_id is not null and not exists (select 1 from public.orders where id = p_order_id and b2b_customer_id = c.id) then
    raise exception 'That order is not this customer''s';
  end if;
  no := public.next_doc_number('receipt', 'MW-RCT', public.financial_year(p_paid_on), 5);
  eid := public._post_journal(p_paid_on, 'payment', pid::text, 'Receipt ' || no || ' · ' || c.shop_name || ' (' || c.customer_code || ')', 'payment:' || pid,
    jsonb_build_array(public._jl(p_account_code, p_amount), public._jl('1100', -p_amount, 'customer', 'b2b:' || c.id)));
  insert into public.payments (id, payment_no, direction, party_type, party_id, party_name, amount, paid_on, method, account_code, reference, entry_id)
  values (pid, no, 'in', 'customer', 'b2b:' || c.id, c.shop_name, p_amount, p_paid_on, p_method, p_account_code, nullif(trim(coalesce(p_reference, '')), ''), eid);
  if p_order_id is not null then
    insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, 'order', p_order_id, p_amount);
  else
    -- Settle the oldest invoiced orders that still have an unpaid amount recorded against them.
    for inv in
      select o.id, o.total - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.doc_type = 'order' and pa.doc_id = o.id), 0) as unpaid
      from public.orders o
      where o.b2b_customer_id = c.id and o.invoice_number is not null and o.status <> 'cancelled'
      order by o.invoice_date, o.order_number
    loop
      exit when left_to_allocate <= 0;
      continue when inv.unpaid <= 0;
      take := least(inv.unpaid, left_to_allocate);
      insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, 'order', inv.id, take);
      left_to_allocate := left_to_allocate - take;
    end loop;
  end if;
  perform public.write_audit('payment.b2b_customer', 'payments', pid::text,
    jsonb_build_object('no', no, 'customer', c.customer_code, 'amount', p_amount, 'order', p_order_id));
  return pid;
end;
$$;

-- Customer ledger and statement: invoices, receipts, credit notes and refunds from the ledger, the
-- open invoices and the balance. Read-only for everyone, including the customer.
create function public.b2b_statement(p_customer_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a text := public._b2b_require_access(p_customer_id);
  d1 date := coalesce(p_from, public.ist_today() - 90);
  d2 date := coalesce(p_to, public.ist_today());
  opening numeric;
begin
  if not (a = 'customer' or (a = 'staff' and public.has_permission('sales', 'view')) or (a <> 'customer' and public._b2b_can_see_money(p_customer_id))) then
    raise exception 'You do not have permission to see this customer''s account' using errcode = '42501';
  end if;
  select coalesce(sum(l.debit - l.credit), 0) into opening from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id and e.entry_date < d1;
  return jsonb_build_object(
    'from', d1, 'to', d2, 'opening', opening,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('date', x.entry_date, 'entry_no', x.entry_no, 'kind', x.kind, 'memo', x.memo,
        'debit', x.debit, 'credit', x.credit, 'balance', opening + x.running, 'order_id', x.order_id) order by x.entry_date, x.entry_no), '[]')
      from (select e.entry_date, e.entry_no, e.memo, l.debit, l.credit,
              case e.source_type when 'order' then case when e.posting_key like 'sale-cancel:%' then 'cancellation' when e.posting_key like 'receipt:%' then 'payment' else 'invoice' end
                when 'payment' then 'payment' when 'dispatch' then 'payment' when 'credit_note' then 'credit_note' when 'refund' then 'refund' else e.source_type end as kind,
              case when e.source_type = 'order' then e.source_id::uuid end as order_id,
              sum(l.debit - l.credit) over (order by e.entry_date, e.entry_no) as running
            from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
            where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id and e.entry_date between d1 and d2) x),
    'closing', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
      where l.account_code = '1100' and l.party_id = 'b2b:' || p_customer_id and e.entry_date <= d2),
    'open_invoices', (select coalesce(jsonb_agg(to_jsonb(i) order by i.invoice_date), '[]') from public._b2b_open_invoices(p_customer_id) i),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('payment_no', p.payment_no, 'paid_on', p.paid_on, 'amount', p.amount, 'method', p.method,
        'reference', p.reference) order by p.paid_on desc), '[]')
      from public.payments p where p.party_type = 'customer' and p.party_id = 'b2b:' || p_customer_id and p.direction = 'in'),
    'credit', public._b2b_credit(p_customer_id)
  );
end;
$$;

-- Reports -------------------------------------------------------------------------------------------------
-- Per salesperson. Orders they entered (SALES_REP) are attributed to them; direct orders from their
-- accounts are shown separately and never counted as their entries. Each order counts once.
create function public.b2b_sales_performance(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('sales_team', 'view') or public.has_permission('reports', 'view')) then
    raise exception 'You do not have permission to see sales performance' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(x order by (x ->> 'rep_sales')::numeric desc), '[]') from (
    select jsonb_build_object(
      'salesperson_id', s.id, 'name', s.full_name, 'employee_code', s.employee_code, 'active', s.is_active, 'territories', s.territories,
      'leads_added', (select count(*) from public.b2b_customers c where c.acquired_by = s.id and public._ist_date(c.acquired_at) between p_from and p_to),
      'customers_acquired', (select count(*) from public.b2b_customers c where c.acquired_by = s.id and c.status in ('approved', 'suspended', 'inactive')
        and public._ist_date(c.approved_at) between p_from and p_to),
      'conversion_pct', (select case when count(*) > 0 then round(100.0 * count(*) filter (where c.status in ('approved', 'suspended', 'inactive')) / count(*), 1) end
        from public.b2b_customers c where c.acquired_by = s.id and public._ist_date(c.acquired_at) between p_from and p_to),
      'assigned_customers', (select count(*) from public.b2b_customers c where c.assigned_salesperson = s.id and c.status = 'approved'),
      'rep_orders', r.orders, 'rep_sales', r.sales,
      'rep_avg_order', case when r.orders > 0 then round(r.sales / r.orders, 2) end,
      'direct_orders_from_accounts', r.direct_orders, 'direct_sales_from_accounts', r.direct_sales,
      'repeat_customers', r.repeat_customers,
      'retained_customers', (select count(distinct o.b2b_customer_id) from public.orders o where o.account_salesperson_id = s.id and o.status <> 'cancelled'
        and public._ist_date(o.created_at) between p_from and p_to
        and exists (select 1 from public.orders o2 where o2.b2b_customer_id = o.b2b_customer_id and o2.status <> 'cancelled' and public._ist_date(o2.created_at) < p_from)),
      'visits', (select count(*) from public.b2b_activities v where v.salesperson_id = s.id and v.kind = 'visit' and public._ist_date(v.occurred_at) between p_from and p_to),
      'outstanding', case when public.has_permission('sales', 'view') then (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l
        where l.account_code = '1100' and l.party_id in (select 'b2b:' || c.id from public.b2b_customers c where c.assigned_salesperson = s.id)) end,
      'target', (select coalesce(sum(t.target_value), 0) from public.sales_targets t where t.salesperson_id = s.id
        and t.month between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date),
      'incentive_pct', s.incentive_pct, 'incentive_basis', s.incentive_basis,
      'incentive', round(s.incentive_pct / 100 * case when s.incentive_basis = 'account_sales' then r.sales + r.direct_sales else r.sales end, 2)
    ) as x
    from public.salespeople s
    cross join lateral (
      select
        count(*) filter (where o.salesperson_id = s.id) as orders,
        coalesce(sum(o.total) filter (where o.salesperson_id = s.id), 0) as sales,
        count(*) filter (where o.source = 'b2b_app' and o.account_salesperson_id = s.id) as direct_orders,
        coalesce(sum(o.total) filter (where o.source = 'b2b_app' and o.account_salesperson_id = s.id), 0) as direct_sales,
        (select count(*) from (select o3.b2b_customer_id from public.orders o3 where o3.salesperson_id = s.id and o3.status <> 'cancelled'
          and public._ist_date(o3.created_at) between p_from and p_to group by o3.b2b_customer_id having count(*) > 1) z) as repeat_customers
      from public.orders o
      where o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to
        and (o.salesperson_id = s.id or o.account_salesperson_id = s.id)
    ) r
  ) t);
end;
$$;

-- B2B sales by channel, product, area and day (each order once; cancelled excluded).
create function public.b2b_sales_breakdown(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('sales_team', 'view') or public.has_permission('reports', 'view') or public.has_permission('b2b_customers', 'view')) then
    raise exception 'You do not have permission to see sales reports' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'orders', x.n, 'sales', x.v) order by x.v desc), '[]') from (
      select o.source, count(*) as n, sum(o.total) as v from public.orders o
      where o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to group by o.source) x),
    'by_product', (select coalesce(jsonb_agg(jsonb_build_object('product', x.product, 'sku', x.sku, 'qty', x.qty, 'sales', x.v) order by x.v desc), '[]') from (
      select coalesce(p.name, oi.product_name) as product, coalesce(i.code, oi.pack_label) as sku, sum(oi.quantity) as qty, sum(oi.unit_price * oi.quantity) as v
      from public.orders o join public.order_items oi on oi.order_id = o.id left join public.items i on i.id = oi.item_id left join public.products p on p.id = i.product_id
      where o.b2b_customer_id is not null and o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to
      group by 1, 2) x),
    'by_area', (select coalesce(jsonb_agg(jsonb_build_object('city', x.city, 'locality', x.locality, 'customers', x.customers, 'orders', x.n, 'sales', x.v) order by x.v desc), '[]') from (
      select c.city, coalesce(c.locality, '—') as locality, count(distinct c.id) as customers, count(*) as n, sum(o.total) as v
      from public.orders o join public.b2b_customers c on c.id = o.b2b_customer_id
      where o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to group by 1, 2) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'sales_rep', x.rep, 'b2b_app', x.app, 'other', x.other) order by x.d), '[]') from (
      select public._ist_date(o.created_at) as d,
        coalesce(sum(o.total) filter (where o.source = 'sales_rep'), 0) as rep,
        coalesce(sum(o.total) filter (where o.source = 'b2b_app'), 0) as app,
        coalesce(sum(o.total) filter (where o.b2b_customer_id is not null and o.source not in ('sales_rep', 'b2b_app')), 0) as other
      from public.orders o where o.b2b_customer_id is not null and o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to group by 1) x),
    'totals', (select jsonb_build_object('orders', count(*), 'sales', coalesce(sum(o.total), 0), 'customers', count(distinct o.b2b_customer_id),
        'avg_order', case when count(*) > 0 then round(sum(o.total) / count(*), 2) end)
      from public.orders o where o.b2b_customer_id is not null and o.status <> 'cancelled' and public._ist_date(o.created_at) between p_from and p_to)
  );
end;
$$;

-- Marketing ---------------------------------------------------------------------------------------------
create function public.mkt_save_campaign(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.require_permission('marketing', 'create');
  if cid is not null then
    update public.marketing_campaigns set name = trim(p ->> 'name'), channel = p ->> 'channel', segment = coalesce(nullif(p ->> 'segment', ''), 'marketing_consent'),
      filters = coalesce(p -> 'filters', '{}'), message = trim(p ->> 'message')
    where id = cid and status = 'draft';
    if not found then
      raise exception 'Only draft campaigns can be changed';
    end if;
  else
    insert into public.marketing_campaigns (name, channel, segment, filters, message)
    values (trim(p ->> 'name'), p ->> 'channel', coalesce(nullif(p ->> 'segment', ''), 'marketing_consent'), coalesce(p -> 'filters', '{}'), trim(p ->> 'message'))
    returning id into cid;
  end if;
  perform public.write_audit('campaign.save', 'marketing_campaigns', cid::text, p);
  return cid;
end;
$$;

-- Approving a campaign fixes its recipients: customers in the segment who agreed to that channel and
-- have not opted out. Everyone else is counted as excluded, never messaged.
create function public.mkt_approve_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mc public.marketing_campaigns;
  seg jsonb;
  n integer;
  no_consent integer;
  opted integer;
begin
  perform public.require_permission('marketing', 'approve');
  select * into mc from public.marketing_campaigns where id = p_campaign_id for update;
  if not found or mc.status <> 'draft' then
    raise exception 'Only draft campaigns can be approved';
  end if;
  seg := public.b2b_customer_list(null, coalesce(mc.filters, '{}') || jsonb_build_object('segment', case when mc.segment = 'all' then '' else mc.segment end), 2000);
  insert into public.marketing_recipients (campaign_id, customer_id)
  select mc.id, c.id from jsonb_array_elements(seg) e join public.b2b_customers c on c.id = (e ->> 'id')::uuid
  where c.marketing_consent and c.opted_out_at is null and mc.channel = any (c.consent_channels) and c.status in ('approved', 'suspended', 'inactive');
  get diagnostics n = row_count;
  select count(*) filter (where not c.marketing_consent and c.opted_out_at is null or (c.marketing_consent and not (mc.channel = any (c.consent_channels)))),
    count(*) filter (where c.opted_out_at is not null)
  into no_consent, opted
  from jsonb_array_elements(seg) e join public.b2b_customers c on c.id = (e ->> 'id')::uuid;
  update public.marketing_campaigns set status = 'approved', approved_by = auth.uid(), approved_at = now(), excluded_no_consent = no_consent, excluded_opted_out = opted
  where id = mc.id;
  perform public.write_audit('campaign.approve', 'marketing_campaigns', mc.id::text, jsonb_build_object('recipients', n, 'excluded_no_consent', no_consent, 'excluded_opted_out', opted));
  return jsonb_build_object('recipients', n, 'excluded_no_consent', no_consent, 'excluded_opted_out', opted);
end;
$$;

-- Recipients to hand to the messaging provider. Consent is checked again at this moment, so an opt-out
-- recorded after approval is always respected.
create function public.mkt_campaign_recipients(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mc public.marketing_campaigns;
  out jsonb;
begin
  perform public.require_permission('marketing', 'export');
  select * into mc from public.marketing_campaigns where id = p_campaign_id;
  if not found or mc.status not in ('approved', 'sent') then
    raise exception 'Approve the campaign first';
  end if;
  update public.marketing_recipients r set status = 'skipped_opted_out' from public.b2b_customers c
  where r.campaign_id = mc.id and c.id = r.customer_id and r.status = 'queued'
    and (not c.marketing_consent or c.opted_out_at is not null or not (mc.channel = any (c.consent_channels)));
  select coalesce(jsonb_agg(jsonb_build_object('customer_code', c.customer_code, 'shop_name', c.shop_name, 'owner_name', c.owner_name,
      'contact', case mc.channel when 'email' then c.email when 'whatsapp' then coalesce(c.whatsapp, c.mobile) else c.mobile end) order by c.shop_name), '[]')
  into out
  from public.marketing_recipients r join public.b2b_customers c on c.id = r.customer_id
  where r.campaign_id = mc.id and r.status in ('queued', 'sent');
  perform public.write_audit('campaign.export', 'marketing_campaigns', mc.id::text, jsonb_build_object('rows', jsonb_array_length(out)));
  return out;
end;
$$;

create function public.mkt_mark_sent(p_campaign_id uuid, p_provider_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('marketing', 'approve');
  perform public.mkt_campaign_recipients(p_campaign_id);
  update public.marketing_recipients set status = 'sent' where campaign_id = p_campaign_id and status = 'queued';
  update public.marketing_campaigns set status = 'sent', sent_at = now(), sent_by = auth.uid(), provider_reference = nullif(trim(coalesce(p_provider_reference, '')), '')
  where id = p_campaign_id and status = 'approved';
  if not found then
    raise exception 'Only approved campaigns can be marked sent';
  end if;
  perform public.write_audit('campaign.sent', 'marketing_campaigns', p_campaign_id::text, jsonb_build_object('reference', p_provider_reference));
end;
$$;

-- New accounts: staff invites (as before), salesperson records and Wholesale app invites ---------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.ops_staff_invites;
  b2b public.b2b_login_invites;
  v_phone text := nullif(right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10), '');
begin
  insert into public.profiles (id, phone, email, is_admin)
  values (new.id, v_phone, lower(new.email), exists (select 1 from public.staff_emails s where s.email = lower(new.email)));

  select * into invite from public.ops_staff_invites where email = lower(new.email) and accepted_at is null;
  if found then
    insert into public.ops_user_roles (user_id, role_key, granted_by)
    select new.id, r, invite.invited_by from unnest(invite.role_keys) r
    where exists (select 1 from public.ops_roles where key = r)
    on conflict do nothing;
    update public.ops_staff_invites set accepted_at = now() where email = invite.email;
  end if;

  update public.salespeople set user_id = new.id where email = lower(new.email) and user_id is null;

  select * into b2b from public.b2b_login_invites
  where accepted_at is null and (contact = lower(new.email) or contact = v_phone)
  order by invited_at desc limit 1;
  if found then
    insert into public.b2b_customer_users (user_id, customer_id, status, decided_by, decided_at)
    values (new.id, b2b.customer_id, 'active', b2b.invited_by, now()) on conflict do nothing;
    update public.b2b_login_invites set accepted_at = now() where contact = b2b.contact;
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Access rules ---------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sales_territories', 'salespeople', 'sales_targets', 'price_categories', 'b2b_customers', 'b2b_customer_users',
    'b2b_login_invites', 'b2b_activities', 'b2b_consent_log', 'b2b_item_access', 'wholesale_prices', 'price_requests', 'b2b_drafts',
    'b2b_notifications', 'marketing_campaigns', 'marketing_recipients', 'order_amendments', 'order_packing'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Staff screens read these directly; the two apps read through the functions above.
create policy "Sales staff read territories" on public.sales_territories for select to authenticated
  using ((select public.has_permission('sales_team', 'view')) or (select public.has_permission('b2b_customers', 'view')) or (select public.has_permission('field_sales', 'view')));
create policy "Sales staff read salespeople" on public.salespeople for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('sales_team', 'view')) or (select public.has_permission('b2b_customers', 'view'))
    or (select public.has_permission('dispatch', 'view')));
create policy "Sales staff read targets" on public.sales_targets for select to authenticated
  using ((select public.has_permission('sales_team', 'view')) or salesperson_id in (select id from public.salespeople where user_id = (select auth.uid())));
create policy "Staff read price categories" on public.price_categories for select to authenticated
  using ((select public.has_permission('pricing', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read B2B customers" on public.b2b_customers for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read app logins" on public.b2b_customer_users for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read login invites" on public.b2b_login_invites for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Customer staff read activities" on public.b2b_activities for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')));
create policy "Marketing reads consent log" on public.b2b_consent_log for select to authenticated
  using ((select public.has_permission('marketing', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Pricing reads item access" on public.b2b_item_access for select to authenticated
  using ((select public.has_permission('pricing', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Pricing reads prices" on public.wholesale_prices for select to authenticated
  using ((select public.has_permission('pricing', 'view')));
create policy "Pricing reads price requests" on public.price_requests for select to authenticated
  using ((select public.has_permission('pricing', 'view')) or requested_by = (select auth.uid()));
create policy "Customer staff read notifications" on public.b2b_notifications for select to authenticated
  using ((select public.has_permission('b2b_customers', 'view')) or customer_id = (select public._b2b_my_customer_id()));
create policy "Marketing reads campaigns" on public.marketing_campaigns for select to authenticated
  using ((select public.has_permission('marketing', 'view')));
create policy "Marketing reads recipients" on public.marketing_recipients for select to authenticated
  using ((select public.has_permission('marketing', 'view')));
create policy "Dispatch reads amendments" on public.order_amendments for select to authenticated
  using ((select public.has_permission('dispatch', 'view')) or (select public.has_permission('b2b_customers', 'view')));
create policy "Dispatch reads packing" on public.order_packing for select to authenticated
  using ((select public.has_permission('dispatch', 'view')));
grant select on public.v_b2b_customer_stats to authenticated;
revoke all on public.v_b2b_customer_stats from anon;

do $$
declare
  f text;
begin
  -- Internal helpers: not callable through the API.
  foreach f in array array[
    '_b2b_access(uuid)', '_b2b_require_access(uuid)', '_b2b_can_see_money(uuid)', '_b2b_salesperson()',
    '_b2b_price(uuid, uuid, integer, date)', '_b2b_free_stock(uuid)', '_b2b_item_visible(uuid, uuid)', '_b2b_quote(uuid, jsonb, date)',
    '_b2b_credit(uuid, uuid)', '_b2b_open_invoices(uuid)', '_b2b_guard_unaccepted()', '_b2b_invoice_on_dispatch()', '_b2b_notify_event()',
    '_b2b_write_lines(uuid, uuid, jsonb)', '_b2b_review_reasons(uuid, jsonb)', '_b2b_territory_salesperson(text, text)',
    '_b2b_customer_from_json(jsonb, public.b2b_customers, boolean)', '_b2b_check_required(public.b2b_customers)',
    '_b2b_segments(public.b2b_customers, public.v_b2b_customer_stats, numeric)', '_b2b_clean_phone(text)', 'exists_staff(uuid)',
    'b2b_order_status(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Actions and readers: signed-in users only; each checks the caller itself.
  foreach f in array array[
    'b2b_quote(uuid, jsonb)', 'b2b_place_order(uuid, jsonb, text, date, text, text)', 'b2b_reorder_lines(uuid)', 'b2b_confirm_order(uuid, boolean, text)',
    'b2b_accept_order(uuid, date, text, boolean)', 'b2b_amend_order(uuid, jsonb, text, date, text)', 'b2b_cancel_order(uuid, text)',
    'ops_set_order_priority(uuid, text, uuid)', 'ops_record_packing(uuid, jsonb, text, jsonb)',
    'b2b_find_matches(text, text, text, text)', 'b2b_required_fields()', 'b2b_create_customer(jsonb, boolean, text)', 'b2b_register(jsonb)', 'b2b_decide_customer(uuid, boolean, text)',
    'b2b_update_customer(uuid, jsonb, text)', 'b2b_set_terms(uuid, jsonb, text)', 'b2b_set_status(uuid, text, text)', 'b2b_assign_customers(uuid[], uuid, text)',
    'b2b_grant_login(uuid, text)', 'b2b_decide_login(uuid, uuid, boolean, text)', 'b2b_log_activity(uuid, jsonb)',
    'b2b_record_consent(uuid, boolean, text[], text, text)', 'b2b_save_draft(uuid, jsonb, text)', 'b2b_get_draft(uuid)', 'b2b_mark_notifications_read()',
    'b2b_customer_list(text, jsonb, integer)', 'b2b_customer_profile(uuid)', 'b2b_catalogue(uuid)', 'b2b_me()', 'b2b_orders(uuid, text, integer)',
    'b2b_order_detail(uuid)', 'b2b_can_view_order(uuid)', 'fs_dashboard(date, date)', 'fs_request_price(uuid, uuid, numeric, integer, date, text)',
    'pr_decide_price_request(uuid, boolean, numeric, date, date, text)', 'pr_save_price(jsonb)', 'pr_end_price(uuid, text)',
    'pr_save_item_wholesale(uuid, jsonb)', 'pr_set_item_access(uuid, uuid, boolean)', 'pr_save_category(text, text, text, boolean)',
    'st_save_salesperson(jsonb)', 'st_save_territory(text, text, text, text[], boolean)', 'st_set_target(uuid, date, numeric, integer, integer)',
    'ops_order_queue(text, text, date, date, integer)', 'ops_packing_slip(uuid)', 'ops_production_requirements()', 'ops_batch_customers(uuid)',
    'b2b_receive_payment(uuid, numeric, date, text, text, text, uuid, text)', 'b2b_statement(uuid, date, date)',
    'b2b_sales_performance(date, date)', 'b2b_sales_breakdown(date, date)',
    'mkt_save_campaign(jsonb)', 'mkt_approve_campaign(uuid)', 'mkt_campaign_recipients(uuid)', 'mkt_mark_sent(uuid, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._b2b_stage_label(text) from public, anon;
-- Used by the notifications access rule; it only ever returns the caller's own customer.
revoke execute on function public._b2b_my_customer_id() from public, anon;
grant execute on function public._b2b_my_customer_id() to authenticated;
grant execute on function public._b2b_stage_label(text) to authenticated;

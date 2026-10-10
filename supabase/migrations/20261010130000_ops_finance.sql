-- Finance: double-entry ledger, purchases, payments, sales accounting, expenses, payroll, cash & bank, reports.
--
-- Every business document posts its own journal entry, once: each entry carries a unique posting key
-- (e.g. 'stock:123', 'sale:<order>', 'receipt:dispatch:<id>'), so a retried request or a repeated
-- payment callback can never post twice. Entries must balance and can never be edited or deleted;
-- corrections are reversing entries linked to the original.
--
-- What posts automatically:
--   stock movements         → inventory / work-in-progress / cost of goods sold / wastage
--   milk collections        → raw milk inventory against the farmer's payable
--   purchase invoices       → inventory or expense + GST input against the supplier's payable
--   orders (when invoiced)  → receivable against sales + GST output; online payments → receipt
--   cash collected on delivery → receipt
--   batch release / write-off → overhead absorption, rounding, production loss

-- Chart of accounts --------------------------------------------------------------------
create table public.ledger_accounts (
  code text primary key check (code ~ '^[0-9]{4}$'),
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  subtype text,
  is_system boolean not null default false,
  is_active boolean not null default true
);

insert into public.ledger_accounts (code, name, type, subtype, is_system) values
  ('1000', 'Cash in hand', 'asset', 'cash', true),
  ('1010', 'Bank — current account', 'asset', 'bank', true),
  ('1020', 'Razorpay / payment gateway clearing', 'asset', 'bank', true),
  ('1100', 'Accounts receivable — customers', 'asset', 'receivable', true),
  ('1150', 'Employee advances', 'asset', 'receivable', true),
  ('1200', 'Inventory — raw materials', 'asset', 'inventory', true),
  ('1210', 'Inventory — packaging materials', 'asset', 'inventory', true),
  ('1220', 'Inventory — finished goods', 'asset', 'inventory', true),
  ('1230', 'Inventory — purchased goods for resale', 'asset', 'inventory', true),
  ('1240', 'Inventory — consumables', 'asset', 'inventory', true),
  ('1250', 'Work in progress', 'asset', 'inventory', true),
  ('1300', 'GST input — CGST', 'asset', 'tax', true),
  ('1301', 'GST input — SGST', 'asset', 'tax', true),
  ('1302', 'GST input — IGST', 'asset', 'tax', true),
  ('1400', 'Machinery and equipment', 'asset', 'fixed_asset', true),
  ('2000', 'Accounts payable — suppliers', 'liability', 'payable', true),
  ('2050', 'Other payables (expenses)', 'liability', 'payable', true),
  ('2100', 'GST output — CGST', 'liability', 'tax', true),
  ('2101', 'GST output — SGST', 'liability', 'tax', true),
  ('2102', 'GST output — IGST', 'liability', 'tax', true),
  ('2200', 'Salaries payable', 'liability', 'payable', true),
  ('2210', 'Payroll deductions payable', 'liability', 'payable', true),
  ('2300', 'Customer bottle deposits', 'liability', 'deposit', true),
  ('2310', 'Customer advances / prepaid balance', 'liability', 'deposit', true),
  ('3000', 'Owner''s capital', 'equity', null, true),
  ('3100', 'Opening balance equity', 'equity', null, true),
  ('4000', 'Sales — Mithai Wallah products', 'income', 'sales', true),
  ('4010', 'Sales — purchased goods', 'income', 'sales', true),
  ('4095', 'Sales returns and credit notes', 'income', 'sales', true),
  ('4100', 'Other income', 'income', 'other', true),
  ('5000', 'Cost of goods sold', 'expense', 'cogs', true),
  ('5100', 'Production loss and wastage', 'expense', 'cogs', true),
  ('5110', 'Inventory count differences', 'expense', 'cogs', true),
  ('5200', 'Production overhead absorbed', 'expense', 'cogs', true),
  ('6000', 'Electricity', 'expense', 'operating', true),
  ('6010', 'Fuel', 'expense', 'operating', true),
  ('6020', 'Boiler expenses', 'expense', 'operating', true),
  ('6030', 'Transportation and freight', 'expense', 'operating', true),
  ('6040', 'Repairs and maintenance', 'expense', 'operating', true),
  ('6050', 'Rent', 'expense', 'operating', true),
  ('6060', 'Telephone and internet', 'expense', 'operating', true),
  ('6070', 'Office expenses', 'expense', 'operating', true),
  ('6080', 'Marketing', 'expense', 'operating', true),
  ('6090', 'Packaging (not stocked)', 'expense', 'operating', true),
  ('6100', 'Employee welfare and expenses', 'expense', 'operating', true),
  ('6200', 'Salaries and wages', 'expense', 'operating', true),
  ('6900', 'Other operating expenses', 'expense', 'operating', true),
  ('6950', 'Bank charges and gateway fees', 'expense', 'operating', true),
  ('6990', 'Rounding and cash differences', 'expense', 'operating', true);

-- Journal ----------------------------------------------------------------------------
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  entry_date date not null,
  source_type text not null,
  source_id text,
  memo text,
  posting_key text not null unique,
  reversal_of uuid unique references public.journal_entries,
  reason text,
  posted_by uuid default auth.uid(),
  posted_at timestamptz not null default now()
);
create index journal_entries_date_idx on public.journal_entries (entry_date);
create index journal_entries_source_idx on public.journal_entries (source_type, source_id);

create table public.journal_lines (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.journal_entries,
  account_code text not null references public.ledger_accounts,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  party_type text check (party_type in ('customer', 'supplier', 'employee', 'batch', 'other')),
  party_id text,
  memo text,
  check (debit = 0 or credit = 0),
  check (debit > 0 or credit > 0)
);
create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account_code);
create index journal_lines_party_idx on public.journal_lines (party_type, party_id);

create trigger journal_entries_append_only before update or delete on public.journal_entries
  for each row execute function public.reject_change();
create trigger journal_lines_append_only before update or delete on public.journal_lines
  for each row execute function public.reject_change();
create trigger journal_entries_no_truncate before truncate on public.journal_entries
  for each statement execute function public.reject_change();
create trigger journal_lines_no_truncate before truncate on public.journal_lines
  for each statement execute function public.reject_change();

-- Every entry must balance (checked when the transaction commits).
create function public._journal_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  diff numeric;
begin
  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) into diff from public.journal_lines where entry_id = new.entry_id;
  if diff <> 0 then
    raise exception 'Journal entry does not balance (difference %)', diff using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger journal_lines_balanced after insert on public.journal_lines
  deferrable initially deferred for each row execute function public._journal_balanced();

-- Post an entry. Lines: [{account, debit, credit, party_type, party_id, memo}]. Returns the existing
-- entry if this posting key was already used. Zero lines are dropped; amounts are rounded to paise.
create function public._post_journal(p_date date, p_source_type text, p_source_id text, p_memo text, p_key text, p_lines jsonb,
  p_reversal_of uuid default null, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid;
  e jsonb;
  dr numeric := 0;
  cr numeric := 0;
  d numeric;
  c numeric;
begin
  select id into eid from public.journal_entries where posting_key = p_key;
  if found then
    return eid;
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    dr := dr + round(coalesce((e ->> 'debit')::numeric, 0), 2);
    cr := cr + round(coalesce((e ->> 'credit')::numeric, 0), 2);
  end loop;
  if dr = 0 and cr = 0 then
    return null;
  end if;
  if dr <> cr then
    raise exception 'Journal entry does not balance: debits % vs credits %', dr, cr using errcode = '23514';
  end if;
  insert into public.journal_entries (entry_no, entry_date, source_type, source_id, memo, posting_key, reversal_of, reason)
  values (public.next_doc_number('journal', 'JV', public.financial_year(p_date), 6), p_date, p_source_type, p_source_id, p_memo, p_key, p_reversal_of, p_reason)
  returning id into eid;
  for e in select * from jsonb_array_elements(p_lines) loop
    d := round(coalesce((e ->> 'debit')::numeric, 0), 2);
    c := round(coalesce((e ->> 'credit')::numeric, 0), 2);
    -- A negative amount on one side is posted as a positive amount on the other.
    if d < 0 then c := c - d; d := 0; end if;
    if c < 0 then d := d - c; c := 0; end if;
    if d - c <> 0 then
      insert into public.journal_lines (entry_id, account_code, debit, credit, party_type, party_id, memo)
      values (eid, e ->> 'account', greatest(d - c, 0), greatest(c - d, 0), e ->> 'party_type', e ->> 'party_id', e ->> 'memo');
    end if;
  end loop;
  return eid;
end;
$$;

-- Builds a two-line entry in one call.
create function public._jl(p_account text, p_amount numeric, p_party_type text default null, p_party_id text default null, p_memo text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('account', p_account,
    'debit', case when p_amount > 0 then p_amount else 0 end,
    'credit', case when p_amount < 0 then -p_amount else 0 end,
    'party_type', p_party_type, 'party_id', p_party_id, 'memo', p_memo)
$$;

create function public._inventory_account(p_item_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case item_type
    when 'raw_material' then '1200' when 'packaging' then '1210' when 'finished_good' then '1220'
    when 'purchased_good' then '1230' else '1240' end
  from public.items where id = p_item_id
$$;

create function public._ist_date(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Kolkata')::date
$$;

-- Stock movements → ledger ---------------------------------------------------------------
create function public._gl_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv text := public._inventory_account(new.item_id);
  v numeric := new.value;          -- signed: + into stock, − out of stock
  orig public.stock_movements;
  counter text;
  ptype text;
  pid text;
  t text := new.movement_type;
begin
  if v = 0 then
    return null;
  end if;
  if t = 'reversal' then
    if new.reversal_of is null then
      return null;                 -- reversals of documents (collections, purchases) post through the document
    end if;
    select * into orig from public.stock_movements where id = new.reversal_of;
    t := orig.movement_type;
  end if;
  if t in ('purchase_receipt', 'procurement_receipt', 'supplier_return') then
    return null;                   -- posted by the purchase / collection document itself
  end if;

  counter := case t
    when 'opening' then '3100'
    when 'issue_to_production' then '1250'
    when 'return_from_production' then '1250'
    when 'packaging_consumption' then '1250'
    when 'production_receipt' then '1250'
    when 'dispatch' then '5000'
    when 'customer_return' then '5000'
    when 'damage' then '5100'
    when 'expiry' then '5100'
    when 'adjustment_in' then '5110'
    when 'adjustment_out' then '5110'
  end;
  if counter is null then
    return null;
  end if;
  if counter = '1250' then
    ptype := 'batch';
    pid := case new.doc_type
      when 'batch' then new.doc_id
      when 'batch_packaging' then (select batch_id::text from public.batch_packaging where id::text = new.doc_id)
    end;
  end if;
  perform public._post_journal(public._ist_date(new.occurred_at), 'stock_movement', new.id::text,
    initcap(replace(new.movement_type, '_', ' ')) || coalesce(' · ' || new.doc_no, ''), 'stock:' || new.id,
    jsonb_build_array(public._jl(inv, v), public._jl(counter, -v, ptype, pid)));
  return null;
end;
$$;
create trigger stock_movements_post_gl after insert on public.stock_movements
  for each row execute function public._gl_stock_movement();

-- Batches: overhead absorption on release; leftover work in progress to rounding or loss.
create function public._gl_batch_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  absorbed numeric := coalesce(new.labour_cost, 0) + coalesce(new.overhead_cost, 0);
  wip numeric;
begin
  if new.status = old.status or new.status not in ('released', 'cancelled') then
    return null;
  end if;
  if new.status = 'released' and absorbed > 0 then
    perform public._post_journal(public.ist_today(), 'batch', new.id::text, 'Labour and overhead absorbed · ' || new.batch_no,
      'batch-absorb:' || new.id, jsonb_build_array(public._jl('1250', absorbed, 'batch', new.id::text), public._jl('5200', -absorbed)));
  end if;
  select coalesce(sum(debit - credit), 0) into wip from public.journal_lines where account_code = '1250' and party_type = 'batch' and party_id = new.id::text;
  if wip <> 0 then
    perform public._post_journal(public.ist_today(), 'batch', new.id::text,
      case when new.status = 'released' then 'Batch cost rounding · ' else 'Batch written off · ' end || new.batch_no,
      'batch-close:' || new.id,
      jsonb_build_array(public._jl(case when new.status = 'released' then '6990' else '5100' end, wip), public._jl('1250', -wip, 'batch', new.id::text)));
  end if;
  return null;
end;
$$;
create trigger production_batches_post_gl after update of status on public.production_batches
  for each row execute function public._gl_batch_status();

-- Milk collections → farmer payable ---------------------------------------------------------
alter table public.milk_collections add column if not exists amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partly_paid', 'paid'));

create function public._gl_milk_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.amount > 0 then
    perform public._post_journal(new.collected_on, 'milk_collection', new.id::text, 'Milk collection ' || new.collection_no,
      'milk:' || new.id, jsonb_build_array(public._jl('1200', new.amount), public._jl('2000', -new.amount, 'supplier', new.supplier_id::text)));
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' and new.amount > 0 then
    perform public._post_journal(public.ist_today(), 'milk_collection', new.id::text, 'Cancelled milk collection ' || new.collection_no,
      'milk-cancel:' || new.id, jsonb_build_array(public._jl('2000', new.amount, 'supplier', new.supplier_id::text), public._jl('1200', -new.amount)),
      (select id from public.journal_entries where posting_key = 'milk:' || new.id), new.cancel_reason);
  end if;
  return null;
end;
$$;
create trigger milk_collections_post_gl after insert or update of status on public.milk_collections
  for each row execute function public._gl_milk_collection();

-- Purchases --------------------------------------------------------------------------------
create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  purchase_no text not null unique,
  supplier_id uuid not null references public.suppliers,
  invoice_no text not null,
  invoice_date date not null,
  due_date date,
  is_interstate boolean not null default false,
  taxable_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  freight numeric(14, 2) not null default 0 check (freight >= 0),
  other_charges numeric(14, 2) not null default 0 check (other_charges >= 0),
  round_off numeric(8, 2) not null default 0 check (abs(round_off) < 1),
  total numeric(14, 2) not null,
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  document_url text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  unique (supplier_id, invoice_no)
);
create index purchase_invoices_date_idx on public.purchase_invoices (invoice_date desc);

create table public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices on delete cascade,
  line_no integer not null,
  item_id uuid references public.items,
  account_code text references public.ledger_accounts,
  description text,
  qty numeric(14, 3) not null check (qty > 0),
  rate numeric(14, 4) not null check (rate >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  gst_rate numeric(5, 2) not null default 0 check (gst_rate between 0 and 40),
  taxable numeric(14, 2) not null,
  tax numeric(14, 2) not null,
  landed_cost numeric(14, 2),
  lot_id uuid references public.stock_lots,
  check ((item_id is null) <> (account_code is null))
);
create index purchase_invoice_lines_invoice_idx on public.purchase_invoice_lines (invoice_id);

-- p_header: {supplier_id, invoice_no, invoice_date, due_date, is_interstate, freight, other_charges, round_off, notes, document_url}
-- p_lines:  [{item_id | account_code, description, qty, rate, discount, gst_rate, expiry_date, supplier_lot}]
create function public.fin_post_purchase_invoice(p_header jsonb, p_lines jsonb, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := gen_random_uuid();
  sup public.suppliers;
  e jsonb;
  n integer := 0;
  v_taxable numeric;
  v_tax numeric;
  v_taxable_total numeric := 0;
  v_stock_taxable numeric := 0;
  v_tax_total numeric := 0;
  v_charges numeric := coalesce((p_header ->> 'freight')::numeric, 0) + coalesce((p_header ->> 'other_charges')::numeric, 0);
  v_round_off numeric := coalesce((p_header ->> 'round_off')::numeric, 0);
  v_registered boolean := coalesce((public.setting('tax.gst_registered') #>> '{}')::boolean, true);
  v_interstate boolean := coalesce((p_header ->> 'is_interstate')::boolean, false);
  v_inv_date date := (p_header ->> 'invoice_date')::date;
  l record;
  v_share numeric;
  v_landed numeric;
  lot uuid;
  jl jsonb := '[]';
  v_total numeric;
  pno text;
begin
  perform public.require_permission('purchases', 'create');
  perform public._claim_request_key(p_key, 'fin_post_purchase_invoice');
  select * into sup from public.suppliers where id = (p_header ->> 'supplier_id')::uuid and is_active;
  if not found then
    raise exception 'Choose an active supplier';
  end if;
  if coalesce(trim(p_header ->> 'invoice_no'), '') = '' or v_inv_date is null then
    raise exception 'Enter the supplier''s invoice number and date';
  end if;
  if v_inv_date > public.ist_today() then
    raise exception 'Invoice date cannot be in the future';
  end if;
  if exists (select 1 from public.purchase_invoices where supplier_id = sup.id and invoice_no = trim(p_header ->> 'invoice_no')) then
    raise exception 'Invoice % from % is already recorded', trim(p_header ->> 'invoice_no'), sup.name using errcode = '23505';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then
    raise exception 'Add at least one line';
  end if;

  pno := public.next_doc_number('purchase', 'MW-PUR', public.financial_year(v_inv_date), 5);
  insert into public.purchase_invoices (id, purchase_no, supplier_id, invoice_no, invoice_date, due_date, is_interstate, freight, other_charges,
    round_off, total, notes, document_url)
  values (pid, pno, sup.id, trim(p_header ->> 'invoice_no'), v_inv_date,
    coalesce((p_header ->> 'due_date')::date, v_inv_date + sup.payment_terms_days), v_interstate,
    coalesce((p_header ->> 'freight')::numeric, 0), coalesce((p_header ->> 'other_charges')::numeric, 0), v_round_off, 0,
    nullif(trim(coalesce(p_header ->> 'notes', '')), ''), nullif(trim(coalesce(p_header ->> 'document_url', '')), ''));

  for e in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    if (e ->> 'item_id') is not null then
      if not exists (select 1 from public.items where id = (e ->> 'item_id')::uuid and is_active and item_type <> 'finished_good') then
        raise exception 'Line %: choose an active stock item you buy (finished goods are made, not bought)', n;
      end if;
    elsif not exists (select 1 from public.ledger_accounts where code = e ->> 'account_code' and is_active
                        and ((type = 'expense' and subtype is distinct from 'cogs') or (type = 'asset' and subtype = 'fixed_asset'))) then
      -- Stock, cost of goods sold, tax and money accounts move only through their own documents.
      raise exception 'Line %: choose a stock item or an expense / fixed-asset account', n;
    end if;
    if coalesce((e ->> 'qty')::numeric, 0) <= 0 or coalesce((e ->> 'rate')::numeric, -1) < 0 then
      raise exception 'Line %: enter quantity and rate', n;
    end if;
    v_taxable := round((e ->> 'qty')::numeric * (e ->> 'rate')::numeric - coalesce((e ->> 'discount')::numeric, 0), 2);
    if v_taxable < 0 then
      raise exception 'Line %: discount is larger than the line value', n;
    end if;
    v_tax := round(v_taxable * coalesce((e ->> 'gst_rate')::numeric, 0) / 100, 2);
    insert into public.purchase_invoice_lines (invoice_id, line_no, item_id, account_code, description, qty, rate, discount, gst_rate, taxable, tax)
    values (pid, n, (e ->> 'item_id')::uuid, case when (e ->> 'item_id') is null then e ->> 'account_code' end, e ->> 'description',
      (e ->> 'qty')::numeric, (e ->> 'rate')::numeric, coalesce((e ->> 'discount')::numeric, 0), coalesce((e ->> 'gst_rate')::numeric, 0), v_taxable, v_tax);
    v_taxable_total := v_taxable_total + v_taxable;
    v_tax_total := v_tax_total + v_tax;
    if (e ->> 'item_id') is not null then
      v_stock_taxable := v_stock_taxable + v_taxable;
    end if;
  end loop;

  -- Freight and other charges are part of the landed cost of stock lines (or a freight expense if none).
  for l in select pl.*, (select e2 from jsonb_array_elements(p_lines) with ordinality as x(e2, i) where x.i = pl.line_no) as src
           from public.purchase_invoice_lines pl where pl.invoice_id = pid order by pl.line_no loop
    if l.item_id is not null then
      v_share := case when v_stock_taxable > 0 then round(v_charges * l.taxable / v_stock_taxable, 2) else 0 end;
      v_landed := l.taxable + v_share + case when v_registered then 0 else l.tax end;
      lot := public._new_lot(l.item_id, l.qty, round(v_landed / l.qty, 4), 'purchase', pid::text, null, sup.id,
        (l.src ->> 'expiry_date')::date, v_inv_date, 'available', l.src ->> 'supplier_lot');
      perform public._stock_post(lot, l.qty, 'purchase_receipt', 'purchase_invoice', pid::text, pno);
      update public.purchase_invoice_lines set lot_id = lot, landed_cost = v_landed where id = l.id;
      jl := jl || public._jl(public._inventory_account(l.item_id), v_landed, null, null, 'Line ' || l.line_no);
    else
      jl := jl || public._jl(l.account_code, l.taxable + case when v_registered then 0 else l.tax end, null, null, coalesce(l.description, 'Line ' || l.line_no));
    end if;
  end loop;
  -- Rounding of the freight split goes to the last stock line's account via the rounding account.
  if v_stock_taxable = 0 and v_charges > 0 then
    jl := jl || public._jl('6030', v_charges, null, null, 'Freight and charges');
  elsif v_stock_taxable > 0 then
    jl := jl || public._jl('6990', v_charges - (select coalesce(sum(round(v_charges * pil.taxable / v_stock_taxable, 2)), 0) from public.purchase_invoice_lines pil where pil.invoice_id = pid and pil.item_id is not null));
  end if;
  if v_registered and v_tax_total > 0 then
    if v_interstate then
      jl := jl || public._jl('1302', v_tax_total);
    else
      jl := jl || public._jl('1300', round(v_tax_total / 2, 2)) || public._jl('1301', v_tax_total - round(v_tax_total / 2, 2));
    end if;
  end if;
  jl := jl || public._jl('6990', v_round_off);
  v_total := v_taxable_total + v_tax_total + v_charges + v_round_off;
  jl := jl || public._jl('2000', -v_total, 'supplier', sup.id::text, 'Invoice ' || trim(p_header ->> 'invoice_no'));
  update public.purchase_invoices set taxable_total = v_taxable_total, tax_total = v_tax_total, total = v_total where id = pid;
  perform public._post_journal(v_inv_date, 'purchase_invoice', pid::text, 'Purchase ' || pno || ' · ' || sup.name || ' inv ' || trim(p_header ->> 'invoice_no'),
    'purchase:' || pid, jl);
  perform public.write_audit('purchase.post', 'purchase_invoices', pid::text, jsonb_build_object('purchase_no', pno, 'total', v_total));
  return pid;
end;
$$;

create function public.fin_cancel_purchase_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pi public.purchase_invoices;
  l record;
  orig uuid;
  jl jsonb := '[]';
  r record;
begin
  perform public.require_permission('purchases', 'approve');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into pi from public.purchase_invoices where id = p_invoice_id for update;
  if not found or pi.status = 'cancelled' then
    raise exception 'Invoice not found or already cancelled';
  end if;
  if pi.amount_paid > 0 then
    raise exception 'This invoice has payments against it; record a supplier return / debit note instead';
  end if;
  for l in select pl.*, sl.qty_on_hand, sl.qty_received from public.purchase_invoice_lines pl left join public.stock_lots sl on sl.id = pl.lot_id
           where pl.invoice_id = pi.id and pl.lot_id is not null loop
    if l.qty_on_hand <> l.qty_received then
      raise exception 'Stock from line % has already been used; record a supplier return instead', l.line_no;
    end if;
    perform public._stock_post(l.lot_id, -l.qty_on_hand, 'reversal', 'purchase_invoice', pi.id::text, pi.purchase_no, p_reason, 0, true);
  end loop;
  select id into orig from public.journal_entries where posting_key = 'purchase:' || pi.id;
  for r in select * from public.journal_lines where entry_id = orig loop
    jl := jl || jsonb_build_object('account', r.account_code, 'debit', r.credit, 'credit', r.debit, 'party_type', r.party_type, 'party_id', r.party_id);
  end loop;
  perform public._post_journal(public.ist_today(), 'purchase_invoice', pi.id::text, 'Cancelled purchase ' || pi.purchase_no, 'purchase-cancel:' || pi.id, jl, orig, p_reason);
  update public.purchase_invoices set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason where id = pi.id;
  perform public.write_audit('purchase.cancel', 'purchase_invoices', pi.id::text, null, p_reason);
end;
$$;

-- Return purchased stock to the supplier (debit note).
create function public.fin_supplier_return(p_invoice_id uuid, p_lines jsonb, p_reason text, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pi public.purchase_invoices;
  e jsonb;
  pl public.purchase_invoice_lines;
  lot public.stock_lots;
  qty numeric;
  value numeric;
  tax numeric;
  total numeric := 0;
  tax_total numeric := 0;
  jl jsonb := '[]';
  rid uuid := gen_random_uuid();
  registered boolean := coalesce((public.setting('tax.gst_registered') #>> '{}')::boolean, true);
begin
  perform public.require_permission('purchases', 'edit');
  perform public._claim_request_key(p_key, 'fin_supplier_return');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into pi from public.purchase_invoices where id = p_invoice_id and status = 'posted';
  if not found then
    raise exception 'Purchase invoice not found';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select * into pl from public.purchase_invoice_lines where id = (e ->> 'line_id')::uuid and invoice_id = pi.id and lot_id is not null;
    if not found then
      raise exception 'Choose stock lines of this invoice';
    end if;
    qty := (e ->> 'qty')::numeric;
    select * into lot from public.stock_lots where id = pl.lot_id;
    perform public._stock_post(pl.lot_id, -qty, 'supplier_return', 'supplier_return', rid::text, pi.purchase_no, p_reason, 0, true);
    value := round(qty * lot.unit_cost, 2);
    tax := case when registered then round(qty * pl.rate * pl.gst_rate / 100, 2) else 0 end;
    jl := jl || public._jl(public._inventory_account(pl.item_id), -value);
    total := total + value + tax;
    tax_total := tax_total + tax;
  end loop;
  if total = 0 then
    raise exception 'Nothing to return';
  end if;
  if tax_total > 0 then
    if pi.is_interstate then
      jl := jl || public._jl('1302', -tax_total);
    else
      jl := jl || public._jl('1300', -round(tax_total / 2, 2)) || public._jl('1301', -(tax_total - round(tax_total / 2, 2)));
    end if;
  end if;
  jl := jl || public._jl('2000', total, 'supplier', pi.supplier_id::text, 'Debit note on ' || pi.invoice_no);
  perform public._post_journal(public.ist_today(), 'supplier_return', rid::text, 'Supplier return on ' || pi.purchase_no, 'supplier-return:' || rid, jl, null, p_reason);
  perform public.write_audit('purchase.return', 'purchase_invoices', pi.id::text, jsonb_build_object('lines', p_lines, 'value', total), p_reason);
  return rid;
end;
$$;

-- Payments in and out -------------------------------------------------------------------
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique references public.ledger_accounts,
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'upi', 'gateway')),
  bank_name text,
  account_masked text,
  is_active boolean not null default true
);
insert into public.bank_accounts (account_code, name, kind) values
  ('1000', 'Cash in hand', 'cash'), ('1010', 'Bank — current account', 'bank'), ('1020', 'Razorpay settlements', 'gateway');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  direction text not null check (direction in ('in', 'out')),
  party_type text not null check (party_type in ('customer', 'supplier', 'employee', 'other')),
  party_id text,
  party_name text,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null,
  method text not null check (method in ('cash', 'bank_transfer', 'upi', 'cheque', 'razorpay', 'card', 'other')),
  account_code text not null references public.ledger_accounts,
  reference text,
  notes text,
  entry_id uuid references public.journal_entries,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index payments_party_idx on public.payments (party_type, party_id);
create index payments_date_idx on public.payments (paid_on desc);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments on delete cascade,
  doc_type text not null check (doc_type in ('purchase_invoice', 'milk_collection', 'order', 'expense')),
  doc_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0)
);
create index payment_allocations_doc_idx on public.payment_allocations (doc_type, doc_id);

create trigger payments_append_only before update or delete on public.payments for each row execute function public.reject_change();
create trigger payment_allocations_append_only before update or delete on public.payment_allocations for each row execute function public.reject_change();

create function public._check_money_account(p_code text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.bank_accounts where account_code = p_code and is_active) then
    raise exception 'Choose a cash or bank account';
  end if;
end;
$$;

-- Pay a supplier. Allocations: [{doc_type: purchase_invoice | milk_collection, doc_id, amount}].
create function public.fin_pay_supplier(p_supplier_id uuid, p_amount numeric, p_paid_on date, p_method text, p_account_code text,
  p_reference text default null, p_allocations jsonb default '[]', p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sup public.suppliers;
  pid uuid := gen_random_uuid();
  no text;
  e jsonb;
  outstanding numeric;
  alloc_total numeric := 0;
  eid uuid;
begin
  perform public.require_permission('purchases', 'edit');
  perform public._claim_request_key(p_key, 'fin_pay_supplier');
  perform public._check_money_account(p_account_code);
  select * into sup from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Supplier not found';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount paid';
  end if;
  no := public.next_doc_number('payment', 'MW-PAY', public.financial_year(p_paid_on), 5);
  insert into public.payments (id, payment_no, direction, party_type, party_id, party_name, amount, paid_on, method, account_code, reference)
  values (pid, no, 'out', 'supplier', sup.id::text, sup.name, p_amount, p_paid_on, p_method, p_account_code, nullif(trim(coalesce(p_reference, '')), ''));
  for e in select * from jsonb_array_elements(coalesce(p_allocations, '[]')) loop
    if e ->> 'doc_type' = 'purchase_invoice' then
      select total - amount_paid into outstanding from public.purchase_invoices where id = (e ->> 'doc_id')::uuid and supplier_id = sup.id and status = 'posted' for update;
      if outstanding is null then raise exception 'Invoice not found for this supplier'; end if;
      if (e ->> 'amount')::numeric > outstanding then raise exception 'Allocation is more than the % outstanding on the invoice', outstanding; end if;
      update public.purchase_invoices set amount_paid = amount_paid + (e ->> 'amount')::numeric where id = (e ->> 'doc_id')::uuid;
    elsif e ->> 'doc_type' = 'milk_collection' then
      select amount - amount_paid into outstanding from public.milk_collections where id = (e ->> 'doc_id')::uuid and supplier_id = sup.id and status = 'posted' for update;
      if outstanding is null then raise exception 'Collection not found for this supplier'; end if;
      if (e ->> 'amount')::numeric > outstanding then raise exception 'Allocation is more than the % outstanding on the collection', outstanding; end if;
      update public.milk_collections set amount_paid = amount_paid + (e ->> 'amount')::numeric,
        payment_status = case when amount_paid + (e ->> 'amount')::numeric >= amount then 'paid' else 'partly_paid' end
      where id = (e ->> 'doc_id')::uuid;
    else
      raise exception 'Supplier payments can be allocated to purchase invoices or milk collections';
    end if;
    insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, e ->> 'doc_type', (e ->> 'doc_id')::uuid, (e ->> 'amount')::numeric);
    alloc_total := alloc_total + (e ->> 'amount')::numeric;
  end loop;
  if alloc_total > p_amount then
    raise exception 'Allocations (%) are more than the payment (%)', alloc_total, p_amount;
  end if;
  eid := public._post_journal(p_paid_on, 'payment', pid::text, 'Payment ' || no || ' to ' || sup.name, 'payment:' || pid,
    jsonb_build_array(public._jl('2000', p_amount, 'supplier', sup.id::text), public._jl(p_account_code, -p_amount)));
  perform public.write_audit('payment.supplier', 'payments', pid::text, jsonb_build_object('no', no, 'amount', p_amount, 'allocations', p_allocations));
  return pid;
end;
$$;

-- Sales accounting -------------------------------------------------------------------------
create function public._order_party(o public.orders)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(o.user_id::text, 'phone:' || o.phone)
$$;

-- GST split of an order, the same way the tax invoice shows it: delivery fee and discount are spread
-- over the lines by value, and every price includes GST.
create function public._order_tax(p_order_id uuid)
returns table (taxable_manufactured numeric, taxable_purchased numeric, tax numeric, total numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
  gross_total numeric;
  adj numeric;
  r record;
  net numeric;
  taxable numeric;
  allocated numeric := 0;
  n integer;
  i integer := 0;
begin
  select * into o from public.orders where id = p_order_id;
  select sum(unit_price * quantity), count(*) into gross_total, n from public.order_items where order_id = o.id;
  -- Delivery fee less discount, taken from the order total so the split always adds up to what the customer pays.
  adj := o.total - gross_total;
  taxable_manufactured := 0;
  taxable_purchased := 0;
  tax := 0;
  for r in
    select oi.unit_price * oi.quantity as gross, coalesce(oi.gst_rate, it.gst_rate, 0) as rate, coalesce(p.source, 'manufactured') as source
    from public.order_items oi left join public.items it on it.id = oi.item_id left join public.products p on p.id = it.product_id
    where oi.order_id = o.id order by oi.id
  loop
    i := i + 1;
    if i = n then
      net := r.gross + (adj - allocated);
    else
      net := r.gross + round(adj * r.gross / nullif(gross_total, 0), 2);
      allocated := allocated + round(adj * r.gross / nullif(gross_total, 0), 2);
    end if;
    taxable := round(net * 100 / (100 + r.rate), 2);
    tax := tax + (net - taxable);
    if r.source = 'purchased' then
      taxable_purchased := taxable_purchased + taxable;
    else
      taxable_manufactured := taxable_manufactured + taxable;
    end if;
  end loop;
  total := o.total;
  return next;
end;
$$;

create function public._post_order_sale(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  t record;
  party text;
  eid uuid;
  half numeric;
begin
  select * into o from public.orders where id = p_order_id;
  if o.invoice_number is null or o.status = 'cancelled' then
    return null;
  end if;
  select * into t from public._order_tax(o.id);
  party := public._order_party(o);
  half := round(t.tax / 2, 2);
  eid := public._post_journal(public._ist_date(coalesce(o.invoice_date, o.created_at)), 'order', o.id::text,
    'Sale ' || o.invoice_number || ' · order #' || o.order_number, 'sale:' || o.id,
    jsonb_build_array(
      public._jl('1100', o.total, 'customer', party),
      public._jl('4000', -t.taxable_manufactured),
      public._jl('4010', -t.taxable_purchased),
      public._jl('2100', -half),
      public._jl('2101', -(t.tax - half)),
      public._jl('6990', -(o.total - t.taxable_manufactured - t.taxable_purchased - t.tax))));
  if o.payment_status = 'paid' and o.payment_method = 'online' then
    perform public._post_journal(public._ist_date(coalesce(o.invoice_date, o.created_at)), 'order', o.id::text,
      'Online payment · order #' || o.order_number || coalesce(' · ' || o.razorpay_payment_id, ''), 'receipt:order:' || o.id,
      jsonb_build_array(public._jl('1020', o.total), public._jl('1100', -o.total, 'customer', party)));
  end if;
  return eid;
end;
$$;

-- Postings triggered by the storefront must never block a customer's order. If one fails, it is
-- logged here and finance re-posts it (fin_retry_postings) once the cause is fixed.
create table public.posting_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source_type text not null,
  source_id text not null,
  error text not null,
  resolved_at timestamptz
);

create function public._gl_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  orig uuid;
  jl jsonb := '[]';
  r record;
begin
  if new.invoice_number is not null and (old.invoice_number is null or (new.payment_status = 'paid' and old.payment_status is distinct from 'paid')) then
    begin
      perform public._post_order_sale(new.id);
    exception when others then
      insert into public.posting_errors (source_type, source_id, error) values ('order', new.id::text, sqlerrm);
    end;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select id into orig from public.journal_entries where posting_key = 'sale:' || new.id;
    if orig is not null then
      for r in select * from public.journal_lines where entry_id = orig loop
        jl := jl || jsonb_build_object('account', case when r.account_code in ('4000', '4010') then '4095' else r.account_code end,
          'debit', r.credit, 'credit', r.debit, 'party_type', r.party_type, 'party_id', r.party_id);
      end loop;
      perform public._post_journal(public.ist_today(), 'order', new.id::text, 'Cancelled order #' || new.order_number || ' (credit note)',
        'sale-cancel:' || new.id, jl, orig, 'Order cancelled');
    end if;
  end if;
  return null;
end;
$$;
create trigger orders_post_gl after update of invoice_number, payment_status, status on public.orders
  for each row execute function public._gl_order();

-- Cash collected on delivery.
create function public._gl_dispatch_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  amt numeric := coalesce(new.cash_collected, 0) - coalesce(old.cash_collected, 0);
begin
  if amt <= 0 then
    return null;
  end if;
  select * into o from public.orders where id = new.order_id;
  begin
    perform public._post_journal(public.ist_today(), 'dispatch', new.id::text, 'Collected on delivery ' || new.dispatch_no || ' · order #' || o.order_number,
      'receipt:dispatch:' || new.id || ':' || coalesce(old.cash_collected, 0),
      jsonb_build_array(public._jl(case new.collection_method when 'cash' then '1000' else '1010' end, amt),
        public._jl('1100', -amt, 'customer', public._order_party(o))));
  exception when others then
    insert into public.posting_errors (source_type, source_id, error) values ('dispatch_collection', new.id::text, sqlerrm);
  end;
  return null;
end;
$$;
create trigger dispatches_post_gl after update of cash_collected on public.dispatches
  for each row execute function public._gl_dispatch_collection();

-- Customer receipts outside delivery (bank transfer, UPI, settling a balance).
create function public.fin_receive_customer_payment(p_order_id uuid, p_amount numeric, p_paid_on date, p_method text, p_account_code text,
  p_reference text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  pid uuid := gen_random_uuid();
  no text;
  eid uuid;
begin
  perform public.require_permission('sales', 'create');
  perform public._claim_request_key(p_key, 'fin_receive_customer_payment');
  perform public._check_money_account(p_account_code);
  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter the amount received';
  end if;
  no := public.next_doc_number('receipt', 'MW-RCT', public.financial_year(p_paid_on), 5);
  eid := public._post_journal(p_paid_on, 'payment', pid::text, 'Receipt ' || no || ' · order #' || o.order_number, 'payment:' || pid,
    jsonb_build_array(public._jl(p_account_code, p_amount), public._jl('1100', -p_amount, 'customer', public._order_party(o))));
  insert into public.payments (id, payment_no, direction, party_type, party_id, party_name, amount, paid_on, method, account_code, reference, entry_id)
  values (pid, no, 'in', 'customer', public._order_party(o), o.customer_name, p_amount, p_paid_on, p_method, p_account_code, p_reference, eid);
  insert into public.payment_allocations (payment_id, doc_type, doc_id, amount) values (pid, 'order', o.id, p_amount);
  perform public.write_audit('payment.customer', 'payments', pid::text, jsonb_build_object('order', o.order_number, 'amount', p_amount));
  return pid;
end;
$$;

-- Credit note (e.g. returned or short-delivered goods) and refund.
create function public.fin_credit_note(p_order_id uuid, p_amount numeric, p_reason text, p_refund_account text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  rate numeric;
  taxable numeric;
  tax numeric;
  half numeric;
  cid uuid := gen_random_uuid();
  no text;
  party text;
begin
  perform public.require_permission('sales', 'approve');
  perform public._claim_request_key(p_key, 'fin_credit_note');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason';
  end if;
  select * into o from public.orders where id = p_order_id and invoice_number is not null;
  if not found then
    raise exception 'Credit notes are issued against an invoiced order';
  end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > o.total then
    raise exception 'Credit note amount must be between 0 and the order total';
  end if;
  select coalesce(max(coalesce(oi.gst_rate, 0)), 0) into rate from public.order_items oi where oi.order_id = o.id;
  taxable := round(p_amount * 100 / (100 + rate), 2);
  tax := p_amount - taxable;
  half := round(tax / 2, 2);
  party := public._order_party(o);
  no := public.next_doc_number('credit_note', 'MW-CN', public.financial_year(public.ist_today()), 5);
  perform public._post_journal(public.ist_today(), 'credit_note', cid::text, 'Credit note ' || no || ' · order #' || o.order_number, 'credit-note:' || cid,
    jsonb_build_array(public._jl('4095', taxable), public._jl('2100', half), public._jl('2101', tax - half), public._jl('1100', -p_amount, 'customer', party)),
    null, p_reason);
  if p_refund_account is not null then
    perform public._check_money_account(p_refund_account);
    perform public._post_journal(public.ist_today(), 'refund', cid::text, 'Refund for ' || no, 'refund:' || cid,
      jsonb_build_array(public._jl('1100', p_amount, 'customer', party), public._jl(p_refund_account, -p_amount)), null, p_reason);
  end if;
  perform public.write_audit('sales.credit_note', 'orders', o.id::text, jsonb_build_object('no', no, 'amount', p_amount, 'refunded', p_refund_account is not null), p_reason);
  return cid;
end;
$$;

-- Expenses -----------------------------------------------------------------------------------
create table public.expense_categories (
  code text primary key,
  label text not null,
  account_code text not null references public.ledger_accounts,
  is_active boolean not null default true
);
insert into public.expense_categories (code, label, account_code) values
  ('electricity', 'Electricity', '6000'), ('fuel', 'Fuel', '6010'), ('boiler', 'Boiler expenses', '6020'),
  ('transport', 'Transportation', '6030'), ('repairs', 'Repairs and maintenance', '6040'), ('rent', 'Rent', '6050'),
  ('telephone', 'Telephone and internet', '6060'), ('office', 'Office expenses', '6070'), ('marketing', 'Marketing', '6080'),
  ('packaging', 'Packaging (not stocked)', '6090'), ('employee', 'Employee expenses', '6100'), ('bank_charges', 'Bank and gateway charges', '6950'),
  ('other', 'Other operating expenses', '6900');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  expense_date date not null,
  category_code text not null references public.expense_categories,
  amount numeric(14, 2) not null check (amount > 0),
  gst_amount numeric(14, 2) not null default 0 check (gst_amount >= 0),
  payee text not null,
  description text,
  paid_from text references public.ledger_accounts,
  payment_method text check (payment_method in ('cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other')),
  reference text,
  document_url text,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'rejected', 'cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  decision_note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (gst_amount <= amount)
);
create index expenses_date_idx on public.expenses (expense_date desc);

create function public._post_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.expenses;
  acct text;
  registered boolean := coalesce((public.setting('tax.gst_registered') #>> '{}')::boolean, true);
  gst numeric;
begin
  select * into x from public.expenses where id = p_expense_id;
  select account_code into acct from public.expense_categories where code = x.category_code;
  gst := case when registered then x.gst_amount else 0 end;
  perform public._post_journal(x.expense_date, 'expense', x.id::text, 'Expense ' || x.expense_no || ' · ' || x.payee, 'expense:' || x.id,
    jsonb_build_array(public._jl(acct, x.amount - gst, null, null, x.description), public._jl('1300', round(gst / 2, 2)), public._jl('1301', gst - round(gst / 2, 2)),
      public._jl(coalesce(x.paid_from, '2050'), -x.amount, case when x.paid_from is null then 'other' end, case when x.paid_from is null then x.payee end)));
end;
$$;

create function public.fin_record_expense(p_date date, p_category text, p_amount numeric, p_payee text, p_description text default null,
  p_paid_from text default null, p_payment_method text default null, p_gst_amount numeric default 0, p_reference text default null,
  p_document_url text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  xid uuid := gen_random_uuid();
  no text;
  needs_approval boolean := p_amount > public.setting_num('finance.expense_approval_limit', 5000);
begin
  perform public.require_permission('expenses', 'create');
  perform public._claim_request_key(p_key, 'fin_record_expense');
  if p_date is null or p_date > public.ist_today() then
    raise exception 'Enter a valid expense date';
  end if;
  if coalesce(trim(p_payee), '') = '' then
    raise exception 'Enter who was paid';
  end if;
  if p_paid_from is not null then
    perform public._check_money_account(p_paid_from);
  end if;
  no := public.next_doc_number('expense', 'MW-EXP', public.financial_year(p_date), 5);
  insert into public.expenses (id, expense_no, expense_date, category_code, amount, gst_amount, payee, description, paid_from, payment_method, reference, document_url, status)
  values (xid, no, p_date, p_category, p_amount, coalesce(p_gst_amount, 0), trim(p_payee), nullif(trim(coalesce(p_description, '')), ''), p_paid_from,
    p_payment_method, nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_document_url, '')), ''),
    case when needs_approval then 'pending_approval' else 'approved' end);
  if not needs_approval then
    update public.expenses set approved_at = now(), decision_note = 'Within the approval limit' where id = xid;
    perform public._post_expense(xid);
  end if;
  perform public.write_audit('expense.record', 'expenses', xid::text, jsonb_build_object('no', no, 'amount', p_amount, 'needs_approval', needs_approval));
  return xid;
end;
$$;

create function public.fin_decide_expense(p_expense_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.expenses;
begin
  perform public.require_permission('expenses', 'approve');
  select * into x from public.expenses where id = p_expense_id for update;
  if not found or x.status <> 'pending_approval' then
    raise exception 'This expense is not waiting for approval';
  end if;
  if x.created_by = auth.uid() and not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'Someone else must approve an expense you recorded';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for rejecting';
  end if;
  update public.expenses set status = case when p_approve then 'approved' else 'rejected' end, approved_by = auth.uid(), approved_at = now(),
    decision_note = p_note where id = x.id;
  if p_approve then
    perform public._post_expense(x.id);
  end if;
  perform public.write_audit(case when p_approve then 'expense.approve' else 'expense.reject' end, 'expenses', x.id::text, null, p_note);
end;
$$;

-- Employees and payroll (sensitive: payroll permission only) ------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  department text,
  designation text,
  joining_date date not null,
  leaving_date date,
  phone text,
  user_id uuid references public.profiles (id) on delete set null,
  pay_type text not null default 'monthly' check (pay_type in ('monthly', 'daily')),
  monthly_salary numeric(12, 2) check (monthly_salary >= 0),
  daily_rate numeric(10, 2) check (daily_rate >= 0),
  -- Configured components: [{name, kind: earning|deduction, amount}] — no statutory rule is assumed.
  salary_components jsonb not null default '[]',
  overtime_rate_per_hour numeric(10, 2) not null default 0 check (overtime_rate_per_hour >= 0),
  bank_account_masked text,
  is_active boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pay_type = 'monthly' and monthly_salary is not null) or (pay_type = 'daily' and daily_rate is not null))
);

create table public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees,
  advance_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  recovered numeric(12, 2) not null default 0 check (recovered >= 0),
  reason text,
  paid_from text not null references public.ledger_accounts,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (recovered <= amount)
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  run_no text not null unique,
  period_start date not null unique check (extract(day from period_start) = 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'cancelled')),
  total_gross numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null default 0,
  total_net numeric(14, 2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  paid_from text references public.ledger_accounts,
  payment_reference text
);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs on delete cascade,
  employee_id uuid not null references public.employees,
  days_in_period integer not null,
  days_payable numeric(5, 2) not null,
  base_pay numeric(12, 2) not null default 0,
  component_earnings numeric(12, 2) not null default 0,
  overtime_hours numeric(6, 2) not null default 0,
  overtime_pay numeric(12, 2) not null default 0,
  other_earnings numeric(12, 2) not null default 0,
  component_deductions numeric(12, 2) not null default 0,
  advance_recovery numeric(12, 2) not null default 0,
  other_deductions numeric(12, 2) not null default 0,
  gross numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null default 0,
  note text,
  unique (run_id, employee_id),
  check (net_pay >= 0)
);

create function public._payroll_recalc(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.payroll_lines;
  emp public.employees;
  earn numeric := 0;
  ded numeric := 0;
  c jsonb;
  ratio numeric;
begin
  select * into l from public.payroll_lines where id = p_line_id;
  select * into emp from public.employees where id = l.employee_id;
  ratio := l.days_payable / l.days_in_period;
  for c in select * from jsonb_array_elements(emp.salary_components) loop
    if c ->> 'kind' = 'earning' then earn := earn + round(coalesce((c ->> 'amount')::numeric, 0) * ratio, 2);
    elsif c ->> 'kind' = 'deduction' then ded := ded + round(coalesce((c ->> 'amount')::numeric, 0), 2);
    end if;
  end loop;
  update public.payroll_lines set
    base_pay = case when emp.pay_type = 'monthly' then round(emp.monthly_salary * ratio, 2) else round(emp.daily_rate * l.days_payable, 2) end,
    component_earnings = earn,
    overtime_pay = round(l.overtime_hours * emp.overtime_rate_per_hour, 2),
    component_deductions = ded
  where id = l.id;
  update public.payroll_lines set gross = base_pay + component_earnings + overtime_pay + other_earnings,
    net_pay = base_pay + component_earnings + overtime_pay + other_earnings - component_deductions - advance_recovery - other_deductions
  where id = l.id;
end;
$$;

create function public._payroll_totals(p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payroll_runs r set
    total_gross = coalesce((select sum(gross) from public.payroll_lines where run_id = r.id), 0),
    total_deductions = coalesce((select sum(component_deductions + advance_recovery + other_deductions) from public.payroll_lines where run_id = r.id), 0),
    total_net = coalesce((select sum(net_pay) from public.payroll_lines where run_id = r.id), 0)
  where r.id = p_run_id
$$;

create function public.pay_save_employee(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid := (p ->> 'id')::uuid;
begin
  if eid is null then
    perform public.require_permission('payroll', 'create');
    insert into public.employees (employee_code, full_name, department, designation, joining_date, phone, pay_type, monthly_salary, daily_rate,
      salary_components, overtime_rate_per_hour, bank_account_masked, notes)
    values (upper(public._text(p, 'employee_code')), public._text(p, 'full_name'), public._text(p, 'department'), public._text(p, 'designation'),
      (p ->> 'joining_date')::date, public._text(p, 'phone'), coalesce(public._text(p, 'pay_type'), 'monthly'), (p ->> 'monthly_salary')::numeric,
      (p ->> 'daily_rate')::numeric, coalesce(p -> 'salary_components', '[]'), coalesce((p ->> 'overtime_rate_per_hour')::numeric, 0),
      public._text(p, 'bank_account_masked'), public._text(p, 'notes'))
    returning id into eid;
    perform public.write_audit('employee.create', 'employees', eid::text, p - 'bank_account_masked');
  else
    perform public.require_permission('payroll', 'edit');
    update public.employees set
      full_name = coalesce(public._text(p, 'full_name'), full_name),
      department = case when p ? 'department' then public._text(p, 'department') else department end,
      designation = case when p ? 'designation' then public._text(p, 'designation') else designation end,
      leaving_date = case when p ? 'leaving_date' then (p ->> 'leaving_date')::date else leaving_date end,
      phone = case when p ? 'phone' then public._text(p, 'phone') else phone end,
      monthly_salary = case when p ? 'monthly_salary' then (p ->> 'monthly_salary')::numeric else monthly_salary end,
      daily_rate = case when p ? 'daily_rate' then (p ->> 'daily_rate')::numeric else daily_rate end,
      salary_components = coalesce(p -> 'salary_components', salary_components),
      overtime_rate_per_hour = coalesce((p ->> 'overtime_rate_per_hour')::numeric, overtime_rate_per_hour),
      bank_account_masked = case when p ? 'bank_account_masked' then public._text(p, 'bank_account_masked') else bank_account_masked end,
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      notes = case when p ? 'notes' then public._text(p, 'notes') else notes end,
      updated_at = now()
    where id = eid;
    perform public.write_audit('employee.update', 'employees', eid::text, p - 'bank_account_masked');
  end if;
  return eid;
end;
$$;

create function public.pay_record_advance(p_employee_id uuid, p_amount numeric, p_date date, p_paid_from text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  aid uuid := gen_random_uuid();
begin
  perform public.require_permission('payroll', 'create');
  perform public._check_money_account(p_paid_from);
  if not exists (select 1 from public.employees where id = p_employee_id and is_active) then
    raise exception 'Choose an active employee';
  end if;
  insert into public.employee_advances (id, employee_id, advance_date, amount, reason, paid_from) values (aid, p_employee_id, p_date, p_amount, p_reason, p_paid_from);
  perform public._post_journal(p_date, 'employee_advance', aid::text, 'Salary advance', 'advance:' || aid,
    jsonb_build_array(public._jl('1150', p_amount, 'employee', p_employee_id::text), public._jl(p_paid_from, -p_amount)));
  perform public.write_audit('payroll.advance', 'employee_advances', aid::text, jsonb_build_object('employee_id', p_employee_id, 'amount', p_amount), p_reason);
  return aid;
end;
$$;

create function public.pay_create_run(p_period_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid := gen_random_uuid();
  days integer := extract(day from (date_trunc('month', p_period_start) + interval '1 month - 1 day'))::int;
  emp record;
  lid uuid;
begin
  perform public.require_permission('payroll', 'create');
  if extract(day from p_period_start) <> 1 then
    raise exception 'A payroll period starts on the 1st of a month';
  end if;
  insert into public.payroll_runs (id, run_no, period_start) values (rid, 'MW-SAL-' || to_char(p_period_start, 'YYYY-MM'), p_period_start);
  for emp in
    select * from public.employees
    where is_active and joining_date <= (p_period_start + days - 1) and (leaving_date is null or leaving_date >= p_period_start)
  loop
    insert into public.payroll_lines (run_id, employee_id, days_in_period, days_payable)
    values (rid, emp.id, days,
      -- Part months for joiners/leavers; full attendance otherwise (edit from attendance before approving).
      (least(coalesce(emp.leaving_date, p_period_start + days - 1), p_period_start + days - 1) - greatest(emp.joining_date, p_period_start) + 1))
    returning id into lid;
    perform public._payroll_recalc(lid);
  end loop;
  perform public._payroll_totals(rid);
  perform public.write_audit('payroll.create', 'payroll_runs', rid::text, jsonb_build_object('period', p_period_start));
  return rid;
end;
$$;

create function public.pay_update_line(p_line_id uuid, p_days_payable numeric, p_overtime_hours numeric default 0, p_other_earnings numeric default 0,
  p_advance_recovery numeric default 0, p_other_deductions numeric default 0, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.payroll_lines;
  st text;
  open_advances numeric;
begin
  perform public.require_permission('payroll', 'edit');
  select * into l from public.payroll_lines where id = p_line_id for update;
  if not found then
    raise exception 'Payroll line not found';
  end if;
  select status into st from public.payroll_runs where id = l.run_id;
  if st <> 'draft' then
    raise exception 'An approved payroll cannot be edited';
  end if;
  if p_days_payable < 0 or p_days_payable > l.days_in_period then
    raise exception 'Days payable must be between 0 and %', l.days_in_period;
  end if;
  select coalesce(sum(amount - recovered), 0) into open_advances from public.employee_advances where employee_id = l.employee_id;
  if coalesce(p_advance_recovery, 0) > open_advances then
    raise exception 'Only % of advances is outstanding', open_advances;
  end if;
  update public.payroll_lines set days_payable = p_days_payable, overtime_hours = coalesce(p_overtime_hours, 0), other_earnings = coalesce(p_other_earnings, 0),
    advance_recovery = coalesce(p_advance_recovery, 0), other_deductions = coalesce(p_other_deductions, 0), note = p_note
  where id = l.id;
  perform public._payroll_recalc(l.id);
  perform public._payroll_totals(l.run_id);
end;
$$;

create function public.pay_approve_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payroll_runs;
  l record;
  remaining numeric;
  a record;
  take numeric;
  jl jsonb := '[]';
begin
  perform public.require_permission('payroll', 'approve');
  select * into r from public.payroll_runs where id = p_run_id for update;
  if not found or r.status <> 'draft' then
    raise exception 'Only a draft payroll can be approved';
  end if;
  if exists (select 1 from public.payroll_lines where run_id = r.id and net_pay < 0) then
    raise exception 'A net pay is below zero';
  end if;
  jl := jl || public._jl('6200', r.total_gross, null, null, 'Salaries ' || to_char(r.period_start, 'Mon YYYY'));
  for l in select * from public.payroll_lines where run_id = r.id loop
    jl := jl || public._jl('2200', -l.net_pay, 'employee', l.employee_id::text);
    if l.advance_recovery > 0 then
      jl := jl || public._jl('1150', -l.advance_recovery, 'employee', l.employee_id::text);
      remaining := l.advance_recovery;
      for a in select * from public.employee_advances where employee_id = l.employee_id and recovered < amount order by advance_date for update loop
        exit when remaining <= 0;
        take := least(remaining, a.amount - a.recovered);
        update public.employee_advances set recovered = recovered + take where id = a.id;
        remaining := remaining - take;
      end loop;
    end if;
    jl := jl || public._jl('2210', -(l.component_deductions + l.other_deductions), 'employee', l.employee_id::text);
  end loop;
  perform public._post_journal((r.period_start + interval '1 month - 1 day')::date, 'payroll', r.id::text, 'Payroll ' || r.run_no, 'payroll:' || r.id, jl);
  update public.payroll_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = r.id;
  perform public.write_audit('payroll.approve', 'payroll_runs', r.id::text, jsonb_build_object('gross', r.total_gross, 'net', r.total_net));
end;
$$;

create function public.pay_mark_paid(p_run_id uuid, p_paid_on date, p_paid_from text, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payroll_runs;
  jl jsonb := '[]';
  l record;
begin
  perform public.require_permission('payroll', 'approve');
  perform public._check_money_account(p_paid_from);
  select * into r from public.payroll_runs where id = p_run_id for update;
  if not found or r.status <> 'approved' then
    raise exception 'Approve the payroll before paying it';
  end if;
  for l in select * from public.payroll_lines where run_id = r.id and net_pay > 0 loop
    jl := jl || public._jl('2200', l.net_pay, 'employee', l.employee_id::text);
  end loop;
  jl := jl || public._jl(p_paid_from, -r.total_net);
  perform public._post_journal(p_paid_on, 'payroll_payment', r.id::text, 'Salaries paid ' || r.run_no, 'payroll-paid:' || r.id, jl);
  update public.payroll_runs set status = 'paid', paid_at = now(), paid_from = p_paid_from, payment_reference = p_reference where id = r.id;
  perform public.write_audit('payroll.paid', 'payroll_runs', r.id::text, jsonb_build_object('net', r.total_net, 'from', p_paid_from), p_reference);
end;
$$;

-- Cash and bank -------------------------------------------------------------------------------
create table public.bank_reconciliations (
  journal_line_id bigint primary key references public.journal_lines,
  statement_date date not null,
  statement_ref text,
  reconciled_by uuid default auth.uid(),
  reconciled_at timestamptz not null default now()
);

create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null,
  account_code text not null references public.ledger_accounts,
  counted numeric(14, 2) not null,
  book_balance numeric(14, 2) not null,
  difference numeric(14, 2) generated always as (counted - book_balance) stored,
  notes text,
  counted_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create function public._account_balance(p_code text, p_to date default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.debit - l.credit), 0)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = p_code and (p_to is null or e.entry_date <= p_to)
$$;

create function public.fin_transfer(p_from text, p_to text, p_amount numeric, p_date date, p_reference text default null, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid := gen_random_uuid();
begin
  perform public.require_permission('banking', 'create');
  perform public._claim_request_key(p_key, 'fin_transfer');
  perform public._check_money_account(p_from);
  perform public._check_money_account(p_to);
  if p_from = p_to or coalesce(p_amount, 0) <= 0 then
    raise exception 'Choose two different accounts and an amount';
  end if;
  perform public._post_journal(p_date, 'transfer', tid::text, coalesce(p_reference, 'Transfer'), 'transfer:' || tid,
    jsonb_build_array(public._jl(p_to, p_amount), public._jl(p_from, -p_amount)));
  perform public.write_audit('bank.transfer', 'journal_entries', tid::text, jsonb_build_object('from', p_from, 'to', p_to, 'amount', p_amount));
  return tid;
end;
$$;

create function public.fin_reconcile(p_line_ids bigint[], p_statement_date date, p_statement_ref text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_permission('banking', 'approve');
  insert into public.bank_reconciliations (journal_line_id, statement_date, statement_ref)
  select l.id, p_statement_date, p_statement_ref from public.journal_lines l
  where l.id = any (p_line_ids) and l.account_code in (select account_code from public.bank_accounts where kind in ('bank', 'gateway', 'upi'))
  on conflict do nothing;
  get diagnostics n = row_count;
  perform public.write_audit('bank.reconcile', 'bank_reconciliations', null, jsonb_build_object('lines', n, 'statement_date', p_statement_date), p_statement_ref);
  return n;
end;
$$;

create function public.fin_cash_count(p_account_code text, p_counted numeric, p_date date default null, p_notes text default null, p_post_difference boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := gen_random_uuid();
  book numeric := public._account_balance(p_account_code, coalesce(p_date, public.ist_today()));
  diff numeric := p_counted - book;
begin
  perform public.require_permission('banking', 'create');
  perform public._check_money_account(p_account_code);
  insert into public.cash_counts (id, count_date, account_code, counted, book_balance, notes)
  values (cid, coalesce(p_date, public.ist_today()), p_account_code, p_counted, book, p_notes);
  if p_post_difference and diff <> 0 then
    perform public.require_permission('banking', 'approve');
    perform public._post_journal(coalesce(p_date, public.ist_today()), 'cash_count', cid::text, 'Cash count difference', 'cash-count:' || cid,
      jsonb_build_array(public._jl(p_account_code, diff), public._jl('6990', -diff)), null, p_notes);
  end if;
  return cid;
end;
$$;

-- Accountant's journal (opening balances, accruals, corrections).
create function public.fin_manual_journal(p_date date, p_memo text, p_lines jsonb, p_key text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mid uuid := gen_random_uuid();
  eid uuid;
begin
  perform public.require_permission('banking', 'approve');
  perform public._claim_request_key(p_key, 'fin_manual_journal');
  if coalesce(trim(p_memo), '') = '' then
    raise exception 'Describe the entry';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where (e ->> 'account') in ('1200', '1210', '1220', '1230', '1240', '1250')) then
    raise exception 'Inventory accounts change only through stock movements';
  end if;
  eid := public._post_journal(p_date, 'manual', mid::text, p_memo, 'manual:' || mid, p_lines);
  perform public.write_audit('journal.manual', 'journal_entries', eid::text, jsonb_build_object('lines', p_lines), p_memo);
  return eid;
end;
$$;

-- Reverse a manual, opening or transfer entry. The original stays; the reversal is linked to it.
create function public.fin_reverse_entry(p_entry_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.journal_entries;
  jl jsonb := '[]';
  r record;
  rid uuid;
begin
  perform public.require_permission('banking', 'approve');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the reversal';
  end if;
  select * into e from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'Entry not found';
  end if;
  if e.source_type not in ('manual', 'transfer', 'cash_count') then
    raise exception 'This entry belongs to a % document; correct it through that document', e.source_type;
  end if;
  if e.reversal_of is not null then
    raise exception 'A reversal cannot itself be reversed; post a new entry';
  end if;
  if exists (select 1 from public.journal_entries where reversal_of = e.id) then
    raise exception 'This entry has already been reversed';
  end if;
  for r in select * from public.journal_lines where entry_id = e.id loop
    jl := jl || jsonb_build_object('account', r.account_code, 'debit', r.credit, 'credit', r.debit, 'party_type', r.party_type, 'party_id', r.party_id);
  end loop;
  rid := public._post_journal(public.ist_today(), e.source_type, e.source_id, 'Reversal of ' || e.entry_no, 'reversal:' || e.id, jl, e.id, p_reason);
  perform public.write_audit('journal.reverse', 'journal_entries', e.id::text, jsonb_build_object('reversal_id', rid), p_reason);
  return rid;
end;
$$;

-- Book balance of every cash, bank and gateway account, with what is not yet matched to a bank statement.
create function public.fin_money_balances(p_to date default null)
returns table (account_code text, name text, kind text, balance numeric, unreconciled numeric, last_counted date, last_count_difference numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('banking', 'view');
  return query
  select b.account_code, b.name, b.kind, public._account_balance(b.account_code, p_to),
    case when b.kind = 'cash' then null else
      (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where l.account_code = b.account_code and (p_to is null or e.entry_date <= p_to)
         and not exists (select 1 from public.bank_reconciliations r where r.journal_line_id = l.id)) end,
    (select max(c.count_date) from public.cash_counts c where c.account_code = b.account_code),
    (select c.difference from public.cash_counts c where c.account_code = b.account_code order by c.count_date desc, c.created_at desc limit 1)
  from public.bank_accounts b
  where b.is_active
  order by b.account_code;
end;
$$;

create function public.fin_retry_postings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  perform public.require_permission('sales', 'approve');
  for r in select * from public.posting_errors where resolved_at is null and source_type = 'order' loop
    begin
      perform public._post_order_sale(r.source_id::uuid);
      update public.posting_errors set resolved_at = now() where id = r.id;
      n := n + 1;
    exception when others then
      update public.posting_errors set error = sqlerrm, at = now() where id = r.id;
    end;
  end loop;
  return n;
end;
$$;

-- Reports ------------------------------------------------------------------------------------
create function public.fin_trial_balance(p_to date default null)
returns table (account_code text, name text, type text, debit numeric, credit numeric, balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return query
  select a.code, a.name, a.type, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0), coalesce(sum(l.debit - l.credit), 0)
  from public.ledger_accounts a
  left join public.journal_lines l on l.account_code = a.code
    and exists (select 1 from public.journal_entries e where e.id = l.entry_id and (p_to is null or e.entry_date <= p_to))
  group by a.code
  having coalesce(sum(l.debit), 0) <> 0 or coalesce(sum(l.credit), 0) <> 0
  order by a.code;
end;
$$;

-- Profit and loss, with cash received, purchases and expenses shown separately from profit.
create function public.fin_profit_and_loss(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rows jsonb;
  revenue numeric;
  cogs numeric;
  opex numeric;
begin
  perform public.require_permission('reports', 'view');
  with mv as (
    select a.code, a.name, a.type, a.subtype, sum(l.credit - l.debit) as net
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id join public.ledger_accounts a on a.code = l.account_code
    where e.entry_date between p_from and p_to and a.type in ('income', 'expense')
    group by a.code
  )
  select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'type', type, 'subtype', subtype,
      'amount', case when type = 'income' then net else -net end) order by code),
    coalesce(sum(net) filter (where type = 'income'), 0),
    coalesce(-sum(net) filter (where type = 'expense' and subtype = 'cogs'), 0),
    coalesce(-sum(net) filter (where type = 'expense' and subtype <> 'cogs'), 0)
  into rows, revenue, cogs, opex
  from mv;
  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'lines', coalesce(rows, '[]'),
    'net_sales', revenue, 'cost_of_goods_sold', cogs, 'gross_profit', revenue - cogs,
    'operating_expenses', opex, 'operating_profit', revenue - cogs - opex,
    'cash_received', (select coalesce(sum(l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where e.entry_date between p_from and p_to and l.account_code in (select account_code from public.bank_accounts)
         and e.source_type in ('order', 'dispatch', 'payment') and l.debit > 0),
    'inventory_purchased', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
       where e.entry_date between p_from and p_to and e.source_type in ('purchase_invoice', 'milk_collection', 'supplier_return')
         and l.account_code in ('1200', '1210', '1220', '1230', '1240')),
    'expenses_incurred', (select coalesce(sum(amount), 0) from public.expenses where status = 'approved' and expense_date between p_from and p_to),
    'note', 'Net sales exclude GST. Profit is sales less cost of goods sold and expenses — not the cash received.'
  );
end;
$$;

create function public.fin_account_ledger(p_code text, p_from date, p_to date)
returns table (entry_date date, entry_no text, memo text, party text, debit numeric, credit numeric, running_balance numeric, line_id bigint, reconciled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  opening numeric;
begin
  if not (public.has_permission('reports', 'view') or public.has_permission('banking', 'view')) then
    perform public.require_permission('reports', 'view');
  end if;
  if p_code in ('6200', '2200', '1150', '2210') then
    perform public.require_permission('payroll', 'view');
  end if;
  opening := public._account_balance(p_code, p_from - 1);
  return query
  select e.entry_date, e.entry_no, e.memo, l.party_type || coalesce(':' || l.party_id, ''), l.debit, l.credit,
    opening + sum(l.debit - l.credit) over (order by e.entry_date, e.posted_at, l.id), l.id,
    exists (select 1 from public.bank_reconciliations br where br.journal_line_id = l.id)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = p_code and e.entry_date between p_from and p_to
  order by e.entry_date, e.posted_at, l.id;
end;
$$;

create function public.fin_receivables()
returns table (party_id text, customer text, phone text, balance numeric, last_activity date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('sales', 'view');
  return query
  select l.party_id,
    (select o.customer_name from public.orders o where public._order_party(o) = l.party_id order by o.created_at desc limit 1),
    (select o.phone from public.orders o where public._order_party(o) = l.party_id order by o.created_at desc limit 1),
    sum(l.debit - l.credit), max(e.entry_date)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_code = '1100'
  group by l.party_id
  having sum(l.debit - l.credit) <> 0
  order by 4 desc;
end;
$$;

create function public.fin_payables()
returns table (supplier_id uuid, supplier text, balance numeric, overdue numeric, next_due date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('purchases', 'view');
  return query
  select s.id, s.name,
    coalesce((select sum(l.credit - l.debit) from public.journal_lines l where l.account_code = '2000' and l.party_type = 'supplier' and l.party_id = s.id::text), 0),
    coalesce((select sum(pi.total - pi.amount_paid) from public.purchase_invoices pi where pi.supplier_id = s.id and pi.status = 'posted' and pi.due_date < public.ist_today()), 0),
    (select min(pi.due_date) from public.purchase_invoices pi where pi.supplier_id = s.id and pi.status = 'posted' and pi.total > pi.amount_paid)
  from public.suppliers s
  where exists (select 1 from public.journal_lines l where l.account_code = '2000' and l.party_type = 'supplier' and l.party_id = s.id::text)
  order by 3 desc;
end;
$$;

create function public.fin_cash_flow(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_permission('reports', 'view');
  with money as (
    select e.id, e.source_type, l.debit - l.credit as amount
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where e.entry_date between p_from and p_to and l.account_code in (select account_code from public.bank_accounts) and e.source_type <> 'transfer'
  )
  select jsonb_build_object(
    'opening', (select coalesce(sum(public._account_balance(account_code, p_from - 1)), 0) from public.bank_accounts),
    'closing', (select coalesce(sum(public._account_balance(account_code, p_to)), 0) from public.bank_accounts),
    'inflows', coalesce((select jsonb_object_agg(source_type, s) from (select source_type, sum(amount) s from money where amount > 0 group by source_type) x), '{}'),
    'outflows', coalesce((select jsonb_object_agg(source_type, s) from (select source_type, -sum(amount) s from money where amount < 0 group by source_type) x), '{}'),
    'net_change', (select coalesce(sum(amount), 0) from money)
  ) into result;
  return result;
end;
$$;

create function public.fin_gst_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return jsonb_build_object(
    'output_cgst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2100' and e.entry_date between p_from and p_to),
    'output_sgst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2101' and e.entry_date between p_from and p_to),
    'output_igst', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '2102' and e.entry_date between p_from and p_to),
    'input_cgst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1300' and e.entry_date between p_from and p_to),
    'input_sgst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1301' and e.entry_date between p_from and p_to),
    'input_igst', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code = '1302' and e.entry_date between p_from and p_to),
    'note', 'Summary from the books for your accountant; file GST returns from verified invoice registers.'
  );
end;
$$;

-- Sales, cost and margin per SKU from dispatches.
create function public.fin_product_margins(p_from date, p_to date)
returns table (item_id uuid, code text, name text, units_dispatched numeric, sales_value numeric, cost_value numeric, gross_margin numeric, margin_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('reports', 'view');
  return query
  with lines as (
    select dl.item_id, dl.qty - dl.qty_returned as qty,
      -- Ex-GST selling price of the order line.
      oi.unit_price * 100 / (100 + coalesce(oi.gst_rate, i.gst_rate, 0)) as unit_net,
      -m.unit_cost as unit_cost
    from public.dispatch_lines dl
    join public.dispatches d on d.id = dl.dispatch_id
    join public.order_items oi on oi.id = dl.order_item_id
    join public.items i on i.id = dl.item_id
    join public.stock_movements m on m.id = dl.movement_id
    where public._ist_date(d.dispatched_at) between p_from and p_to
  )
  select i.id, i.code, i.name, sum(l.qty), round(sum(l.qty * l.unit_net), 2), round(sum(l.qty * -l.unit_cost), 2),
    round(sum(l.qty * l.unit_net) - sum(l.qty * -l.unit_cost), 2),
    round((sum(l.qty * l.unit_net) - sum(l.qty * -l.unit_cost)) / nullif(sum(l.qty * l.unit_net), 0) * 100, 1)
  from lines l join public.items i on i.id = l.item_id
  group by i.id
  order by 6 desc;
end;
$$;

create function public.inv_valuation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('inventory', 'view') or public.has_permission('reports', 'view')) then
    perform public.require_permission('inventory', 'view');
  end if;
  return jsonb_build_object(
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('item_type', item_type, 'value', v, 'ledger', public._account_balance(acct))), '[]')
      from (select i.item_type, case i.item_type when 'raw_material' then '1200' when 'packaging' then '1210' when 'finished_good' then '1220'
              when 'purchased_good' then '1230' else '1240' end as acct, round(sum(l.qty_on_hand * l.unit_cost), 2) as v
            from public.stock_lots l join public.items i on i.id = l.item_id where l.qty_on_hand > 0 group by i.item_type) x),
    'work_in_progress', public._account_balance('1250'),
    'total', (select coalesce(round(sum(qty_on_hand * unit_cost), 2), 0) from public.stock_lots)
  );
end;
$$;

-- Dashboard figures. Financial figures appear only for people allowed to see them.
create function public.ops_dashboard(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f date := coalesce(p_from, public.ist_today());
  t date := coalesce(p_to, public.ist_today());
  m date := date_trunc('month', public.ist_today())::date;
  result jsonb := '{}';
begin
  perform public.require_permission('dashboard', 'view');
  result := jsonb_build_object('from', f, 'to', t);
  if public.has_permission('dispatch', 'view') or public.has_permission('sales', 'view') then
    result := result || jsonb_build_object(
      'orders', (select count(*) from public.orders where public._ist_date(created_at) between f and t and status <> 'pending_payment'),
      'orders_pending', (select count(*) from public.orders where fulfilment_status in ('confirmed', 'processing', 'picking', 'packed', 'ready_for_dispatch')),
      'orders_awaiting_dispatch', (select count(*) from public.orders where fulfilment_status in ('ready_for_dispatch', 'packed', 'partially_dispatched')),
      'deliveries_completed', (select count(*) from public.dispatches where status = 'delivered' and public._ist_date(delivered_at) between f and t),
      'orders_on_hold', (select count(*) from public.orders where on_hold),
      'new_customers', (select count(*) from public.profiles p where public._ist_date(p.created_at) between f and t and not p.is_admin
          and not exists (select 1 from public.ops_user_roles ur where ur.user_id = p.id)));
  end if;
  if public.has_permission('production', 'view') or public.has_permission('procurement', 'view') then
    result := result || jsonb_build_object(
      'milk_procured_litres', (select coalesce(sum(qty_accepted), 0) from public.milk_collections where status = 'posted' and collected_on between f and t),
      'production_output', (select coalesce(jsonb_agg(jsonb_build_object('product', p.name, 'unit', p.base_unit, 'qty', x.q)), '[]')
          from (select product_id, sum(finished_qty) q from public.production_batches where completed_at is not null and public._ist_date(completed_at) between f and t group by product_id) x
          join public.products p on p.id = x.product_id),
      'active_batches', (select count(*) from public.production_batches where status in ('planned', 'materials_issued', 'in_production', 'production_completed', 'packaging', 'qc_approved')),
      'batches_awaiting_qc', (select count(*) from public.production_batches where status = 'awaiting_qc'),
      'batches_awaiting_release', (select count(*) from public.production_batches where status = 'packaging_completed'));
  end if;
  if public.has_permission('inventory', 'view') then
    result := result || jsonb_build_object(
      'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'available', available, 'reorder_level', reorder_level, 'unit', unit) order by name), '[]')
          from public.v_stock_summary where is_active and reorder_level > 0 and available <= reorder_level),
      'near_expiry_lots', (select count(*) from public.stock_lots where qty_on_hand > 0 and expiry_date between public.ist_today() and public.ist_today() + public.setting_num('inventory.expiry_alert_days', 3)::int),
      'expired_lots', (select count(*) from public.stock_lots where qty_on_hand > 0 and expiry_date < public.ist_today()),
      'raw_material_value', (select coalesce(round(sum(l.qty_on_hand * l.unit_cost), 2), 0) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type in ('raw_material', 'packaging', 'consumable')),
      'finished_goods_value', (select coalesce(round(sum(l.qty_on_hand * l.unit_cost), 2), 0) from public.stock_lots l join public.items i on i.id = l.item_id where i.item_type in ('finished_good', 'purchased_good')));
  end if;
  if public.has_permission('reports', 'view') then
    result := result || jsonb_build_object(
      'sales_period', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code in ('4000', '4010', '4095') and e.entry_date between f and t),
      'sales_month', (select coalesce(sum(l.credit - l.debit), 0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id where l.account_code in ('4000', '4010', '4095') and e.entry_date >= m),
      'purchases_period', (select coalesce(sum(total), 0) from public.purchase_invoices where status = 'posted' and invoice_date between f and t)
          + (select coalesce(sum(amount), 0) from public.milk_collections where status = 'posted' and collected_on between f and t),
      'expenses_period', (select coalesce(sum(amount), 0) from public.expenses where status = 'approved' and expense_date between f and t),
      'cash_and_bank', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'balance', public._account_balance(account_code))), '[]') from public.bank_accounts where is_active),
      'receivables', public._account_balance('1100'),
      'payables', -public._account_balance('2000'),
      'profit', public.fin_profit_and_loss(f, t) - 'lines');
  end if;
  if public.has_permission('payroll', 'view') then
    result := result || jsonb_build_object(
      'monthly_salary_commitment', (select coalesce(sum(coalesce(monthly_salary, daily_rate * 26)), 0) from public.employees where is_active));
  end if;
  if public.has_permission('subscriptions', 'view') then
    result := result || jsonb_build_object(
      'milk_interest', (select count(*) from public.milk_interest where status <> 'cancelled'),
      'active_subscribers', (select count(distinct user_id) from public.subscriptions where status = 'active'),
      'subscription_deliveries_period', (select count(*) from public.subscription_deliveries where status = 'delivered' and delivery_date between f and t),
      'subscription_revenue_period', (select coalesce(sum(o.total), 0) from public.orders o where o.source = 'subscription' and o.status <> 'cancelled'
          and o.delivery_date between f and t));
  end if;
  return result;
end;
$$;

-- Existing invoiced orders enter the books.
do $$
declare
  r record;
begin
  for r in select id from public.orders where invoice_number is not null and status <> 'cancelled' loop
    perform public._post_order_sale(r.id);
  end loop;
end $$;

-- Access rules ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ledger_accounts', 'journal_entries', 'journal_lines', 'purchase_invoices', 'purchase_invoice_lines', 'bank_accounts',
    'payments', 'payment_allocations', 'expense_categories', 'expenses', 'employees', 'employee_advances', 'payroll_runs', 'payroll_lines',
    'bank_reconciliations', 'cash_counts', 'posting_errors'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy "Finance reads accounts" on public.ledger_accounts for select to authenticated
  using ((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'view'))
    or (select public.has_permission('expenses', 'view')) or (select public.has_permission('sales', 'view')));
-- Journal lines of payroll accounts are visible only to payroll users.
create policy "Finance reads journal entries" on public.journal_entries for select to authenticated
  using ((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')));
create policy "Finance reads journal lines" on public.journal_lines for select to authenticated
  using (((select public.has_permission('reports', 'view')) or (select public.has_permission('banking', 'view')))
    and (account_code not in ('6200', '2200', '1150', '2210') or (select public.has_permission('payroll', 'view'))));
create policy "Buyers read purchase invoices" on public.purchase_invoices for select to authenticated using ((select public.has_permission('purchases', 'view')));
create policy "Buyers read purchase lines" on public.purchase_invoice_lines for select to authenticated using ((select public.has_permission('purchases', 'view')));
create policy "Finance reads bank accounts" on public.bank_accounts for select to authenticated
  using ((select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'edit')) or (select public.has_permission('expenses', 'create'))
    or (select public.has_permission('payroll', 'create')) or (select public.has_permission('payroll', 'approve')) or (select public.has_permission('sales', 'create'))
    or (select public.has_permission('dispatch', 'edit')));
create policy "Finance reads payments" on public.payments for select to authenticated
  using ((select public.has_permission('banking', 'view')) or ((select public.has_permission('purchases', 'view')) and party_type = 'supplier')
    or ((select public.has_permission('sales', 'view')) and party_type = 'customer'));
create policy "Finance reads payment allocations" on public.payment_allocations for select to authenticated
  using ((select public.has_permission('banking', 'view')) or (select public.has_permission('purchases', 'view')) or (select public.has_permission('sales', 'view')));
create policy "Staff read expense categories" on public.expense_categories for select to authenticated using ((select public.has_permission('expenses', 'view')));
create policy "Finance reads expenses" on public.expenses for select to authenticated using ((select public.has_permission('expenses', 'view')));
create policy "Payroll reads employees" on public.employees for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads advances" on public.employee_advances for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads runs" on public.payroll_runs for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Payroll reads lines" on public.payroll_lines for select to authenticated using ((select public.has_permission('payroll', 'view')));
create policy "Finance reads reconciliations" on public.bank_reconciliations for select to authenticated using ((select public.has_permission('banking', 'view')));
create policy "Finance reads cash counts" on public.cash_counts for select to authenticated using ((select public.has_permission('banking', 'view')));
create policy "Finance reads posting errors" on public.posting_errors for select to authenticated using ((select public.has_permission('sales', 'view')));

do $$
declare
  f text;
begin
  foreach f in array array[
    '_journal_balanced()', '_post_journal(date, text, text, text, text, jsonb, uuid, text)', '_gl_stock_movement()', '_gl_batch_status()',
    '_gl_milk_collection()', '_order_tax(uuid)', '_post_order_sale(uuid)', '_gl_order()', '_gl_dispatch_collection()', '_post_expense(uuid)',
    '_payroll_recalc(uuid)', '_payroll_totals(uuid)', '_account_balance(text, date)', '_check_money_account(text)', '_inventory_account(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'fin_post_purchase_invoice(jsonb, jsonb, text)', 'fin_cancel_purchase_invoice(uuid, text)', 'fin_supplier_return(uuid, jsonb, text, text)',
    'fin_pay_supplier(uuid, numeric, date, text, text, text, jsonb, text)', 'fin_receive_customer_payment(uuid, numeric, date, text, text, text, text)',
    'fin_credit_note(uuid, numeric, text, text, text)', 'fin_record_expense(date, text, numeric, text, text, text, text, numeric, text, text, text)',
    'fin_decide_expense(uuid, boolean, text)', 'pay_save_employee(jsonb)', 'pay_record_advance(uuid, numeric, date, text, text)', 'pay_create_run(date)',
    'pay_update_line(uuid, numeric, numeric, numeric, numeric, numeric, text)', 'pay_approve_run(uuid)', 'pay_mark_paid(uuid, date, text, text)',
    'fin_transfer(text, text, numeric, date, text, text)', 'fin_reconcile(bigint[], date, text)', 'fin_cash_count(text, numeric, date, text, boolean)',
    'fin_manual_journal(date, text, jsonb, text)', 'fin_reverse_entry(uuid, text)', 'fin_trial_balance(date)', 'fin_profit_and_loss(date, date)',
    'fin_account_ledger(text, date, date)', 'fin_receivables()', 'fin_payables()', 'fin_cash_flow(date, date)', 'fin_gst_summary(date, date)',
    'fin_product_margins(date, date)', 'inv_valuation()', 'ops_dashboard(date, date)', 'fin_retry_postings()', 'fin_money_balances(date)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._jl(text, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public._ist_date(timestamptz) from public, anon;
grant execute on function public._ist_date(timestamptz) to authenticated;
revoke execute on function public._order_party(public.orders) from public, anon, authenticated;

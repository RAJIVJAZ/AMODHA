-- Documents & licences checklist with renewal reminders, and the machinery & equipment register with
-- condition checks, replacements, warranty and a service / repair history with costs.
--
-- Reminders: a document is "due" from `remind_days` (default 20) days before its expiry date and stays due
-- every day — on the Today screen and in the daily email — until someone records the renewal with the next
-- expiry date. Nothing is snoozed or dismissed: the only way to clear a reminder is to renew (or, for a
-- document the business no longer needs, mark it not applicable with a reason).
--
-- Same security model as the rest of the business app: row-level security on, no direct writes, every write
-- through a SECURITY DEFINER function that checks the caller and writes the audit log.

-- Modules and permissions ------------------------------------------------------------------
insert into public.ops_modules (key, label, description, sort_order) values
  ('compliance', 'Documents & licences', 'Licences, registrations, certificates and their renewal dates', 23),
  ('equipment', 'Machinery & equipment', 'Machines and equipment: condition, replacements, warranty, services and repair costs', 24)
on conflict (key) do nothing;

insert into public.ops_role_permissions (role_key, module, action)
select 'admin', m.key, a.key from public.ops_modules m cross join public.ops_actions a
where m.key in ('compliance', 'equipment')
on conflict do nothing;

insert into public.ops_role_permissions (role_key, module, action)
select r, v.module, v.action
from (values
  ('finance_officer', 'compliance', 'view'), ('finance_officer', 'compliance', 'create'), ('finance_officer', 'compliance', 'edit'),
  ('finance_officer', 'equipment', 'view'),
  ('production_manager', 'compliance', 'view'),
  ('production_manager', 'equipment', 'view'), ('production_manager', 'equipment', 'create'), ('production_manager', 'equipment', 'edit'),
  ('quality_inspector', 'equipment', 'view'), ('quality_inspector', 'equipment', 'edit'),
  ('dispatch_staff', 'equipment', 'view')
) as v (r, module, action)
on conflict do nothing;

insert into public.business_settings (key, value, label, description, category, value_type) values
  ('compliance.remind_days', '20', 'Remind before a document expires (days)',
    'Documents show as due this many days before their expiry date, every day until the renewal is recorded', 'compliance', 'number'),
  ('compliance.reminder_emails', '[]', 'Daily reminder email to',
    'Email addresses for the daily documents and machinery reminder, e.g. ["owner@example.com"]. Empty: the business email', 'compliance', 'json'),
  ('equipment.warranty_remind_days', '30', 'Remind before a warranty or AMC ends (days)',
    'Machines show on the reminder list this many days before their warranty or maintenance contract ends', 'equipment', 'number'),
  ('equipment.service_remind_days', '7', 'Remind before a service is due (days)',
    'Machines show on the reminder list this many days before their next service date', 'equipment', 'number')
on conflict (key) do nothing;

-- Documents & licences ---------------------------------------------------------------------
create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('fssai_license', 'gst_registration', 'trade_license', 'fire_noc', 'pollution_consent',
    'shop_establishment', 'factory_license', 'legal_metrology', 'udyam', 'trademark', 'water_test', 'pest_control', 'medical_fitness',
    'fire_extinguisher', 'boiler_certificate', 'electrical_safety', 'insurance', 'vehicle_rc', 'vehicle_insurance', 'vehicle_puc',
    'vehicle_fitness', 'rent_agreement', 'other')),
  title text not null check (length(trim(title)) > 1),
  document_number text,
  issuing_authority text,
  holder text,                     -- e.g. vehicle number, staff member, premises
  issue_date date,
  expiry_date date,                -- null: no expiry (e.g. GST, Udyam) or not entered yet
  no_expiry boolean not null default false,
  remind_days integer check (remind_days between 1 and 180), -- null: the business setting
  document_url text,
  notes text,
  status text not null default 'active' check (status in ('active', 'not_applicable')),
  status_note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);
create index compliance_documents_expiry_idx on public.compliance_documents (status, expiry_date);

create table public.compliance_document_renewals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.compliance_documents on delete cascade,
  renewed_on date not null,
  previous_expiry date,
  new_expiry date,
  previous_number text,
  new_number text,
  document_url text,
  cost numeric(12, 2) check (cost >= 0),
  note text,
  recorded_by uuid default auth.uid(),
  recorded_at timestamptz not null default now()
);
create index compliance_document_renewals_doc_idx on public.compliance_document_renewals (document_id, renewed_on desc);

-- The checklist every food business in Uttar Pradesh is likely to need; details are filled in by the team.
insert into public.compliance_documents (doc_type, title, document_number, issuing_authority, no_expiry, created_by) values
  ('fssai_license', 'FSSAI food licence', (select value ->> 'fssai' from public.business_settings where key = 'company'), 'FSSAI', false, null),
  ('gst_registration', 'GST registration', (select value ->> 'gstin' from public.business_settings where key = 'company'), 'GST department', true, null),
  ('trade_license', 'Trade licence (Nagar Nigam)', null, 'Prayagraj Nagar Nigam', false, null),
  ('fire_noc', 'Fire safety NOC', null, 'UP Fire & Emergency Services', false, null),
  ('pollution_consent', 'Consent to operate (pollution board)', null, 'UP Pollution Control Board', false, null),
  ('shop_establishment', 'Shop & establishment registration', null, 'Labour department', false, null),
  ('legal_metrology', 'Weighing scale verification (legal metrology)', null, 'Legal Metrology department', false, null),
  ('udyam', 'Udyam (MSME) registration', null, 'Ministry of MSME', true, null),
  ('water_test', 'Water test report (NABL lab)', null, 'NABL-accredited lab', false, null),
  ('pest_control', 'Pest control service certificate', null, null, false, null),
  ('medical_fitness', 'Food handlers'' medical fitness certificates', null, 'Registered medical practitioner', false, null),
  ('fire_extinguisher', 'Fire extinguisher refilling', null, null, false, null),
  ('insurance', 'Business / stock insurance', null, null, false, null);

-- Machinery & equipment --------------------------------------------------------------------
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null check (length(trim(name)) > 1),
  category text not null default 'production' check (category in ('production', 'cooking', 'refrigeration', 'packaging', 'weighing',
    'boiler', 'utility', 'vehicle', 'it_office', 'other')),
  location text,
  make text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_cost numeric(12, 2) check (purchase_cost >= 0),
  vendor text,
  vendor_contact text,
  warranty_start date,
  warranty_end date,
  warranty_terms text,
  amc_provider text,
  amc_end date,
  service_interval_days integer check (service_interval_days between 1 and 1095),
  next_service_due date,
  status text not null default 'working' check (status in ('working', 'needs_attention', 'under_repair', 'out_of_service', 'replaced', 'disposed')),
  replaced_by uuid references public.equipment on delete set null,
  replaced_on date,
  last_checked_on date,
  document_url text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (warranty_end is null or warranty_start is null or warranty_end >= warranty_start),
  check (replaced_by is null or replaced_by <> id)
);
create index equipment_status_idx on public.equipment (status);

-- Condition checks (the machinery checklist).
create table public.equipment_checks (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment on delete cascade,
  checked_on date not null,
  condition text not null check (condition in ('working', 'needs_attention', 'not_working')),
  note text,
  checked_by uuid default auth.uid(),
  checked_at timestamptz not null default now()
);
create index equipment_checks_eq_idx on public.equipment_checks (equipment_id, checked_on desc);

-- Services and repairs, with whether the work was under warranty and every cost.
create table public.equipment_services (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment on delete cascade,
  service_date date not null,
  kind text not null check (kind in ('service', 'repair', 'breakdown', 'part_replacement', 'calibration', 'inspection')),
  problem text,
  work_done text not null check (length(trim(work_done)) > 1),
  vendor text,
  technician text,
  under_warranty boolean not null,
  under_amc boolean not null default false,
  parts_cost numeric(12, 2) not null default 0 check (parts_cost >= 0),
  labour_cost numeric(12, 2) not null default 0 check (labour_cost >= 0),
  other_cost numeric(12, 2) not null default 0 check (other_cost >= 0),
  total_cost numeric(12, 2) generated always as (parts_cost + labour_cost + other_cost) stored,
  downtime_hours numeric(8, 1) check (downtime_hours >= 0),
  invoice_number text,
  document_url text,
  status_after text not null check (status_after in ('working', 'needs_attention', 'under_repair', 'out_of_service')),
  expense_id uuid references public.expenses on delete set null,
  recorded_by uuid default auth.uid(),
  recorded_at timestamptz not null default now()
);
create index equipment_services_eq_idx on public.equipment_services (equipment_id, service_date desc);

-- Per-machine totals for the register.
create view public.v_equipment_summary with (security_invoker = true) as
select e.id as equipment_id,
  count(s.id) filter (where s.kind in ('service', 'calibration', 'inspection'))::int as services,
  count(s.id) filter (where s.kind in ('repair', 'breakdown', 'part_replacement'))::int as repairs,
  coalesce(sum(s.total_cost), 0)::numeric(12, 2) as total_cost,
  coalesce(sum(s.total_cost) filter (where s.kind in ('repair', 'breakdown', 'part_replacement')), 0)::numeric(12, 2) as repair_cost,
  coalesce(sum(s.downtime_hours), 0)::numeric(10, 1) as downtime_hours,
  max(s.service_date) as last_service_date
from public.equipment e
left join public.equipment_services s on s.equipment_id = e.id
group by e.id;

-- Access rules -------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['compliance_documents', 'compliance_document_renewals', 'equipment', 'equipment_checks', 'equipment_services'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on public.v_equipment_summary from anon;

create policy "Compliance staff read documents" on public.compliance_documents for select to authenticated
  using ((select public.has_permission('compliance', 'view')));
create policy "Compliance staff read renewals" on public.compliance_document_renewals for select to authenticated
  using ((select public.has_permission('compliance', 'view')));
create policy "Equipment staff read equipment" on public.equipment for select to authenticated
  using ((select public.has_permission('equipment', 'view')));
create policy "Equipment staff read checks" on public.equipment_checks for select to authenticated
  using ((select public.has_permission('equipment', 'view')));
create policy "Equipment staff read services" on public.equipment_services for select to authenticated
  using ((select public.has_permission('equipment', 'view')));

-- Helpers ------------------------------------------------------------------------------------
create function public._clean(p_value text, p_max integer default 300)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(trim(coalesce(p_value, '')), p_max), '')
$$;

create function public._clean_url(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := public._clean(p_value, 1000);
begin
  if v is not null and v !~* '^https?://' then
    raise exception 'Links must start with https://';
  end if;
  return v;
end;
$$;

-- Days left before a document's reminder threshold matters (negative: expired).
create function public.cmp_days_left(p_expiry date)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_expiry is null then null else p_expiry - public.ist_today() end
$$;

-- Documents: save, renew, mark not applicable ---------------------------------------------------
create function public.cmp_save_document(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  did uuid := nullif(p ->> 'id', '')::uuid;
  before public.compliance_documents;
  d public.compliance_documents;
begin
  if did is null then
    perform public.require_permission('compliance', 'create');
  else
    perform public.require_permission('compliance', 'edit');
    select * into before from public.compliance_documents where id = did for update;
    if not found then
      raise exception 'Document not found';
    end if;
  end if;
  if coalesce(trim(p ->> 'title'), '') = '' and did is null then
    raise exception 'Give the document a name';
  end if;
  if did is null then
    insert into public.compliance_documents (doc_type, title) values (coalesce(nullif(p ->> 'doc_type', ''), 'other'), trim(p ->> 'title'))
    returning id into did;
  end if;
  update public.compliance_documents set
    doc_type = case when p ? 'doc_type' and p ->> 'doc_type' <> '' then p ->> 'doc_type' else doc_type end,
    title = case when p ? 'title' and trim(p ->> 'title') <> '' then left(trim(p ->> 'title'), 150) else title end,
    document_number = case when p ? 'document_number' then public._clean(p ->> 'document_number', 80) else document_number end,
    issuing_authority = case when p ? 'issuing_authority' then public._clean(p ->> 'issuing_authority', 150) else issuing_authority end,
    holder = case when p ? 'holder' then public._clean(p ->> 'holder', 150) else holder end,
    issue_date = case when p ? 'issue_date' then nullif(p ->> 'issue_date', '')::date else issue_date end,
    expiry_date = case when p ? 'expiry_date' then nullif(p ->> 'expiry_date', '')::date else expiry_date end,
    no_expiry = case when p ? 'no_expiry' then coalesce((p ->> 'no_expiry')::boolean, false) else no_expiry end,
    remind_days = case when p ? 'remind_days' then nullif(p ->> 'remind_days', '')::int else remind_days end,
    document_url = case when p ? 'document_url' then public._clean_url(p ->> 'document_url') else document_url end,
    notes = case when p ? 'notes' then public._clean(p ->> 'notes', 1000) else notes end,
    updated_by = auth.uid(), updated_at = now()
  where id = did
  returning * into d;
  if d.no_expiry then
    update public.compliance_documents set expiry_date = null where id = did returning * into d;
  end if;
  perform public.write_audit(case when before.id is null then 'document.create' else 'document.update' end, 'compliance_documents', did::text,
    jsonb_build_object('title', d.title, 'number', d.document_number, 'expiry', d.expiry_date,
      'previous_expiry', before.expiry_date));
  return did;
end;
$$;

-- Records a renewal: the new expiry date (required unless the document has no expiry) clears the reminder.
create function public.cmp_renew_document(p_document_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.compliance_documents;
  new_expiry date := nullif(p ->> 'expiry_date', '')::date;
  renewed date := coalesce(nullif(p ->> 'renewed_on', '')::date, public.ist_today());
begin
  perform public.require_permission('compliance', 'edit');
  select * into d from public.compliance_documents where id = p_document_id for update;
  if not found then
    raise exception 'Document not found';
  end if;
  if d.status <> 'active' then
    raise exception 'This document is marked not applicable; switch it back on first';
  end if;
  if not d.no_expiry then
    if new_expiry is null then
      raise exception 'Enter the new expiry (next renewal) date';
    end if;
    if new_expiry <= public.ist_today() then
      raise exception 'The new expiry date must be in the future';
    end if;
    if d.expiry_date is not null and new_expiry <= d.expiry_date then
      raise exception 'The new expiry date must be after the current one (%)', to_char(d.expiry_date, 'DD Mon YYYY');
    end if;
  end if;
  if renewed > public.ist_today() then
    raise exception 'The renewal date cannot be in the future';
  end if;
  insert into public.compliance_document_renewals (document_id, renewed_on, previous_expiry, new_expiry, previous_number, new_number, document_url, cost, note)
  values (d.id, renewed, d.expiry_date, new_expiry, d.document_number, coalesce(public._clean(p ->> 'document_number', 80), d.document_number),
    public._clean_url(p ->> 'document_url'), nullif(p ->> 'cost', '')::numeric, public._clean(p ->> 'note', 500));
  update public.compliance_documents set
    expiry_date = case when no_expiry then null else new_expiry end,
    issue_date = coalesce(nullif(p ->> 'issue_date', '')::date, renewed),
    document_number = coalesce(public._clean(p ->> 'document_number', 80), document_number),
    document_url = coalesce(public._clean_url(p ->> 'document_url'), document_url),
    updated_by = auth.uid(), updated_at = now()
  where id = d.id;
  perform public.write_audit('document.renew', 'compliance_documents', d.id::text,
    jsonb_build_object('title', d.title, 'previous_expiry', d.expiry_date, 'new_expiry', new_expiry, 'cost', nullif(p ->> 'cost', '')), public._clean(p ->> 'note', 500));
end;
$$;

create function public.cmp_set_applicable(p_document_id uuid, p_applicable boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('compliance', 'edit');
  if not p_applicable and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason (e.g. no boiler on the premises)';
  end if;
  update public.compliance_documents set status = case when p_applicable then 'active' else 'not_applicable' end,
    status_note = case when p_applicable then null else left(trim(p_reason), 300) end, updated_by = auth.uid(), updated_at = now()
  where id = p_document_id;
  if not found then
    raise exception 'Document not found';
  end if;
  perform public.write_audit(case when p_applicable then 'document.applicable' else 'document.not_applicable' end, 'compliance_documents',
    p_document_id::text, null, p_reason);
end;
$$;

-- Equipment: save, check, service / repair, replace ------------------------------------------------
create function public.eq_save_equipment(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid := nullif(p ->> 'id', '')::uuid;
  before public.equipment;
  e public.equipment;
begin
  if eid is null then
    perform public.require_permission('equipment', 'create');
    if coalesce(trim(p ->> 'name'), '') = '' then
      raise exception 'Give the machine a name';
    end if;
    insert into public.equipment (asset_code, name, category)
    values (public.next_doc_number('equipment', 'MW', 'EQ', 4), left(trim(p ->> 'name'), 150), coalesce(nullif(p ->> 'category', ''), 'production'))
    returning id into eid;
  else
    perform public.require_permission('equipment', 'edit');
    select * into before from public.equipment where id = eid for update;
    if not found then
      raise exception 'Machine not found';
    end if;
  end if;
  update public.equipment set
    name = case when p ? 'name' and trim(p ->> 'name') <> '' then left(trim(p ->> 'name'), 150) else name end,
    category = case when p ? 'category' and p ->> 'category' <> '' then p ->> 'category' else category end,
    location = case when p ? 'location' then public._clean(p ->> 'location', 120) else location end,
    make = case when p ? 'make' then public._clean(p ->> 'make', 120) else make end,
    model = case when p ? 'model' then public._clean(p ->> 'model', 120) else model end,
    serial_number = case when p ? 'serial_number' then public._clean(p ->> 'serial_number', 120) else serial_number end,
    purchase_date = case when p ? 'purchase_date' then nullif(p ->> 'purchase_date', '')::date else purchase_date end,
    purchase_cost = case when p ? 'purchase_cost' then nullif(p ->> 'purchase_cost', '')::numeric else purchase_cost end,
    vendor = case when p ? 'vendor' then public._clean(p ->> 'vendor', 150) else vendor end,
    vendor_contact = case when p ? 'vendor_contact' then public._clean(p ->> 'vendor_contact', 150) else vendor_contact end,
    warranty_start = case when p ? 'warranty_start' then nullif(p ->> 'warranty_start', '')::date else warranty_start end,
    warranty_end = case when p ? 'warranty_end' then nullif(p ->> 'warranty_end', '')::date else warranty_end end,
    warranty_terms = case when p ? 'warranty_terms' then public._clean(p ->> 'warranty_terms', 500) else warranty_terms end,
    amc_provider = case when p ? 'amc_provider' then public._clean(p ->> 'amc_provider', 150) else amc_provider end,
    amc_end = case when p ? 'amc_end' then nullif(p ->> 'amc_end', '')::date else amc_end end,
    service_interval_days = case when p ? 'service_interval_days' then nullif(p ->> 'service_interval_days', '')::int else service_interval_days end,
    next_service_due = case when p ? 'next_service_due' then nullif(p ->> 'next_service_due', '')::date else next_service_due end,
    document_url = case when p ? 'document_url' then public._clean_url(p ->> 'document_url') else document_url end,
    notes = case when p ? 'notes' then public._clean(p ->> 'notes', 1000) else notes end,
    updated_by = auth.uid(), updated_at = now()
  where id = eid
  returning * into e;
  -- The warranty normally starts on the purchase date.
  if e.warranty_end is not null and e.warranty_start is null and e.purchase_date is not null then
    update public.equipment set warranty_start = purchase_date where id = eid returning * into e;
  end if;
  perform public.write_audit(case when before.id is null then 'equipment.create' else 'equipment.update' end, 'equipment', eid::text,
    jsonb_build_object('asset_code', e.asset_code, 'name', e.name, 'warranty_end', e.warranty_end));
  return eid;
end;
$$;

-- The checklist: record whether a machine is working today.
create function public.eq_record_check(p_equipment_id uuid, p_condition text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.equipment;
begin
  perform public.require_permission('equipment', 'edit');
  select * into e from public.equipment where id = p_equipment_id for update;
  if not found then
    raise exception 'Machine not found';
  end if;
  if e.status in ('replaced', 'disposed') then
    raise exception 'This machine has been %; check its replacement instead', e.status;
  end if;
  if p_condition not in ('working', 'needs_attention', 'not_working') then
    raise exception 'Choose working, needs attention or not working';
  end if;
  if p_condition <> 'working' and coalesce(trim(p_note), '') = '' then
    raise exception 'Say what is wrong';
  end if;
  insert into public.equipment_checks (equipment_id, checked_on, condition, note) values (e.id, public.ist_today(), p_condition, public._clean(p_note, 500));
  update public.equipment set last_checked_on = public.ist_today(),
    status = case
      when p_condition = 'working' and status in ('needs_attention', 'out_of_service') then 'working'
      when p_condition = 'working' then status
      when p_condition = 'needs_attention' and status = 'working' then 'needs_attention'
      when p_condition = 'not_working' and status <> 'under_repair' then 'out_of_service'
      else status end,
    updated_by = auth.uid(), updated_at = now()
  where id = e.id;
  perform public.write_audit('equipment.check', 'equipment', e.id::text, jsonb_build_object('condition', p_condition, 'previous_status', e.status), p_note);
end;
$$;

-- A service or repair. Whether it was under warranty is worked out from the warranty dates (it can be
-- overridden, e.g. when the vendor refuses a claim). Optionally also recorded as an expense in the books.
create function public.eq_record_service(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.equipment;
  sid uuid := gen_random_uuid();
  sdate date := coalesce(nullif(p ->> 'service_date', '')::date, public.ist_today());
  warranty boolean;
  amc boolean;
  parts numeric := coalesce(nullif(p ->> 'parts_cost', '')::numeric, 0);
  labour numeric := coalesce(nullif(p ->> 'labour_cost', '')::numeric, 0);
  other numeric := coalesce(nullif(p ->> 'other_cost', '')::numeric, 0);
  status_after text := coalesce(nullif(p ->> 'status_after', ''), 'working');
  next_due date := nullif(p ->> 'next_service_due', '')::date;
  xid uuid;
begin
  perform public.require_permission('equipment', 'edit');
  select * into e from public.equipment where id = nullif(p ->> 'equipment_id', '')::uuid for update;
  if not found then
    raise exception 'Machine not found';
  end if;
  if e.status in ('replaced', 'disposed') then
    raise exception 'This machine has been %', e.status;
  end if;
  if sdate > public.ist_today() then
    raise exception 'The service date cannot be in the future';
  end if;
  if least(parts, labour, other) < 0 then
    raise exception 'Costs cannot be negative';
  end if;
  warranty := coalesce(nullif(p ->> 'under_warranty', '')::boolean, e.warranty_end is not null and sdate <= e.warranty_end
    and (e.warranty_start is null or sdate >= e.warranty_start));
  amc := e.amc_end is not null and sdate <= e.amc_end;
  if next_due is null and e.service_interval_days is not null and (p ->> 'kind') in ('service', 'calibration') then
    next_due := sdate + e.service_interval_days;
  end if;
  insert into public.equipment_services (id, equipment_id, service_date, kind, problem, work_done, vendor, technician, under_warranty, under_amc,
    parts_cost, labour_cost, other_cost, downtime_hours, invoice_number, document_url, status_after)
  values (sid, e.id, sdate, coalesce(nullif(p ->> 'kind', ''), 'repair'), public._clean(p ->> 'problem', 500), coalesce(public._clean(p ->> 'work_done', 1000), ''),
    public._clean(p ->> 'vendor', 150), public._clean(p ->> 'technician', 150), warranty, amc, parts, labour, other,
    nullif(p ->> 'downtime_hours', '')::numeric, public._clean(p ->> 'invoice_number', 80), public._clean_url(p ->> 'document_url'), status_after);
  update public.equipment set status = status_after, next_service_due = coalesce(next_due, next_service_due),
    updated_by = auth.uid(), updated_at = now()
  where id = e.id;
  -- Also in the books (expenses permission needed; above the approval limit it waits for approval as usual).
  if coalesce((p ->> 'add_expense')::boolean, false) and parts + labour + other > 0 then
    xid := public.fin_record_expense(sdate, 'repairs', parts + labour + other, coalesce(public._clean(p ->> 'vendor', 150), 'Repair vendor'),
      left(e.asset_code || ' ' || e.name || ': ' || coalesce(public._clean(p ->> 'work_done', 200), ''), 300),
      nullif(p ->> 'paid_from', ''), nullif(p ->> 'payment_method', ''), 0, public._clean(p ->> 'invoice_number', 80), public._clean_url(p ->> 'document_url'));
    update public.equipment_services set expense_id = xid where id = sid;
  end if;
  perform public.write_audit('equipment.service', 'equipment', e.id::text,
    jsonb_build_object('kind', p ->> 'kind', 'date', sdate, 'total', parts + labour + other, 'under_warranty', warranty, 'status_after', status_after,
      'expense', xid));
  return sid;
end;
$$;

-- Replace a machine with another one from the register (or retire it).
create function public.eq_replace(p_equipment_id uuid, p_replacement_id uuid, p_note text, p_disposed boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.equipment;
begin
  perform public.require_permission('equipment', 'edit');
  select * into e from public.equipment where id = p_equipment_id for update;
  if not found then
    raise exception 'Machine not found';
  end if;
  if e.status in ('replaced', 'disposed') then
    raise exception 'This machine has already been %', e.status;
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason';
  end if;
  if p_replacement_id is not null then
    if p_replacement_id = e.id then
      raise exception 'A machine cannot replace itself';
    end if;
    if not exists (select 1 from public.equipment where id = p_replacement_id and status not in ('replaced', 'disposed')) then
      raise exception 'Choose the new machine from the register (add it first)';
    end if;
  elsif not p_disposed then
    raise exception 'Choose the replacement machine, or mark this one as disposed';
  end if;
  update public.equipment set status = case when p_replacement_id is null then 'disposed' else 'replaced' end,
    replaced_by = p_replacement_id, replaced_on = public.ist_today(),
    notes = left(concat_ws(E'\n', notes, to_char(public.ist_today(), 'DD Mon YYYY') || ': ' || trim(p_note)), 1000),
    updated_by = auth.uid(), updated_at = now()
  where id = e.id;
  perform public.write_audit(case when p_replacement_id is null then 'equipment.dispose' else 'equipment.replace' end, 'equipment', e.id::text,
    jsonb_build_object('replaced_by', p_replacement_id), p_note);
end;
$$;

-- Reminders --------------------------------------------------------------------------------------
-- Everything that needs attention, newest-urgent first. Shared by the Today screen (filtered by the
-- caller's permissions) and the daily email (all of it, called with the service key).
create function public._reminders_all()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select public.setting_num('compliance.remind_days', 20)::int as doc_days,
      public.setting_num('equipment.warranty_remind_days', 30)::int as warranty_days,
      public.setting_num('equipment.service_remind_days', 7)::int as service_days,
      public.ist_today() as today
  ),
  items as (
    -- Documents expiring within their reminder window (or already expired), until renewed.
    select 'compliance' as module, 'document' as kind, d.id, d.title as name, d.document_number as detail, d.expiry_date as due,
      d.expiry_date - s.today as days_left,
      case when d.expiry_date < s.today then 'expired' else 'renew' end as action
    from public.compliance_documents d, s
    where d.status = 'active' and not d.no_expiry and d.expiry_date is not null
      and d.expiry_date - s.today <= coalesce(d.remind_days, s.doc_days)
    union all
    -- Checklist items with no expiry date entered yet.
    select 'compliance', 'document_missing', d.id, d.title, d.document_number, null::date, null::int, 'add details'
    from public.compliance_documents d
    where d.status = 'active' and not d.no_expiry and d.expiry_date is null
    union all
    select 'equipment', 'warranty', e.id, e.asset_code || ' ' || e.name, e.make, e.warranty_end, e.warranty_end - s.today, 'warranty ends'
    from public.equipment e, s
    where e.status not in ('replaced', 'disposed') and e.warranty_end is not null
      and e.warranty_end - s.today between 0 and s.warranty_days
    union all
    select 'equipment', 'amc', e.id, e.asset_code || ' ' || e.name, e.amc_provider, e.amc_end, e.amc_end - s.today,
      case when e.amc_end < s.today then 'AMC expired' else 'AMC ends' end
    from public.equipment e, s
    where e.status not in ('replaced', 'disposed') and e.amc_end is not null and e.amc_end - s.today <= s.warranty_days
      and e.amc_end - s.today >= -30
    union all
    select 'equipment', 'service', e.id, e.asset_code || ' ' || e.name, e.location, e.next_service_due, e.next_service_due - s.today,
      case when e.next_service_due < s.today then 'service overdue' else 'service due' end
    from public.equipment e, s
    where e.status not in ('replaced', 'disposed') and e.next_service_due is not null and e.next_service_due - s.today <= s.service_days
    union all
    select 'equipment', 'not_working', e.id, e.asset_code || ' ' || e.name, e.location, null::date, null::int,
      replace(e.status, '_', ' ')
    from public.equipment e
    where e.status in ('needs_attention', 'under_repair', 'out_of_service')
  )
  select coalesce(jsonb_agg(to_jsonb(i) order by i.days_left nulls last, i.name), '[]') from items i
$$;

-- For the signed-in staff member: only the modules they can see.
create function public.ops_reminders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x), '[]')
  from jsonb_array_elements(public._reminders_all()) x
  where (x ->> 'module' = 'compliance' and public.has_permission('compliance', 'view'))
     or (x ->> 'module' = 'equipment' and public.has_permission('equipment', 'view'))
$$;

-- One email a day: the route asks first, so a repeated trigger never sends twice.
create table public.reminder_email_log (
  sent_on date primary key,
  recipients text[] not null,
  items integer not null,
  sent_at timestamptz not null default now()
);
alter table public.reminder_email_log enable row level security;
revoke all on public.reminder_email_log from anon, authenticated;

create function public._reminder_claim_today(p_recipients text[], p_items integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reminder_email_log (sent_on, recipients, items) values (public.ist_today(), p_recipients, p_items);
  return true;
exception when unique_violation then
  return false;
end;
$$;

create function public._reminder_unclaim_today()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.reminder_email_log where sent_on = public.ist_today()
$$;

-- Grants -------------------------------------------------------------------------------------------
revoke execute on function public._clean(text, integer), public._clean_url(text), public._reminders_all(),
  public._reminder_claim_today(text[], integer), public._reminder_unclaim_today() from public, anon, authenticated;
grant execute on function public._reminders_all(), public._reminder_claim_today(text[], integer), public._reminder_unclaim_today() to service_role;
revoke execute on function public.cmp_days_left(date), public.cmp_save_document(jsonb), public.cmp_renew_document(uuid, jsonb),
  public.cmp_set_applicable(uuid, boolean, text), public.eq_save_equipment(jsonb), public.eq_record_check(uuid, text, text),
  public.eq_record_service(jsonb), public.eq_replace(uuid, uuid, text, boolean), public.ops_reminders() from public, anon;
grant execute on function public.cmp_days_left(date), public.cmp_save_document(jsonb), public.cmp_renew_document(uuid, jsonb),
  public.cmp_set_applicable(uuid, boolean, text), public.eq_save_equipment(jsonb), public.eq_record_check(uuid, text, text),
  public.eq_record_service(jsonb), public.eq_replace(uuid, uuid, text, boolean), public.ops_reminders() to authenticated;

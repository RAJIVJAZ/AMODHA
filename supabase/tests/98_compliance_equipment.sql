-- Documents & licences with renewal reminders; machinery & equipment with checks, warranty, services and costs.

-- Checklist is seeded; reminders follow the 20-day window until the renewal is recorded.
do $$
declare
  fssai uuid;
  r jsonb;
begin
  perform test.login('owner@test.local');
  perform test.eq('checklist seeded', (select count(*)::int from public.compliance_documents) >= 13, true);
  select id into fssai from public.compliance_documents where doc_type = 'fssai_license';
  perform test.put('fssai', fssai);
  perform test.eq('FSSAI number copied from company settings', (select document_number from public.compliance_documents where id = fssai), '12725998000262');
  perform test.eq('no expiry yet: listed as missing details',
    exists (select 1 from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = fssai::text and x ->> 'kind' = 'document_missing'), true);
  perform test.eq('GST (no expiry) is never a reminder',
    exists (select 1 from jsonb_array_elements(public.ops_reminders()) x where x ->> 'name' = 'GST registration'), false);

  -- 25 days left: not yet due.
  perform public.cmp_save_document(jsonb_build_object('id', fssai, 'expiry_date', public.ist_today() + 25, 'issue_date', public.ist_today() - 340));
  perform test.eq('25 days before: no reminder',
    exists (select 1 from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = fssai::text), false);
  -- 20 days left: due (and stays due every day until renewed).
  perform public.cmp_save_document(jsonb_build_object('id', fssai, 'expiry_date', public.ist_today() + 20));
  select x into r from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = fssai::text;
  perform test.eq('20 days before: reminder', r ->> 'action', 'renew');
  perform test.eq('days left shown', (r ->> 'days_left')::int, 20);
  -- Expired and still not renewed: still listed, as expired.
  perform public.cmp_save_document(jsonb_build_object('id', fssai, 'expiry_date', public.ist_today() - 3, 'issue_date', public.ist_today() - 368));
  select x into r from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = fssai::text;
  perform test.eq('after expiry: still reminded, as expired', r ->> 'action', 'expired');

  -- Renewal rules.
  perform test.fails('renewal needs the next expiry date', format('select public.cmp_renew_document(%L, %L)', fssai, '{}'), 'new expiry');
  perform test.fails('next expiry must be in the future',
    format('select public.cmp_renew_document(%L, %L)', fssai, jsonb_build_object('expiry_date', public.ist_today() - 1)), 'future');
  perform public.cmp_renew_document(fssai, jsonb_build_object('expiry_date', public.ist_today() + 365 * 5, 'document_number', '12725998000262',
    'document_url', 'https://drive.google.com/fssai-2031', 'cost', 7500, 'note', 'Renewed for 5 years'));
  perform test.eq('renewed: reminder cleared',
    exists (select 1 from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = fssai::text), false);
  perform test.eq('renewal history kept', (select count(*)::int from public.compliance_document_renewals where document_id = fssai), 1);
  perform test.eq('previous expiry recorded', (select previous_expiry from public.compliance_document_renewals where document_id = fssai), public.ist_today() - 3);
  perform test.eq('renewal audited', (select count(*)::int from public.audit_log where action = 'document.renew' and entity_id = fssai::text), 1);
  perform test.fails('links must be web links',
    format('select public.cmp_save_document(%L)', jsonb_build_object('id', fssai, 'document_url', 'javascript:alert(1)')), 'https://');

  -- A new document with its own reminder window; not applicable clears it with a reason.
  perform test.put('fire', public.cmp_save_document(jsonb_build_object('doc_type', 'other', 'title', 'Boiler inspection certificate',
    'expiry_date', public.ist_today() + 40, 'remind_days', 45)));
  perform test.eq('own reminder window (45 days)',
    exists (select 1 from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = test.id('fire')::text), true);
  perform test.fails('not applicable needs a reason', format('select public.cmp_set_applicable(%L, false, %L)', test.id('fire'), ''), 'reason');
  perform public.cmp_set_applicable(test.id('fire'), false, 'No boiler on the premises');
  perform test.eq('not applicable: no reminder',
    exists (select 1 from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = test.id('fire')::text), false);
end $$;
reset role;

-- Permissions: customers and dispatch staff cannot see or change documents.
do $$
begin
  perform test.login('cust@test.local');
  perform test.fails('customer cannot add documents', $q$select public.cmp_save_document('{"title":"Fake"}')$q$, 'permission');
  perform test.eq('customer sees no documents', (select count(*)::int from public.compliance_documents), 0);
  perform test.eq('customer gets no reminders', public.ops_reminders(), '[]'::jsonb);
end $$;
reset role;

-- Equipment: register, checklist, warranty, services and repair costs, replacement.
do $$
declare
  kadhai uuid;
  newk uuid;
  s uuid;
begin
  perform test.login('pm@test.local');
  kadhai := public.eq_save_equipment(jsonb_build_object('name', 'Khoya kadhai machine', 'category', 'cooking', 'make', 'Shree Engineering',
    'serial_number', 'SE-4410', 'purchase_date', public.ist_today() - 200, 'purchase_cost', 185000,
    'warranty_end', public.ist_today() + 165, 'service_interval_days', 90, 'location', 'Kitchen line 1'));
  perform test.put('kadhai', kadhai);
  perform test.eq('asset code given', (select asset_code from public.equipment where id = kadhai), 'MW-EQ-0001');
  perform test.eq('warranty starts on the purchase date', (select warranty_start from public.equipment where id = kadhai), public.ist_today() - 200);

  -- Checklist.
  perform test.fails('a problem needs a note', format('select public.eq_record_check(%L, %L)', kadhai, 'not_working'), 'wrong');
  perform public.eq_record_check(kadhai, 'not_working', 'Motor not starting');
  perform test.eq('not working: out of service', (select status from public.equipment where id = kadhai), 'out_of_service');
  perform test.eq('shows on reminders',
    exists (select 1 from jsonb_array_elements(public.ops_reminders()) x where x ->> 'id' = kadhai::text and x ->> 'kind' = 'not_working'), true);

  -- Repair inside the warranty period: flagged as under warranty automatically.
  s := public.eq_record_service(jsonb_build_object('equipment_id', kadhai, 'kind', 'repair', 'problem', 'Motor not starting',
    'work_done', 'Motor winding replaced', 'vendor', 'Shree Engineering', 'parts_cost', 0, 'labour_cost', 500, 'downtime_hours', 6,
    'status_after', 'working'));
  perform test.eq('repair under warranty', (select under_warranty from public.equipment_services where id = s), true);
  perform test.eq('back to working', (select status from public.equipment where id = kadhai), 'working');

  -- Service after the warranty ended (warranty override shown by changing the dates): not under warranty, next service set.
  perform public.eq_save_equipment(jsonb_build_object('id', kadhai, 'warranty_end', public.ist_today() - 1));
  s := public.eq_record_service(jsonb_build_object('equipment_id', kadhai, 'kind', 'service', 'work_done', 'Quarterly service, gearbox oil',
    'parts_cost', 1200, 'labour_cost', 800, 'other_cost', 150, 'status_after', 'working'));
  perform test.eq('service out of warranty', (select under_warranty from public.equipment_services where id = s), false);
  perform test.eq('total cost adds up', (select total_cost from public.equipment_services where id = s), 2150.00);
  perform test.eq('next service from the interval', (select next_service_due from public.equipment where id = kadhai), public.ist_today() + 90);
  perform test.eq('summary counts services and repairs',
    (select (services, repairs, total_cost) from public.v_equipment_summary where equipment_id = kadhai)::text, '(1,1,2650.00)');
  perform test.fails('no negative costs',
    format('select public.eq_record_service(%L)', jsonb_build_object('equipment_id', kadhai, 'work_done', 'x y', 'parts_cost', -5)), 'negative');
  perform test.fails('expense needs expenses permission',
    format('select public.eq_record_service(%L)', jsonb_build_object('equipment_id', kadhai, 'kind', 'repair', 'work_done', 'Belt changed',
      'labour_cost', 300, 'add_expense', true)), 'permission');

  -- Replacement by another machine in the register.
  newk := public.eq_save_equipment(jsonb_build_object('name', 'Khoya kadhai machine (new)', 'category', 'cooking'));
  perform test.fails('replacement needs a reason', format('select public.eq_replace(%L, %L, %L)', kadhai, newk, ''), 'reason');
  perform test.fails('cannot replace itself', format('select public.eq_replace(%L, %L, %L)', kadhai, kadhai, 'x'), 'itself');
  perform public.eq_replace(kadhai, newk, 'Upgraded to a bigger machine');
  perform test.eq('old machine marked replaced', (select (status, replaced_by = newk) from public.equipment where id = kadhai)::text, '(replaced,t)');
  perform test.fails('no checks on a replaced machine', format('select public.eq_record_check(%L, %L)', kadhai, 'working'), 'replaced');
end $$;
reset role;

-- The owner can put a repair straight into the books.
do $$
declare
  s uuid;
begin
  perform test.login('owner@test.local');
  s := public.eq_record_service(jsonb_build_object('equipment_id', (select id from public.equipment where name = 'Khoya kadhai machine (new)'),
    'kind', 'repair', 'work_done', 'Thermostat replaced', 'vendor', 'Local electrician', 'parts_cost', 900, 'labour_cost', 300,
    'add_expense', true, 'paid_from', '1000', 'payment_method', 'cash'));
  perform test.eq('expense created for the repair',
    (select (x.category_code, x.amount, x.payee) from public.expenses x join public.equipment_services es on es.expense_id = x.id where es.id = s)::text,
    '(repairs,1200.00,"Local electrician")');
end $$;
reset role;

do $$
begin
  perform test.login('cust@test.local');
  perform test.fails('customer cannot add machines', $q$select public.eq_save_equipment('{"name":"Fake"}')$q$, 'permission');
  perform test.eq('customer sees no machines', (select count(*)::int from public.equipment), 0);
end $$;
reset role;

-- The daily email claims the day once, and lists documents and machines together.
do $$
begin
  perform test.login('pm@test.local');
  perform public.eq_record_check((select id from public.equipment where name = 'Khoya kadhai machine (new)'), 'needs_attention', 'Thermostat flickering');
end $$;
reset role;

do $$
begin
  perform test.eq('first claim today', public._reminder_claim_today(array['owner@test.local'], 3), true);
  perform test.eq('second claim today refused', public._reminder_claim_today(array['owner@test.local'], 3), false);
  perform test.eq('all reminders for the email include both modules',
    (select count(distinct x ->> 'module')::int from jsonb_array_elements(public._reminders_all()) x), 2);
end $$;

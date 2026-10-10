-- Acceptance tests 1, 2, 9 (production side), 10, 11 and 12 (batch correction).
-- Every action runs as the real role through the same functions the app calls.

create table if not exists test.ids (name text primary key, id uuid not null);
grant select, insert, update on test.ids to authenticated, service_role;

create or replace function test.id(p_name text) returns uuid language sql stable as $$ select id from test.ids where name = p_name $$;
create or replace function test.put(p_name text, p_id uuid) returns void language sql as $$
  insert into test.ids values (p_name, p_id) on conflict (name) do update set id = excluded.id $$;
grant execute on all functions in schema test to authenticated, service_role;

-- Users -------------------------------------------------------------------------------
do $$
begin
  perform test.put('owner', test.make_user('owner@test.local', '{}', true));
  perform test.put('pm', test.make_user('pm@test.local', '{production_manager}'));
  perform test.put('fin', test.make_user('fin@test.local', '{finance_officer}'));
  perform test.put('qc', test.make_user('qc@test.local', '{quality_inspector}'));
  perform test.put('cust', test.make_user('cust@test.local'));
end $$;

-- Catalogue set-up by the administrator ---------------------------------------------------
do $$
declare
  milk_cake uuid;
  rid uuid;
  cfg500 uuid; cfg1k uuid; cfg5k uuid;
begin
  perform test.login('owner@test.local');
  perform test.put('farmer', public.cat_save_supplier('{"code":"F-RAMU","name":"Ramu Yadav","kind":"farmer","village":"Phaphamau"}'));
  perform test.put('vendor', public.cat_save_supplier('{"code":"V-SUGAR","name":"Prayag Traders","kind":"vendor","payment_terms_days":15}'));

  perform test.put('milk', (select id from public.items where code = 'RM-MILK'));
  perform public.cat_save_item(jsonb_build_object('id', test.id('milk'), 'name', 'Raw cow milk', 'shelf_life_days', 2, 'reorder_level', 100));
  perform test.put('sugar', public.cat_save_item('{"code":"RM-SUGAR","name":"Sugar","item_type":"raw_material","category":"sugar_ingredients","unit":"kg","reorder_level":50}'));
  perform test.put('smp', public.cat_save_item('{"code":"RM-SMP","name":"Skimmed milk powder","item_type":"raw_material","category":"smp","unit":"kg"}'));
  perform test.put('ghee', public.cat_save_item('{"code":"RM-GHEE","name":"Desi ghee","item_type":"raw_material","category":"fats","unit":"kg"}'));
  perform test.put('box500', public.cat_save_item('{"code":"PK-BOX-500","name":"Sweet box 500 g","item_type":"packaging","category":"packaging","unit":"box"}'));
  perform test.put('box1k', public.cat_save_item('{"code":"PK-BOX-1KG","name":"Sweet box 1 kg","item_type":"packaging","category":"packaging","unit":"box"}'));
  perform test.put('pouch5', public.cat_save_item('{"code":"PK-POUCH-5KG","name":"Bulk pouch 5 kg","item_type":"packaging","category":"packaging","unit":"pouch"}'));
  perform test.put('label', public.cat_save_item('{"code":"PK-LABEL","name":"Product label","item_type":"packaging","category":"packaging","unit":"label"}'));
  perform test.put('seal', public.cat_save_item('{"code":"PK-SEAL","name":"Tamper seal","item_type":"packaging","category":"packaging","unit":"pcs"}'));

  -- Milk Cake and its 500 g / 1 kg box SKUs come from the website catalogue; add the packaging materials.
  select id into milk_cake from public.products where code = 'MILK-CAKE';
  perform public.cat_save_product(jsonb_build_object('id', milk_cake, 'shelf_life_days', 10, 'hsn', '21069099', 'gst_rate', 5));
  perform test.put('milk_cake', milk_cake);
  select id into cfg500 from public.packaging_configs where code = 'BOX-500G';
  select id into cfg1k from public.packaging_configs where code = 'BOX-1KG';
  perform public.cat_save_packaging_config(jsonb_build_object('id', cfg500),
    jsonb_build_array(jsonb_build_object('item_id', test.id('box500'), 'qty_per_pack', 1), jsonb_build_object('item_id', test.id('label'), 'qty_per_pack', 1),
      jsonb_build_object('item_id', test.id('seal'), 'qty_per_pack', 1)));
  perform public.cat_save_packaging_config(jsonb_build_object('id', cfg1k),
    jsonb_build_array(jsonb_build_object('item_id', test.id('box1k'), 'qty_per_pack', 1), jsonb_build_object('item_id', test.id('label'), 'qty_per_pack', 1),
      jsonb_build_object('item_id', test.id('seal'), 'qty_per_pack', 1)));
  cfg5k := public.cat_save_packaging_config('{"code":"POUCH-5KG","name":"5 kg bulk pouch","pack_type":"pouch","net_qty":5,"net_unit":"kg","is_bulk":true}',
    jsonb_build_array(jsonb_build_object('item_id', test.id('pouch5'), 'qty_per_pack', 1), jsonb_build_object('item_id', test.id('label'), 'qty_per_pack', 1)));

  perform test.put('mc500', (select id from public.items where code = 'MILK-CAKE-500G'));
  perform test.put('mc1k', (select id from public.items where code = 'MILK-CAKE-1KG'));
  perform test.put('mc5k', public.cat_save_item(jsonb_build_object('code', 'MILK-CAKE-5KG-POUCH', 'name', 'Milk Cake — 5 kg bulk pouch', 'item_type', 'finished_good', 'category', 'finished_goods',
    'unit', 'pouch', 'product_id', milk_cake, 'packaging_config_id', cfg5k, 'net_qty', 5, 'sale_price', 3100, 'is_perishable', true)));

  -- Standard batch: 100 L milk, 20 kg sugar, 5 kg SMP, 2 kg ghee → 30 kg milk cake.
  rid := public.cat_save_recipe_draft(milk_cake, 30, jsonb_build_array(
    jsonb_build_object('item_id', test.id('milk'), 'qty', 100, 'is_main_input', true),
    jsonb_build_object('item_id', test.id('sugar'), 'qty', 20),
    jsonb_build_object('item_id', test.id('smp'), 'qty', 5),
    jsonb_build_object('item_id', test.id('ghee'), 'qty', 2)), 240, 'Reduce milk, add sugar, cook in ghee, set and cut.');
  perform public.cat_activate_recipe(rid);
  perform test.put('recipe_v1', rid);
end $$;
reset role;

-- Opening stock (administrator) and milk collections (production manager) ----------------
do $$
begin
  perform test.login('owner@test.local');
  perform public.inv_receive_opening_stock(test.id('sugar'), 100, 42, null, 'SUP-LOT-77');
  perform public.inv_receive_opening_stock(test.id('smp'), 20, 300);
  perform public.inv_receive_opening_stock(test.id('ghee'), 10, 600);
  perform public.inv_receive_opening_stock(test.id('box500'), 200, 6);
  perform public.inv_receive_opening_stock(test.id('box1k'), 100, 9);
  perform public.inv_receive_opening_stock(test.id('pouch5'), 20, 15);
  perform public.inv_receive_opening_stock(test.id('label'), 500, 0.5);
  perform public.inv_receive_opening_stock(test.id('seal'), 500, 0.3);
  perform test.fails('finished goods cannot be added as opening stock',
    format('select public.inv_receive_opening_stock(%L, 10, 100)', test.id('mc500')), 'only by releasing');
end $$;
reset role;

do $$
begin
  perform test.login('pm@test.local');
  perform test.put('col1', public.proc_record_collection(test.id('farmer'), public.ist_today(), 'morning', 125, 5, 50, 4.2, 8.6, 6, '{}', 'Can 1-3', null, 'key-col-1-aaaa'));
  perform test.put('col2', public.proc_record_collection(test.id('farmer'), public.ist_today(), 'evening', 120, 0, 50, 2.1, 8.4, 11, '{}', 'Can 4-6'));
  perform test.fails('duplicate submission is ignored',
    format('select public.proc_record_collection(%L, public.ist_today(), %L, 125, 5, 50, 4.2, 8.6, 6, %L, %L, null, %L)', test.id('farmer'), 'morning', '{}', 'Can 1-3', 'key-col-1-aaaa'),
    'already saved');
end $$;
reset role;

do $$
begin
  perform test.eq('collection 1 accepted litres', (select qty_accepted from public.milk_collections where id = test.id('col1')), 120.000);
  perform test.eq('collection 1 amount payable', (select amount from public.milk_collections where id = test.id('col1')), 6000.00);
  perform test.eq('collection 2 flagged (low fat, warm)', (select quality_flags from public.milk_collections where id = test.id('col2')),
    array['Fat out of range', 'Temperature at receipt out of range']);
  perform test.eq('raw milk in stock', (select on_hand from public.v_stock_summary where item_id = test.id('milk')), 240.000);
end $$;

-- TEST 1: manufacturing batch -----------------------------------------------------------
do $$
declare
  bid uuid;
begin
  perform test.login('pm@test.local');
  bid := public.prod_create_batch(test.id('milk_cake'), public.ist_today(), 60, 'morning', null, 'Kitchen 1', 'Suresh', '500 g and 1 kg boxes, 5 kg pouches');
  perform test.put('batch1', bid);
end $$;
reset role;

do $$
begin
  perform test.eq('batch number format', (select batch_no ~ ('^MW-MFG-' || to_char(public.ist_today(), 'YYYY') || '-[0-9]{4}$') from public.production_batches where id = test.id('batch1')), true);
  perform test.eq('planned milk scaled 2x', (select planned_qty from public.batch_materials where batch_id = test.id('batch1') and item_id = test.id('milk')), 200.000);
  perform test.eq('planned sugar scaled 2x', (select planned_qty from public.batch_materials where batch_id = test.id('batch1') and item_id = test.id('sugar')), 40.000);
  perform test.eq('planned SMP scaled 2x', (select planned_qty from public.batch_materials where batch_id = test.id('batch1') and item_id = test.id('smp')), 10.000);
  perform test.eq('planned ghee scaled 2x', (select planned_qty from public.batch_materials where batch_id = test.id('batch1') and item_id = test.id('ghee')), 4.000);
end $$;

do $$
begin
  perform test.login('pm@test.local');
  perform public.prod_issue_material(test.id('batch1'), test.id('milk'), 205, null, null, 'key-issue-milk-1');
  perform test.fails('same material issue cannot be posted twice',
    format('select public.prod_issue_material(%L, %L, 205, null, null, %L)', test.id('batch1'), test.id('milk'), 'key-issue-milk-1'), 'already saved');
  perform public.prod_issue_material(test.id('batch1'), test.id('sugar'), 44);
  perform public.prod_issue_material(test.id('batch1'), test.id('smp'), 10);
  perform public.prod_issue_material(test.id('batch1'), test.id('ghee'), 4);
  perform test.fails('cannot issue more sugar than in stock',
    format('select public.prod_issue_material(%L, %L, 500)', test.id('batch1'), test.id('sugar')), 'not enough sugar');
  perform public.prod_start_batch(test.id('batch1'));
  perform test.fails('sugar variance (10%) needs an explanation',
    format('select public.prod_complete_batch(%L, 58, 57, 1)', test.id('batch1')), 'explain the variance for: sugar');
  perform public.prod_complete_batch(test.id('batch1'), 58, 57, 1, 0, null, 'Set and cut into 2 trays',
    jsonb_build_object(test.id('sugar'), 'Extra sugar added: milk was less sweet'));
end $$;
reset role;

do $$
begin
  perform test.eq('milk issued FEFO from both collections', (select count(distinct lot_id)::int from public.stock_movements
    where doc_type = 'batch' and doc_id = test.id('batch1')::text and item_id = test.id('milk')), 2);
  perform test.eq('raw milk left', (select on_hand from public.v_stock_summary where item_id = test.id('milk')), 35.000);
  perform test.eq('sugar left', (select on_hand from public.v_stock_summary where item_id = test.id('sugar')), 56.000);
  perform test.eq('SMP left', (select on_hand from public.v_stock_summary where item_id = test.id('smp')), 10.000);
  perform test.eq('ghee left', (select on_hand from public.v_stock_summary where item_id = test.id('ghee')), 6.000);
  perform test.eq('actual milk recorded', (select actual_qty from public.v_batch_materials where batch_id = test.id('batch1') and item_id = test.id('milk')), 205.000);
  perform test.eq('yield % vs plan', (select yield_pct from public.production_batches where id = test.id('batch1')), 96.67);
  perform test.eq('batch awaits quality approval', (select status from public.production_batches where id = test.id('batch1')), 'awaiting_qc');
end $$;

-- TEST 9 (production side): a production manager records QC results but cannot approve them.
do $$
declare
  p uuid;
begin
  perform test.login('pm@test.local');
  perform test.fails('production manager cannot approve quality',
    format('select public.prod_record_qc(%L, %L, %L)', test.id('batch1'), '[]', 'approved'), 'permission');
end $$;
reset role;

do $$
declare
  results jsonb;
begin
  perform test.login('qc@test.local');
  select jsonb_agg(jsonb_build_object('parameter_id', id, 'passed', true)) into results
  from public.quality_parameters where scope = 'product' and product_id is null;
  perform public.prod_record_qc(test.id('batch1'), results, 'approved', 'Good colour and grain');
  perform test.fails('quality inspector cannot create batches',
    format('select public.prod_create_batch(%L, public.ist_today(), 10, %L)', test.id('milk_cake'), 'morning'), 'permission');
end $$;
reset role;

-- TEST 2: one batch packed into 500 g boxes, 1 kg boxes and 5 kg pouches ----------------------
do $$
begin
  perform test.login('pm@test.local');
  perform public.prod_record_packaging(test.id('batch1'), test.id('mc500'), 40, 0, 1, 'Meena');
  perform public.prod_record_packaging(test.id('batch1'), test.id('mc1k'), 20, 0, 0, 'Meena');
  perform test.fails('cannot pack more than the batch made',
    format('select public.prod_record_packaging(%L, %L, 10, 0, 0, %L)', test.id('batch1'), test.id('mc5k'), 'Meena'), 'exceed');
  perform public.prod_record_packaging(test.id('batch1'), test.id('mc5k'), 3, 0, 0, 'Raju');
  perform test.fails('a 1.5 kg gap must be explained',
    format('select public.prod_complete_packaging(%L, 0)', test.id('batch1')), 'differs from finished quantity');
  perform public.prod_complete_packaging(test.id('batch1'), 1.5, 'Trimmings given as staff samples');
  perform public.prod_release_batch(test.id('batch1'));
end $$;
reset role;

do $$
declare
  b public.production_batches;
  fg_value numeric;
begin
  select * into b from public.production_batches where id = test.id('batch1');
  perform test.eq('batch released', b.status, 'released');
  perform test.eq('500 g boxes in stock', (select on_hand from public.v_stock_summary where item_id = test.id('mc500')), 40.000);
  perform test.eq('1 kg boxes in stock', (select on_hand from public.v_stock_summary where item_id = test.id('mc1k')), 20.000);
  perform test.eq('5 kg pouches in stock', (select on_hand from public.v_stock_summary where item_id = test.id('mc5k')), 3.000);
  perform test.eq('finished lots carry the batch number',
    (select count(*)::int from public.stock_lots where batch_id = b.id and lot_code = b.batch_no), 3);
  perform test.eq('packed + unpacked reconciles with finished', (select sum(net_qty_total) from public.batch_packaging where batch_id = b.id) + b.unpacked_qty, b.finished_qty);
  -- Packaging BOM: 41 + 20 boxes, 41 + 20 + 3 labels, 41 + 20 seals, 3 pouches.
  perform test.eq('500 g boxes used (incl. 1 damaged)', (select on_hand from public.v_stock_summary where item_id = test.id('box500')), 159.000);
  perform test.eq('1 kg boxes used', (select on_hand from public.v_stock_summary where item_id = test.id('box1k')), 80.000);
  perform test.eq('pouches used', (select on_hand from public.v_stock_summary where item_id = test.id('pouch5')), 17.000);
  perform test.eq('labels used', (select on_hand from public.v_stock_summary where item_id = test.id('label')), 436.000);
  perform test.eq('seals used', (select on_hand from public.v_stock_summary where item_id = test.id('seal')), 439.000);
  -- Cost: milk 205 L × ₹50, sugar 44 × 42, SMP 10 × 300, ghee 4 × 600 = 10250 + 1848 + 3000 + 2400.
  perform test.eq('material cost', b.material_cost, 17498.00);
  perform test.eq('packaging cost', b.packaging_cost, round(41 * 6 + 20 * 9 + 3 * 15 + 64 * 0.5 + 61 * 0.3, 2));
  select sum(qty_received * unit_cost) into fg_value from public.stock_lots where batch_id = b.id;
  perform test.near('finished-goods value equals batch cost', fg_value, b.total_cost, 0.10);
  perform test.eq('stock cannot go negative (constraint)', (select count(*)::int from public.stock_lots where qty_on_hand < 0), 0);
end $$;

-- TEST 11: traceability ---------------------------------------------------------------------
do $$
declare
  t jsonb;
begin
  perform test.login('pm@test.local');
  t := public.prod_batch_trace(test.id('batch1'));
  perform test.eq('trace: milk lots name the farmer', (select count(*)::int from jsonb_array_elements(t -> 'materials') m
    where m ->> 'item' = 'Raw cow milk' and m ->> 'supplier' = 'Ramu Yadav' and m ->> 'collection_no' is not null), 2);
  perform test.eq('trace: sugar keeps supplier lot', (select m ->> 'supplier_lot' from jsonb_array_elements(t -> 'materials') m where m ->> 'item' = 'Sugar'), 'SUP-LOT-77');
  perform test.eq('trace: three finished lots', jsonb_array_length(t -> 'finished_lots'), 3);
  perform test.eq('trace: status history recorded', (select count(*)::int from jsonb_array_elements(t -> 'events')) >= 8, true);
end $$;
reset role;

-- TEST 12 (batch side): correcting a recorded figure keeps the original --------------------
do $$
declare
  bid uuid;
begin
  perform test.login('pm@test.local');
  bid := public.prod_create_batch(test.id('milk_cake'), public.ist_today(), 7.5, 'evening');
  perform test.put('batch2', bid);
  perform public.prod_issue_material(bid, test.id('milk'), 25);
  perform public.prod_issue_material(bid, test.id('sugar'), 5);
  perform public.prod_issue_material(bid, test.id('smp'), 1.25);
  perform public.prod_issue_material(bid, test.id('ghee'), 0.5);
  perform public.prod_complete_batch(bid, 7, 7, 0, 0, null, null, '{}');
  perform public.prod_correct_output(bid, 'finished_qty', 6.5, 'Weighed again: 0.5 kg stuck to the tray');
end $$;
reset role;

do $$
begin
  perform test.eq('correction keeps the old value', (select old_value || ' -> ' || new_value from public.batch_corrections where batch_id = test.id('batch2')), '7.000 -> 6.5');
  perform test.eq('correction keeps reason and person', (select reason is not null and corrected_by = test.id('pm') from public.batch_corrections where batch_id = test.id('batch2')), true);
  perform test.eq('audit log has the correction', (select count(*)::int from public.audit_log where action = 'batch.correct' and entity_id = test.id('batch2')::text), 1);
  perform test.eq('the audit log cannot be edited', (select count(*)::int from pg_trigger where tgname = 'audit_log_append_only'), 1);
end $$;

do $$
begin
  perform test.login('pm@test.local');
  perform test.fails('a stock movement cannot be deleted', 'delete from public.stock_movements', 'permission denied');
  perform test.fails('a batch cannot be edited directly', format('update public.production_batches set finished_qty = 99 where id = %L', test.id('batch1')), 'permission denied');
end $$;
reset role;

do $$
begin
  perform test.fails('even the database owner cannot rewrite movements', 'update public.stock_movements set qty = 1', 'permanent');
end $$;

-- Cancelling a batch before production returns its materials to the same lots ---------------
do $$
declare
  bid uuid;
  sugar_before numeric;
begin
  perform test.login('pm@test.local');
  bid := public.prod_create_batch(test.id('milk_cake'), public.ist_today(), 6, 'night');
  perform public.prod_issue_material(bid, test.id('sugar'), 4);
  perform test.put('batch3', bid);
end $$;
reset role;
do $$
begin
  perform test.login('owner@test.local');
  perform public.prod_cancel_batch(test.id('batch3'), 'Gas supply problem', 'return_materials');
end $$;
reset role;
do $$
begin
  perform test.eq('cancelled batch returned sugar', (select on_hand from public.v_stock_summary where item_id = test.id('sugar')), 51.000);
  perform test.eq('cancelled batch status', (select status from public.production_batches where id = test.id('batch3')), 'cancelled');
end $$;

-- Customers see none of this -------------------------------------------------------------
do $$
begin
  perform test.login('cust@test.local');
  perform test.eq('customer sees no stock', (select count(*)::int from public.stock_lots), 0);
  perform test.eq('customer sees no batches', (select count(*)::int from public.production_batches), 0);
  perform test.eq('customer sees no audit log', (select count(*)::int from public.audit_log), 0);
  perform test.fails('customer cannot record a collection',
    format('select public.proc_record_collection(%L, public.ist_today(), %L, 10, 0, 50)', test.id('farmer'), 'morning'), 'permission');
end $$;
reset role;

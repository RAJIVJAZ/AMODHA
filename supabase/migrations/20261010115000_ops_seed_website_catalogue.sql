-- The website's existing sweets catalogue as products and sellable SKUs, so website orders can be
-- allocated to stock and dispatched. Prices and tax codes are copied from the live site's catalogue
-- (src/data/sweets.ts, src/data/tax.ts). Recipes, shelf life and packaging materials are NOT invented:
-- the administrator adds them in the business app.

insert into public.packaging_configs (code, name, pack_type, net_qty, net_unit) values
  ('BOX-250G', '250 g box', 'box', 0.25, 'kg'),
  ('BOX-500G', '500 g box', 'box', 0.5, 'kg'),
  ('BOX-1KG', '1 kg box', 'box', 1, 'kg'),
  ('TIN-1KG', '1 kg tin', 'tin', 1, 'kg')
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('MILK-CAKE', 'Milk Cake', 'sweets', 'manufactured', 'kg', 'Dense, caramelised milk cake slow-cooked from fresh khoya in pure desi ghee — golden, grainy and rich.', '21069099', 5, true, 1)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MILK-CAKE-250G', 'Milk Cake — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 180, 'milk-cake', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MILK-CAKE' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MILK-CAKE-500G', 'Milk Cake — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 340, 'milk-cake', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MILK-CAKE' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MILK-CAKE-1KG', 'Milk Cake — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 650, 'milk-cake', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MILK-CAKE' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('KALAKAND', 'Kalakand', 'sweets', 'manufactured', 'kg', 'Soft, moist kalakand made from fresh paneer and reduced milk — gently sweet with a delicate grainy texture.', '21069099', 5, true, 2)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KALAKAND-250G', 'Kalakand — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 200, 'kalakand', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KALAKAND' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KALAKAND-500G', 'Kalakand — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 380, 'kalakand', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KALAKAND' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KALAKAND-1KG', 'Kalakand — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 720, 'kalakand', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KALAKAND' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('CHOCOLATE-BARFI', 'Chocolate Barfi', 'sweets', 'manufactured', 'kg', 'Fudgy cocoa-and-khoya barfi finished with almonds and pistachios — classic mithai with a modern twist.', '21069099', 5, true, 3)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'CHOCOLATE-BARFI-250G', 'Chocolate Barfi — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 220, 'chocolate-barfi', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'CHOCOLATE-BARFI' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'CHOCOLATE-BARFI-500G', 'Chocolate Barfi — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 420, 'chocolate-barfi', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'CHOCOLATE-BARFI' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'CHOCOLATE-BARFI-1KG', 'Chocolate Barfi — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 800, 'chocolate-barfi', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'CHOCOLATE-BARFI' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('DODA-BARFI', 'Doda Barfi', 'sweets', 'manufactured', 'kg', 'Dense, deeply roasted doda barfi with a firm, grainy bite and a rich ghee aroma.', '21069099', 5, true, 4)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'DODA-BARFI-250G', 'Doda Barfi — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 190, 'doda-barfi', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'DODA-BARFI' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'DODA-BARFI-500G', 'Doda Barfi — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 360, 'doda-barfi', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'DODA-BARFI' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'DODA-BARFI-1KG', 'Doda Barfi — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 680, 'doda-barfi', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'DODA-BARFI' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('MALAI-BARFI', 'Malai Barfi', 'sweets', 'manufactured', 'kg', 'Pale, creamy malai barfi that melts in the mouth, generously topped with pistachios.', '21069099', 5, true, 5)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MALAI-BARFI-250G', 'Malai Barfi — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 210, 'malai-barfi', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MALAI-BARFI' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MALAI-BARFI-500G', 'Malai Barfi — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 400, 'malai-barfi', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MALAI-BARFI' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'MALAI-BARFI-1KG', 'Malai Barfi — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 760, 'malai-barfi', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'MALAI-BARFI' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('PEDA', 'Peda', 'sweets', 'manufactured', 'kg', 'Hand-shaped khoya peda with a soft crumb, a hint of cardamom and pistachio on top.', '21069099', 5, true, 6)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PEDA-250G', 'Peda — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 180, 'peda', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'PEDA' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PEDA-500G', 'Peda — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 340, 'peda', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'PEDA' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PEDA-1KG', 'Peda — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 640, 'peda', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'PEDA' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('KUNDA', 'Kunda', 'sweets', 'manufactured', 'kg', 'Prayagraj''s own specialty — a thick, caramelised khoya sweet, rich enough to eat by the spoon.', '21069099', 5, true, 7)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KUNDA-250G', 'Kunda — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 220, 'kunda', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KUNDA' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KUNDA-500G', 'Kunda — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 420, 'kunda', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KUNDA' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'KUNDA-1KG-TIN', 'Kunda — 1 kg tin', 'finished_good', 'finished_goods', 'tin', p.id, c.id, 1, 800, 'kunda', '1 kg tin', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'KUNDA' and c.code = 'TIN-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('BIKANERI-CAKE', 'Bikaneri Cake', 'sweets', 'manufactured', 'kg', 'A firm, layered milk sweet with rich caramel notes that keeps and travels well.', '21069099', 5, true, 8)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'BIKANERI-CAKE-250G', 'Bikaneri Cake — 250 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.25, 200, 'bikaneri-cake', '250 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'BIKANERI-CAKE' and c.code = 'BOX-250G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'BIKANERI-CAKE-500G', 'Bikaneri Cake — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 380, 'bikaneri-cake', '500 g', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'BIKANERI-CAKE' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'BIKANERI-CAKE-1KG', 'Bikaneri Cake — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 720, 'bikaneri-cake', '1 kg', true, 'FEFO', '21069099', 5
from public.products p, public.packaging_configs c where p.code = 'BIKANERI-CAKE' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

insert into public.products (code, name, category, source, base_unit, description, hsn, gst_rate, pure_desi_ghee, sort_order)
values ('PREMIUM-DRY-FRUIT-BOX', 'Premium Dry Fruit Box', 'sweets', 'manufactured', 'kg', 'Almonds, cashews, pistachios, walnuts and raisins in an elegant Mithai Wallah gift box — thoughtful inside, impressive outside.', '08135020', 5, false, 9)
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PREMIUM-DRY-FRUIT-BOX-500G', 'Premium Dry Fruit Box — 500 g', 'finished_good', 'finished_goods', 'box', p.id, c.id, 0.5, 900, 'premium-dry-fruit-box', '500 g', false, 'FEFO', '08135020', 5
from public.products p, public.packaging_configs c where p.code = 'PREMIUM-DRY-FRUIT-BOX' and c.code = 'BOX-500G'
on conflict (code) do nothing;
insert into public.items (code, name, item_type, category, unit, product_id, packaging_config_id, net_qty, sale_price, storefront_slug, storefront_pack, is_perishable, rotation, hsn, gst_rate)
select 'PREMIUM-DRY-FRUIT-BOX-1KG', 'Premium Dry Fruit Box — 1 kg', 'finished_good', 'finished_goods', 'box', p.id, c.id, 1, 1700, 'premium-dry-fruit-box', '1 kg', false, 'FEFO', '08135020', 5
from public.products p, public.packaging_configs c where p.code = 'PREMIUM-DRY-FRUIT-BOX' and c.code = 'BOX-1KG'
on conflict (code) do nothing;

-- The stock item that accepted milk from the collection register goes into.
insert into public.items (code, name, item_type, category, unit, is_perishable, rotation, shelf_life_days)
values ('RM-MILK', 'Raw milk', 'raw_material', 'raw_milk', 'l', true, 'FEFO', 1)
on conflict (code) do nothing;

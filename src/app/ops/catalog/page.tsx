import Link from "next/link";
import { JsonObjectFields } from "@/components/ops/json-fields";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, PageHeader, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { label, param, qty } from "@/lib/ops/format";

export const metadata = { title: "Products & recipes" };

type Product = { id: string; code: string; name: string; category: string; source: string; brand: string; base_unit: string; is_active: boolean; is_subscribable: boolean; show_in_app: boolean };
type Item = { id: string; code: string; name: string; item_type: string; category: string; unit: string; is_active: boolean; reorder_level: number; standard_cost: number; shelf_life_days: number | null; rotation: string };
type Config = { id: string; code: string; name: string; pack_type: string; net_qty: number; net_unit: string; is_bulk: boolean; is_active: boolean; packaging_bom: { item_id: string; qty_per_pack: number; items: { name: string; unit: string } | null }[] };
type Param = { id: string; scope: string; name: string; kind: string; min_value: number | null; max_value: number | null; unit: string | null; is_required: boolean; is_active: boolean; products: { name: string } | null };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("catalog");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "products";
  const canCreate = ops.can("catalog", "create");
  const canEdit = ops.can("catalog", "edit");

  const [{ data: products }, { data: items }, { data: configs }, { data: params }, { data: units }, { data: categories }] = await Promise.all([
    ops.supabase.from("products").select("id, code, name, category, source, brand, base_unit, is_active, is_subscribable, show_in_app").order("sort_order").order("name"),
    ops.supabase.from("items").select("id, code, name, item_type, category, unit, is_active, reorder_level, standard_cost, shelf_life_days, rotation").order("item_type").order("name"),
    ops.supabase.from("packaging_configs").select("id, code, name, pack_type, net_qty, net_unit, is_bulk, is_active, packaging_bom(item_id, qty_per_pack, items(name, unit))").order("net_qty"),
    ops.supabase.from("quality_parameters").select("id, scope, name, kind, min_value, max_value, unit, is_required, is_active, products(name)").order("scope").order("sort_order"),
    ops.supabase.from("units").select("code, label").order("sort_order"),
    ops.supabase.from("categories").select("code, label, kind").eq("is_active", true).order("sort_order"),
  ]);
  const unitOpts = ((units ?? []) as { code: string; label: string }[]).map((u) => ({ value: u.code, label: u.label }));
  const cats = (categories ?? []) as { code: string; label: string; kind: string }[];
  const invCats = cats.filter((c) => c.kind === "inventory").map((c) => ({ value: c.code, label: c.label }));
  const prodCats = cats.filter((c) => c.kind === "catalog").map((c) => ({ value: c.code, label: c.label }));
  const allItems = (items ?? []) as Item[];
  const materials = allItems.filter((i) => !["finished_good", "purchased_good"].includes(i.item_type));
  const packagingItems = allItems.filter((i) => ["packaging", "consumable"].includes(i.item_type) && i.is_active);

  return (
    <>
      <PageHeader title="Products & recipes" description="Everything the factory makes, buys and packs. Recipes are versioned: an approved version never changes, so old batches keep their costs." />
      <Tabs
        current={tab}
        items={[
          { key: "products", label: "Products", href: "/ops/catalog" },
          { key: "materials", label: "Materials & packaging stock", href: "/ops/catalog?tab=materials" },
          { key: "packaging", label: "Packaging configurations", href: "/ops/catalog?tab=packaging" },
          { key: "quality", label: "Quality checks", href: "/ops/catalog?tab=quality" },
        ]}
      />

      {tab === "products" ? (
        <div className="flex flex-col gap-4">
          <Card title="Products" description="Open a product to manage its pack sizes, prices, recipe and quality checks.">
            {(products ?? []).length ? (
              <Table head={["Product", "Code", "Category", "Made / bought", "Unit", "Flags"]}>
                {((products ?? []) as Product[]).map((p) => (
                  <tr key={p.id} className={p.is_active ? "" : "opacity-50"}>
                    <Td>
                      <Link href={`/ops/catalog/products/${p.id}`} className="font-semibold text-primary-dark hover:underline">
                        {p.name}
                      </Link>
                      {p.brand !== "Mithai Wallah" ? <span className="text-xs text-dark/55"> · {p.brand}</span> : null}
                    </Td>
                    <Td>{p.code}</Td>
                    <Td>{label(p.category)}</Td>
                    <Td>{p.source}</Td>
                    <Td>{p.base_unit}</Td>
                    <Td>
                      {p.is_subscribable ? <Badge tone="info">subscription</Badge> : null} {p.show_in_app ? <Badge tone="good">in app</Badge> : null}
                      {p.is_active ? null : <Badge>inactive</Badge>}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No products yet.</Empty>
            )}
          </Card>
          {canCreate ? (
            <Card title="Add a product" description="Made products need a recipe; bought products (e.g. Amul butter, bread, eggs) are sold from purchased stock.">
              <OpsForm fn="cat_save_product" submitLabel="Add product" success="Product added" redirectTo="/ops/catalog/products/{id}">
                <JsonObjectFields
                  name="p#json"
                  fields={[
                    { key: "code", label: "Code", required: true, placeholder: "e.g. PANEER" },
                    { key: "name", label: "Name", required: true },
                    { key: "category", label: "Category", required: true, options: prodCats },
                    { key: "source", label: "Made or bought", required: true, options: [{ value: "manufactured", label: "Made by us" }, { value: "purchased", label: "Bought in" }] },
                    { key: "brand", label: "Brand", defaultValue: "Mithai Wallah" },
                    { key: "base_unit", label: "Unit of quantity", required: true, options: unitOpts },
                    { key: "shelf_life_days", label: "Shelf life (days)", type: "number" },
                    { key: "hsn", label: "HSN code" },
                    { key: "gst_rate", label: "GST %", type: "number" },
                    { key: "storage_conditions", label: "Storage conditions", wide: true },
                    { key: "qc_required", label: "Quality check before release", type: "checkbox", defaultValue: true },
                    { key: "pure_desi_ghee", label: "Made with 100% pure desi ghee", type: "checkbox" },
                    { key: "is_subscribable", label: "Available as milk subscription", type: "checkbox" },
                    { key: "show_in_app", label: "Show in customer app", type: "checkbox" },
                  ]}
                />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "materials" ? (
        <div className="flex flex-col gap-4">
          <Card title="Materials, packaging and consumables">
            {materials.length ? (
              <Table head={["Item", "Code", "Type", "Category", "Unit", "Reorder level", "Rotation", "Shelf life"]}>
                {materials.map((i) => (
                  <tr key={i.id} className={i.is_active ? "" : "opacity-50"}>
                    <Td>
                      <Link href={`/ops/inventory/${i.id}`} className="font-semibold text-primary-dark hover:underline">
                        {i.name}
                      </Link>
                    </Td>
                    <Td>{i.code}</Td>
                    <Td>{label(i.item_type)}</Td>
                    <Td>{label(i.category)}</Td>
                    <Td>{i.unit}</Td>
                    <Td right>{qty(i.reorder_level, i.unit)}</Td>
                    <Td>{i.rotation}</Td>
                    <Td>{i.shelf_life_days ? `${i.shelf_life_days} days` : "—"}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No materials yet.</Empty>
            )}
          </Card>
          {canCreate ? (
            <Card title="Add a material, packaging item or consumable" description="E.g. Sugar (kg), SMP (kg), 500 g box (box), label (label), seal (pcs).">
              <OpsForm fn="cat_save_item" submitLabel="Add item" success="Item added">
                <JsonObjectFields
                  name="p#json"
                  fields={[
                    { key: "code", label: "Code", required: true, placeholder: "e.g. RM-SUGAR" },
                    { key: "name", label: "Name", required: true },
                    { key: "item_type", label: "Type", required: true, options: [
                      { value: "raw_material", label: "Raw material / ingredient" },
                      { value: "packaging", label: "Packaging material" },
                      { value: "consumable", label: "Consumable" },
                    ] },
                    { key: "category", label: "Category", required: true, options: invCats },
                    { key: "unit", label: "Stock unit", required: true, options: unitOpts },
                    { key: "reorder_level", label: "Reorder level", type: "number" },
                    { key: "reorder_qty", label: "Reorder quantity", type: "number" },
                    { key: "standard_cost", label: "Standard cost per unit (₹)", type: "number" },
                    { key: "shelf_life_days", label: "Shelf life (days)", type: "number" },
                    { key: "is_perishable", label: "Perishable (use oldest expiry first)", type: "checkbox" },
                    { key: "hsn", label: "HSN code" },
                    { key: "gst_rate", label: "GST %", type: "number" },
                  ]}
                />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "packaging" ? (
        <div className="flex flex-col gap-4">
          <Card title="Packaging configurations" description="What one pack uses. Packing a batch deducts these from stock for every pack, including rejected and damaged ones.">
            {(configs ?? []).length ? (
              <div className="flex flex-col divide-y divide-ink/10">
                {((configs ?? []) as unknown as Config[]).map((c) => (
                  <details key={c.id} className="py-2">
                    <summary className="cursor-pointer">
                      <span className="font-semibold text-ink">{c.name}</span>{" "}
                      <span className="text-sm text-dark/60">
                        {c.code} · {qty(c.net_qty, c.net_unit)} per {c.pack_type}
                        {c.is_bulk ? " · bulk" : ""} ·{" "}
                        {c.packaging_bom.length ? c.packaging_bom.map((b) => `${b.qty_per_pack} ${b.items?.name}`).join(", ") : "no materials set"}
                      </span>
                    </summary>
                    {canEdit ? (
                      <div className="mt-2 rounded-xl bg-ink/5 p-3">
                        <OpsForm fn="cat_save_packaging_config" submitLabel="Save materials per pack" success="Saved" resetOnSuccess={false}>
                          <input type="hidden" name="p#json" value={JSON.stringify({ id: c.id })} />
                          <LineEditor
                            name="p_bom#json"
                            addLabel="Add material"
                            initial={c.packaging_bom.map((b) => ({ item_id: b.item_id, qty_per_pack: String(b.qty_per_pack) }))}
                            columns={[
                              { key: "item_id", label: "Packaging material", type: "select", required: true, options: packagingItems.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` })) },
                              { key: "qty_per_pack", label: "Per pack", type: "number", width: "8rem" },
                            ]}
                          />
                        </OpsForm>
                      </div>
                    ) : null}
                  </details>
                ))}
              </div>
            ) : (
              <Empty>No packaging configurations yet.</Empty>
            )}
          </Card>
          {canCreate ? (
            <Card title="Add a packaging configuration" description="E.g. 500 g box, 1 kg box, 2 kg box, 3 kg box, 5 kg pouch, 10 kg pouch, 1 L glass bottle.">
              <OpsForm fn="cat_save_packaging_config" submitLabel="Add configuration" success="Added">
                <JsonObjectFields
                  name="p#json"
                  fields={[
                    { key: "code", label: "Code", required: true, placeholder: "e.g. POUCH-10KG" },
                    { key: "name", label: "Name", required: true, placeholder: "10 kg pouch" },
                    { key: "pack_type", label: "Pack type", required: true, options: ["box", "pouch", "bottle", "packet", "tray", "tub", "tin", "jar", "crate", "other"] },
                    { key: "net_qty", label: "Product per pack", type: "number", required: true },
                    { key: "net_unit", label: "Unit", required: true, options: unitOpts },
                    { key: "is_bulk", label: "Bulk pack", type: "checkbox" },
                  ]}
                />
                <p className="text-sm font-semibold text-ink">Materials used per pack</p>
                <LineEditor
                  name="p_bom#json"
                  addLabel="Add material"
                  columns={[
                    { key: "item_id", label: "Packaging material", type: "select", required: true, options: packagingItems.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` })) },
                    { key: "qty_per_pack", label: "Per pack", type: "number", width: "8rem" },
                  ]}
                />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "quality" ? (
        <div className="flex flex-col gap-4">
          <Card title="Quality checks" description="General product checks apply to every product; product-specific ones are added on the product page.">
            <Table head={["Check", "Applies to", "Type", "Range", "Required", "Status"]}>
              {((params ?? []) as unknown as Param[]).map((q) => (
                <tr key={q.id} className={q.is_active ? "" : "opacity-50"}>
                  <Td>{q.name}</Td>
                  <Td>{q.scope === "milk_receipt" ? "Milk received" : (q.products?.name ?? "All products")}</Td>
                  <Td>{label(q.kind)}</Td>
                  <Td>{q.kind === "numeric" ? `${q.min_value ?? "–"} to ${q.max_value ?? "–"} ${q.unit ?? ""}` : "—"}</Td>
                  <Td>{q.is_required ? "yes" : "no"}</Td>
                  <Td>
                    {canEdit ? (
                      <OpsForm fn="cat_save_quality_parameter" submitLabel={q.is_active ? "Switch off" : "Switch on"} variant="quiet" inline success="Updated">
                        <input type="hidden" name="p#json" value={JSON.stringify({ id: q.id, is_active: !q.is_active })} />
                      </OpsForm>
                    ) : q.is_active ? (
                      "on"
                    ) : (
                      "off"
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
          {canEdit ? (
            <Card title="Add a check">
              <OpsForm fn="cat_save_quality_parameter" submitLabel="Add check" success="Added">
                <JsonObjectFields
                  name="p#json"
                  fields={[
                    { key: "scope", label: "Applies to", required: true, options: [{ value: "product", label: "All products" }, { value: "milk_receipt", label: "Milk received" }] },
                    { key: "name", label: "Check", required: true },
                    { key: "kind", label: "Type", required: true, options: [{ value: "pass_fail", label: "Pass / fail" }, { value: "numeric", label: "Reading" }, { value: "text", label: "Note" }] },
                    { key: "min_value", label: "Minimum", type: "number" },
                    { key: "max_value", label: "Maximum", type: "number" },
                    { key: "unit", label: "Unit" },
                    { key: "is_required", label: "Required to approve", type: "checkbox", defaultValue: true },
                  ]}
                />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

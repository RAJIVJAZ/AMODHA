import { notFound } from "next/navigation";
import { JsonObjectFields } from "@/components/ops/json-fields";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, NumberInput, PageHeader, Select, StatusBadge, Table, Td, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, label, qty, todayIST } from "@/lib/ops/format";

type Product = {
  id: string; code: string; name: string; category: string; source: string; brand: string; base_unit: string; description: string | null; storage_conditions: string | null;
  shelf_life_days: number | null; qc_required: boolean; min_yield_pct: number | null; hsn: string | null; gst_rate: number | null; pure_desi_ghee: boolean;
  is_subscribable: boolean; show_in_app: boolean; is_active: boolean; image_url: string | null; sort_order: number;
};
type Sku = { id: string; code: string; name: string; item_type: string; unit: string; net_qty: number; sale_price: number | null; mrp: number | null; barcode: string | null;
  storefront_slug: string | null; storefront_pack: string | null; is_active: boolean; packaging_configs: { name: string } | null };
type Recipe = { id: string; version: number; status: string; standard_output_qty: number; expected_minutes: number | null; instructions: string | null; activated_at: string | null;
  recipe_lines: { item_id: string; qty: number; is_main_input: boolean; sort_order: number; items: { name: string; unit: string } | null }[] };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ops = await requireOps("catalog");
  const { data: pData } = await ops.supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!pData) notFound();
  const p = pData as Product;
  const made = p.source === "manufactured";

  const [{ data: skus }, { data: recipes }, { data: materials }, { data: configs }, { data: prices }, { data: qc }, { data: units }, { data: cats }] = await Promise.all([
    ops.supabase.from("items").select("id, code, name, item_type, unit, net_qty, sale_price, mrp, barcode, storefront_slug, storefront_pack, is_active, packaging_configs(name)").eq("product_id", id).order("net_qty"),
    ops.supabase.from("recipes").select("id, version, status, standard_output_qty, expected_minutes, instructions, activated_at, recipe_lines(item_id, qty, is_main_input, sort_order, items(name, unit))").eq("product_id", id).order("version", { ascending: false }),
    ops.supabase.from("items").select("id, name, unit").in("item_type", ["raw_material", "consumable", "purchased_good"]).eq("is_active", true).order("name"),
    ops.supabase.from("packaging_configs").select("id, name, net_qty, net_unit").eq("is_active", true).order("net_qty"),
    ops.supabase.from("item_prices").select("item_id, price, effective_from, note").order("effective_from", { ascending: false }),
    ops.supabase.from("quality_parameters").select("id, name, kind, min_value, max_value, unit, is_required, is_active").eq("product_id", id).order("sort_order"),
    ops.supabase.from("units").select("code, label").order("sort_order"),
    ops.supabase.from("categories").select("code, label").eq("kind", "catalog").order("sort_order"),
  ]);
  const skuList = (skus ?? []) as unknown as Sku[];
  const recipeList = (recipes ?? []) as unknown as Recipe[];
  const draft = recipeList.find((r) => r.status === "draft");
  const active = recipeList.find((r) => r.status === "active");
  const base = draft ?? active;
  const materialOpts = ((materials ?? []) as { id: string; name: string; unit: string }[]).map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }));
  const unitOpts = ((units ?? []) as { code: string; label: string }[]).map((u) => ({ value: u.code, label: u.label }));
  const priceRows = ((prices ?? []) as { item_id: string; price: number; effective_from: string; note: string | null }[]).filter((x) => skuList.some((s) => s.id === x.item_id));
  const canEdit = ops.can("catalog", "edit");

  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.code} · ${made ? "made by us" : `bought in (${p.brand})`} · quantities in ${p.base_unit}${p.pure_desi_ghee ? " · 100% pure desi ghee" : ""}`}
        actions={!p.is_active ? <Badge>inactive</Badge> : null}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card title="Pack sizes (sellable SKUs)" description="Each pack size has its own stock, price and packaging. Website pack labels link website orders to stock.">
            {skuList.length ? (
              <Table head={["SKU", "Pack", "Net", "Price", "Website link", "Status"]}>
                {skuList.map((s) => (
                  <tr key={s.id} className={s.is_active ? "" : "opacity-50"}>
                    <Td>
                      <a href={`/ops/inventory/${s.id}`} className="font-semibold text-primary-dark hover:underline">
                        {s.name}
                      </a>
                      <div className="text-xs text-dark/50">{s.code}</div>
                    </Td>
                    <Td>{s.packaging_configs?.name ?? s.unit}</Td>
                    <Td>{qty(s.net_qty, p.base_unit)}</Td>
                    <Td right>{s.sale_price === null ? "—" : inr(s.sale_price)}</Td>
                    <Td>{s.storefront_slug ? `${s.storefront_slug} / ${s.storefront_pack}` : "—"}</Td>
                    <Td>
                      {canEdit ? (
                        <OpsForm fn="cat_save_item" submitLabel={s.is_active ? "Switch off" : "Switch on"} variant="quiet" inline success="Updated">
                          <input type="hidden" name="p#json" value={JSON.stringify({ id: s.id, is_active: !s.is_active })} />
                        </OpsForm>
                      ) : s.is_active ? (
                        "on"
                      ) : (
                        "off"
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No pack sizes yet.</Empty>
            )}
            {ops.can("catalog", "create") ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-primary-dark">+ Add a pack size</summary>
                <div className="mt-2">
                  <OpsForm fn="cat_save_item" submitLabel="Add pack size" success="Pack size added">
                    <JsonObjectFields
                      name="p#json"
                      fixed={{ product_id: p.id, item_type: made ? "finished_good" : "purchased_good", category: made ? "finished_goods" : "purchased_dairy", is_perishable: true, hsn: p.hsn, gst_rate: p.gst_rate }}
                      fields={[
                        { key: "code", label: "SKU code", required: true, placeholder: `${p.code}-500G` },
                        { key: "name", label: "Name", required: true, placeholder: `${p.name} — 500 g box` },
                        ...(made
                          ? [{ key: "packaging_config_id", label: "Packaging configuration", required: true, options: ((configs ?? []) as { id: string; name: string }[]).map((c) => ({ value: c.id, label: c.name })) }]
                          : []),
                        { key: "net_qty", label: `Contents per pack (${p.base_unit})`, type: "number", required: true },
                        { key: "unit", label: "Counted as", required: true, options: unitOpts },
                        { key: "sale_price", label: "Selling price incl. GST (₹)", type: "number" },
                        { key: "mrp", label: "MRP (₹)", type: "number" },
                        { key: "barcode", label: "Barcode" },
                        { key: "shelf_life_days", label: "Shelf life (days)", type: "number", defaultValue: p.shelf_life_days },
                        { key: "storefront_slug", label: "Website product slug", hint: "Only if sold on the website" },
                        { key: "storefront_pack", label: "Website pack label", hint: "Exactly as on the website, e.g. 500 g" },
                      ]}
                    />
                  </OpsForm>
                </div>
              </details>
            ) : null}
          </Card>

          {skuList.length && canEdit ? (
            <Card title="Prices" description={p.is_subscribable ? "Subscription prices can only change from the next open delivery day; subscribers are told automatically." : "A price from today applies straight away."}>
              <OpsForm fn="cat_set_item_price" submitLabel="Set price" success="Price saved">
                <Grid cols={4}>
                  <Select label="Pack size" name="p_item_id" required placeholder="Choose…" options={skuList.map((s) => ({ value: s.id, label: s.name }))} />
                  <NumberInput label="Price incl. GST (₹)" name="p_price#num" required />
                  <Input label="Effective from" name="p_effective_from#date" type="date" defaultValue={todayIST(p.is_subscribable ? 2 : 0)} required />
                  <Input label="Note" name="p_note" />
                </Grid>
              </OpsForm>
              {priceRows.length ? (
                <div className="mt-3">
                  <Table head={["Pack size", "Price", "From", "Note"]} compact>
                    {priceRows.map((r, i) => (
                      <tr key={i}>
                        <Td>{skuList.find((s) => s.id === r.item_id)?.name}</Td>
                        <Td right>{inr(r.price)}</Td>
                        <Td>{date(r.effective_from)}</Td>
                        <Td>{r.note}</Td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ) : null}
            </Card>
          ) : null}

          {made ? (
            <Card
              title="Recipe (bill of materials)"
              description="Quantities for one standard batch. Batches scale them to the planned quantity. Approving a draft retires the previous version; old batches keep theirs."
            >
              {recipeList.length ? (
                <div className="flex flex-col gap-3">
                  {recipeList.map((r) => (
                    <details key={r.id} open={r.status !== "retired"} className="rounded-xl border border-ink/10 p-3">
                      <summary className="cursor-pointer">
                        <span className="font-semibold text-ink">Version {r.version}</span> <StatusBadge status={r.status} />{" "}
                        <span className="text-sm text-dark/60">
                          standard batch {qty(r.standard_output_qty, p.base_unit)}
                          {r.expected_minutes ? ` · ${r.expected_minutes} min` : ""}
                          {r.activated_at ? ` · approved ${date(r.activated_at)}` : ""}
                        </span>
                      </summary>
                      <Table head={["Material", "Quantity", ""]} compact>
                        {[...r.recipe_lines]
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((l) => (
                            <tr key={l.item_id}>
                              <Td>{l.items?.name}</Td>
                              <Td right>{qty(l.qty, l.items?.unit)}</Td>
                              <Td>{l.is_main_input ? <Badge tone="info">main input</Badge> : null}</Td>
                            </tr>
                          ))}
                      </Table>
                      {r.instructions ? <p className="mt-2 whitespace-pre-line text-sm text-dark/70">{r.instructions}</p> : null}
                      {r.status === "draft" && ops.can("catalog", "approve") ? (
                        <div className="mt-2">
                          <OpsForm fn="cat_activate_recipe" submitLabel="Approve this version" confirm="Approve this recipe version for production?" success="Recipe approved">
                            <input type="hidden" name="p_recipe_id" value={r.id} />
                          </OpsForm>
                        </div>
                      ) : null}
                    </details>
                  ))}
                </div>
              ) : (
                <Empty>No recipe yet.</Empty>
              )}

              {canEdit ? (
                <div className="mt-4 rounded-xl bg-blush/50 p-3">
                  <p className="mb-2 font-semibold text-ink">{draft ? `Edit draft version ${draft.version}` : "Create a new draft version"}</p>
                  <OpsForm fn="cat_save_recipe_draft" submitLabel={draft ? "Save draft" : "Create draft"} success="Draft saved" resetOnSuccess={false}>
                    <input type="hidden" name="p_product_id" value={p.id} />
                    {draft ? <input type="hidden" name="p_recipe_id" value={draft.id} /> : null}
                    <Grid cols={2}>
                      <NumberInput label={`Standard batch output (${p.base_unit})`} name="p_standard_output_qty#num" required defaultValue={base?.standard_output_qty} />
                      <NumberInput label="Expected production time (minutes)" name="p_expected_minutes#int" step="1" defaultValue={base?.expected_minutes ?? undefined} />
                    </Grid>
                    <LineEditor
                      name="p_lines#json"
                      addLabel="Add material"
                      minRows={3}
                      initial={base?.recipe_lines
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((l) => ({ item_id: l.item_id, qty: String(l.qty), is_main_input: l.is_main_input }))}
                      columns={[
                        { key: "item_id", label: "Material", type: "select", required: true, options: materialOpts },
                        { key: "qty", label: "Quantity per standard batch", type: "number", width: "10rem" },
                        { key: "is_main_input", label: "Main input", type: "checkbox", width: "6rem" },
                      ]}
                    />
                    <TextArea label="Method / instructions" name="p_instructions" defaultValue={base?.instructions ?? ""} />
                  </OpsForm>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {canEdit ? (
            <Card title="Product details">
              <OpsForm fn="cat_save_product" submitLabel="Save" success="Saved" resetOnSuccess={false}>
                <JsonObjectFields
                  name="p#json"
                  cols={2}
                  fixed={{ id: p.id }}
                  fields={[
                    { key: "name", label: "Name", required: true, defaultValue: p.name },
                    { key: "category", label: "Category", options: ((cats ?? []) as { code: string; label: string }[]).map((c) => ({ value: c.code, label: c.label })), defaultValue: p.category },
                    { key: "brand", label: "Brand", defaultValue: p.brand },
                    { key: "shelf_life_days", label: "Shelf life (days)", type: "number", defaultValue: p.shelf_life_days },
                    { key: "min_yield_pct", label: "Yield alert below (%)", type: "number", defaultValue: p.min_yield_pct, hint: "Empty = business default" },
                    { key: "hsn", label: "HSN", defaultValue: p.hsn },
                    { key: "gst_rate", label: "GST %", type: "number", defaultValue: p.gst_rate },
                    { key: "sort_order", label: "Sort order", type: "number", defaultValue: p.sort_order },
                    { key: "storage_conditions", label: "Storage conditions", defaultValue: p.storage_conditions, wide: true },
                    { key: "description", label: "Description", defaultValue: p.description, wide: true },
                    { key: "image_url", label: "Image URL", defaultValue: p.image_url, wide: true },
                    { key: "qc_required", label: "Quality check before release", type: "checkbox", defaultValue: p.qc_required },
                    { key: "pure_desi_ghee", label: "100% pure desi ghee", type: "checkbox", defaultValue: p.pure_desi_ghee },
                    { key: "is_subscribable", label: "Milk subscription product", type: "checkbox", defaultValue: p.is_subscribable },
                    { key: "show_in_app", label: "Show in customer app", type: "checkbox", defaultValue: p.show_in_app },
                    { key: "is_active", label: "Active", type: "checkbox", defaultValue: p.is_active },
                  ]}
                />
              </OpsForm>
              <p className="mt-2 text-xs text-dark/55">Only mark &ldquo;100% pure desi ghee&rdquo; when the recipe&rsquo;s fat is entirely desi ghee.</p>
            </Card>
          ) : null}

          {made ? (
            <Card title="Quality checks for this product" description="Added to the general checks.">
              {(qc ?? []).length ? (
                <ul className="mb-3 flex flex-col gap-1 text-sm">
                  {((qc ?? []) as { id: string; name: string; kind: string; min_value: number | null; max_value: number | null; unit: string | null; is_required: boolean; is_active: boolean }[]).map((q) => (
                    <li key={q.id} className={q.is_active ? "" : "opacity-50"}>
                      {q.name} · {label(q.kind)}
                      {q.kind === "numeric" ? ` (${q.min_value ?? "–"}–${q.max_value ?? "–"} ${q.unit ?? ""})` : ""}
                      {q.is_required ? " · required" : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canEdit ? (
                <OpsForm fn="cat_save_quality_parameter" submitLabel="Add check" success="Added">
                  <JsonObjectFields
                    name="p#json"
                    cols={2}
                    fixed={{ scope: "product", product_id: p.id }}
                    fields={[
                      { key: "name", label: "Check", required: true },
                      { key: "kind", label: "Type", required: true, options: [{ value: "pass_fail", label: "Pass / fail" }, { value: "numeric", label: "Reading" }, { value: "text", label: "Note" }] },
                      { key: "min_value", label: "Minimum", type: "number" },
                      { key: "max_value", label: "Maximum", type: "number" },
                      { key: "unit", label: "Unit" },
                      { key: "is_required", label: "Required", type: "checkbox", defaultValue: true },
                    ]}
                  />
                </OpsForm>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

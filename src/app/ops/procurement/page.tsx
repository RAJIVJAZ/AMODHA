import { JsonObjectFields } from "@/components/ops/json-fields";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, NumberInput, PageHeader, Select, StatusBadge, Table, Tabs, Td, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, param, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Milk collection" };

type Collection = {
  id: string; collection_no: string; collected_on: string; shift: string; qty_received: number; qty_rejected: number; qty_accepted: number;
  fat_pct: number | null; snf_pct: number | null; temperature_c: number | null; rate_per_litre: number; amount: number; status: string;
  payment_status: string; quality_flags: string[]; reference: string | null; suppliers: { name: string; code: string } | null;
};
type Supplier = { id: string; code: string; name: string; kind: string; phone: string | null; village: string | null; is_active: boolean; payment_terms_days: number };

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("procurement");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "register";
  const from = param(sp.from) ?? todayIST(-6);
  const to = param(sp.to) ?? todayIST();

  const [{ data: cols }, { data: sups }] = await Promise.all([
    ops.supabase
      .from("milk_collections")
      .select("id, collection_no, collected_on, shift, qty_received, qty_rejected, qty_accepted, fat_pct, snf_pct, temperature_c, rate_per_litre, amount, status, payment_status, quality_flags, reference, suppliers(name, code)")
      .gte("collected_on", from)
      .lte("collected_on", to)
      .order("collected_on", { ascending: false })
      .order("collection_no", { ascending: false })
      .limit(500),
    ops.supabase.from("suppliers").select("id, code, name, kind, phone, village, is_active, payment_terms_days").order("name"),
  ]);
  const collections = (cols ?? []) as unknown as Collection[];
  const suppliers = (sups ?? []) as Supplier[];
  const posted = collections.filter((c) => c.status === "posted");
  const totals = posted.reduce((t, c) => ({ accepted: t.accepted + Number(c.qty_accepted), rejected: t.rejected + Number(c.qty_rejected), amount: t.amount + Number(c.amount) }), {
    accepted: 0,
    rejected: 0,
    amount: 0,
  });

  return (
    <>
      <PageHeader title="Milk collection" description="Raw milk received from farmers and suppliers. Accepted milk goes into stock as its own traceable lot." />
      <Tabs
        current={tab}
        items={[
          { key: "register", label: "Collection register", href: "/ops/procurement" },
          { key: "suppliers", label: "Farmers & suppliers", href: "/ops/procurement?tab=suppliers" },
        ]}
      />

      {tab === "register" ? (
        <div className="flex flex-col gap-4">
          {ops.can("procurement", "create") ? (
            <Card title="Record a collection">
              <OpsForm fn="proc_record_collection" submitLabel="Save collection" idempotent success="Collection saved and milk added to stock">
                <Grid cols={4}>
                  <Select
                    label="Farmer / supplier"
                    name="p_supplier_id"
                    required
                    placeholder="Choose…"
                    options={suppliers.filter((s) => s.is_active).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                  />
                  <Input label="Date" name="p_collected_on#date" type="date" defaultValue={todayIST()} required />
                  <Select label="Shift" name="p_shift" options={[{ value: "morning", label: "Morning" }, { value: "evening", label: "Evening" }]} />
                  <Input label="Reference / can no." name="p_reference" />
                  <NumberInput label="Received (litres)" name="p_qty_received#num" required />
                  <NumberInput label="Rejected (litres)" name="p_qty_rejected#num" defaultValue={0} />
                  <NumberInput label="Rate per litre (₹)" name="p_rate#num" required />
                  <NumberInput label="Fat %" name="p_fat#num" />
                  <NumberInput label="SNF %" name="p_snf#num" />
                  <NumberInput label="Temperature (°C)" name="p_temperature#num" />
                </Grid>
                <TextArea label="Notes" name="p_notes" />
              </OpsForm>
            </Card>
          ) : null}
          <Card
            title="Register"
            description={`${date(from)} to ${date(to)} · accepted ${qty(totals.accepted, "L")} · rejected ${qty(totals.rejected, "L")} · payable ${inr(totals.amount)}`}
            actions={
              <div className="flex flex-wrap items-end gap-2">
                <form className="flex flex-wrap items-end gap-2">
                  <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1 text-sm" />
                  <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1 text-sm" />
                  <button className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-ink/15">Show</button>
                </form>
                {ops.can("procurement", "export") ? (
                  <a href={`/ops/export/milk-collections?from=${from}&to=${to}`} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-ink/15">
                    Export CSV
                  </a>
                ) : null}
              </div>
            }
          >
            {collections.length ? (
              <Table head={["No.", "Date", "Farmer", "Received", "Rejected", "Accepted", "Fat / SNF / °C", "Rate", "Amount", "Payment", ""]} compact>
                {collections.map((c) => (
                  <tr key={c.id} className={c.status === "cancelled" ? "opacity-50" : ""}>
                    <Td>{c.collection_no}</Td>
                    <Td>
                      {date(c.collected_on)} {c.shift === "morning" ? "AM" : "PM"}
                    </Td>
                    <Td>{c.suppliers?.name}</Td>
                    <Td right>{qty(c.qty_received)}</Td>
                    <Td right>{qty(c.qty_rejected)}</Td>
                    <Td right>{qty(c.qty_accepted)}</Td>
                    <Td>
                      {[c.fat_pct, c.snf_pct, c.temperature_c].map((v) => v ?? "–").join(" / ")}
                      {c.quality_flags?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.quality_flags.map((f) => (
                            <Badge key={f} tone="warn">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </Td>
                    <Td right>{inr(c.rate_per_litre)}</Td>
                    <Td right>{inr(c.amount)}</Td>
                    <Td>{c.status === "cancelled" ? <StatusBadge status="cancelled" /> : <StatusBadge status={c.payment_status} />}</Td>
                    <Td>
                      {c.status === "posted" && ops.can("procurement", "approve") ? (
                        <OpsForm fn="proc_cancel_collection" submitLabel="Cancel" variant="quiet" inline confirm="Cancel this collection? Its milk is removed from stock." success="Cancelled">
                          <input type="hidden" name="p_collection_id" value={c.id} />
                          <input type="hidden" name="p_reason" value="Entered by mistake" />
                        </OpsForm>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No collections in this period.</Empty>
            )}
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ops.can("procurement", "create") || ops.can("purchases", "create") ? (
            <Card title="Add a farmer or supplier">
              <OpsForm fn="cat_save_supplier" submitLabel="Add" success="Added">
                <SupplierFields />
              </OpsForm>
            </Card>
          ) : null}
          <Card title="Farmers & suppliers">
            {suppliers.length ? (
              <Table head={["Code", "Name", "Type", "Village / area", "Phone", "Payment terms", "Status"]}>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.code}</Td>
                    <Td>{s.name}</Td>
                    <Td>{s.kind}</Td>
                    <Td>{s.village}</Td>
                    <Td>{s.phone}</Td>
                    <Td>{s.payment_terms_days} days</Td>
                    <Td>{s.is_active ? <Badge tone="good">active</Badge> : <Badge>inactive</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No suppliers yet.</Empty>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

/** Supplier fields, sent as one JSON object to cat_save_supplier. */
function SupplierFields() {
  return (
    <>
      <p className="text-xs text-dark/60">Codes use capital letters, numbers and dashes, e.g. F-RAMU or V-SUGAR-01.</p>
      <JsonObjectFields
        name="p#json"
        fields={[
          { key: "code", label: "Code", required: true },
          { key: "name", label: "Name", required: true },
          { key: "kind", label: "Type", options: ["farmer", "vendor", "distributor", "service"] },
          { key: "village", label: "Village / area" },
          { key: "phone", label: "Phone" },
          { key: "gstin", label: "GSTIN" },
          { key: "payment_terms_days", label: "Payment terms (days)", type: "number" },
          { key: "address", label: "Address" },
        ]}
      />
    </>
  );
}


import { JsonObjectFields } from "@/components/ops/json-fields";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Card, Notice, PageHeader } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { label, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Record supplier bill" };

export default async function NewPurchasePage() {
  const ops = await requireOps("purchases", "create");
  const [{ data: sup }, { data: itemData }, { data: acctData }] = await Promise.all([
    ops.supabase.from("suppliers").select("id, name, kind, payment_terms_days").eq("is_active", true).order("name"),
    ops.supabase.from("items").select("id, code, name, unit, item_type").eq("is_active", true).neq("item_type", "finished_good").order("item_type").order("name"),
    ops.supabase.from("ledger_accounts").select("code, name, type, subtype").eq("is_active", true).in("type", ["expense", "asset"]).order("code"),
  ]);
  const suppliers = (sup ?? []) as { id: string; name: string; kind: string; payment_terms_days: number }[];
  const items = (itemData ?? []) as { id: string; code: string; name: string; unit: string; item_type: string }[];
  const accounts = ((acctData ?? []) as { code: string; name: string; type: string; subtype: string | null }[]).filter(
    (a) => (a.type === "expense" && a.subtype !== "cogs") || (a.type === "asset" && a.subtype === "fixed_asset")
  );

  return (
    <>
      <PageHeader
        title="Record supplier bill"
        description="Stock lines are received into stock as new lots at landed cost (freight and other charges are spread across them). Non-stock lines go to the expense or asset account you choose."
      />
      {suppliers.length === 0 ? (
        <Notice tone="warn">Add the supplier first under Milk collection → Suppliers.</Notice>
      ) : (
        <Card>
          <OpsForm fn="fin_post_purchase_invoice" submitLabel="Post bill" idempotent redirectTo="/ops/finance/purchases/{id}" confirm="Post this bill? Stock and the supplier's account are updated straight away.">
            <JsonObjectFields
              name="p_header#json"
              cols={4}
              fields={[
                { key: "supplier_id", label: "Supplier", required: true, options: suppliers.map((s) => ({ value: s.id, label: `${s.name} (${label(s.kind)})` })) },
                { key: "invoice_no", label: "Their bill number", required: true },
                { key: "invoice_date", label: "Bill date", type: "date", required: true, defaultValue: todayIST() },
                { key: "due_date", label: "Due date", type: "date", hint: "Leave blank to use the supplier's payment terms" },
                { key: "freight", label: "Freight (₹)", type: "number" },
                { key: "other_charges", label: "Other charges (₹)", type: "number" },
                { key: "round_off", label: "Round off (₹)", type: "number", hint: "Between −0.99 and 0.99" },
                { key: "is_interstate", label: "Supplier is outside Uttar Pradesh (IGST)", type: "checkbox" },
                { key: "notes", label: "Notes", wide: true },
                { key: "document_url", label: "Link to scanned bill", wide: true, placeholder: "https://…" },
              ]}
            />
            <div className="mt-2">
              <p className="mb-1 text-sm font-semibold text-ink">Lines — choose a stock item or an account on each line</p>
              <LineEditor
                name="p_lines#json"
                addLabel="Add line"
                columns={[
                  { key: "item_id", label: "Stock item", type: "select", options: items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit}) · ${label(i.item_type)}` })), width: "16rem" },
                  { key: "account_code", label: "or account", type: "select", options: accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })), width: "12rem" },
                  { key: "description", label: "Description", type: "text" },
                  { key: "qty", label: "Qty", type: "number", required: true, width: "6rem" },
                  { key: "rate", label: "Rate ₹ (ex-GST)", type: "number", width: "7rem" },
                  { key: "discount", label: "Discount ₹", type: "number", width: "6rem" },
                  { key: "gst_rate", label: "GST %", type: "number", width: "5rem" },
                  { key: "expiry_date", label: "Expiry", type: "date", width: "9rem" },
                  { key: "supplier_lot", label: "Their lot no.", type: "text", width: "7rem" },
                ]}
              />
            </div>
          </OpsForm>
        </Card>
      )}
    </>
  );
}

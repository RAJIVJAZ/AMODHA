import { JsonObjectFields } from "@/components/ops/json-fields";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Card, Grid, Input, NumberInput, PageHeader, Select, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { inr, qty } from "@/lib/ops/format";

export const metadata = { title: "New order" };

export default async function NewStaffOrderPage() {
  const ops = await requireOps("dispatch", "create");
  const { data } = await ops.supabase
    .from("v_stock_summary")
    .select("item_id, name, available, unit")
    .in("item_type", ["finished_good", "purchased_good"])
    .eq("is_active", true)
    .order("name");
  const { data: prices } = await ops.supabase.from("items").select("id, sale_price").in("item_type", ["finished_good", "purchased_good"]).eq("is_active", true);
  const price = new Map(((prices ?? []) as { id: string; sale_price: number | null }[]).map((p) => [p.id, p.sale_price]));
  const options = ((data ?? []) as { item_id: string; name: string; available: number; unit: string }[])
    .filter((i) => price.get(i.item_id) !== null && price.get(i.item_id) !== undefined)
    .map((i) => ({ value: i.item_id, label: `${i.name} — ${inr(price.get(i.item_id) ?? 0, 0)} (${qty(i.available)} in stock)` }));

  return (
    <>
      <PageHeader title="Phone / walk-in order" description="Prices come from the product list. The order joins the dispatch queue and, for cash on delivery, gets its tax invoice straight away." />
      <Card>
        <OpsForm fn="disp_create_staff_order" submitLabel="Create order" idempotent redirectTo="/ops/dispatch/{id}">
          <JsonObjectFields
            name="p_customer#json"
            fields={[
              { key: "name", label: "Customer name", required: true },
              { key: "phone", label: "Mobile number", required: true },
              { key: "email", label: "Email (for the invoice)" },
              { key: "address", label: "Delivery address", required: true, wide: true },
              { key: "city", label: "City", defaultValue: "Prayagraj" },
              { key: "pincode", label: "Pincode", required: true },
            ]}
          />
          <LineEditor
            name="p_lines#json"
            addLabel="Add product"
            columns={[
              { key: "item_id", label: "Product", type: "select", required: true, options },
              { key: "qty", label: "Quantity", type: "number", width: "8rem" },
            ]}
          />
          <Grid cols={3}>
            <Select label="Payment" name="p_payment_method" options={[{ value: "cod", label: "Cash / UPI on delivery" }, { value: "online", label: "Paid online (payment link)" }]} />
            <NumberInput label="Delivery charge (₹)" name="p_delivery_fee#int" defaultValue={0} step="1" />
            <Input label="Delivery date" name="p_delivery_date#date" type="date" />
          </Grid>
          <TextArea label="Notes" name="p_notes" />
        </OpsForm>
      </Card>
    </>
  );
}

import { Badge, ButtonLink, Card, Empty, PageHeader, Table, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, qty } from "@/lib/ops/format";
import { num, priorityTone, type Requirement } from "../_lib";

export const metadata = { title: "Production requirements" };

export default async function PlanningPage() {
  const ops = await requireOps("production");
  const { data, error } = await ops.supabase.rpc("ops_production_requirements");
  const rows = (data ?? []) as Requirement[];
  const byProduct = new Map<string, { product: string; unit: string; kg: number; inProd: number; earliest: string | null }>();
  for (const r of rows) {
    const p = byProduct.get(r.product_id) ?? { product: r.product, unit: r.net_unit ?? "kg", kg: 0, inProd: num(r.in_production_base), earliest: null };
    p.kg += num(r.additional_required_base);
    if (r.earliest_delivery && (!p.earliest || r.earliest_delivery < p.earliest)) p.earliest = r.earliest_delivery;
    byProduct.set(r.product_id, p);
  }
  const shortProducts = [...byProduct.values()].filter((p) => p.kg > 0);

  return (
    <>
      <PageHeader
        title="Production requirements"
        description="Accepted orders (B2B and retail) against free finished stock. Submitted or unconfirmed orders are shown for information only and never count as demand."
        actions={ops.can("production", "create") ? <ButtonLink href="/ops/production/new">Plan a batch</ButtonLink> : null}
      />
      {error ? <p className="mb-4 text-sm text-accent-dark">{error.message}</p> : null}
      <div className="flex flex-col gap-4">
        <Card title="To make, by product">
          {shortProducts.length ? (
            <Table head={["Product", "Additional needed", "Already planned / in production", "Proposed", "Earliest delivery"]}>
              {shortProducts.map((p) => (
                <tr key={p.product}>
                  <Td>{p.product}</Td>
                  <Td right>{qty(p.kg, p.unit)}</Td>
                  <Td right>{qty(p.inProd, p.unit)}</Td>
                  <Td right className="font-semibold">{qty(Math.max(p.kg - p.inProd, 0), p.unit)}</Td>
                  <Td>{date(p.earliest)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Free stock covers every accepted order.</Empty>
          )}
        </Card>
        <Card title="By pack size (SKU)">
          {rows.length ? (
            <Table head={["SKU", "Confirmed demand", "Reserved", "Free stock", "Additional", "Unconfirmed (info)", "Earliest", "Start by", "Shelf life", "Priority"]} compact>
              {rows.map((r) => (
                <tr key={r.item_id}>
                  <Td>
                    {r.name}
                    <div className="text-xs text-dark/55">{r.sku}</div>
                  </Td>
                  <Td right>{qty(r.confirmed_demand, r.unit)}</Td>
                  <Td right>{qty(r.reserved)}</Td>
                  <Td right>{qty(r.free_stock)}</Td>
                  <Td right className={num(r.additional_required) > 0 ? "font-semibold text-accent-dark" : ""}>
                    {qty(r.additional_required)}
                    {num(r.additional_required_base) > 0 ? <div className="text-xs">{qty(r.additional_required_base, r.net_unit)}</div> : null}
                  </Td>
                  <Td right className="text-dark/55">{qty(r.unconfirmed_demand)}</Td>
                  <Td>{date(r.earliest_delivery)}</Td>
                  <Td>{date(r.start_by)}</Td>
                  <Td>{r.shelf_life_days ? `${r.shelf_life_days} d` : "—"}</Td>
                  <Td>
                    <Badge tone={priorityTone[r.priority] ?? "muted"}>{r.priority}</Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No open orders.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

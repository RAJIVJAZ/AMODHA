import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Stat, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, label, param, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Inventory" };

type Row = {
  item_id: string; code: string; name: string; item_type: string; category: string; unit: string; reorder_level: number; reorder_qty: number;
  is_active: boolean; on_hand: number; reserved: number; available: number; stock_value: number; expired_qty: number; near_expiry_qty: number; next_expiry: string | null;
};

const TYPES = [
  { key: "all", label: "All stock" },
  { key: "raw_material", label: "Raw materials" },
  { key: "packaging", label: "Packaging" },
  { key: "finished_good", label: "Finished goods" },
  { key: "purchased_good", label: "Purchased goods" },
  { key: "consumable", label: "Consumables" },
  { key: "low", label: "Low stock" },
  { key: "expiry", label: "Expiry" },
];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("inventory");
  const sp = await searchParams;
  const view = param(sp.view) ?? param(sp.type) ?? "all";
  const search = (param(sp.q) ?? "").trim();

  let query = ops.supabase.from("v_stock_summary").select("*").eq("is_active", true).order("item_type").order("name");
  if (["raw_material", "packaging", "finished_good", "purchased_good", "consumable"].includes(view)) query = query.eq("item_type", view);
  if (search) query = query.or(`name.ilike.%${search.replace(/[%,()]/g, "")}%,code.ilike.%${search.replace(/[%,()]/g, "")}%`);
  const [{ data }, { data: lotsData }] = await Promise.all([
    query.limit(1000),
    view === "expiry"
      ? ops.supabase
          .from("stock_lots")
          .select("id, lot_code, qty_on_hand, expiry_date, status, item_id, items(name, unit, code)")
          .gt("qty_on_hand", 0)
          .not("expiry_date", "is", null)
          .lte("expiry_date", todayIST(7))
          .order("expiry_date")
      : Promise.resolve({ data: [] }),
  ]);
  let rows = (data ?? []) as Row[];
  if (view === "low") rows = rows.filter((r) => Number(r.reorder_level) > 0 && Number(r.available) <= Number(r.reorder_level));
  const total = rows.reduce((s, r) => s + Number(r.stock_value), 0);
  const lowCount = ((data ?? []) as Row[]).filter((r) => Number(r.reorder_level) > 0 && Number(r.available) <= Number(r.reorder_level)).length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Live stock by item, from every recorded movement. Open an item for lots, history and adjustments."
        actions={
          ops.can("inventory", "export") ? (
            <a href={`/ops/export/stock?view=${view}`} className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-ink">
              Export CSV
            </a>
          ) : null
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stock value (shown)" value={inr(total, 0)} />
        <Stat label="Items below reorder level" value={lowCount} tone={lowCount ? "warn" : "default"} href="/ops/inventory?view=low" />
      </div>
      <Tabs current={view} items={TYPES.map((t) => ({ key: t.key, label: t.label, href: t.key === "all" ? "/ops/inventory" : `/ops/inventory?view=${t.key}` }))} />

      {view === "expiry" ? (
        <Card title="Lots expired or expiring within 7 days" description="Use FEFO: these should go first, or be written off.">
          {(lotsData ?? []).length ? (
            <Table head={["Item", "Lot", "On hand", "Expiry", "Status"]}>
              {((lotsData ?? []) as unknown as { id: string; lot_code: string; qty_on_hand: number; expiry_date: string; status: string; item_id: string; items: { name: string; unit: string } | null }[]).map((l) => (
                <tr key={l.id}>
                  <Td>
                    <Link href={`/ops/inventory/${l.item_id}`} className="font-semibold text-primary-dark hover:underline">
                      {l.items?.name}
                    </Link>
                  </Td>
                  <Td>{l.lot_code}</Td>
                  <Td right>{qty(l.qty_on_hand, l.items?.unit)}</Td>
                  <Td className={l.expiry_date < todayIST() ? "font-semibold text-accent-dark" : "text-amber-700"}>
                    {date(l.expiry_date)} {l.expiry_date < todayIST() ? "(expired)" : ""}
                  </Td>
                  <Td>
                    <Badge tone={l.status === "available" ? "good" : "warn"}>{l.status}</Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nothing expiring in the next 7 days.</Empty>
          )}
        </Card>
      ) : (
        <Card
          actions={
            <form className="flex gap-2">
              {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
              <input name="q" defaultValue={search} placeholder="Search name or code" className="rounded-lg border-2 border-ink/15 px-2 py-1 text-sm" />
              <button className="rounded-lg bg-white px-3 py-1 text-sm font-semibold ring-1 ring-ink/15">Search</button>
            </form>
          }
        >
          {rows.length ? (
            <Table head={["Item", "Type", "On hand", "Reserved", "Available", "Value", "Next expiry", ""]}>
              {rows.map((r) => {
                const low = Number(r.reorder_level) > 0 && Number(r.available) <= Number(r.reorder_level);
                return (
                  <tr key={r.item_id} className="hover:bg-blush/40">
                    <Td>
                      <Link href={`/ops/inventory/${r.item_id}`} className="font-semibold text-primary-dark hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-xs text-dark/50">{r.code}</div>
                    </Td>
                    <Td>{label(r.item_type)}</Td>
                    <Td right>{qty(r.on_hand, r.unit)}</Td>
                    <Td right>{Number(r.reserved) ? qty(r.reserved, r.unit) : "—"}</Td>
                    <Td right className={low ? "font-semibold text-accent-dark" : ""}>
                      {qty(r.available, r.unit)}
                    </Td>
                    <Td right>{inr(r.stock_value, 0)}</Td>
                    <Td>{date(r.next_expiry)}</Td>
                    <Td>
                      {low ? <Badge tone="warn">reorder {qty(r.reorder_qty || r.reorder_level, r.unit)}</Badge> : null}
                      {Number(r.expired_qty) > 0 ? <Badge tone="bad">expired stock</Badge> : null}
                      {Number(r.near_expiry_qty) > 0 ? <Badge tone="warn">near expiry</Badge> : null}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty>No items to show. Add materials and products under Products &amp; recipes.</Empty>
          )}
        </Card>
      )}
    </>
  );
}

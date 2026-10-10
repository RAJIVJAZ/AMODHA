import Link from "next/link";
import { ButtonLink, Card, Empty, PageHeader, StatusBadge, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, param, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Production" };

type Batch = {
  id: string;
  batch_no: string;
  production_date: string;
  shift: string;
  status: string;
  planned_qty: number;
  finished_qty: number | null;
  yield_pct: number | null;
  yield_flag: boolean;
  supervisor: string | null;
  products: { name: string; base_unit: string } | null;
};

const OPEN = ["planned", "materials_issued", "in_production", "production_completed", "awaiting_qc", "qc_approved", "packaging", "packaging_completed"];

function BatchTable({ rows }: { rows: Batch[] }) {
  if (!rows.length) return <Empty>No batches here.</Empty>;
  return (
    <Table head={["Batch", "Product", "Date", "Planned", "Finished", "Yield", "Status"]}>
      {rows.map((b) => (
        <tr key={b.id} className="hover:bg-blush/40">
          <Td>
            <Link href={`/ops/production/${b.id}`} className="font-semibold text-primary-dark hover:underline">
              {b.batch_no}
            </Link>
          </Td>
          <Td>{b.products?.name}</Td>
          <Td>
            {date(b.production_date)} · {b.shift}
          </Td>
          <Td right>{qty(b.planned_qty, b.products?.base_unit)}</Td>
          <Td right>{b.finished_qty === null ? "—" : qty(b.finished_qty, b.products?.base_unit)}</Td>
          <Td right className={b.yield_flag ? "font-semibold text-accent-dark" : ""}>
            {b.yield_pct === null ? "—" : `${b.yield_pct}%`}
            {b.yield_flag ? " ⚠" : ""}
          </Td>
          <Td>
            <StatusBadge status={b.status} />
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export default async function ProductionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("production");
  const sp = await searchParams;
  const status = param(sp.status);
  const view = param(sp.view) ?? (status ? "all" : "today");
  const select = "id, batch_no, production_date, shift, status, planned_qty, finished_qty, yield_pct, yield_flag, supervisor, products(name, base_unit)";

  let query = ops.supabase.from("production_batches").select(select).order("production_date", { ascending: false }).order("batch_no", { ascending: false });
  if (status) query = query.eq("status", status);
  else if (view === "today") query = query.in("status", OPEN);
  else if (view === "released") query = query.in("status", ["released", "partially_dispatched", "fully_dispatched", "closed"]);
  const { data } = await query.limit(200);
  const batches = (data ?? []) as unknown as Batch[];
  const today = todayIST();

  const byStatus = (s: string[]) => batches.filter((b) => s.includes(b.status));

  return (
    <>
      <PageHeader
        title="Production"
        description="Today's plan, batches in progress, quality checks, packaging and release."
        actions={ops.can("production", "create") ? <ButtonLink href="/ops/production/new">+ Create new manufacturing batch</ButtonLink> : null}
      />
      <Tabs
        current={status ? "all" : view}
        items={[
          { key: "today", label: "In progress", href: "/ops/production" },
          { key: "released", label: "Released & dispatched", href: "/ops/production?view=released" },
          { key: "all", label: "All batches", href: "/ops/production?view=all" },
        ]}
      />
      {view === "today" && !status ? (
        <div className="flex flex-col gap-4">
          <Card title="Today's production plan" description={date(today)}>
            <BatchTable rows={batches.filter((b) => b.production_date === today)} />
          </Card>
          <Card title="Materials and production" description="Planned, materials issued or cooking">
            <BatchTable rows={byStatus(["planned", "materials_issued", "in_production"])} />
          </Card>
          <Card title="Awaiting quality approval">
            <BatchTable rows={byStatus(["production_completed", "awaiting_qc"])} />
          </Card>
          <Card title="Packaging jobs" description="Quality approved — record packs by size">
            <BatchTable rows={byStatus(["qc_approved", "packaging"])} />
          </Card>
          <Card title="Ready to release to finished goods">
            <BatchTable rows={byStatus(["packaging_completed"])} />
          </Card>
        </div>
      ) : (
        <Card>
          <BatchTable rows={batches} />
        </Card>
      )}
    </>
  );
}

import { BatchPlanner, type PlannerProduct } from "@/components/ops/batch-planner";
import { OpsForm } from "@/components/ops/ops-form";
import { Card, Grid, Input, Notice, PageHeader, Select, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { todayIST } from "@/lib/ops/format";

export const metadata = { title: "New manufacturing batch" };

type RecipeRow = {
  id: string;
  product_id: string;
  version: number;
  status: string;
  standard_output_qty: number;
  recipe_lines: { qty: number; sort_order: number; items: { name: string; unit: string } | null }[];
};

export default async function NewBatchPage() {
  const ops = await requireOps("production", "create");
  const [{ data: products }, { data: recipes }, { data: configs }] = await Promise.all([
    ops.supabase.from("products").select("id, name, base_unit").eq("source", "manufactured").eq("is_active", true).order("sort_order").order("name"),
    ops.supabase
      .from("recipes")
      .select("id, product_id, version, status, standard_output_qty, recipe_lines(qty, sort_order, items(name, unit))")
      .in("status", ["active", "retired"])
      .order("version", { ascending: false }),
    ops.supabase.from("packaging_configs").select("name").eq("is_active", true).order("net_qty"),
  ]);

  const planner: PlannerProduct[] = ((products ?? []) as { id: string; name: string; base_unit: string }[]).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.base_unit,
    recipes: ((recipes ?? []) as unknown as RecipeRow[])
      .filter((r) => r.product_id === p.id)
      .map((r) => ({
        id: r.id,
        version: r.version,
        status: r.status,
        standard_output_qty: Number(r.standard_output_qty),
        lines: [...r.recipe_lines]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((l) => ({ name: l.items?.name ?? "", unit: l.items?.unit ?? "", qty: Number(l.qty) })),
      })),
  }));

  return (
    <>
      <PageHeader title="Create new manufacturing batch" description="A permanent batch number is given when you save." />
      {!planner.some((p) => p.recipes.some((r) => r.status === "active")) ? (
        <div className="mb-4">
          <Notice tone="warn">No product has an approved recipe yet. Add and approve one under Products &amp; recipes first.</Notice>
        </div>
      ) : null}
      <Card>
        <OpsForm fn="prod_create_batch" submitLabel="Create batch" idempotent redirectTo="/ops/production/{id}">
          <BatchPlanner products={planner} />
          <Grid cols={3}>
            <Input label="Production date" name="p_production_date#date" type="date" defaultValue={todayIST()} required />
            <Select
              label="Shift"
              name="p_shift"
              defaultValue="morning"
              options={["morning", "afternoon", "evening", "night", "general"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
            />
            <Input label="Production unit / line" name="p_production_unit" placeholder="e.g. Kitchen 1" />
            <Input label="Assigned supervisor" name="p_supervisor" placeholder="Name" />
            <Input
              label="Expected packaging"
              name="p_planned_packaging"
              placeholder={((configs ?? []) as { name: string }[]).slice(0, 3).map((c) => c.name).join(", ") || "e.g. 500 g boxes"}
              wrapClass="sm:col-span-2"
            />
          </Grid>
          <TextArea label="Notes" name="p_notes" />
        </OpsForm>
      </Card>
    </>
  );
}

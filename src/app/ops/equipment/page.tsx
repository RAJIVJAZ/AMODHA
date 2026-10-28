import Link from "next/link";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, NumberInput, PageHeader, Select, Stat, Table, Tabs, Td, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, param, todayIST } from "@/lib/ops/format";
import { CATEGORIES, categoryLabel, statusInfo, warrantyInfo, type Equipment, type EquipmentSummary } from "./shared";

export const metadata = { title: "Machinery & equipment" };

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("equipment");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "checklist";
  const today = todayIST();
  const [{ data: eqData }, { data: sumData }] = await Promise.all([
    ops.supabase.from("equipment").select("*").order("asset_code"),
    ops.supabase.from("v_equipment_summary").select("*"),
  ]);
  const all = (eqData ?? []) as Equipment[];
  const summary = new Map(((sumData ?? []) as EquipmentSummary[]).map((s) => [s.equipment_id, s]));
  const inUse = all.filter((e) => !["replaced", "disposed"].includes(e.status));
  const notWorking = inUse.filter((e) => e.status !== "working");
  const checkedToday = inUse.filter((e) => e.last_checked_on === today);
  const inWarranty = inUse.filter((e) => warrantyInfo(e, today).tone === "good" || warrantyInfo(e, today).tone === "warn");
  const spend = [...summary.values()].reduce((s, x) => s + Number(x.total_cost), 0);
  const canEdit = ops.can("equipment", "edit");
  const byId = new Map(all.map((e) => [e.id, e]));

  return (
    <>
      <PageHeader
        title="Machinery & equipment"
        description="Every machine, whether it is working, its warranty, and every service and repair with what it cost."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Machines in use" value={inUse.length} />
        <Stat label="Not working / need attention" value={notWorking.length} tone={notWorking.length ? "bad" : "default"} href="/ops/equipment?tab=checklist" />
        <Stat label="Checked today" value={`${checkedToday.length} / ${inUse.length}`} tone={checkedToday.length === inUse.length && inUse.length ? "good" : "warn"} />
        <Stat label="Service & repair spend (all time)" value={inr(spend, 0)} hint={`${inWarranty.length} machine(s) in warranty`} />
      </div>
      <Tabs
        current={tab}
        items={[
          { key: "checklist", label: "Daily checklist", href: "/ops/equipment?tab=checklist" },
          { key: "register", label: `Register (${all.length})`, href: "/ops/equipment?tab=register" },
          ...(ops.can("equipment", "create") ? [{ key: "new", label: "+ Add machine", href: "/ops/equipment?tab=new" }] : []),
        ]}
      />

      {tab === "checklist" ? (
        <Card description="Tick each machine once a day. Anything not working goes on the reminder list until it is repaired or replaced.">
          {inUse.length ? (
            <div className="flex flex-col divide-y divide-ink/10">
              {inUse.map((e) => {
                const s = statusInfo(e.status);
                const w = warrantyInfo(e, today);
                return (
                  <div key={e.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm">
                      <Link href={`/ops/equipment/${e.id}`} className="font-semibold text-ink hover:underline">
                        {e.asset_code} · {e.name}
                      </Link>
                      <p className="text-dark/60">
                        {categoryLabel(e.category)}
                        {e.location ? ` · ${e.location}` : ""} · {e.last_checked_on === today ? "checked today" : e.last_checked_on ? `last checked ${date(e.last_checked_on)}` : "never checked"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={s.tone}>{s.text}</Badge>
                        <Badge tone={w.tone}>{w.text}</Badge>
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <OpsForm fn="eq_record_check" submitLabel="✓ Working" inline success="Checked">
                          <input type="hidden" name="p_equipment_id" value={e.id} />
                          <input type="hidden" name="p_condition" value="working" />
                        </OpsForm>
                        <details className="rounded-xl bg-[#f5f6f7] px-3 py-2">
                          <summary className="cursor-pointer text-sm font-semibold text-accent-dark">Report a problem</summary>
                          <OpsForm fn="eq_record_check" submitLabel="Save" inline success="Problem recorded" className="mt-2">
                            <input type="hidden" name="p_equipment_id" value={e.id} />
                            <Select
                              label="Condition"
                              name="p_condition"
                              options={[
                                { value: "needs_attention", label: "Working, needs attention" },
                                { value: "not_working", label: "Not working" },
                              ]}
                            />
                            <Input label="What is wrong" name="p_note" required />
                          </OpsForm>
                        </details>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>No machines yet. Add them under “+ Add machine”.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "register" ? (
        <Card>
          {all.length ? (
            <Table head={["Machine", "Status", "Warranty", "Services", "Repairs", "Spent on upkeep", "Next service"]} compact>
              {all.map((e) => {
                const s = statusInfo(e.status);
                const w = warrantyInfo(e, today);
                const x = summary.get(e.id);
                const replacement = e.replaced_by ? byId.get(e.replaced_by) : null;
                return (
                  <tr key={e.id}>
                    <Td>
                      <Link href={`/ops/equipment/${e.id}`} className="font-semibold text-ink hover:underline">
                        {e.asset_code} · {e.name}
                      </Link>
                      <div className="text-dark/55">
                        {[categoryLabel(e.category), e.make, e.model, e.location].filter(Boolean).join(" · ")}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={s.tone}>{s.text}</Badge>
                      {replacement ? (
                        <div className="text-dark/55">
                          by{" "}
                          <Link href={`/ops/equipment/${replacement.id}`} className="text-primary-dark hover:underline">
                            {replacement.asset_code}
                          </Link>
                        </div>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={w.tone}>{w.text}</Badge>
                    </Td>
                    <Td right>{x?.services ?? 0}</Td>
                    <Td right>{x?.repairs ?? 0}</Td>
                    <Td right>{inr(x?.total_cost ?? 0, 0)}</Td>
                    <Td>{date(e.next_service_due) || "—"}</Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty>No machines yet.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "new" && ops.can("equipment", "create") ? (
        <Card title="Add a machine" description="Copy the details from the bill and warranty card. Keep photos of them in Google Drive and paste the link.">
          <OpsForm fn="eq_save_equipment" submitLabel="Add machine" success="Added" redirectTo="/ops/equipment/{id}">
            <Grid cols={3}>
              <Input label="Name" name="p.name" required placeholder="e.g. Khoya kadhai machine" />
              <Select label="Type" name="p.category" options={CATEGORIES} defaultValue="production" />
              <Input label="Where it is" name="p.location" placeholder="e.g. Kitchen line 1" />
              <Input label="Make / brand" name="p.make" />
              <Input label="Model" name="p.model" />
              <Input label="Serial number" name="p.serial_number" />
              <Input label="Bought on" name="p.purchase_date#date" type="date" max={today} />
              <NumberInput label="Price paid (₹)" name="p.purchase_cost#num" />
              <Input label="Bought from" name="p.vendor" />
              <Input label="Vendor phone / service contact" name="p.vendor_contact" />
              <Input label="Warranty ends on" name="p.warranty_end#date" type="date" hint="Starts on the purchase date unless you set it" />
              <Input label="Warranty starts on" name="p.warranty_start#date" type="date" />
              <Input label="Maintenance contract (AMC) with" name="p.amc_provider" />
              <Input label="AMC ends on" name="p.amc_end#date" type="date" />
              <NumberInput label="Service every (days)" name="p.service_interval_days#int" placeholder="e.g. 90" />
              <Input label="Next service due" name="p.next_service_due#date" type="date" />
              <Input label="Link to bill / warranty card" name="p.document_url" placeholder="https://drive.google.com/…" />
            </Grid>
            <TextArea label="Warranty terms" name="p.warranty_terms" rows={2} placeholder="What the warranty covers (parts, labour, motor only…)" />
          </OpsForm>
        </Card>
      ) : null}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Checkbox, Empty, Grid, Input, NumberInput, PageHeader, Select, Stat, Table, Td, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { moneyAccounts, paymentMethods } from "@/lib/ops/finance";
import { date, inr, todayIST } from "@/lib/ops/format";
import { CATEGORIES, SERVICE_KINDS, categoryLabel, statusInfo, warrantyInfo, type Equipment, type EquipmentSummary } from "../shared";

export const metadata = { title: "Machine" };

type Service = {
  id: string; service_date: string; kind: string; problem: string | null; work_done: string; vendor: string | null; technician: string | null;
  under_warranty: boolean; under_amc: boolean; parts_cost: number; labour_cost: number; other_cost: number; total_cost: number;
  downtime_hours: number | null; invoice_number: string | null; document_url: string | null; status_after: string; expense_id: string | null;
};
type Check = { id: string; checked_on: string; condition: string; note: string | null };

const kindLabel = (k: string) => SERVICE_KINDS.find((x) => x.value === k)?.label ?? k;

export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ops = await requireOps("equipment");
  const today = todayIST();
  const canEdit = ops.can("equipment", "edit");
  const canExpense = ops.can("expenses", "create");
  const [{ data: eqData }, { data: svcData }, { data: chkData }, { data: sumData }, { data: allData }, accounts] = await Promise.all([
    ops.supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
    ops.supabase.from("equipment_services").select("*").eq("equipment_id", id).order("service_date", { ascending: false }),
    ops.supabase.from("equipment_checks").select("id, checked_on, condition, note").eq("equipment_id", id).order("checked_at", { ascending: false }).limit(30),
    ops.supabase.from("v_equipment_summary").select("*").eq("equipment_id", id).maybeSingle(),
    ops.supabase.from("equipment").select("id, asset_code, name, status").order("asset_code"),
    canEdit && canExpense ? moneyAccounts(ops) : Promise.resolve([]),
  ]);
  const e = eqData as Equipment | null;
  if (!e) notFound();
  const services = (svcData ?? []) as Service[];
  const checks = (chkData ?? []) as Check[];
  const sum = sumData as EquipmentSummary | null;
  const others = ((allData ?? []) as { id: string; asset_code: string; name: string; status: string }[]).filter(
    (o) => o.id !== e.id && !["replaced", "disposed"].includes(o.status),
  );
  const replacement = e.replaced_by ? ((allData ?? []) as { id: string; asset_code: string; name: string }[]).find((o) => o.id === e.replaced_by) : null;
  const s = statusInfo(e.status);
  const w = warrantyInfo(e, today);
  const retired = ["replaced", "disposed"].includes(e.status);
  const warrantyCost = services.filter((x) => x.under_warranty).reduce((t, x) => t + Number(x.total_cost), 0);

  return (
    <>
      <PageHeader
        title={`${e.asset_code} · ${e.name}`}
        description={[categoryLabel(e.category), e.make, e.model, e.serial_number ? `S/N ${e.serial_number}` : null, e.location].filter(Boolean).join(" · ")}
        actions={
          <Link href="/ops/equipment?tab=register" className="text-sm font-semibold text-primary-dark">
            ← All machines
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={s.tone}>{s.text}</Badge>
        <Badge tone={w.tone}>{w.text}</Badge>
        {replacement ? (
          <Badge tone="info">
            Replaced by{" "}
            <Link href={`/ops/equipment/${replacement.id}`} className="underline">
              {replacement.asset_code} {replacement.name}
            </Link>
            {e.replaced_on ? ` on ${date(e.replaced_on)}` : ""}
          </Badge>
        ) : null}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Services" value={sum?.services ?? 0} hint={sum?.last_service_date ? `Last ${date(sum.last_service_date)}` : undefined} />
        <Stat label="Repairs" value={sum?.repairs ?? 0} hint={sum?.downtime_hours ? `${sum.downtime_hours} h out of action` : undefined} tone={(sum?.repairs ?? 0) >= 3 ? "warn" : "default"} />
        <Stat label="Total spent on upkeep" value={inr(sum?.total_cost ?? 0, 0)} hint={`Repairs ${inr(sum?.repair_cost ?? 0, 0)}${warrantyCost ? ` · ${inr(warrantyCost, 0)} while in warranty` : ""}`} />
        <Stat
          label="Next service"
          value={e.next_service_due ? date(e.next_service_due) : "—"}
          tone={e.next_service_due && e.next_service_due < today ? "bad" : "default"}
          hint={e.service_interval_days ? `Every ${e.service_interval_days} days` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {canEdit && !retired ? (
            <Card title="Record a service or repair" description="Whether it was under warranty is filled in from the warranty dates; change it if the vendor refused the claim.">
              <OpsForm fn="eq_record_service" submitLabel="Save" success="Saved" idempotent>
                <input type="hidden" name="p.equipment_id" value={e.id} />
                <Grid cols={3}>
                  <Select label="What was done" name="p.kind" options={SERVICE_KINDS} defaultValue="repair" />
                  <Input label="Date" name="p.service_date#date" type="date" defaultValue={today} max={today} />
                  <Select
                    label="Machine after the work"
                    name="p.status_after"
                    options={[
                      { value: "working", label: "Working" },
                      { value: "needs_attention", label: "Working, needs attention" },
                      { value: "under_repair", label: "Still under repair" },
                      { value: "out_of_service", label: "Not working" },
                    ]}
                  />
                  <Input label="Problem" name="p.problem" />
                  <Input label="Work done" name="p.work_done" required />
                  <Input label="Vendor / company" name="p.vendor" defaultValue={e.vendor ?? ""} />
                  <Input label="Technician" name="p.technician" />
                  <NumberInput label="Parts (₹)" name="p.parts_cost#num" />
                  <NumberInput label="Labour / service charge (₹)" name="p.labour_cost#num" />
                  <NumberInput label="Other costs (₹)" name="p.other_cost#num" hint="Transport, call-out" />
                  <NumberInput label="Hours out of action" name="p.downtime_hours#num" />
                  <Input label="Bill number" name="p.invoice_number" />
                  <Select
                    label="Under warranty?"
                    name="p.under_warranty"
                    placeholder={`Work it out (${w.text.toLowerCase()})`}
                    options={[
                      { value: "true", label: "Yes, under warranty" },
                      { value: "false", label: "No, not covered" },
                    ]}
                  />
                  <Input label="Next service due" name="p.next_service_due#date" type="date" hint={e.service_interval_days ? `Blank: ${e.service_interval_days} days after a routine service` : undefined} />
                  <Input label="Link to bill" name="p.document_url" placeholder="https://…" />
                </Grid>
                {canExpense ? (
                  <div className="mt-2 rounded-xl bg-[#f5f6f7] p-3">
                    <Checkbox label="Also record the cost as an expense (Repairs and maintenance)" name="p.add_expense#bool" />
                    <Grid cols={2}>
                      <Select label="Paid from" name="p.paid_from" placeholder="Not paid yet (owed)" options={accounts} />
                      <Select label="Method" name="p.payment_method" placeholder="—" options={paymentMethods} />
                    </Grid>
                  </div>
                ) : null}
              </OpsForm>
            </Card>
          ) : null}

          <Card title="Service & repair history">
            {services.length ? (
              <Table head={["Date", "Work", "Vendor", "Warranty", "Parts", "Labour", "Other", "Total", "After"]} compact>
                {services.map((x) => (
                  <tr key={x.id}>
                    <Td>{date(x.service_date)}</Td>
                    <Td>
                      <span className="font-semibold">{kindLabel(x.kind)}</span>: {x.work_done}
                      {x.problem ? <div className="text-dark/55">Problem: {x.problem}</div> : null}
                      {x.downtime_hours ? <div className="text-dark/55">{x.downtime_hours} h out of action</div> : null}
                      {x.document_url ? (
                        <a href={x.document_url} target="_blank" rel="noopener noreferrer" className="text-primary-dark hover:underline">
                          bill{x.invoice_number ? ` ${x.invoice_number}` : ""}
                        </a>
                      ) : x.invoice_number ? (
                        <div className="text-dark/55">Bill {x.invoice_number}</div>
                      ) : null}
                    </Td>
                    <Td>
                      {x.vendor ?? "—"}
                      {x.technician ? <div className="text-dark/55">{x.technician}</div> : null}
                    </Td>
                    <Td>{x.under_warranty ? <Badge tone="good">Warranty</Badge> : x.under_amc ? <Badge tone="info">AMC</Badge> : <Badge tone="muted">No</Badge>}</Td>
                    <Td right>{inr(x.parts_cost, 0)}</Td>
                    <Td right>{inr(x.labour_cost, 0)}</Td>
                    <Td right>{inr(x.other_cost, 0)}</Td>
                    <Td right>
                      <span className="font-semibold">{inr(x.total_cost, 0)}</span>
                      {x.expense_id ? <div className="text-dark/55">in expenses</div> : null}
                    </Td>
                    <Td>
                      <Badge tone={statusInfo(x.status_after).tone}>{statusInfo(x.status_after).text}</Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No services or repairs recorded yet.</Empty>
            )}
          </Card>

          <Card title="Condition checks (last 30)">
            {checks.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {checks.map((c) => (
                  <li key={c.id}>
                    {date(c.checked_on)} ·{" "}
                    <span className={c.condition === "working" ? "text-emerald-700" : c.condition === "not_working" ? "font-semibold text-red-700" : "text-amber-700"}>
                      {c.condition === "working" ? "Working" : c.condition === "not_working" ? "Not working" : "Needs attention"}
                    </span>
                    {c.note ? ` · ${c.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No checks yet.</Empty>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Purchase & warranty">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-dark/55">Bought</dt>
              <dd>{date(e.purchase_date) || "—"}</dd>
              <dt className="text-dark/55">Price</dt>
              <dd>{e.purchase_cost ? inr(e.purchase_cost, 0) : "—"}</dd>
              <dt className="text-dark/55">From</dt>
              <dd>
                {e.vendor ?? "—"}
                {e.vendor_contact ? <div className="text-dark/55">{e.vendor_contact}</div> : null}
              </dd>
              <dt className="text-dark/55">Warranty</dt>
              <dd>{e.warranty_end ? `${date(e.warranty_start) || "?"} – ${date(e.warranty_end)}` : "—"}</dd>
              <dt className="text-dark/55">AMC</dt>
              <dd>{e.amc_end ? `${e.amc_provider ?? ""} till ${date(e.amc_end)}` : "—"}</dd>
              <dt className="text-dark/55">Papers</dt>
              <dd>
                {e.document_url ? (
                  <a href={e.document_url} target="_blank" rel="noopener noreferrer" className="text-primary-dark hover:underline">
                    Open
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {e.warranty_terms ? <p className="mt-3 text-sm text-dark/70">{e.warranty_terms}</p> : null}
            {e.notes ? <p className="mt-3 whitespace-pre-line text-sm text-dark/70">{e.notes}</p> : null}
          </Card>

          {canEdit && !retired ? (
            <Card title="Edit details">
              <OpsForm fn="eq_save_equipment" submitLabel="Save details" success="Saved" resetOnSuccess={false}>
                <input type="hidden" name="p.id" value={e.id} />
                <div className="flex flex-col gap-3">
                  <Input label="Name" name="p.name" defaultValue={e.name} required />
                  <Select label="Type" name="p.category" options={CATEGORIES} defaultValue={e.category} />
                  <Input label="Where it is" name="p.location" defaultValue={e.location ?? ""} />
                  <Grid cols={2}>
                    <Input label="Make" name="p.make" defaultValue={e.make ?? ""} />
                    <Input label="Model" name="p.model" defaultValue={e.model ?? ""} />
                  </Grid>
                  <Input label="Serial number" name="p.serial_number" defaultValue={e.serial_number ?? ""} />
                  <Grid cols={2}>
                    <Input label="Bought on" name="p.purchase_date#date" type="date" defaultValue={e.purchase_date ?? ""} />
                    <NumberInput label="Price (₹)" name="p.purchase_cost#num" defaultValue={e.purchase_cost ?? ""} />
                  </Grid>
                  <Input label="Bought from" name="p.vendor" defaultValue={e.vendor ?? ""} />
                  <Input label="Vendor / service contact" name="p.vendor_contact" defaultValue={e.vendor_contact ?? ""} />
                  <Grid cols={2}>
                    <Input label="Warranty from" name="p.warranty_start#date" type="date" defaultValue={e.warranty_start ?? ""} />
                    <Input label="Warranty until" name="p.warranty_end#date" type="date" defaultValue={e.warranty_end ?? ""} />
                  </Grid>
                  <TextArea label="Warranty terms" name="p.warranty_terms" defaultValue={e.warranty_terms ?? ""} />
                  <Grid cols={2}>
                    <Input label="AMC with" name="p.amc_provider" defaultValue={e.amc_provider ?? ""} />
                    <Input label="AMC until" name="p.amc_end#date" type="date" defaultValue={e.amc_end ?? ""} />
                  </Grid>
                  <Grid cols={2}>
                    <NumberInput label="Service every (days)" name="p.service_interval_days#int" defaultValue={e.service_interval_days ?? ""} />
                    <Input label="Next service due" name="p.next_service_due#date" type="date" defaultValue={e.next_service_due ?? ""} />
                  </Grid>
                  <Input label="Link to bill / warranty card" name="p.document_url" defaultValue={e.document_url ?? ""} />
                  <TextArea label="Notes" name="p.notes" defaultValue={e.notes ?? ""} />
                </div>
              </OpsForm>
            </Card>
          ) : null}

          {canEdit && !retired ? (
            <Card title="Replace or retire" description="Add the new machine to the register first, then choose it here. Its history stays with this one.">
              <OpsForm fn="eq_replace" submitLabel="Mark replaced" variant="danger" success="Marked replaced" confirm="Mark this machine as replaced?">
                <input type="hidden" name="p_equipment_id" value={e.id} />
                <Select label="Replaced by" name="p_replacement_id" required placeholder="Choose the new machine…" options={others.map((o) => ({ value: o.id, label: `${o.asset_code} · ${o.name}` }))} />
                <Input label="Why" name="p_note" required placeholder="e.g. Motor burnt, repair not worth it" />
              </OpsForm>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-dark/55">Retire without a replacement</summary>
                <OpsForm fn="eq_replace" submitLabel="Mark disposed" variant="secondary" success="Marked disposed" confirm="Retire this machine without a replacement?" className="mt-2">
                  <input type="hidden" name="p_equipment_id" value={e.id} />
                  <input type="hidden" name="p_disposed#bool" value="true" />
                  <Input label="Why" name="p_note" required placeholder="e.g. Sold as scrap" />
                </OpsForm>
              </details>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

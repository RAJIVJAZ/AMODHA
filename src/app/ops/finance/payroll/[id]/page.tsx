import { notFound } from "next/navigation";
import { OpsForm } from "@/components/ops/ops-form";
import { Card, Empty, Grid, Input, NumberInput, PageHeader, Select, Stat, StatusBadge } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { dateTime, inr, todayIST } from "@/lib/ops/format";
import { moneyAccounts } from "@/lib/ops/finance";

type Run = { id: string; run_no: string; period_start: string; status: string; total_gross: number; total_deductions: number; total_net: number; approved_at: string | null; paid_at: string | null; paid_from: string | null; payment_reference: string | null };
type Line = {
  id: string; employee_id: string; days_in_period: number; days_payable: number; base_pay: number; component_earnings: number; overtime_hours: number; overtime_pay: number;
  other_earnings: number; component_deductions: number; advance_recovery: number; other_deductions: number; gross: number; net_pay: number; note: string | null;
  employees: { full_name: string; employee_code: string; pay_type: string } | null;
};

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ops = await requireOps("payroll");
  const { data } = await ops.supabase
    .from("payroll_runs")
    .select("id, run_no, period_start, status, total_gross, total_deductions, total_net, approved_at, paid_at, paid_from, payment_reference")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const run = data as Run;
  const [{ data: lineData }, { data: advData }, accounts] = await Promise.all([
    ops.supabase
      .from("payroll_lines")
      .select("id, employee_id, days_in_period, days_payable, base_pay, component_earnings, overtime_hours, overtime_pay, other_earnings, component_deductions, advance_recovery, other_deductions, gross, net_pay, note, employees(full_name, employee_code, pay_type)")
      .eq("run_id", id),
    ops.supabase.from("employee_advances").select("employee_id, amount, recovered"),
    moneyAccounts(ops),
  ]);
  const lines = ((lineData ?? []) as unknown as Line[]).sort((a, b) => (a.employees?.full_name ?? "").localeCompare(b.employees?.full_name ?? ""));
  const openAdvance = new Map<string, number>();
  for (const a of (advData ?? []) as { employee_id: string; amount: number; recovered: number }[]) {
    openAdvance.set(a.employee_id, (openAdvance.get(a.employee_id) ?? 0) + Number(a.amount) - Number(a.recovered));
  }
  const month = new Date(`${run.period_start}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const draft = run.status === "draft" && ops.can("payroll", "edit");

  return (
    <>
      <PageHeader title={`Payroll ${month}`} description={`${run.run_no} · ${lines.length} employees`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gross pay" value={inr(run.total_gross, 0)} />
        <Stat label="Deductions" value={inr(run.total_deductions, 0)} />
        <Stat label="Net to pay" value={inr(run.total_net, 0)} />
        <div className="rounded-2xl border-2 border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-dark/55">Status</p>
          <div className="mt-1">
            <StatusBadge status={run.status} />
          </div>
          {run.approved_at ? <p className="mt-1 text-xs text-dark/55">approved {dateTime(run.approved_at)}</p> : null}
          {run.paid_at ? <p className="text-xs text-dark/55">paid {dateTime(run.paid_at)}{run.payment_reference ? ` · ${run.payment_reference}` : ""}</p> : null}
        </div>
      </div>

      <Card title="Employees" description={draft ? "Change days payable from the attendance register, add overtime, other earnings and deductions, then save each line." : undefined}>
        {lines.length ? (
          <div className="flex flex-col divide-y divide-ink/10">
            {lines.map((l) => (
              <div key={l.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">
                    {l.employees?.full_name} <span className="text-xs font-normal text-dark/55">{l.employees?.employee_code}</span>
                  </p>
                  <p className="text-sm">
                    Gross {inr(l.gross)} · deductions {inr(Number(l.component_deductions) + Number(l.advance_recovery) + Number(l.other_deductions))} ·{" "}
                    <span className="font-semibold">net {inr(l.net_pay)}</span>
                  </p>
                </div>
                <p className="mt-1 text-xs text-dark/60">
                  {Number(l.days_payable)} of {l.days_in_period} days · basic {inr(l.base_pay)} · allowances {inr(l.component_earnings)} · overtime {Number(l.overtime_hours)} h = {inr(l.overtime_pay)} ·
                  other {inr(l.other_earnings)} · fixed deductions {inr(l.component_deductions)} · advance recovered {inr(l.advance_recovery)} · other deductions {inr(l.other_deductions)}
                  {l.note ? ` · ${l.note}` : ""}
                </p>
                {draft ? (
                  <div className="mt-2">
                    <OpsForm fn="pay_update_line" submitLabel="Save" variant="secondary" inline success="Updated" resetOnSuccess={false}>
                      <input type="hidden" name="p_line_id" value={l.id} />
                      <NumberInput label="Days payable" name="p_days_payable#num" defaultValue={l.days_payable} className="w-24" />
                      <NumberInput label="Overtime hours" name="p_overtime_hours#num" defaultValue={l.overtime_hours} className="w-24" />
                      <NumberInput label="Other earnings ₹" name="p_other_earnings#num" defaultValue={l.other_earnings} className="w-28" />
                      <NumberInput
                        label={`Advance recovery ₹ (of ${inr(openAdvance.get(l.employee_id) ?? 0, 0)})`}
                        name="p_advance_recovery#num"
                        defaultValue={l.advance_recovery}
                        className="w-28"
                      />
                      <NumberInput label="Other deductions ₹" name="p_other_deductions#num" defaultValue={l.other_deductions} className="w-28" />
                      <Input label="Note" name="p_note" defaultValue={l.note ?? ""} className="w-40" />
                    </OpsForm>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No employees in this payroll.</Empty>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {run.status === "draft" && ops.can("payroll", "approve") ? (
          <Card title="Approve" description="Posts salaries to the books and recovers advances. Lines can no longer be changed.">
            <OpsForm fn="pay_approve_run" submitLabel="Approve payroll" confirm="Approve this payroll? It can no longer be edited." success="Payroll approved">
              <input type="hidden" name="p_run_id" value={run.id} />
            </OpsForm>
          </Card>
        ) : null}
        {run.status === "approved" && ops.can("payroll", "approve") ? (
          <Card title="Record salary payment">
            <OpsForm fn="pay_mark_paid" submitLabel="Mark as paid" confirm={`Record ${inr(run.total_net)} paid?`} success="Payment recorded">
              <input type="hidden" name="p_run_id" value={run.id} />
              <Grid cols={2}>
                <Input label="Paid on" name="p_paid_on#date" type="date" required defaultValue={todayIST()} />
                <Select label="Paid from" name="p_paid_from" options={accounts} defaultValue="1010" />
              </Grid>
              <Input label="Reference" name="p_reference" />
            </OpsForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}

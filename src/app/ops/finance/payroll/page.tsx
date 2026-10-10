import Link from "next/link";
import { EmployeeFields } from "@/components/ops/employee-fields";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, NumberInput, PageHeader, Select, StatusBadge, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, param, todayIST } from "@/lib/ops/format";
import { moneyAccounts } from "@/lib/ops/finance";

export const metadata = { title: "Payroll" };

type Run = { id: string; run_no: string; period_start: string; status: string; total_gross: number; total_deductions: number; total_net: number; paid_at: string | null };
type Employee = {
  id: string; employee_code: string; full_name: string; department: string | null; designation: string | null; joining_date: string; leaving_date: string | null;
  pay_type: string; monthly_salary: number | null; daily_rate: number | null; is_active: boolean;
};
type Advance = { id: string; employee_id: string; advance_date: string; amount: number; recovered: number; reason: string | null; employees: { full_name: string } | null };

function recentMonths(today: string, n = 4) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = d.toISOString().slice(0, 10);
    return { value, label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("payroll");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "runs";

  const [{ data: runData }, { data: empData }, { data: advData }, accounts] = await Promise.all([
    ops.supabase.from("payroll_runs").select("id, run_no, period_start, status, total_gross, total_deductions, total_net, paid_at").order("period_start", { ascending: false }),
    ops.supabase.from("employees").select("id, employee_code, full_name, department, designation, joining_date, leaving_date, pay_type, monthly_salary, daily_rate, is_active").order("is_active", { ascending: false }).order("full_name"),
    ops.supabase.from("employee_advances").select("id, employee_id, advance_date, amount, recovered, reason, employees(full_name)").order("advance_date", { ascending: false }),
    ops.can("payroll", "create") ? moneyAccounts(ops) : Promise.resolve([]),
  ]);
  const runs = (runData ?? []) as Run[];
  const employees = (empData ?? []) as Employee[];
  const advances = (advData ?? []) as unknown as Advance[];
  const existing = new Set(runs.map((r) => r.period_start));
  const months = recentMonths(todayIST()).filter((m) => !existing.has(m.value));

  return (
    <>
      <PageHeader title="Payroll" description="Employees, salary advances and monthly payroll. Payroll figures are visible only to people with payroll access." />
      <Tabs
        current={tab}
        items={[
          { key: "runs", label: "Monthly payroll", href: "/ops/finance/payroll" },
          { key: "employees", label: `Employees (${employees.filter((e) => e.is_active).length})`, href: "/ops/finance/payroll?tab=employees" },
          { key: "advances", label: "Advances", href: "/ops/finance/payroll?tab=advances" },
        ]}
      />

      {tab === "runs" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Card>
              {runs.length ? (
                <Table head={["Payroll", "Month", "Gross", "Deductions", "Net pay", "Status"]}>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <Link href={`/ops/finance/payroll/${r.id}`} className="font-semibold text-primary-dark hover:underline">
                          {r.run_no}
                        </Link>
                      </Td>
                      <Td>{new Date(`${r.period_start}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</Td>
                      <Td right>{inr(r.total_gross)}</Td>
                      <Td right>{inr(r.total_deductions)}</Td>
                      <Td right className="font-semibold">
                        {inr(r.total_net)}
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No payroll prepared yet.</Empty>
              )}
            </Card>
          </div>
          {ops.can("payroll", "create") ? (
            <Card title="Prepare payroll" description="Creates a draft for every active employee with full attendance; adjust days, overtime and deductions before approving.">
              {months.length && employees.some((e) => e.is_active) ? (
                <OpsForm fn="pay_create_run" submitLabel="Prepare" redirectTo="/ops/finance/payroll/{id}">
                  <Select label="Month" name="p_period_start#date" options={months} />
                </OpsForm>
              ) : (
                <Empty>{employees.some((e) => e.is_active) ? "Payroll for recent months is already prepared." : "Add employees first."}</Empty>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "employees" ? (
        <div className="flex flex-col gap-4">
          <Card>
            {employees.length ? (
              <Table head={["Code", "Name", "Department", "Joined", "Pay", "Status"]}>
                {employees.map((e) => (
                  <tr key={e.id} className={e.is_active ? "" : "opacity-60"}>
                    <Td>{e.employee_code}</Td>
                    <Td>
                      {ops.can("payroll", "edit") ? (
                        <Link href={`/ops/finance/payroll/employees/${e.id}`} className="font-semibold text-primary-dark hover:underline">
                          {e.full_name}
                        </Link>
                      ) : (
                        e.full_name
                      )}
                      {e.designation ? <div className="text-xs text-dark/55">{e.designation}</div> : null}
                    </Td>
                    <Td>{e.department}</Td>
                    <Td>
                      {date(e.joining_date)}
                      {e.leaving_date ? <div className="text-xs text-dark/55">left {date(e.leaving_date)}</div> : null}
                    </Td>
                    <Td right>{e.pay_type === "monthly" ? `${inr(e.monthly_salary, 0)} / month` : `${inr(e.daily_rate, 0)} / day`}</Td>
                    <Td>
                      <Badge tone={e.is_active ? "good" : "info"}>{e.is_active ? "active" : "inactive"}</Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No employees yet.</Empty>
            )}
          </Card>
          {ops.can("payroll", "create") ? (
            <Card title="Add employee">
              <OpsForm fn="pay_save_employee" submitLabel="Add employee" success="Employee added">
                <EmployeeFields />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "advances" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Card description="Advances are recovered through payroll (enter the recovery on the employee's payroll line).">
              {advances.length ? (
                <Table head={["Date", "Employee", "Amount", "Recovered", "Outstanding", "Reason"]}>
                  {advances.map((a) => (
                    <tr key={a.id}>
                      <Td>{date(a.advance_date)}</Td>
                      <Td>{a.employees?.full_name}</Td>
                      <Td right>{inr(a.amount)}</Td>
                      <Td right>{inr(a.recovered)}</Td>
                      <Td right className={Number(a.amount) > Number(a.recovered) ? "font-semibold" : ""}>
                        {inr(Number(a.amount) - Number(a.recovered))}
                      </Td>
                      <Td>{a.reason}</Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No advances.</Empty>
              )}
            </Card>
          </div>
          {ops.can("payroll", "create") && employees.some((e) => e.is_active) ? (
            <Card title="Give an advance">
              <OpsForm fn="pay_record_advance" submitLabel="Record advance" success="Advance recorded">
                <Select label="Employee" name="p_employee_id" required placeholder="Choose…" options={employees.filter((e) => e.is_active).map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))} />
                <Grid cols={2}>
                  <NumberInput label="Amount (₹)" name="p_amount#num" required />
                  <Input label="Date" name="p_date#date" type="date" required defaultValue={todayIST()} />
                </Grid>
                <Select label="Paid from" name="p_paid_from" options={accounts} defaultValue="1000" />
                <Input label="Reason" name="p_reason" />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

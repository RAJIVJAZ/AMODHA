import { notFound } from "next/navigation";
import { EmployeeFields, type EmployeeValues } from "@/components/ops/employee-fields";
import { OpsForm } from "@/components/ops/ops-form";
import { Card, PageHeader } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date } from "@/lib/ops/format";

export const metadata = { title: "Employee" };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ops = await requireOps("payroll", "edit");
  const { data } = await ops.supabase
    .from("employees")
    .select("id, employee_code, full_name, department, designation, joining_date, leaving_date, phone, pay_type, monthly_salary, daily_rate, overtime_rate_per_hour, bank_account_masked, notes, is_active, salary_components")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const emp = data as EmployeeValues;

  return (
    <>
      <PageHeader title={emp.full_name ?? "Employee"} description={`${emp.employee_code} · joined ${date(emp.joining_date)} · ${emp.pay_type === "daily" ? "daily wage" : "monthly salary"}`} />
      <Card>
        <OpsForm fn="pay_save_employee" submitLabel="Save changes" success="Saved" resetOnSuccess={false}>
          <EmployeeFields initial={emp} />
        </OpsForm>
      </Card>
    </>
  );
}

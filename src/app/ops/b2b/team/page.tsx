import Link from "next/link";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Checkbox, Empty, Grid, Input, NumberInput, PageHeader, Select, Table, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { dateTime, inr, todayIST } from "@/lib/ops/format";
import type { Salesperson, Territory } from "../_lib";

export const metadata = { title: "Sales team" };

type Target = { salesperson_id: string; month: string; target_value: number; target_orders: number; target_new_customers: number };

function SalespersonFields({ s, territories }: { s?: Salesperson; territories: Territory[] }) {
  return (
    <>
      {s ? <input type="hidden" name="p.id" value={s.id} /> : null}
      <Grid cols={3}>
        {s ? <Input label="Sign-in email" value={s.email} disabled /> : <Input label="Sign-in email" name="p.email" type="email" required hint="Their own account — never shared" />}
        <Input label="Full name" name="p.full_name" defaultValue={s?.full_name} required />
        <Input label="Employee code" name="p.employee_code" defaultValue={s?.employee_code} required placeholder="MW-S01" />
        <Input label="Mobile" name="p.phone" defaultValue={s?.phone ?? ""} />
        <NumberInput label="Incentive %" name="p.incentive_pct#num" defaultValue={s?.incentive_pct ?? 0} />
        <Select
          label="Incentive on"
          name="p.incentive_basis"
          defaultValue={s?.incentive_basis ?? "rep_orders"}
          options={[
            { value: "rep_orders", label: "Orders they entered" },
            { value: "account_sales", label: "All sales of their shops" },
          ]}
        />
      </Grid>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 font-semibold text-ink">Territories</legend>
        <input type="hidden" name="p.territories#list" value="" />
        {territories.map((t) => (
          <label key={t.code} className="flex items-center gap-2">
            <input type="checkbox" name="p.territories#list" value={t.code} defaultChecked={s?.territories.includes(t.code)} className="h-4 w-4 accent-ink" />
            {t.name}
          </label>
        ))}
        {!territories.length ? <span className="text-dark/55">Add territories below first.</span> : null}
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <Checkbox label="Active" name="p.is_active#bool" defaultChecked={s?.is_active ?? true} />
        <Checkbox label="May see outstanding balances" name="p.can_view_outstanding#bool" defaultChecked={s?.can_view_outstanding} />
        <Checkbox label="May see credit limits" name="p.can_view_credit#bool" defaultChecked={s?.can_view_credit} />
      </div>
    </>
  );
}

export default async function TeamPage() {
  const ops = await requireOps("sales_team");
  const month = `${todayIST().slice(0, 8)}01`;
  const [{ data: sp }, { data: tr }, { data: tg }, { data: ap }] = await Promise.all([
    ops.supabase.from("salespeople").select("*").order("full_name"),
    ops.supabase.from("sales_territories").select("*").order("name"),
    ops.supabase.from("sales_targets").select("*").eq("month", month),
    ops.supabase.from("salesperson_applications").select("*").eq("status", "pending").order("created_at"),
  ]);
  const applications = (ap ?? []) as { id: string; email: string; full_name: string; phone: string; city: string; areas: string | null; experience: string | null; created_at: string }[];
  const people = (sp ?? []) as Salesperson[];
  const territories = (tr ?? []) as Territory[];
  const targets = new Map(((tg ?? []) as Target[]).map((t) => [t.salesperson_id, t]));
  const edit = ops.can("sales_team", "edit");

  return (
    <>
      <PageHeader
        title="Sales team"
        description="Each salesperson signs in with their own email (one person, one account). New people can register at /sales/register; their app is at /sales."
        actions={<Link href="/ops/b2b/reports" className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-ink">Sales performance</Link>}
      />
      <div className="flex flex-col gap-4">
        {applications.length ? (
          <Card title={`Applications to join (${applications.length})`} description="People who registered at /sales/register. Approving creates their salesperson account and opens the Sales app for them.">
            <div className="flex flex-col gap-3">
              {applications.map((a) => (
                <div key={a.id} className="rounded-xl border border-ink/10 p-3 text-sm">
                  <p className="font-semibold text-ink">
                    {a.full_name} · {a.phone} · {a.email}
                  </p>
                  <p className="text-dark/65">
                    {a.city}
                    {a.areas ? ` · areas: ${a.areas}` : ""} · applied {dateTime(a.created_at)}
                  </p>
                  {a.experience ? <p className="mt-1 text-dark/75">“{a.experience}”</p> : null}
                  {ops.can("sales_team", "create") ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <OpsForm fn="st_decide_application" submitLabel="Approve" success="Approved — they can now sign in to the Sales app" autosave={false}>
                        <input type="hidden" name="p_application_id" value={a.id} />
                        <input type="hidden" name="p_approve#bool" value="true" />
                        <Grid cols={3}>
                          <Input label="Employee code" name="p_employee_code" required placeholder="MW-S05" />
                          <Input label="Note" name="p_note" />
                        </Grid>
                        <fieldset className="flex flex-wrap gap-3">
                          <legend className="mb-1 font-semibold text-ink">Territories</legend>
                          <input type="hidden" name="p_territories#list" value="" />
                          {territories.map((t) => (
                            <label key={t.code} className="flex items-center gap-2">
                              <input type="checkbox" name="p_territories#list" value={t.code} className="h-4 w-4 accent-ink" />
                              {t.name}
                            </label>
                          ))}
                        </fieldset>
                      </OpsForm>
                      <OpsForm fn="st_decide_application" submitLabel="Reject" variant="secondary" inline success="Rejected" autosave={false}>
                        <input type="hidden" name="p_application_id" value={a.id} />
                        <input type="hidden" name="p_approve#bool" value="false" />
                        <Input label="Reason" name="p_note" required />
                      </OpsForm>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
        <Card title="Salespeople">
          {people.length ? (
            <Table head={["Name", "Code", "Territories", "Login", "Target this month", "Incentive", ""]}>
              {people.map((s) => {
                const t = targets.get(s.id);
                return (
                  <tr key={s.id}>
                    <Td>
                      {s.full_name}
                      <div className="text-xs text-dark/55">{s.email}</div>
                      {!s.is_active ? <Badge tone="bad">inactive</Badge> : null}
                    </Td>
                    <Td>{s.employee_code}</Td>
                    <Td>{s.territories.join(", ") || "—"}</Td>
                    <Td>{s.user_id ? <Badge tone="good">signed in</Badge> : <Badge tone="warn">not yet signed in</Badge>}</Td>
                    <Td>{t ? `${inr(t.target_value, 0)} · ${t.target_orders} orders · ${t.target_new_customers} new` : "—"}</Td>
                    <Td>
                      {s.incentive_pct}% {s.incentive_basis === "account_sales" ? "of shop sales" : "of entered orders"}
                    </Td>
                    <Td>
                      {edit ? (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-primary-dark">Edit / target</summary>
                          <div className="mt-2 flex flex-col gap-4">
                            <OpsForm fn="st_save_salesperson" submitLabel="Save" success="Saved">
                              <SalespersonFields s={s} territories={territories} />
                            </OpsForm>
                            <OpsForm fn="st_set_target" submitLabel="Set target" success="Target set" inline>
                              <input type="hidden" name="p_salesperson_id" value={s.id} />
                              <Input label="Month" name="p_month#date" type="date" defaultValue={month} />
                              <NumberInput label="Sales ₹" name="p_value#num" defaultValue={t?.target_value ?? 0} />
                              <NumberInput label="Orders" name="p_orders#int" defaultValue={t?.target_orders ?? 0} />
                              <NumberInput label="New shops" name="p_new_customers#int" defaultValue={t?.target_new_customers ?? 0} />
                            </OpsForm>
                          </div>
                        </details>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty>No salespeople yet.</Empty>
          )}
        </Card>

        {ops.can("sales_team", "create") ? (
          <Card title="Add salesperson" description="Gives the Salesperson role now (or when they first sign in with this email).">
            <OpsForm fn="st_save_salesperson" submitLabel="Add salesperson" success="Salesperson added">
              <SalespersonFields territories={territories} />
            </OpsForm>
          </Card>
        ) : null}

        <Card title="Territories" description="Self-registered shops are assigned to the salesperson whose territory covers their locality.">
          {territories.length ? (
            <Table head={["Code", "Name", "City", "Localities", "Active"]} compact>
              {territories.map((t) => (
                <tr key={t.code}>
                  <Td>{t.code}</Td>
                  <Td>{t.name}</Td>
                  <Td>{t.city}</Td>
                  <Td>{t.localities.join(", ") || "whole city"}</Td>
                  <Td>{t.is_active ? "yes" : "no"}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No territories yet.</Empty>
          )}
          {edit ? (
            <div className="mt-3">
              <OpsForm fn="st_save_territory" submitLabel="Save territory" success="Territory saved">
                <Grid cols={4}>
                  <Input label="Code" name="p_code" required placeholder="PRG-CIVIL" />
                  <Input label="Name" name="p_name" required />
                  <Input label="City" name="p_city" defaultValue="Prayagraj" />
                  <Input label="Localities (comma separated)" name="p_localities#list" hint="Empty = whole city" />
                </Grid>
                <Checkbox label="Active" name="p_active#bool" defaultChecked />
              </OpsForm>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}

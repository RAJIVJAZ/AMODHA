import { OpsForm } from "@/components/ops/ops-form";
import { Card, PageHeader } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { dateTime, label } from "@/lib/ops/format";

export const metadata = { title: "Settings" };

type Setting = { key: string; value: unknown; label: string; description: string | null; category: string; value_type: string; updated_at: string };

const field = "w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";

function ValueField({ s, disabled }: { s: Setting; disabled: boolean }) {
  switch (s.value_type) {
    case "number":
      return <input aria-label={s.label} name="p_value#num" type="number" step="any" required defaultValue={String(s.value)} disabled={disabled} className={`${field} sm:w-40`} />;
    case "boolean":
      return (
        <select aria-label={s.label} name="p_value#bool" defaultValue={s.value ? "true" : "false"} disabled={disabled} className={`${field} sm:w-40`}>
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      );
    case "time":
      return <input aria-label={s.label} name="p_value" type="time" required defaultValue={String(s.value)} disabled={disabled} className={`${field} sm:w-40`} />;
    case "text":
      return <input aria-label={s.label} name="p_value" required defaultValue={String(s.value)} disabled={disabled} className={field} />;
    default:
      return <textarea aria-label={s.label} name="p_value#json" rows={4} required defaultValue={JSON.stringify(s.value, null, 2)} disabled={disabled} className={`${field} font-mono text-xs`} />;
  }
}

export default async function SettingsPage() {
  const ops = await requireOps("settings");
  const { data } = await ops.supabase.from("business_settings").select("key, value, label, description, category, value_type, updated_at").order("category").order("key");
  const settings = (data ?? []) as Setting[];
  const categories = [...new Set(settings.map((s) => s.category))];
  const canEdit = ops.can("settings", "edit");

  return (
    <>
      <PageHeader title="Settings" description="Business rules used across the app. Changes apply immediately and are recorded in the audit log." />
      <div className="flex flex-col gap-4">
        {categories.map((c) => (
          <Card key={c} title={label(c).replace(/^\w/, (x) => x.toUpperCase())}>
            <div className="flex flex-col divide-y divide-ink/10">
              {settings
                .filter((s) => s.category === c)
                .map((s) => (
                  <div key={s.key} className="grid grid-cols-1 gap-2 py-3 lg:grid-cols-[1fr_minmax(0,1.2fr)] lg:items-start lg:gap-6">
                    <div className="text-sm">
                      <p className="font-semibold text-ink">{s.label}</p>
                      {s.description ? <p className="text-dark/65">{s.description}</p> : null}
                      <p className="text-xs text-dark/45">changed {dateTime(s.updated_at)}</p>
                    </div>
                    <OpsForm fn="ops_update_setting" submitLabel="Save" variant="secondary" success="Saved" resetOnSuccess={false} inline={s.value_type !== "json"}>
                      <input type="hidden" name="p_key" value={s.key} />
                      <ValueField s={s} disabled={!canEdit} />
                    </OpsForm>
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Checkbox, Empty, Grid, Input, NumberInput, PageHeader, Select, Stat, Tabs, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, param, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Documents & licences" };

type Doc = {
  id: string; doc_type: string; title: string; document_number: string | null; issuing_authority: string | null; holder: string | null;
  issue_date: string | null; expiry_date: string | null; no_expiry: boolean; remind_days: number | null; document_url: string | null;
  notes: string | null; status: "active" | "not_applicable"; status_note: string | null; updated_at: string;
};
type Renewal = { id: string; document_id: string; renewed_on: string; previous_expiry: string | null; new_expiry: string | null; new_number: string | null; cost: number | null; note: string | null; document_url: string | null };

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "fssai_license", label: "FSSAI food licence" },
  { value: "gst_registration", label: "GST registration" },
  { value: "trade_license", label: "Trade licence" },
  { value: "fire_noc", label: "Fire safety NOC" },
  { value: "pollution_consent", label: "Pollution board consent" },
  { value: "shop_establishment", label: "Shop & establishment" },
  { value: "factory_license", label: "Factory licence" },
  { value: "legal_metrology", label: "Weighing scale verification" },
  { value: "udyam", label: "Udyam (MSME)" },
  { value: "trademark", label: "Trademark" },
  { value: "water_test", label: "Water test report" },
  { value: "pest_control", label: "Pest control" },
  { value: "medical_fitness", label: "Medical fitness certificates" },
  { value: "fire_extinguisher", label: "Fire extinguisher refilling" },
  { value: "boiler_certificate", label: "Boiler certificate" },
  { value: "electrical_safety", label: "Electrical safety" },
  { value: "insurance", label: "Insurance" },
  { value: "vehicle_rc", label: "Vehicle RC" },
  { value: "vehicle_insurance", label: "Vehicle insurance" },
  { value: "vehicle_puc", label: "Vehicle PUC" },
  { value: "vehicle_fitness", label: "Vehicle fitness" },
  { value: "rent_agreement", label: "Rent / lease agreement" },
  { value: "other", label: "Other" },
];
const typeLabel = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? t;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function state(d: Doc, today: string, remindDays: number) {
  if (d.status === "not_applicable") return { tone: "muted" as const, text: "Not applicable", order: 5 };
  if (d.no_expiry) return { tone: "good" as const, text: "No expiry", order: 4 };
  if (!d.expiry_date) return { tone: "warn" as const, text: "Expiry date needed", order: 2 };
  const left = daysBetween(today, d.expiry_date);
  if (left < 0) return { tone: "bad" as const, text: `Expired ${-left} day${left === -1 ? "" : "s"} ago`, order: 0 };
  if (left <= (d.remind_days ?? remindDays)) return { tone: "warn" as const, text: `Renew within ${left} day${left === 1 ? "" : "s"}`, order: 1 };
  return { tone: "good" as const, text: `Valid · ${left} days left`, order: 3 };
}

function DocCard({ d, today, remindDays, renewals, canEdit }: { d: Doc; today: string; remindDays: number; renewals: Renewal[]; canEdit: boolean }) {
  const s = state(d, today, remindDays);
  const due = s.order <= 1;
  return (
    <div id={`doc-${d.id}`} className={`scroll-mt-24 rounded-2xl border-2 bg-white p-4 ${s.order === 0 ? "border-red-300" : s.order === 1 ? "border-amber-300" : "border-ink/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-heading text-base font-bold text-ink">{d.title}</p>
          <p className="text-xs text-dark/55">{typeLabel(d.doc_type)}{d.issuing_authority ? ` · ${d.issuing_authority}` : ""}{d.holder ? ` · ${d.holder}` : ""}</p>
        </div>
        <Badge tone={s.tone}>{s.text}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-dark/50">Number</dt>
          <dd className="font-semibold text-ink">{d.document_number ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-dark/50">Issued</dt>
          <dd>{date(d.issue_date) || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-dark/50">Expires / renewal due</dt>
          <dd className={s.order <= 1 ? "font-bold text-red-700" : ""}>{d.no_expiry ? "No expiry" : date(d.expiry_date) || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-dark/50">Document</dt>
          <dd>
            {d.document_url ? (
              <a href={d.document_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-dark hover:underline">
                Open copy
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      {d.notes ? <p className="mt-2 text-sm text-dark/65">{d.notes}</p> : null}
      {d.status === "not_applicable" && d.status_note ? <p className="mt-2 text-sm text-dark/65">Not applicable: {d.status_note}</p> : null}

      {canEdit && d.status === "active" ? (
        <div className="mt-3 flex flex-col gap-2">
          {!d.no_expiry ? (
            <details open={due} className="rounded-xl bg-[#f5f6f7] p-3">
              <summary className="cursor-pointer text-sm font-bold text-ink">{d.expiry_date ? "Record renewal" : "Enter expiry date"}</summary>
              {d.expiry_date ? (
                <OpsForm fn="cmp_renew_document" submitLabel="Save renewal" success="Renewal saved — reminder cleared" className="mt-3">
                  <input type="hidden" name="p_document_id" value={d.id} />
                  <Grid cols={3}>
                    <Input label="New expiry / next renewal date" name="p.expiry_date#date" type="date" required min={todayIST(1)} />
                    <Input label="Renewed on" name="p.renewed_on#date" type="date" defaultValue={today} max={today} />
                    <Input label="New number (if changed)" name="p.document_number" placeholder={d.document_number ?? ""} />
                    <NumberInput label="Fee paid (₹)" name="p.cost#num" />
                    <Input label="Link to the new copy" name="p.document_url" placeholder="https://drive.google.com/…" />
                    <Input label="Note" name="p.note" />
                  </Grid>
                </OpsForm>
              ) : (
                <OpsForm fn="cmp_save_document" submitLabel="Save dates" success="Saved" className="mt-3">
                  <input type="hidden" name="p.id" value={d.id} />
                  <Grid cols={3}>
                    <Input label="Issue date" name="p.issue_date#date" type="date" />
                    <Input label="Expiry / renewal date" name="p.expiry_date#date" type="date" required />
                    <Input label="Number" name="p.document_number" defaultValue={d.document_number ?? ""} />
                  </Grid>
                </OpsForm>
              )}
            </details>
          ) : null}
          <details className="rounded-xl bg-[#f5f6f7] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Edit details</summary>
            <OpsForm fn="cmp_save_document" submitLabel="Save details" success="Saved" className="mt-3" resetOnSuccess={false}>
              <input type="hidden" name="p.id" value={d.id} />
              <Grid cols={3}>
                <Input label="Name" name="p.title" defaultValue={d.title} required />
                <Select label="Type" name="p.doc_type" defaultValue={d.doc_type} options={DOC_TYPES} />
                <Input label="Number" name="p.document_number" defaultValue={d.document_number ?? ""} />
                <Input label="Issued by" name="p.issuing_authority" defaultValue={d.issuing_authority ?? ""} />
                <Input label="For (vehicle no., person, premises)" name="p.holder" defaultValue={d.holder ?? ""} />
                <Input label="Issue date" name="p.issue_date#date" type="date" defaultValue={d.issue_date ?? ""} />
                <Input label="Expiry date" name="p.expiry_date#date" type="date" defaultValue={d.expiry_date ?? ""} hint="To renew, use Record renewal" />
                <NumberInput label="Remind days before" name="p.remind_days#int" defaultValue={d.remind_days ?? ""} placeholder={String(remindDays)} />
                <Input label="Link to the copy" name="p.document_url" defaultValue={d.document_url ?? ""} placeholder="https://…" />
              </Grid>
              <Checkbox label="This document has no expiry date" name="p.no_expiry#bool" defaultChecked={d.no_expiry} />
              <TextArea label="Notes" name="p.notes" defaultValue={d.notes ?? ""} rows={2} />
            </OpsForm>
          </details>
          <details className="rounded-xl p-1">
            <summary className="cursor-pointer text-xs font-semibold text-dark/55">Not needed for our business?</summary>
            <OpsForm fn="cmp_set_applicable" submitLabel="Mark not applicable" variant="secondary" inline success="Marked not applicable">
              <input type="hidden" name="p_document_id" value={d.id} />
              <input type="hidden" name="p_applicable#bool" value="false" />
              <Input label="Reason" name="p_reason" required />
            </OpsForm>
          </details>
        </div>
      ) : null}
      {canEdit && d.status === "not_applicable" ? (
        <OpsForm fn="cmp_set_applicable" submitLabel="We need this after all" variant="quiet" inline success="Back on the checklist" className="mt-2">
          <input type="hidden" name="p_document_id" value={d.id} />
          <input type="hidden" name="p_applicable#bool" value="true" />
          <input type="hidden" name="p_reason" value="Back on the checklist" />
        </OpsForm>
      ) : null}

      {renewals.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-dark/55">Renewal history ({renewals.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-dark/70">
            {renewals.map((r) => (
              <li key={r.id}>
                {date(r.renewed_on)}: {date(r.previous_expiry) || "—"} → {date(r.new_expiry) || "no expiry"}
                {r.new_number ? ` · No. ${r.new_number}` : ""}
                {r.cost ? ` · ${inr(r.cost, 0)}` : ""}
                {r.note ? ` · ${r.note}` : ""}
                {r.document_url ? (
                  <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary-dark hover:underline">
                    copy
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("compliance");
  const sp = await searchParams;
  const today = todayIST();
  const [{ data: docData }, { data: renData }, { data: remind }] = await Promise.all([
    ops.supabase.from("compliance_documents").select("*").order("title"),
    ops.supabase.from("compliance_document_renewals").select("*").order("renewed_on", { ascending: false }),
    ops.supabase.rpc("setting_num", { p_key: "compliance.remind_days", p_default: 20 }),
  ]);
  const remindDays = Number(remind ?? 20);
  const docs = ((docData ?? []) as Doc[]).sort((a, b) => state(a, today, remindDays).order - state(b, today, remindDays).order || (a.expiry_date ?? "9").localeCompare(b.expiry_date ?? "9"));
  const renewals = (renData ?? []) as Renewal[];
  const due = docs.filter((d) => state(d, today, remindDays).order <= 1);
  const missing = docs.filter((d) => state(d, today, remindDays).order === 2);
  const expired = docs.filter((d) => state(d, today, remindDays).order === 0);
  const canEdit = ops.can("compliance", "edit");
  const tab = param(sp.tab) ?? (due.length ? "due" : "checklist");
  const list = tab === "due" ? due : docs;

  return (
    <>
      <PageHeader
        title="Documents & licences"
        description={`Every licence and certificate with its renewal date. From ${remindDays} days before a document expires it appears on Today and in the daily email — every day — until the renewal is recorded with the next expiry date.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Expired" value={expired.length} tone={expired.length ? "bad" : "default"} href="/ops/admin/documents?tab=due" />
        <Stat label={`Due within ${remindDays} days`} value={due.length - expired.length} tone={due.length - expired.length ? "warn" : "default"} href="/ops/admin/documents?tab=due" />
        <Stat label="Expiry date missing" value={missing.length} tone={missing.length ? "warn" : "default"} href="/ops/admin/documents?tab=checklist" />
        <Stat label="On the checklist" value={docs.filter((d) => d.status === "active").length} />
      </div>
      <Tabs
        current={tab}
        items={[
          { key: "due", label: `To renew (${due.length})`, href: "/ops/admin/documents?tab=due" },
          { key: "checklist", label: `Checklist (${docs.length})`, href: "/ops/admin/documents?tab=checklist" },
          ...(ops.can("compliance", "create") ? [{ key: "new", label: "+ Add document", href: "/ops/admin/documents?tab=new" }] : []),
        ]}
      />

      {tab === "new" && ops.can("compliance", "create") ? (
        <Card title="Add a document" description="Licences, certificates, insurance, vehicle papers — anything with a renewal date. Keep the copy in Google Drive and paste its link.">
          <OpsForm fn="cmp_save_document" submitLabel="Add document" success="Added" redirectTo="/ops/admin/documents?tab=checklist">
            <Grid cols={3}>
              <Input label="Name" name="p.title" required placeholder="e.g. Delivery van insurance" />
              <Select label="Type" name="p.doc_type" options={DOC_TYPES} defaultValue="other" />
              <Input label="Number" name="p.document_number" />
              <Input label="Issued by" name="p.issuing_authority" />
              <Input label="For (vehicle no., person, premises)" name="p.holder" />
              <Input label="Issue date" name="p.issue_date#date" type="date" />
              <Input label="Expiry / renewal date" name="p.expiry_date#date" type="date" />
              <NumberInput label="Remind days before" name="p.remind_days#int" placeholder={String(remindDays)} />
              <Input label="Link to the copy" name="p.document_url" placeholder="https://drive.google.com/…" />
            </Grid>
            <Checkbox label="This document has no expiry date" name="p.no_expiry#bool" />
            <TextArea label="Notes" name="p.notes" rows={2} />
          </OpsForm>
        </Card>
      ) : list.length ? (
        <div className="flex flex-col gap-3">
          {list.map((d) => (
            <DocCard key={d.id} d={d} today={today} remindDays={remindDays} renewals={renewals.filter((r) => r.document_id === d.id)} canEdit={canEdit} />
          ))}
        </div>
      ) : (
        <Empty>{tab === "due" ? "Nothing to renew right now." : "No documents yet."}</Empty>
      )}
    </>
  );
}

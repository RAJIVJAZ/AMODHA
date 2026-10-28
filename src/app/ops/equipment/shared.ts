// Shared by the machinery & equipment screens.

export type Equipment = {
  id: string; asset_code: string; name: string; category: string; location: string | null; make: string | null; model: string | null;
  serial_number: string | null; purchase_date: string | null; purchase_cost: number | null; vendor: string | null; vendor_contact: string | null;
  warranty_start: string | null; warranty_end: string | null; warranty_terms: string | null; amc_provider: string | null; amc_end: string | null;
  service_interval_days: number | null; next_service_due: string | null; status: string; replaced_by: string | null; replaced_on: string | null;
  last_checked_on: string | null; document_url: string | null; notes: string | null;
};

export type EquipmentSummary = {
  equipment_id: string; services: number; repairs: number; total_cost: number; repair_cost: number; downtime_hours: number; last_service_date: string | null;
};

export const CATEGORIES = [
  { value: "production", label: "Production" },
  { value: "cooking", label: "Cooking (kadhai, bhatti, burners)" },
  { value: "refrigeration", label: "Refrigeration (chillers, freezers, display)" },
  { value: "packaging", label: "Packaging & sealing" },
  { value: "weighing", label: "Weighing scales" },
  { value: "boiler", label: "Boiler / steam" },
  { value: "utility", label: "Utility (generator, RO, compressor)" },
  { value: "vehicle", label: "Vehicle" },
  { value: "it_office", label: "Computer / printer / office" },
  { value: "other", label: "Other" },
];

export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label.split(" (")[0] ?? c;

type Tone = "good" | "warn" | "bad" | "info" | "muted";

export function statusInfo(status: string): { tone: Tone; text: string } {
  switch (status) {
    case "working":
      return { tone: "good", text: "Working" };
    case "needs_attention":
      return { tone: "warn", text: "Needs attention" };
    case "under_repair":
      return { tone: "warn", text: "Under repair" };
    case "out_of_service":
      return { tone: "bad", text: "Not working" };
    case "replaced":
      return { tone: "muted", text: "Replaced" };
    default:
      return { tone: "muted", text: "Disposed" };
  }
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function warrantyInfo(e: Pick<Equipment, "warranty_start" | "warranty_end" | "amc_end">, today: string): { tone: Tone; text: string } {
  if (e.warranty_end && today <= e.warranty_end && (!e.warranty_start || today >= e.warranty_start)) {
    const left = days(today, e.warranty_end);
    return { tone: left <= 30 ? "warn" : "good", text: `In warranty · ${left} days left` };
  }
  if (e.amc_end && today <= e.amc_end) return { tone: "info", text: `Under AMC till ${e.amc_end.split("-").reverse().join("/")}` };
  if (e.warranty_end) return { tone: "muted", text: "Out of warranty" };
  return { tone: "muted", text: "No warranty recorded" };
}

export const SERVICE_KINDS = [
  { value: "repair", label: "Repair" },
  { value: "breakdown", label: "Breakdown repair" },
  { value: "part_replacement", label: "Part replacement" },
  { value: "service", label: "Routine service" },
  { value: "calibration", label: "Calibration" },
  { value: "inspection", label: "Inspection" },
];

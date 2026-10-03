"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DELIVERY_AREA } from "@/lib/order-rules";
import { createClient } from "@/lib/supabase/client";

export type Address = { id: string; label: string; address: string; city: string; pincode: string };

const inputClass = "rounded-xl border-2 border-ink/30 px-3 py-2 text-sm focus:border-primary focus:outline-none";

export function AddressBook({ addresses }: { addresses: Address[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "Home", address: "", city: DELIVERY_AREA, pincode: "" });
  const [error, setError] = useState<string | null>(null);

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const { error: insertError } = await createClient().from("addresses").insert(form);
    if (insertError) {
      setError("Couldn't save the address. Please try again.");
      return;
    }
    setAdding(false);
    setForm({ label: "Home", address: "", city: DELIVERY_AREA, pincode: "" });
    router.refresh();
  }

  async function removeAddress(id: string) {
    await createClient().from("addresses").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {addresses.length === 0 && !adding ? <p className="text-sm text-dark/60">No saved addresses yet.</p> : null}
      <ul className="flex flex-col gap-3">
        {addresses.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border-2 border-ink/15 bg-blush px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-ink">{entry.label}</p>
              <p className="text-dark/70">
                {entry.address}, {entry.city} – {entry.pincode}
              </p>
            </div>
            <button type="button" onClick={() => removeAddress(entry.id)} className="shrink-0 text-xs font-semibold text-accent-dark hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={addAddress} className="grid grid-cols-1 gap-3 rounded-xl border-2 border-ink/15 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            Label
            <input required maxLength={40} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            Pincode
            <input required maxLength={10} inputMode="numeric" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink sm:col-span-2">
            Address
            <textarea required rows={2} maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            City
            <input required maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} />
          </label>
          <div className="flex items-end gap-3">
            <button type="submit" className="font-heading rounded-full border-2 border-ink bg-accent px-5 py-2 text-xs font-semibold uppercase text-white">
              Save address
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm font-semibold text-dark/60 hover:underline">
              Cancel
            </button>
          </div>
          {error ? <p role="alert" className="text-sm text-accent-dark sm:col-span-2">{error}</p> : null}
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="self-start text-sm font-semibold text-primary-dark hover:underline">
          + Add an address
        </button>
      )}
    </div>
  );
}

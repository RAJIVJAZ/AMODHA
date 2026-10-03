"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const options = [
  { value: "interested", label: "Interested" },
  { value: "active", label: "Active subscriber" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
];

export function MilkStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function change(next: string) {
    setSaving(true);
    setError(false);
    const res = await fetch("/api/admin/milk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <select
        aria-label="Milk subscription status"
        value={status}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="rounded-lg border-2 border-ink/30 px-2 py-1 text-xs focus:border-primary focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-accent-dark">Not saved</span> : null}
    </span>
  );
}

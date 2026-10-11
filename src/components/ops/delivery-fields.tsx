"use client";

import { useState } from "react";

const reasons = ["Customer not at home", "Phone not answered", "Address not found", "Refused the order", "Damaged on the way"];

/** Why a delivery failed: a tap on a common reason, plus an optional note, sent as one remark. */
export function FailReason() {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const remark = [reason, note.trim()].filter(Boolean).join(" — ");
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="p_remarks" value={remark} />
      <div className="flex flex-wrap gap-1.5">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => setReason(reason === r ? "" : r)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${reason === r ? "bg-accent-dark text-white" : "bg-white text-ink ring-1 ring-ink/20"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything else? (optional)"
        aria-label="Note"
        className="w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}

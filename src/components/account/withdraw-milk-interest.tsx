"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WithdrawMilkInterest() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/milk-interest", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't withdraw right now. Please try again.");
      return;
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm font-semibold text-accent-dark hover:underline">
        Withdraw interest
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-dark/70">Withdraw your registration?</span>
      <button type="button" disabled={busy} onClick={withdraw} className="font-semibold text-accent-dark hover:underline disabled:opacity-50">
        {busy ? "Withdrawing…" : "Yes, withdraw"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="font-semibold text-dark/60 hover:underline">
        Keep it
      </button>
      {error ? <span role="alert" className="w-full text-accent-dark">{error}</span> : null}
    </span>
  );
}

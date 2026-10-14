"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { b2bCall } from "@/lib/b2b/actions";

const input = "w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-3 text-base text-ink focus:border-primary focus:outline-none";

/** Application to join the field sales team. Approval by a sales manager gives access. */
export function SalesRegisterForm({ email, defaultName }: { email: string; defaultName: string }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({ full_name: defaultName, city: "Prayagraj" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((c) => ({ ...c, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await b2bCall("fs_apply", { p: v });
        setBusy(false);
        if (!res.ok) return setError(res.message);
        router.refresh();
      }}
    >
      <p className="text-sm text-dark/65">
        Signing in as <strong className="text-ink">{email}</strong> — this becomes your Sales app login.
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Full name
        <input className={input} value={v.full_name ?? ""} onChange={set("full_name")} required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Mobile number
        <input className={input} type="tel" inputMode="numeric" value={v.phone ?? ""} onChange={set("phone")} required placeholder="98765 43210" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        City
        <input className={input} value={v.city ?? ""} onChange={set("city")} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Areas you can cover <span className="font-normal text-dark/50">(optional)</span>
        <input className={input} value={v.areas ?? ""} onChange={set("areas")} placeholder="Katra, Civil Lines, Chowk…" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Sales experience <span className="font-normal text-dark/50">(optional)</span>
        <textarea className={input} rows={3} value={v.experience ?? ""} onChange={set("experience")} />
      </label>
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p> : null}
      <button disabled={busy} className="rounded-xl bg-accent px-4 py-3.5 text-base font-bold text-white disabled:opacity-60">
        {busy ? "Sending…" : "Send application"}
      </button>
    </form>
  );
}

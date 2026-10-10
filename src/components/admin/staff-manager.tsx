"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type StaffMember = { email: string; signedUp: boolean };

export function StaffManager({ staff, currentEmail }: { staff: StaffMember[]; currentEmail: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "add" | "remove", target: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target, action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong");
      return false;
    }
    router.refresh();
    return true;
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await send("add", email)) setEmail("");
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2 text-sm">
        {staff.map((member) => (
          <li key={member.email} className="flex items-center justify-between gap-3 rounded-lg bg-blush px-3 py-2">
            <span className="min-w-0 truncate">
              <span className="font-semibold text-ink">{member.email}</span>
              {member.email === currentEmail ? <span className="text-dark/60"> (you)</span> : null}
              {!member.signedUp ? <span className="text-dark/60"> · not signed up yet</span> : null}
            </span>
            {member.email !== currentEmail ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => send("remove", member.email)}
                className="shrink-0 text-xs font-semibold text-accent-dark hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          aria-label="Staff email"
          placeholder="staff@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border-2 border-ink/30 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="font-heading rounded-full border-2 border-ink bg-accent px-4 py-1.5 text-xs font-semibold uppercase text-white disabled:opacity-60"
        >
          Add admin
        </button>
      </form>
      {error ? <p role="alert" className="text-xs text-accent-dark">{error}</p> : null}
      <p className="text-xs text-dark/55">
        Admins sign in at /login with this email. Access stays with the email even if the account is deleted and
        created again.
      </p>
    </div>
  );
}

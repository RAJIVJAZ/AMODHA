"use client";

import { usePathname } from "next/navigation";
import { startTransition, useActionState, useCallback, useEffect, useRef } from "react";
import { opsAction, type OpsActionState } from "@/app/ops/actions";
import { sessionEndedUrl } from "@/components/staff/session-guard";
import { SaveStatusText, useAutosave } from "@/lib/staff/autosave";

/** The visible, editable values of a form (hidden ids and one-time keys are not drafts). */
function readFields(form: HTMLFormElement | null) {
  if (!form) return null;
  const out: Record<string, unknown> = {};
  let any = false;
  for (const el of Array.from(form.elements)) {
    const f = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!f.name || f.name.startsWith("_") || f.name === "p_key" || f.disabled) continue;
    if (f instanceof HTMLInputElement && f.type === "hidden") continue;
    if (f instanceof HTMLInputElement && (f.type === "checkbox" || f.type === "radio")) {
      const list = (out[f.name] as string[] | undefined) ?? [];
      if (f.checked) list.push(f.value);
      out[f.name] = list;
      continue;
    }
    out[f.name] = f.value;
    const initial = f instanceof HTMLSelectElement ? (Array.from(f.options).find((o) => o.defaultSelected)?.value ?? f.options[0]?.value ?? "") : f.defaultValue;
    if (f.value !== "" && f.value !== initial) any = true;
  }
  return any ? out : null;
}

function restoreFields(form: HTMLFormElement | null, data: Record<string, unknown>) {
  if (!form) return;
  for (const el of Array.from(form.elements)) {
    const f = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!f.name || !(f.name in data) || (f instanceof HTMLInputElement && f.type === "hidden")) continue;
    const v = data[f.name];
    if (f instanceof HTMLInputElement && (f.type === "checkbox" || f.type === "radio")) f.checked = Array.isArray(v) && v.includes(f.value);
    else f.value = String(v ?? "");
  }
}

type Props = {
  /** Database function to call. */
  fn: string;
  children?: React.ReactNode;
  submitLabel?: string;
  success?: string;
  /** Go here after success; "{id}" is replaced with the function's result. */
  redirectTo?: string;
  /** Sends a one-time key so a double click or retry can never post twice. */
  idempotent?: boolean;
  /** Ask before submitting. */
  confirm?: string;
  resetOnSuccess?: boolean;
  variant?: "primary" | "secondary" | "danger" | "quiet";
  className?: string;
  inline?: boolean;
  /** A full-width, taller button for the main action on a phone screen. */
  large?: boolean;
  /** Autosave unfinished entries as a draft (default: on for full forms, off for one-line forms). */
  autosave?: boolean;
};

const buttonStyles = {
  primary: "bg-ink text-white hover:bg-ink-light",
  secondary: "bg-white text-ink border-2 border-ink/20 hover:border-ink/50",
  danger: "bg-accent-dark text-white hover:bg-accent",
  quiet: "bg-transparent text-primary-dark underline-offset-2 hover:underline px-0",
};

export function OpsForm({
  fn,
  children,
  submitLabel = "Save",
  success,
  redirectTo,
  idempotent,
  confirm,
  resetOnSuccess = true,
  variant = "primary",
  className = "",
  inline = false,
  large = false,
  autosave,
}: Props) {
  const [state, action, pending] = useActionState<OpsActionState, FormData>(opsAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<string | null>(null);
  const pathname = usePathname();
  const draftKey = (autosave ?? !inline) ? `${fn}:${pathname}` : null;
  const read = useCallback(() => readFields(formRef.current), []);
  const draft = useAutosave(draftKey, read);
  const { discard } = draft;

  useEffect(() => {
    if (state?.ok) {
      keyRef.current = null;
      void discard();
    }
    // The server ended the session (inactivity / revocation): go and sign in again.
    if (state?.ended) window.location.replace(sessionEndedUrl("expired"));
  }, [state, discard]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const data = new FormData(event.currentTarget);
    if (idempotent) {
      // The same key is reused if the attempt fails, and replaced after a success.
      keyRef.current ??= crypto.randomUUID();
      data.set("p_key", keyRef.current);
    }
    startTransition(() => action(data));
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onInput={draftKey ? draft.changed : undefined}
      onChange={draftKey ? draft.changed : undefined}
      className={inline ? `inline-flex flex-wrap items-end gap-2 ${className}` : `flex flex-col gap-3 ${className}`}
    >
      <input type="hidden" name="_fn" value={fn} />
      <input type="hidden" name="_path" value={pathname} />
      {draftKey && draft.restorable ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            Unfinished entry from {new Date(draft.restorable.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
            {draft.restorable.local ? " (on this device — not yet on the server)" : ""}.
          </span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              restoreFields(formRef.current, draft.restorable?.data ?? {});
              draft.dismissRestore();
              draft.changed();
            }}
          >
            Restore it
          </button>
          <button type="button" className="text-amber-800/70 underline" onClick={() => void draft.discard()}>
            Discard
          </button>
        </div>
      ) : null}
      {success ? <input type="hidden" name="_success" value={success} /> : null}
      {redirectTo ? <input type="hidden" name="_redirect" value={redirectTo} /> : null}
      {/* Remounting the fields after each success clears them, including fields that keep their own state. */}
      <div key={resetOnSuccess ? (state?.okAt ?? 0) : 0} className={inline ? "contents" : "flex flex-col gap-3"}>
        {children}
      </div>
      <div className={inline ? "flex items-center gap-2" : "flex flex-wrap items-center gap-3"}>
        <button
          type="submit"
          disabled={pending}
          className={`rounded-lg font-semibold transition disabled:opacity-60 ${large ? "w-full px-4 py-3 text-base" : "px-4 py-2 text-sm"} ${buttonStyles[variant]}`}
        >
          {pending ? "Working…" : submitLabel}
        </button>
        {draftKey ? <SaveStatusText status={draft.status} savedAt={draft.savedAt} /> : null}
        {state && !pending ? (
          <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-accent-dark"}`}>
            {state.ok ? "✓ " : ""}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

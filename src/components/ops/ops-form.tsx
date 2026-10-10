"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { opsAction, type OpsActionState } from "@/app/ops/actions";

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
}: Props) {
  const [state, action, pending] = useActionState<OpsActionState, FormData>(opsAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    if (state?.ok) keyRef.current = null;
  }, [state]);

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
    <form ref={formRef} onSubmit={onSubmit} className={inline ? `inline-flex flex-wrap items-end gap-2 ${className}` : `flex flex-col gap-3 ${className}`}>
      <input type="hidden" name="_fn" value={fn} />
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
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${buttonStyles[variant]}`}
        >
          {pending ? "Working…" : submitLabel}
        </button>
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

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "rounded-xl border-2 border-ink/30 px-3 py-2.5 text-base text-dark focus:border-primary focus:outline-none";
const buttonClass =
  "font-heading sticker-shadow flex w-full items-center justify-center rounded-full border-[2.5px] border-ink bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60";

export function OtpLogin({ next }: { next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError(null);
    const local = normalizePhone(phone);
    if (!local) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setBusy(true);
    const { error: otpError } = await createClient().auth.signInWithOtp({ phone: `+91${local}` });
    setBusy(false);
    if (otpError) {
      console.error("Sending OTP failed:", otpError);
      setError("We couldn't send the code right now. Please try again in a minute.");
      return;
    }
    setPhone(local);
    setStep("code");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error: verifyError } = await createClient().auth.verifyOtp({
      phone: `+91${phone}`,
      token: code.trim(),
      type: "sms",
    });
    setBusy(false);
    if (verifyError) {
      setError("That code didn't work. Check it and try again, or resend a new code.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="flex flex-col gap-4">
        <p className="text-sm text-dark/70">
          We sent a 6-digit code to <span className="font-semibold text-ink">+91 {phone}</span>.
        </p>
        <label htmlFor="otp" className="text-sm font-semibold text-ink">
          Enter the code
        </label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={`${inputClass} tracking-[0.5em]`}
        />
        {error ? <p role="alert" className="text-sm font-medium text-accent-dark">{error}</p> : null}
        <button type="submit" disabled={busy || code.length !== 6} className={buttonClass}>
          {busy ? "Checking…" : "Verify & Continue"}
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={() => setStep("phone")} className="font-semibold text-primary-dark hover:underline">
            Change number
          </button>
          <button type="button" onClick={() => sendCode()} disabled={busy} className="font-semibold text-primary-dark hover:underline">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="flex flex-col gap-4">
      <label htmlFor="phone" className="text-sm font-semibold text-ink">
        Mobile number
      </label>
      <div className="flex items-center gap-2">
        <span className="rounded-xl border-2 border-ink/30 bg-blush px-3 py-2.5 text-base font-semibold text-ink">+91</span>
        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={`${inputClass} min-w-0 flex-1`}
          placeholder="98765 43210"
        />
      </div>
      {error ? <p role="alert" className="text-sm font-medium text-accent-dark">{error}</p> : null}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Sending…" : "Send OTP"}
      </button>
      <p className="text-xs text-dark/55">
        No password needed. New here? Your account is created when you verify your number.
      </p>
    </form>
  );
}

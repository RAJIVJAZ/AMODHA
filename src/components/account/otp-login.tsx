"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "rounded-xl border-2 border-ink/30 px-3 py-2.5 text-base text-dark focus:border-primary focus:outline-none";
const buttonClass =
  "font-heading sticker-shadow flex w-full items-center justify-center rounded-full border-[2.5px] border-ink bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OtpLogin({ next, method }: { next: string; method: "email" | "phone" }) {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmail = method === "email";
  const sentTo = isEmail ? contact : `+91 ${contact}`;

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError(null);
    const supabase = createClient();

    let result;
    if (isEmail) {
      const email = contact.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        setError("Enter a valid email address.");
        return;
      }
      setBusy(true);
      result = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      setContact(email);
    } else {
      const local = normalizePhone(contact);
      if (!local) {
        setError("Enter a valid 10-digit Indian mobile number.");
        return;
      }
      setBusy(true);
      result = await supabase.auth.signInWithOtp({ phone: `+91${local}` });
      setContact(local);
    }
    setBusy(false);

    if (result.error) {
      console.error("Sending code failed:", result.error);
      setError(
        result.error.status === 429
          ? "Too many codes requested. Please wait a few minutes and try again."
          : "We couldn't send the code right now. Please try again in a minute."
      );
      return;
    }
    setStep("code");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const token = code.trim();
    const { error: verifyError } = isEmail
      ? await supabase.auth.verifyOtp({ email: contact, token, type: "email" })
      : await supabase.auth.verifyOtp({ phone: `+91${contact}`, token, type: "sms" });
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
          We sent a code to <span className="font-semibold text-ink">{sentTo}</span>.
          {isEmail ? " Check your inbox (and spam folder). You can also tap the link in the email." : ""}
        </p>
        <label htmlFor="otp" className="text-sm font-semibold text-ink">
          Enter the code
        </label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6,10}"
          maxLength={10}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={`${inputClass} tracking-[0.4em]`}
        />
        {error ? <p role="alert" className="text-sm font-medium text-accent-dark">{error}</p> : null}
        <button type="submit" disabled={busy || code.length < 6} className={buttonClass}>
          {busy ? "Checking…" : "Verify & Continue"}
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={() => setStep("contact")} className="font-semibold text-primary-dark hover:underline">
            {isEmail ? "Change email" : "Change number"}
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
      <label htmlFor="contact" className="text-sm font-semibold text-ink">
        {isEmail ? "Email address" : "Mobile number"}
      </label>
      {isEmail ? (
        <input
          id="contact"
          type="email"
          autoComplete="email"
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      ) : (
        <div className="flex items-center gap-2">
          <span className="rounded-xl border-2 border-ink/30 bg-blush px-3 py-2.5 text-base font-semibold text-ink">+91</span>
          <input
            id="contact"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="98765 43210"
          />
        </div>
      )}
      {error ? <p role="alert" className="text-sm font-medium text-accent-dark">{error}</p> : null}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Sending…" : "Send Code"}
      </button>
      <p className="text-xs text-dark/55">
        No password needed. New here? Your account is created when you enter the code.
      </p>
    </form>
  );
}

import { AcknowledgeButton } from "@/components/staff/acknowledge-button";

/** The staff monitoring notice. Shown before first use (and after each new version), and at /ops/policy. */
export function MonitoringNotice({ version, timeoutMinutes, retentionDays, acknowledged }: { version: string; timeoutMinutes: number; retentionDays: number; acknowledged: boolean }) {
  return (
    <article className="mx-auto max-w-3xl rounded-2xl border border-ink/10 bg-white p-5 text-sm leading-relaxed text-dark/80 sm:p-7">
      <h1 className="font-heading text-2xl font-bold text-ink">Staff monitoring notice</h1>
      <p className="mt-1 text-xs text-dark/55">Anuradha Enterprises (Mithai Wallah) · version {version}</p>
      <h2 className="mt-5 font-semibold text-ink">What is recorded</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>When you sign in and sign out of the business apps (Ops and Sales), how each session ended, and the device type, browser and network address of the sign-in.</li>
        <li>The role and permissions you held during each session.</li>
        <li>The business actions you complete — for example saving a batch, issuing material, dispatching an order, recording a payment — and actions that were refused.</li>
        <li>That you interacted with the app (a click, key press, scroll, touch, form entry or page change), counted per minute. The content of what you type is <strong>not</strong> recorded, and there is no screen recording, keystroke logging or location tracking. (Salespeople may choose to add a location to a visit; that is shown and optional.)</li>
      </ul>
      <h2 className="mt-4 font-semibold text-ink">Automatic sign-out</h2>
      <p>
        If no interaction is detected for {timeoutMinutes} minutes, you are signed out automatically. A warning appears 30 seconds before, with a Continue
        working button. Unfinished forms are saved as drafts before signing out and offered again when you return; a draft is never posted or approved on its own.
        If a draft could not be saved, you are told and it stays on your device.
      </p>
      <h2 className="mt-4 font-semibold text-ink">Why</h2>
      <p>
        To keep business, customer and financial records secure on shared and mobile devices; to know who made each change (food safety traceability, stock and
        accounts); and to understand how the apps are used. Time without interaction in the app is not treated as time without work — much of the work
        (production, deliveries, calls, stock checks) happens away from the screen.
      </p>
      <h2 className="mt-4 font-semibold text-ink">Who can see it, and for how long</h2>
      <p>
        Only people the owner gives the Staff activity &amp; audit permission. Detailed interaction records are kept for {retentionDays} days; session, role and
        business audit records are kept with the business records. You can see your own recent sessions at any time on this page.
      </p>
      <h2 className="mt-4 font-semibold text-ink">Questions or corrections</h2>
      <p>If you think a record about you is wrong, tell your manager or the owner; corrections are added as new records and the original stays.</p>
      <div className="mt-6">
        {acknowledged ? <p className="font-semibold text-emerald-700">✓ You have acknowledged this notice.</p> : <AcknowledgeButton version={version} />}
      </div>
    </article>
  );
}

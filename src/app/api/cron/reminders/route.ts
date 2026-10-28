import crypto from "crypto";
import { NextResponse } from "next/server";
import { orderAlertRecipients, sendEmail } from "@/lib/email";
import { reminderWhen, type Reminder } from "@/lib/ops/reminders";
import { siteConfig } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/tax-invoice";

// The daily reminder email: documents to renew (from 20 days before expiry, every day until renewed) and
// machines needing attention. Called once a day by the "Daily reminders" GitHub workflow with
// `Authorization: Bearer <CRON_SECRET>`. Sends at most one email a day, however often it is called.

function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(`Bearer ${secret}`);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SAFE_EMAIL = /^[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[a-z]{2,}$/i;

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 503 });

  const [{ data, error }, { data: setting }] = await Promise.all([
    admin.rpc("_reminders_all"),
    admin.from("business_settings").select("value").eq("key", "compliance.reminder_emails").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = ((data ?? []) as Reminder[]).filter((r) => r.kind !== "document_missing");
  if (!items.length) return NextResponse.json({ sent: false, reason: "nothing due" });

  const configured = Array.isArray(setting?.value) ? (setting.value as unknown[]).map(String) : [];
  const recipients = (configured.length ? configured : orderAlertRecipients.split(",")).map((s) => s.trim()).filter((s) => SAFE_EMAIL.test(s));
  if (!recipients.length) return NextResponse.json({ error: "No valid reminder email address" }, { status: 500 });

  const { data: claimed } = await admin.rpc("_reminder_claim_today", { p_recipients: recipients, p_items: items.length });
  if (claimed !== true) return NextResponse.json({ sent: false, reason: "already sent today" });

  const docs = items.filter((r) => r.module === "compliance");
  const machines = items.filter((r) => r.module === "equipment");
  const expired = docs.filter((r) => (r.days_left ?? 0) < 0).length;
  const subject = `${expired ? `⚠ ${expired} expired · ` : ""}${docs.length} document${docs.length === 1 ? "" : "s"} to renew${machines.length ? `, ${machines.length} machine item${machines.length === 1 ? "" : "s"}` : ""} — ${siteConfig.name}`;
  const link = (r: Reminder) => (r.module === "compliance" ? `${siteConfig.url}/ops/admin/documents?tab=due` : `${siteConfig.url}/ops/equipment/${r.id}`);
  const rows = (list: Reminder[]) =>
    list
      .map(
        (r) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee"><a href="${link(r)}" style="color:#16323f;font-weight:600">${escapeHtml(r.name)}</a>${r.detail ? `<br><span style="color:#6b7280;font-size:12px">${escapeHtml(r.detail)}</span>` : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:${(r.days_left ?? 0) < 0 ? "#b91c1c" : "#92400e"}">${escapeHtml(reminderWhen(r))}</td></tr>`,
      )
      .join("");
  const section = (title: string, list: Reminder[]) =>
    list.length ? `<h2 style="font-size:16px;color:#16323f;margin:20px 0 6px">${title}</h2><table style="border-collapse:collapse;width:100%;font-size:14px">${rows(list)}</table>` : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
<p style="font-size:15px">Daily reminder from the business app. It repeats every day until each renewal or repair is recorded.</p>
${section("Documents & licences to renew", docs)}
${section("Machinery & equipment", machines)}
<p style="margin-top:20px"><a href="${siteConfig.url}/ops/today" style="background:#16323f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the business app</a></p>
</div>`;
  const text = [
    "Daily reminder from the business app (repeats until each renewal or repair is recorded).",
    docs.length ? "\nDocuments & licences to renew:" : "",
    ...docs.map((r) => `- ${r.name}: ${reminderWhen(r)}`),
    machines.length ? "\nMachinery & equipment:" : "",
    ...machines.map((r) => `- ${r.name}: ${reminderWhen(r)}`),
    `\n${siteConfig.url}/ops/today`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendEmail({ to: recipients.join(", "), subject, html, text });
  if (!result.sent) {
    // Let the next run (or a manual re-run) try again today.
    await admin.rpc("_reminder_unclaim_today");
    return NextResponse.json({ sent: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ sent: true, items: items.length, recipients: recipients.length });
}

import nodemailer from "nodemailer";
import { siteConfig } from "@/lib/site";

/**
 * Sends email through the same SMTP account the site uses for sign-in codes (e.g. Resend).
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD in Vercel. Without them emails are
 * skipped (and logged) so checkout keeps working.
 */
function transport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export const mailFrom = process.env.MAIL_FROM ?? `${siteConfig.name} <${siteConfig.contact.email}>`;

/** Where "new order" alerts go. Comma-separate several addresses. */
export const orderAlertRecipients = process.env.ORDER_NOTIFY_EMAIL ?? siteConfig.contact.email;

export type Email = { to: string; subject: string; html: string; text: string; replyTo?: string };

export type SendResult = { sent: true } | { sent: false; error: string };

export async function sendEmail(email: Email): Promise<SendResult> {
  const smtp = transport();
  if (!smtp) {
    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].filter((name) => !process.env[name]);
    console.warn(`Email not sent (SMTP is not configured): ${email.subject}`);
    return { sent: false, error: `SMTP is not configured on the server (missing ${missing.join(", ")})` };
  }
  try {
    await smtp.sendMail({ from: mailFrom, ...email });
    return { sent: true };
  } catch (err) {
    console.error(`Sending email failed: ${email.subject}`, err);
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message.slice(0, 300) };
  }
}

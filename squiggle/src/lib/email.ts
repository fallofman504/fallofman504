import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | null = null;

export function emailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

/**
 * Sends a plain-text email through the SMTP account in the environment.
 * Until SMTP is set up, the message is written to the server log instead so the shop can still pass it along.
 * Never throws: a mail outage must not break the page that triggered it.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<void> {
  if (!emailConfigured()) {
    console.log(`[email not configured — would send]\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`);
    return;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  try {
    await transport.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, ...msg });
  } catch (e) {
    console.error(`[email] failed to send "${msg.subject}" to ${msg.to}:`, e);
  }
}

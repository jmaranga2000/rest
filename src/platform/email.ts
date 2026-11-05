import { createTransport, type Transporter } from "nodemailer";
import { env } from "./env";

type MailInput = { to: string; subject: string; text: string; html: string };

let transporter: Transporter | undefined;

export async function sendEmail(message: MailInput): Promise<void> {
  const config = env();
  if (!config.SMTP_HOST || !config.SMTP_PORT || !config.SMTP_FROM) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM.");
  }

  transporter ??= createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER && config.SMTP_PASSWORD
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
      : {}),
  });

  await transporter.sendMail({ from: config.SMTP_FROM, ...message });
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

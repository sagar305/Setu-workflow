import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
export function appUrl() {
  const url = new URL(process.env.APP_URL ?? 'http://127.0.0.1:3000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production APP_URL must use HTTPS.');
  return url.origin;
}
export async function sendLink(to: string, kind: 'invite' | 'reset', token: string, firm: string) {
  const link = `${appUrl()}/${kind}#token=${token}`;
  const text = kind === 'invite'
    ? `You have been invited to join ${firm} on Setu Workflow. Set your password: ${link}\nThis link expires in 48 hours and can be used once.`
    : `Reset your Setu Workflow password: ${link}\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`;
  const subject = kind === 'invite' ? 'Your Setu Workflow invitation' : 'Reset your Setu Workflow password';
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_MAIL === 'true') {
    const directory = path.join(process.cwd(), '.local', 'mail');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${Date.now()}-${randomUUID()}.txt`), `To: ${to}\nSubject: ${subject}\n\n${text}`, { mode: 0o600 });
    return;
  }
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM) throw new Error('Email delivery is not configured.');
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: true, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
}

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  // Log Resend's error name/message only; never the request, which carries the link token.
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { name?: string; message?: string };
    console.error(`Resend delivery failed (${response.status}): ${detail.name ?? 'unknown'} ${detail.message ?? ''}`.trim());
    throw new Error('Email delivery failed.');
  }
}

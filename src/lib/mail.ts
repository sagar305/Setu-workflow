import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderEmail } from './email-template';
import { isDemo } from './demo';
export function appUrl() {
  const url = new URL(process.env.APP_URL ?? 'http://127.0.0.1:3000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production APP_URL must use HTTPS.');
  return url.origin;
}
export type LinkKind = 'invite' | 'reset';

/**
 * Invitation (a colleague, or the firm's own administrator activating a new
 * trial when `signup` is set) and password-reset emails. The token rides after
 * # so it never reaches a server log.
 */
export async function sendLink(to: string, kind: LinkKind, token: string, firm: string, options: { signup?: boolean } = {}) {
  const link = `${appUrl()}/${kind}#token=${token}`;
  const email =
    kind === 'reset'
      ? renderEmail({
          preheader: 'Use this link within 30 minutes to choose a new password.',
          heading: 'Reset your password',
          paragraphs: [
            `We received a request to reset the password for your **${firm}** account on Setu Workflow.`,
            'Choose a new password with the button below. Signing in with it signs you out everywhere else.',
          ],
          button: { label: 'Choose a new password', url: link },
          note: "This link works once and expires in 30 minutes. If you didn't ask for a reset, you can ignore this email — your password won't change.",
        })
      : options.signup
        ? renderEmail({
            preheader: 'Activate your account to start your 15-day free trial.',
            heading: 'Activate your Setu Workflow trial',
            paragraphs: [
              `Thanks for signing up **${firm}** for Setu Workflow — practice management for your whole firm: clients, engagements, workflow stages, checklists, review points, time and capacity in one place.`,
              'Set your password to activate your account. Your **15-day free trial** starts the moment you do — no card needed.',
            ],
            button: { label: 'Activate my account', url: link },
            steps: {
              title: 'Your first ten minutes',
              items: ['Set up your office in Admin → Offices.', 'Invite your partners and team from Admin → Users.', 'Add a client, then create your first engagement.'],
            },
            note: "This link works once and expires in 48 hours. Didn't sign up? Ignore this email and no account will be activated.",
          })
        : renderEmail({
            preheader: `You've been invited to join ${firm} on Setu Workflow.`,
            heading: `Join ${firm} on Setu Workflow`,
            paragraphs: [
              `You've been invited to join **${firm}** on Setu Workflow, where your firm tracks its clients, engagements, review points and time in one place.`,
              'Choose your password to accept the invitation and sign in.',
            ],
            button: { label: 'Accept invitation', url: link },
            note: "This invitation works once and expires in 48 hours. If you weren't expecting it, you can ignore this email.",
          });
  const subject =
    kind === 'reset' ? 'Reset your Setu Workflow password'
    : options.signup ? 'Activate your Setu Workflow trial'
    : `You're invited to join ${firm} on Setu Workflow`;
  await sendEmail(to, subject, email);
}

/** Email through Resend (HTML with a plain-text part), or written to .local/mail in development. */
export async function sendEmail(to: string, subject: string, body: string | { html: string; text: string }) {
  const { html, text } = typeof body === 'string' ? { html: undefined, text: body } : body;
  // The public demo never emails anyone; its addresses are fictional anyway.
  if (isDemo()) return;
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_MAIL === 'true') {
    const directory = path.join(process.cwd(), '.local', 'mail');
    await mkdir(directory, { recursive: true });
    const name = `${Date.now()}-${randomUUID()}`;
    await writeFile(path.join(directory, `${name}.txt`), `To: ${to}\nSubject: ${subject}\n\n${text}`, { mode: 0o600 });
    // Open the .html file in a browser to see the email as recipients will.
    if (html) await writeFile(path.join(directory, `${name}.html`), html, { mode: 0o600 });
    return;
  }
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, ...(html ? { html } : {}) }),
    signal: AbortSignal.timeout(10_000),
  });
  // Log Resend's error name/message only; never the request, which carries the link token.
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { name?: string; message?: string };
    console.error(`Resend delivery failed (${response.status}): ${detail.name ?? 'unknown'} ${detail.message ?? ''}`.trim());
    throw new Error('Email delivery failed.');
  }
}

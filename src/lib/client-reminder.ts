import { z } from 'zod';

// A draft handoff, never a delivery claim. Every URI component is encoded.
export function clientReminderLink(email: string | undefined, clientName: string, firstName?: string) {
  const parsed = z.string().trim().email().safeParse(email);
  if (!parsed.success) return null;
  const singleLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
  const subject = `Input reminder — ${singleLine(clientName)}`;
  const body = `Hello${firstName ? ' '+singleLine(firstName) : ''},\n\nCould you please share the outstanding information and documents needed for ${singleLine(clientName)}?\n\nRequired inputs:\n[Add the information or documents needed]\n\nRequested by: [Add the due date]\n\nIf you have already sent these, please let us know. If you need more time, please reply with the expected date.\n\nThank you.`;
  return `mailto:${encodeURIComponent(parsed.data)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

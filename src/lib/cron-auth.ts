import { createHash, timingSafeEqual } from 'node:crypto';
// Scheduled jobs send `Authorization: Bearer $CRON_SECRET` (Vercel Cron does this itself).
export function cronAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

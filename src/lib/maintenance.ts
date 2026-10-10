import { db } from './db';
// Tenant-agnostic housekeeping for the scheduled cleanup job. Never expose to tenant routes.
export async function purgeExpired(now = new Date()) {
  const [sessions, rateLimits] = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { sessions: sessions.count, rateLimits: rateLimits.count };
}

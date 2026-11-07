import { db } from "./db";
import { demoPassword, isDemo, nextDemoReset } from "./demo";
import { seedDemoData } from "../../prisma/seed-demo";

/** A reset that has not finished after this long is taken to have crashed. */
const STALE_LOCK_MINUTES = 15;

/**
 * Deletes every row in every table (except migration history and the demo
 * marker), then seeds fresh demo data.
 *
 * Refuses before touching anything unless DEMO_MODE=true AND the database is
 * either already marked as a demo or completely empty — so a production
 * database can never be wiped by a misplaced environment variable.
 */
export async function resetDemo(now = new Date()) {
  if (!isDemo()) throw new Error("Refusing to reset: DEMO_MODE is not enabled.");
  const password = demoPassword();
  const marker = await db.demoInstance.findUnique({ where: { id: 1 } });
  if (!marker) {
    const [firms, staff] = await Promise.all([db.firm.count(), db.platformAdmin.count()]);
    if (firms || staff)
      throw new Error("Refusing to reset: this database has data but was never marked as a demo database.");
    await db.demoInstance.create({ data: { id: 1 } });
  }
  // Take the lock in one statement, so two overlapping calls cannot both win.
  const locked = await db.$executeRaw`
    UPDATE demo_instance SET resetting_since = NOW()
    WHERE id = 1 AND (resetting_since IS NULL OR resetting_since < NOW() - ${STALE_LOCK_MINUTES} * INTERVAL '1 minute')`;
  if (!locked) return { reset: false, reason: "A reset is already running." };
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = current_schema() AND tablename NOT IN ('_prisma_migrations', 'demo_instance')`;
    if (tables.length) {
      const list = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
      await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
    await seedDemoData(password);
    await db.demoInstance.update({ where: { id: 1 }, data: { lastResetAt: now } });
    return { reset: true, tables: tables.length, at: now.toISOString(), next: nextDemoReset(now).toISOString() };
  } finally {
    await db.demoInstance.update({ where: { id: 1 }, data: { resettingSince: null } });
  }
}

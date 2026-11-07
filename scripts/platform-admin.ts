/**
 * Bootstrap and recover Setu owner-console staff ("super admins"). Day to day,
 * invite and reset people from the console's Team page instead.
 *
 *   tsx scripts/platform-admin.ts create <email> "<name>"   # prints a one-time set-password link
 *   tsx scripts/platform-admin.ts reset  <email>            # new link; authenticator is linked again
 *   tsx scripts/platform-admin.ts list
 *
 * Needs PLATFORM_ROUTE_SECRET and APP_URL. The console lives at
 * /console/<PLATFORM_ROUTE_SECRET>.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { inviteStaff, listTeam, resetStaff } from "../src/lib/platform-auth";

async function main() {
  const [command, email, name = ""] = process.argv.slice(2);
  if (command === "list") {
    for (const a of await listTeam()) console.log(`${a.status.padEnd(20)} ${a.email} (${a.name}) last sign-in ${a.lastLoginAt ?? "never"}`);
    return;
  }
  if (command === "create" && email) {
    const { link } = await inviteStaff(null, { email, name: name || email }, { email: false });
    console.log(`Open this link to set the password (works once, 48 hours):\n${link}`);
    return;
  }
  if (command === "reset" && email) {
    const admin = await db.platformAdmin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new Error("No such console user.");
    const { link } = await resetStaff(null, admin.id, { email: false });
    console.log(`New set-password link (works once, 48 hours):\n${link}`);
    return;
  }
  console.error('Usage: tsx scripts/platform-admin.ts create <email> "<name>" | reset <email> | list');
  process.exitCode = 2;
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

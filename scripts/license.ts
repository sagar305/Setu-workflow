/**
 * Issue, look up or cancel a Setu Workflow license key. Operator / sales only:
 * never expose this through a tenant route or form.
 *
 *   tsx scripts/license.ts issue  <order id> monthly|yearly|<days> [seats]
 *   tsx scripts/license.ts check  SETUWF-XXXXXX-...
 *   tsx scripts/license.ts revoke SETUWF-XXXXXX-... --yes
 *
 * `issue` is how sales sells a plan for more than the standard 10 users: agree
 * the seats and price, take payment, then issue a key with that seat count
 * (e.g. `issue SALES-2026-014 yearly 8`). The order id must be unique per sale;
 * the same id always yields the same key.
 *
 * `check` says whether a key is valid, what it carries and whether it has been
 * redeemed. `revoke` cancels an unredeemed key, for refunds.
 *
 * Reads WORKFLOW_LICENSE_SECRET (and DATABASE_URL for check/revoke), so run it
 * with the production secret to make production keys.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { issueLicenseKey, readLicenseKey } from "../src/lib/license-key";
import { BILLING_DAYS, INCLUDED_USERS } from "../src/lib/plans";
import { licenseSecret } from "../src/lib/subscription";

async function main(): Promise<number> {
  const [command, arg, ...rest] = process.argv.slice(2);
  const secret = licenseSecret();
  if (!secret) {
    console.error("WORKFLOW_LICENSE_SECRET is not set.");
    return 1;
  }

  if (command === "issue" && arg && rest[0]) {
    const period = rest[0];
    const days =
      period === "monthly" || period === "yearly" ? BILLING_DAYS[period] : Number(period);
    const seats = rest[1] ? Number(rest[1]) : INCLUDED_USERS;
    console.log(issueLicenseKey(arg, days, seats, secret));
    console.error(`${days} days, ${seats} users.`);
    return 0;
  }

  if ((command !== "check" && command !== "revoke") || !arg) {
    console.error(
      "Usage: tsx scripts/license.ts issue <order id> monthly|yearly|<days> [seats]\n" +
        "       tsx scripts/license.ts check <key>\n" +
        "       tsx scripts/license.ts revoke <key> --yes",
    );
    return 2;
  }

  const license = readLicenseKey(arg, secret);
  if (!license) {
    console.error("Not a valid Setu Workflow key for this WORKFLOW_LICENSE_SECRET.");
    return 1;
  }
  console.log(`Valid key: ${license.days} days, ${license.seats} users (key id ${license.keyId}).`);

  const existing = await db.licenseRedemption.findUnique({ where: { keyId: license.keyId } });
  if (existing?.revoked) {
    console.log(`Already cancelled on ${existing.createdAt.toISOString()}.`);
    return 0;
  }
  if (existing) {
    const firm = existing.firmId
      ? await db.firm.findUnique({ where: { id: existing.firmId } })
      : null;
    console.log(
      `REDEEMED on ${existing.createdAt.toISOString()} by ${firm?.displayName ?? existing.firmId}` +
        (existing.newExpiresAt ? `; subscription runs to ${existing.newExpiresAt.toISOString()}` : "") +
        ".",
    );
    return command === "revoke" ? 1 : 0;
  }
  console.log("Not redeemed yet.");
  if (command === "check") return 0;
  if (!rest.includes("--yes")) {
    console.error("Refusing to cancel without --yes. This blocks the key for good.");
    return 1;
  }
  await db.licenseRedemption.create({
    data: { keyId: license.keyId, days: license.days, seats: license.seats, revoked: true },
  });
  console.log("Cancelled. The key can no longer be redeemed.");
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("[license] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

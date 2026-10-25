import "dotenv/config";
import { z } from "zod";
import { db } from "../src/lib/db";
import { lockFirm, audit } from "../src/lib/auth";
// Operator-only CLI; never expose this through a tenant route or form.
async function main() {
  const [firmId, action, value] = process.argv.slice(2);
  z.string().uuid().parse(firmId);
  if (!["extend", "ongoing"].includes(action))
    throw new Error(
      "Usage: tsx scripts/manage-trial.ts <firm UUID> extend <days 1–90> | ongoing",
    );
  const days =
    action === "extend"
      ? z.coerce.number().int().min(1).max(90).parse(value)
      : 0;
  await db.$transaction(async (tx) => {
    await lockFirm(tx, firmId);
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId } });
    if (!firm.isTrial || !firm.trialStartedAt || !firm.trialEndsAt)
      throw new Error("Select an activated trial firm.");
    const data =
      action === "ongoing"
        ? { isTrial: false }
        : {
            trialEndsAt: new Date(
              Math.max(Date.now(), firm.trialEndsAt.getTime()) +
                days * 86400000,
            ),
          };
    await tx.firm.update({ where: { id: firmId }, data });
    await audit(
      tx,
      firmId,
      null,
      action === "ongoing" ? "firm.trial_converted" : "firm.trial_extended",
      "Firm",
      firmId,
      {
        source: "operator-cli",
        previousEnd: firm.trialEndsAt.toISOString(),
        days,
      },
    );
  });
  console.log("Firm access updated.");
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Trial update failed.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

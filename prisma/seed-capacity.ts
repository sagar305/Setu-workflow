import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveEngagement } from "../src/lib/engagements";
import { createAllocations } from "../src/lib/allocations";
import { saveCapacityAdjustment } from "../src/lib/capacity";
import { firmDates } from "../src/lib/engagement-constants";
import { shiftDate } from "../src/lib/capacity-math";
export async function seedDemoCapacity() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is disabled in production.");
  const admin = await db.user.findUnique({
    where: { email: "admin@demo.setu.test" },
    include: { firm: true },
  });
  if (
    !admin ||
    (await db.engagement.findFirst({
      where: { firmId: admin.firmId, engagementCode: "CAPACITY-DEMO" },
    }))
  )
    return;
  const users = await db.user.findMany({
    where: {
      firmId: admin.firmId,
      email: {
        in: [
          "partner@demo.setu.test",
          "manager@demo.setu.test",
          "senior@demo.setu.test",
          "associate@demo.setu.test",
        ],
      },
    },
  });
  const get = (alias: string) =>
    users.find((u) => u.email === `${alias}@demo.setu.test`)!;
  const sample = await db.engagement.findFirst({
    where: { firmId: admin.firmId },
  });
  if (users.length !== 4 || !sample) return;
  const token = newToken(),
    session = await db.session.create({
      data: {
        firmId: admin.firmId,
        userId: admin.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  try {
    const dates = firmDates(admin.firm.timezone);
    const e = await saveEngagement(token, {
      engagementCode: "CAPACITY-DEMO",
      engagementName: "October capacity planning demo",
      clientId: sample.clientId,
      serviceLineId: sample.serviceLineId,
      engagementTypeId: sample.engagementTypeId,
      officeId: sample.officeId,
      partnerId: get("partner").id,
      managerId: get("manager").id,
      reviewerId: get("senior").id,
      preparerId: get("associate").id,
      budgetHours: 200,
      dueDate: shiftDate(dates.weekStart, 4),
    });
    await saveCapacityAdjustment(token, {
      userId: get("associate").id,
      startDate: dates.weekStart,
      endDate: dates.weekStart,
      hoursReduction: 8,
      adjustmentType: "Leave",
      reason: "Build 9 demo — one day of annual leave",
    });
    await createAllocations(token, {
      acknowledgeBudget: true,
      rows: [
        ...[9, 9, 9, 8, 8].map((h, i) => ({
          assignedUserId: get("senior").id,
          allocationDate: shiftDate(dates.weekStart, i),
          allocatedHours: h,
        })),
        ...[8, 7, 7, 7, 7].map((h, i) => ({
          assignedUserId: get("manager").id,
          allocationDate: shiftDate(dates.weekStart, i),
          allocatedHours: h,
        })),
        ...[6, 6, 6].map((h, i) => ({
          assignedUserId: get("partner").id,
          allocationDate: shiftDate(dates.weekStart, i),
          allocatedHours: h,
        })),
      ].map((r) => ({
        ...r,
        engagementId: e.id,
        description: "Capacity planning example",
        allocationNote: "Build 9 demo",
      })),
    });
    console.log(
      "Build 9 demo: overloaded, near-capacity and available employees, with one adjustment.",
    );
  } finally {
    await db.session.delete({ where: { id: session.id } });
  }
}

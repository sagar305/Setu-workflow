import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient } from "../src/lib/clients";
import { saveEngagement } from "../src/lib/engagements";
import { saveTemplate, templateAction } from "../src/lib/workflow-templates";
import { applyWorkflow, getWorkflow } from "../src/lib/workflows";
import { getChecklist } from "../src/lib/checklists";
import { createAllocations, changeAllocation } from "../src/lib/allocations";
import { createTime, changeTime } from "../src/lib/time";
import {
  teamCapacity,
  saveCapacityAdjustment,
  cancelCapacityAdjustment,
} from "../src/lib/capacity";
import {
  capacityPeriod,
  dailyCapacity,
  capacityMetrics,
} from "../src/lib/capacity-math";
import { editUser } from "../src/lib/admin";
async function mint(userId: string, firmId: string) {
  const token = newToken();
  await db.session.create({
    data: {
      userId,
      firmId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return token;
}
async function fixture() {
  const s = randomUUID(),
    f = await provisionFirm({
      firmName: `Time ${s}`,
      adminEmail: `${s}@test.invalid`,
      adminPassword: `Test-${s}`,
      timezone: "America/Chicago",
    }),
    token = await mint(f.admin.id, f.firm.id);
  const office = await db.office.create({
    data: {
      firmId: f.firm.id,
      officeName: "Main",
      city: "Dallas",
      state: "TX",
      country: "US",
    },
  });
  const service = await db.serviceLine.findFirstOrThrow({
      where: { firmId: f.firm.id },
    }),
    type = await db.engagementType.findFirstOrThrow({
      where: { firmId: f.firm.id },
    }),
    entity = await db.entityType.findFirstOrThrow({
      where: { firmId: f.firm.id },
    });
  const client = await saveClient(token, {
    clientCode: "POINTS",
    legalName: "Time client",
    entityTypeId: entity.id,
    primaryOfficeId: office.id,
    status: "Active",
    serviceLineIds: [service.id],
    primaryContact: {
      firstName: "Test",
      lastName: "Contact",
      email: "test@example.test",
      phone: "5551234567",
    },
  });
  const users = [];
  for (const alias of ["preparer", "other"]) {
    const u = await db.user.create({
      data: {
        firmId: f.firm.id,
        roleId: f.roles[4].id,
        firstName: alias,
        lastName: "Test",
        email: `${alias}-${s}@test.invalid`,
        status: "Active",
      },
    });
    users.push({ ...u, token: await mint(u.id, f.firm.id) });
  }
  return {
    ...f,
    token,
    office,
    service,
    type,
    client,
    preparer: users[0],
    other: users[1],
  };
}
let a: Awaited<ReturnType<typeof fixture>>,
  b: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  a = await fixture();
  b = await fixture();
});
afterAll(() => db.$disconnect());
async function running(f = a) {
  const t = await saveTemplate(f.token, {
    name: `Time ${randomUUID()}`,
    serviceLineId: f.service.id,
    engagementTypeId: f.type.id,
    stages: [
      {
        name: "Preparation",
        isStart: true,
        defaultOwnerType: "Preparer",
        checklistItems: [
          {
            itemTitle: "Reconciliation",
            defaultOwnerType: "Preparer",
            isRequired: false,
          },
        ],
      },
      { name: "Review", defaultOwnerType: "Preparer" },
      { name: "Final", isCompletion: true },
    ],
  });
  await templateAction(f.token, t.id, { action: "publish", revision: 1 });
  const e = await saveEngagement(f.token, {
    engagementCode: randomUUID(),
    engagementName: "Time engagement",
    clientId: f.client.id,
    serviceLineId: f.service.id,
    engagementTypeId: f.type.id,
    officeId: f.office.id,
    partnerId: f.admin.id,
    preparerId: f.preparer.id,
    budgetHours: 20,
  });
  await applyWorkflow(f.token, e.id, { templateId: t.id });
  return {
    e,
    c: await getChecklist(f.token, e.id),
    w: (await getWorkflow(f.token, e.id))!,
  };
}
const week = "2026-10-12";
const reduction = (userId: string, extra: Record<string, unknown> = {}) => ({
  userId,
  startDate: week,
  endDate: week,
  hoursReduction: 8,
  adjustmentType: "Leave",
  reason: "Annual leave",
  ...extra,
});
async function planned(
  engagementId: string,
  userId: string,
  hours: number,
  date = week,
  extra: Record<string, unknown> = {},
) {
  return createAllocations(a.token, {
    acknowledgeBudget: true,
    rows: [
      {
        engagementId,
        assignedUserId: userId,
        allocationDate: date,
        allocatedHours: hours,
        ...extra,
      },
    ],
  });
}
test("weekly defaults, daily rounding, zero capacity and load thresholds", () => {
  const d = (v: number) => new Prisma.Decimal(v);
  const daily = dailyCapacity(35.03, "2026-10-12", 7, []);
  expect(daily.map((r) => r.capacity.toFixed(2))).toEqual([
    "7.01",
    "7.01",
    "7.01",
    "7.00",
    "7.00",
    "0.00",
    "0.00",
  ]);
  expect(capacityMetrics(d(40), d(32))).toMatchObject({
    available: "8.00",
    load: "80.0",
    status: "Near Capacity",
  });
  expect(capacityMetrics(d(40), d(43))).toMatchObject({
    available: "-3.00",
    load: "107.5",
    status: "Overloaded",
  });
  expect(capacityMetrics(d(40), d(18)).status).toBe("Available");
  expect(capacityMetrics(d(0), d(1))).toMatchObject({
    load: null,
    status: "Overloaded",
  });
  expect(capacityMetrics(d(0), d(0)).status).toBe("No capacity");
});
test("business-week boundaries cover Sunday, year change, timezone and four weeks", () => {
  expect(
    capacityPeriod(
      "America/Chicago",
      undefined,
      1,
      new Date("2026-10-05T01:00:00Z"),
    ),
  ).toMatchObject({
    today: "2026-10-04",
    start: "2026-09-28",
    end: "2026-10-04",
    next: "2026-10-05",
  });
  expect(capacityPeriod("Asia/Kolkata", "2027-01-01", 4)).toMatchObject({
    start: "2026-12-28",
    end: "2027-01-24",
    previous: "2026-12-21",
  });
});
test("adjustments create/edit/cancel with audit, overlap floors and revision protection", async () => {
  const user = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: a.roles[4].id,
      firstName: "Adjustment",
      lastName: "Test",
      email: `${randomUUID()}@test.invalid`,
      status: "Active",
    },
  });
  const adj = await saveCapacityAdjustment(
    a.token,
    reduction(user.id, { startDate: "2026-10-09", endDate: week }),
  );
  let result = await teamCapacity(a.token, { week, employee: user.id });
  expect(result.selected).toMatchObject({
    capacity: "32.00",
    planned: "0.00",
    available: "32.00",
  });
  expect(result.selected!.daily[0].capacity).toBe("0.00");
  await saveCapacityAdjustment(
    a.token,
    reduction(user.id, { hoursReduction: 2, revision: 1 }),
    adj.id,
  );
  await expect(
    saveCapacityAdjustment(
      a.token,
      reduction(user.id, { revision: 1 }),
      adj.id,
    ),
  ).rejects.toThrow(/changed/);
  const overlap = await saveCapacityAdjustment(
    a.token,
    reduction(user.id, { hoursReduction: 10 }),
  );
  expect(
    (await teamCapacity(a.token, { week, employee: user.id })).selected!
      .capacity,
  ).toBe("32.00");
  await cancelCapacityAdjustment(a.token, overlap.id, {
    revision: 1,
    reason: "Leave withdrawn",
  });
  result = await teamCapacity(a.token, { week, employee: user.id });
  expect(result.selected!.capacity).toBe("38.00");
  await cancelCapacityAdjustment(a.token, adj.id, {
    revision: 2,
    reason: "Back at work",
  });
  expect(
    (await teamCapacity(a.token, { week, employee: user.id })).selected!
      .capacity,
  ).toBe("40.00");
  await expect(
    cancelCapacityAdjustment(a.token, adj.id, { revision: 3, reason: "Again" }),
  ).rejects.toThrow(/changed/);
  const logs = await db.auditLog.findMany({
    where: { entityId: adj.id },
    orderBy: { timestamp: "asc" },
  });
  expect(logs.map((l) => l.action)).toEqual([
    "capacity.adjustment_created",
    "capacity.adjustment_edited",
    "capacity.adjustment_cancelled",
  ]);
  expect(logs.every((l) => l.actorUserId === a.admin.id && l.timestamp)).toBe(
    true,
  );
});
test("invalid reductions, dates and cross-tenant relationships are rejected", async () => {
  for (const extra of [
    { hoursReduction: -1 },
    { hoursReduction: 25 },
    { hoursReduction: 0.001 },
    { endDate: "2026-02-30" },
    { endDate: "2026-10-01" },
    { endDate: "2028-01-01" },
    { startDate: "2026-10-10", endDate: "2026-10-11" },
  ])
    await expect(
      saveCapacityAdjustment(a.token, reduction(a.preparer.id, extra)),
    ).rejects.toThrow();
  await expect(
    saveCapacityAdjustment(a.token, reduction(b.preparer.id)),
  ).rejects.toThrow(/scope/);
  await expect(
    teamCapacity(a.token, { employee: b.preparer.id }),
  ).rejects.toThrow(/scope/);
  const foreign = await saveCapacityAdjustment(
    b.token,
    reduction(b.preparer.id),
  );
  await expect(
    cancelCapacityAdjustment(a.token, foreign.id, {
      revision: 1,
      reason: "No",
    }),
  ).rejects.toThrow(/not found/);
  const { e } = await running();
  await expect(planned(e.id, b.preparer.id, 2)).rejects.toThrow();
  await expect(teamCapacity(a.preparer.token, { week })).rejects.toThrow(
    /access/,
  );
  await expect(
    saveCapacityAdjustment(a.preparer.token, reduction(a.preparer.id)),
  ).rejects.toThrow(/access/);
});
test("planned aggregation, adjusted warnings, actual context and daily totals stay independent", async () => {
  const { e } = await running();
  // Dedicated employee avoids coupling weekly totals to other test cases.
  const u = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: a.roles[1].id,
      firstName: "Aggregation",
      lastName: "Test",
      email: `${randomUUID()}@test.invalid`,
      status: "Active",
    },
  });
  const token = await mint(u.id, a.firm.id);
  await saveCapacityAdjustment(a.token, reduction(u.id));
  const allocation = await planned(e.id, u.id, 34);
  expect(
    allocation.warnings.find((w) => w.kind === "capacity")?.message,
  ).toMatch(/34.00h against 32.00h.*106.3%/);
  const cancelled = await planned(e.id, u.id, 20, "2026-10-13");
  await changeAllocation(a.token, cancelled.items[0].id, {
    action: "cancel",
    revision: 1,
    reason: "Not needed",
  });
  await planned(e.id, u.id, 3, "2026-10-19");
  const time = await createTime(token, {
    engagementId: e.id,
    requestId: randomUUID(),
    workDate: week,
    hours: "2.25",
    description: "Actual work",
  });
  await changeTime(token, time.id, { action: "submit", revision: 1 });
  await createTime(token, {
    engagementId: e.id,
    requestId: randomUUID(),
    workDate: week,
    hours: "1",
    description: "Draft context",
  });
  const result = await teamCapacity(
    a.token,
    { week, employee: u.id },
    new Date("2026-10-14T12:00:00Z"),
  );
  expect(result.selected).toMatchObject({
    capacity: "32.00",
    planned: "34.00",
    employeeStatus: "Active",
    available: "-2.00",
    load: "106.3",
    actual: "2.25",
    status: "Overloaded",
  });
  expect(result.assignments).toHaveLength(1);
  expect(result.selected!.daily[0]).toMatchObject({
    capacity: "0.00",
    planned: "34.00",
    available: "-34.00",
  });
  expect(
    (
      await teamCapacity(
        a.token,
        { week: "2026-10-19", employee: u.id },
        new Date("2026-10-14T12:00:00Z"),
      )
    ).selected!.actual,
  ).toBeNull();
  expect(
    (await teamCapacity(a.token, { week, weeks: 2, employee: u.id })).selected,
  ).toMatchObject({ capacity: "72.00", planned: "37.00", available: "35.00" });
  const before = await db.engagement.findUniqueOrThrow({ where: { id: e.id } });
  await changeAllocation(a.token, allocation.items[0].id, {
    action: "reassign",
    revision: 1,
    assignedUserId: a.admin.id,
    reason: "Balance workload",
  });
  expect(
    (await teamCapacity(a.token, { week, employee: u.id })).selected!.planned,
  ).toBe("0.00");
  expect(
    await db.engagement.findUniqueOrThrow({ where: { id: e.id } }),
  ).toEqual(before);
  expect(
    (
      await db.timeEntry.findUniqueOrThrow({ where: { id: time.id } })
    ).hours.toFixed(2),
  ).toBe("2.25");
});
test("unscheduled stage/checklist responsibilities have no invented hours", async () => {
  const { e, w } = await running();
  const before = await teamCapacity(a.token, { week, employee: a.preparer.id });
  expect(
    before.selected!.unscheduled.filter((r) => r.engagementId === e.id),
  ).toHaveLength(2);
  const allocations = await planned(e.id, a.preparer.id, 1, week, {
    engagementWorkflowStageId: w.currentStageId,
  });
  expect(
    (
      await teamCapacity(a.token, { week, employee: a.preparer.id })
    ).selected!.unscheduled.filter((r) => r.engagementId === e.id),
  ).toHaveLength(0);
  await changeAllocation(a.token, allocations.items[0].id, {
    action: "status",
    revision: 1,
    status: "Completed",
  });
  expect(
    (
      await teamCapacity(a.token, { week, employee: a.preparer.id })
    ).selected!.unscheduled.filter((r) => r.engagementId === e.id),
  ).toHaveLength(2);
});
test("inactive employees retain planned workload but contribute no capacity", async () => {
  const { e } = await running();
  const u = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: a.roles[1].id,
      firstName: "Inactive",
      lastName: "Test",
      email: `${randomUUID()}@test.invalid`,
      status: "Active",
    },
  });
  await planned(e.id, u.id, 2);
  await db.user.update({ where: { id: u.id }, data: { status: "Inactive" } });
  expect(
    (await teamCapacity(a.token, { week })).rows.some((r) => r.id === u.id),
  ).toBe(false);
  expect(
    (await teamCapacity(a.token, { week, inactive: "true", employee: u.id }))
      .selected,
  ).toMatchObject({
    capacity: "0.00",
    planned: "2.00",
    employeeStatus: "Inactive",
    available: "-2.00",
    status: "Overloaded",
  });
  await expect(
    saveCapacityAdjustment(a.token, reduction(u.id)),
  ).rejects.toThrow(/scope/);
});
test("custom team permission scopes totals but protects engagement details and actual hours", async () => {
  const { e } = await running();
  const role = await db.role.create({
    data: { firmId: a.firm.id, roleName: `Capacity ${randomUUID()}` },
  });
  await db.rolePermission.createMany({
    data: ["capacity.view_team", "engagements.view"].map((permissionKey) => ({
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey,
    })),
  });
  const manager = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: role.id,
      firstName: "Scoped",
      lastName: "Manager",
      email: `${randomUUID()}@test.invalid`,
      status: "Active",
    },
  });
  const report = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: a.roles[1].id,
      managerId: manager.id,
      firstName: "Scoped",
      lastName: "Report",
      email: `${randomUUID()}@test.invalid`,
      status: "Active",
    },
  });
  await planned(e.id, report.id, 6);
  const token = await mint(manager.id, a.firm.id);
  const result = await teamCapacity(token, { week, employee: report.id });
  expect(result.selected).toMatchObject({
    planned: "6.00",
    available: "34.00",
    actual: null,
  });
  expect(result.restrictedPlanned).toBe("6.00");
  expect(result.assignments).toHaveLength(0);
  expect(result.rows.every((u) => [manager.id, report.id].includes(u.id))).toBe(
    true,
  );
  await expect(
    teamCapacity(token, { week, employee: a.other.id }),
  ).rejects.toThrow(/scope/);
  await expect(
    saveCapacityAdjustment(token, reduction(report.id)),
  ).rejects.toThrow(/access/);
  await db.rolePermission.create({
    data: {
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey: "capacity.adjust",
    },
  });
  await saveCapacityAdjustment(token, reduction(report.id));
  await expect(
    saveCapacityAdjustment(token, reduction(a.other.id)),
  ).rejects.toThrow(/scope/);
});
test("existing default-capacity edits are audited and do not rewrite work", async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { id: a.admin.id } });
  const fields = {
    firstName: admin.firstName,
    lastName: admin.lastName,
    roleId: admin.roleId,
    primaryOfficeId: admin.primaryOfficeId,
    managerId: admin.managerId,
    jobTitle: admin.jobTitle,
    status: "Active",
    weeklyCapacityHours: 35,
  };
  await expect(
    editUser(a.token, admin.id, { ...fields, weeklyCapacityHours: -1 }),
  ).rejects.toThrow();
  await expect(
    editUser(a.token, admin.id, { ...fields, weeklyCapacityHours: 169 }),
  ).rejects.toThrow();
  const allocations = await db.workAllocation.findMany({
    where: { firmId: a.firm.id, assignedUserId: admin.id },
  });
  await editUser(a.token, admin.id, fields);
  expect(
    (await teamCapacity(a.token, { week, employee: admin.id })).selected!
      .capacity,
  ).toBe("35.00");
  expect(
    await db.workAllocation.findMany({
      where: { firmId: a.firm.id, assignedUserId: admin.id },
    }),
  ).toEqual(allocations);
  const log = await db.auditLog.findFirstOrThrow({
    where: { entityId: admin.id, action: "user.updated" },
    orderBy: { timestamp: "desc" },
  });
  expect(log.metadata).toMatchObject({
    before: { weeklyCapacityHours: 40 },
    after: { weeklyCapacityHours: 35 },
  });
});

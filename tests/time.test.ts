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
import { createAllocations } from "../src/lib/allocations";
import {
  createTime,
  changeTime,
  myTime,
  timeOptions,
  engagementHours,
  engagementTime,
} from "../src/lib/time";
import { timeFields, hourMetrics } from "../src/lib/time-validation";
import { firmDates } from "../src/lib/engagement-constants";
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
const payload = (
  engagementId: string,
  extra: Record<string, unknown> = {},
) => ({
  engagementId,
  requestId: randomUUID(),
  workDate: firmDates("America/Chicago").today,
  hours: "0.25",
  description: "Reconciled bank movements",
  ...extra,
});
test("decimal hours and business dates reject invalid inputs", () => {
  for (const hours of ["0", "-1", "24.01", "0.001", "NaN", "1e1", ""])
    expect(timeFields.safeParse(payload(randomUUID(), { hours })).success).toBe(
      false,
    );
  for (const workDate of ["2026-02-30", "2026-13-01", "2026-01-01T00:00:00Z"])
    expect(
      timeFields.safeParse(payload(randomUUID(), { workDate })).success,
    ).toBe(false);
  expect(
    timeFields.parse(
      payload(randomUUID(), { hours: "2.25", workDate: "2026-10-05" }),
    ).hours,
  ).toBe("2.25");
});
test("deterministic budget warnings and zero/null budgets", () => {
  const d = (v: number) => new Prisma.Decimal(v);
  expect(hourMetrics(40, d(36), d(29.5))).toMatchObject({
    remaining: "10.50",
    used: "73.8",
    warnings: [],
  });
  expect(hourMetrics(10, d(20), d(8)).warnings).toEqual([
    "80% of budget consumed",
  ]);
  expect(hourMetrics(10, d(20), d(9)).warnings).toEqual([
    "90% of budget consumed",
  ]);
  expect(hourMetrics(10, d(10), d(11))).toMatchObject({
    remaining: "-1.00",
    warnings: ["Budget exceeded", "Actual hours exceed planned allocation"],
  });
  expect(hourMetrics(0, d(0), d(1)).used).toBeNull();
  expect(hourMetrics(null, d(0), d(1)).remaining).toBeNull();
});
test("own draft creation, editing, finalization, corrections, audit and immutable history", async () => {
  const { e } = await running();
  const p = await createTime(
    a.preparer.token,
    payload(e.id, { firmId: b.firm.id, userId: b.admin.id }),
  );
  expect(p.firmId).toBe(a.firm.id);
  expect(p.userId).toBe(a.preparer.id);
  await expect(
    changeTime(a.other.token, p.id, {
      action: "edit",
      revision: 1,
      fields: payload(e.id),
    }),
  ).rejects.toThrow();
  await changeTime(a.preparer.token, p.id, {
    action: "edit",
    revision: 1,
    fields: payload(e.id, { hours: "1.10" }),
  });
  await expect(
    changeTime(a.preparer.token, p.id, { action: "submit", revision: 1 }),
  ).rejects.toThrow(/changed/);
  const submits = await Promise.allSettled(
    [1, 2].map(() =>
      changeTime(a.preparer.token, p.id, { action: "submit", revision: 2 }),
    ),
  );
  expect(submits.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await expect(
    changeTime(a.preparer.token, p.id, {
      action: "edit",
      revision: 3,
      fields: payload(e.id),
    }),
  ).rejects.toThrow(/Finalized/);
  await expect(
    changeTime(a.preparer.token, p.id, { action: "delete", revision: 3 }),
  ).rejects.toThrow();
  await expect(
    changeTime(a.preparer.token, p.id, {
      action: "correct",
      revision: 3,
      reason: "Mistake",
    }),
  ).rejects.toThrow();
  await expect(
    changeTime(a.token, p.id, { action: "correct", revision: 3 }),
  ).rejects.toThrow(/reason/);
  await expect(
    db.timeEntry.update({ where: { id: p.id }, data: { hours: "4" } }),
  ).rejects.toThrow();
  await changeTime(a.token, p.id, {
    action: "correct",
    revision: 3,
    reason: "Use actual reconciliation effort",
  });
  await expect(
    changeTime(a.preparer.token, p.id, { action: "delete", revision: 4 }),
  ).rejects.toThrow(/Previously finalized/);
  await changeTime(a.preparer.token, p.id, {
    action: "edit",
    revision: 4,
    fields: payload(e.id, { hours: "1.25" }),
  });
  await changeTime(a.preparer.token, p.id, { action: "submit", revision: 5 });
  const logs = await db.auditLog.findMany({
    where: { entityId: p.id },
    orderBy: { timestamp: "asc" },
  });
  expect(logs.map((l) => l.action)).toEqual([
    "time.created",
    "time.edited",
    "time.submitted",
    "time.corrected",
    "time.edited",
    "time.submitted",
  ]);
  expect(logs.every((l) => l.actorUserId && l.timestamp)).toBe(true);
  expect(logs[3].metadata).toMatchObject({
    reason: "Use actual reconciliation effort",
    before: { hours: "1.1", status: "Submitted" },
    after: { status: "Draft" },
  });
  const draft = await createTime(a.preparer.token, payload(e.id));
  await changeTime(a.preparer.token, draft.id, {
    action: "delete",
    revision: 1,
  });
  expect(await db.timeEntry.findUnique({ where: { id: draft.id } })).toBeNull();
});
test("tenant and record visibility secure entries, budgets, options, checklist and stages", async () => {
  const own = await running(),
    foreign = await running(b);
  await expect(
    createTime(a.preparer.token, payload(foreign.e.id)),
  ).rejects.toThrow();
  await expect(createTime(a.other.token, payload(own.e.id))).rejects.toThrow();
  const stage = foreign.w.stages[0];
  const checklist = await db.engagementChecklistItem.findFirstOrThrow({
    where: { engagementId: foreign.e.id },
  });
  await expect(
    createTime(
      a.preparer.token,
      payload(own.e.id, { engagementWorkflowStageId: stage.id }),
    ),
  ).rejects.toThrow(/Stage/);
  await expect(
    createTime(
      a.preparer.token,
      payload(own.e.id, { checklistItemId: checklist.id }),
    ),
  ).rejects.toThrow(/Checklist/);
  const foreignTime = await createTime(b.preparer.token, payload(foreign.e.id));
  await expect(
    changeTime(a.token, foreignTime.id, {
      action: "correct",
      revision: 1,
      reason: "No",
    }),
  ).rejects.toThrow();
  await expect(engagementTime(a.token, foreign.e.id)).rejects.toThrow();
  await expect(engagementHours(a.token, foreign.e.id)).rejects.toThrow();
  await expect(timeOptions(a.preparer.token, foreign.e.id)).rejects.toThrow();
  await expect(engagementTime(a.preparer.token, own.e.id)).rejects.toThrow();
  await expect(engagementHours(a.preparer.token, own.e.id)).rejects.toThrow();
});
test("allocation and checklist links preserve independent systems and decimal aggregation", async () => {
  const { e, w } = await running();
  const checklist = await db.engagementChecklistItem.findFirstOrThrow({
    where: { engagementId: e.id },
  });
  const allocations = await createAllocations(a.token, {
    rows: [
      {
        engagementId: e.id,
        assignedUserId: a.preparer.id,
        engagementWorkflowStageId: checklist.engagementWorkflowStageId,
        allocationDate: "2026-10-05",
        allocatedHours: 3,
      },
    ],
  });
  await db.workAllocation.create({
    data: {
      firmId: a.firm.id,
      engagementId: e.id,
      assignedUserId: a.preparer.id,
      assignedByUserId: a.admin.id,
      allocationDate: new Date("2026-10-05"),
      allocatedHours: 99,
      status: "Cancelled",
      cancelledAt: new Date(),
    },
  });
  const p = await createTime(
    a.preparer.token,
    payload(e.id, {
      workDate: "2026-10-05",
      hours: "2.25",
      workAllocationId: allocations.items[0].id,
      checklistItemId: checklist.id,
    }),
  );
  expect(p.engagementWorkflowStageId).toBe(checklist.engagementWorkflowStageId);
  expect(p.engagementWorkflowId).toBe(w.id);
  expect(p.workDate.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  expect((await engagementHours(a.token, e.id)).actual).toBe("0.00");
  await changeTime(a.preparer.token, p.id, { action: "submit", revision: 1 });
  for (const hours of ["0.10", "0.20"]) {
    const entry = await createTime(a.preparer.token, payload(e.id, { hours }));
    await changeTime(a.preparer.token, entry.id, {
      action: "submit",
      revision: 1,
    });
  }
  const totals = await engagementHours(a.token, e.id);
  expect(totals).toMatchObject({
    budget: "20.00",
    planned: "3.00",
    actual: "2.55",
    remaining: "17.45",
    used: "12.8",
  });
  expect(totals.employees.find((u) => u.id === a.preparer.id)).toMatchObject({
    role: "preparer",
    planned: "3.00",
    actual: "2.55",
    difference: "0.45",
  });
  expect((await getWorkflow(a.token, e.id))!.revision).toBe(w.revision);
  expect(
    (
      await db.engagementChecklistItem.findUniqueOrThrow({
        where: { id: checklist.id },
      })
    ).status,
  ).toBe(checklist.status);
  expect(
    (
      await db.workAllocation.findUniqueOrThrow({
        where: { id: allocations.items[0].id },
      })
    ).allocatedHours.toFixed(2),
  ).toBe("3.00");
  const options = await timeOptions(a.preparer.token, e.id);
  expect(options.checklist.some((i) => i.id === checklist.id)).toBe(true);
  await expect(
    createTime(
      a.preparer.token,
      payload(e.id, {
        checklistItemId: checklist.id,
        engagementWorkflowStageId: w.stages.find(
          (s) => s.id !== checklist.engagementWorkflowStageId,
        )!.id,
      }),
    ),
  ).rejects.toThrow(/match/);
});
test("duplicate creation and concurrent daily limits are serialized", async () => {
  const { e } = await running();
  const input = payload(e.id, { workDate: "2026-09-01" });
  const duplicated = await Promise.allSettled(
    [1, 2].map(() => createTime(a.preparer.token, input)),
  );
  expect(duplicated.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const limited = await Promise.allSettled(
    [1, 2].map(() =>
      createTime(
        a.preparer.token,
        payload(e.id, { workDate: "2026-09-02", hours: "13" }),
      ),
    ),
  );
  expect(limited.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
test("My Time periods use firm dates and exclude other employees", async () => {
  const { e } = await running();
  const entry = await createTime(a.preparer.token, payload(e.id));
  const own = await myTime(a.preparer.token, "today");
  expect(own.items.some((r) => r.id === entry.id)).toBe(true);
  expect(own.items.every((r) => r.userId === a.preparer.id)).toBe(true);
  const previousDate = new Date(own.dates.weekStart);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const prev = await createTime(
    a.preparer.token,
    payload(e.id, { workDate: previousDate.toISOString().slice(0, 10) }),
  );
  expect(
    (await myTime(a.preparer.token, "previous")).items.some(
      (r) => r.id === prev.id,
    ),
  ).toBe(true);
  expect(
    (await myTime(a.preparer.token, "week")).items.some(
      (r) => r.id === prev.id,
    ),
  ).toBe(false);
});

test("custom capabilities are enforced independently of role names and ownership", async () => {
  const { e } = await running();
  const role = await db.role.create({
    data: { firmId: a.firm.id, roleName: `Time custom ${randomUUID()}` },
  });
  await db.rolePermission.createMany({
    data: ["engagements.view", "engagements.view_all", "time.view_own"].map(
      (permissionKey) => ({
        firmId: a.firm.id,
        roleId: role.id,
        permissionKey,
      }),
    ),
  });
  const user = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: role.id,
      firstName: "Custom",
      lastName: "Time",
      email: `${randomUUID()}@test.invalid`,
      status: "Active",
    },
  });
  const token = await mint(user.id, a.firm.id);
  await expect(createTime(token, payload(e.id))).rejects.toThrow(/access/);
  await db.rolePermission.createMany({
    data: ["time.create", "time.edit_own"].map((permissionKey) => ({
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey,
    })),
  });
  const entry = await createTime(token, payload(e.id));
  await expect(
    changeTime(token, entry.id, { action: "submit", revision: 1 }),
  ).rejects.toThrow(/access/);
  // Even a firm administrator cannot directly rewrite another employee's draft.
  await expect(
    changeTime(a.token, entry.id, {
      action: "edit",
      revision: 1,
      fields: payload(e.id),
    }),
  ).rejects.toThrow(/not found/);
  await db.rolePermission.delete({
    where: {
      firmId_roleId_permissionKey: {
        firmId: a.firm.id,
        roleId: role.id,
        permissionKey: "time.create",
      },
    },
  });
  expect(
    (await timeOptions(token, e.id)).engagements.some((r) => r.id === e.id),
  ).toBe(true);
  await changeTime(token, entry.id, {
    action: "edit",
    revision: 1,
    fields: payload(e.id, { hours: "0.5" }),
  });
  const historical = await createTime(
    a.preparer.token,
    payload(e.id, { workDate: "2025-01-02" }),
  );
  const history = await myTime(a.preparer.token, "week", "2025-01-02");
  expect(history.items.map((r) => r.id)).toContain(historical.id);
  expect(history.selected?.weekStart).toBe("2024-12-30");
});

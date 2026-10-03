import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient } from "../src/lib/clients";
import { saveEngagement, getEngagement } from "../src/lib/engagements";
import {
  saveTemplate,
  getTemplate,
  templateAction,
} from "../src/lib/workflow-templates";
import {
  applyWorkflow,
  getWorkflow,
  transitionWorkflow,
} from "../src/lib/workflows";
import {
  createAllocations,
  changeAllocation,
  listAllocations,
  allocationHistory,
  allocationBudget,
  allocationEmployeeTotals,
  allocationEngagementRoles,
} from "../src/lib/allocations";
import { firmDates } from "../src/lib/engagement-constants";
const suffix = randomUUID();
type Fixture = Awaited<ReturnType<typeof fixture>>;
let a: Fixture, b: Fixture;
async function mint(userId: string, firmId: string) {
  const token = newToken();
  await db.session.create({
    data: {
      firmId,
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return token;
}
async function fixture(label: string) {
  const f = await provisionFirm({
    firmName: `Allocation ${label} ${suffix}`,
    adminEmail: `allocation-${label}-${suffix}@test.invalid`,
    adminPassword: "Test-" + randomUUID(),
    timezone: "America/Chicago",
  });
  const token = await mint(f.admin.id, f.firm.id);
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
      where: { firmId: f.firm.id, name: "Tax" },
    }),
    type = await db.engagementType.findFirstOrThrow({
      where: { firmId: f.firm.id, name: "Monthly Close" },
    }),
    entity = await db.entityType.findFirstOrThrow({
      where: { firmId: f.firm.id },
    });
  const client = await saveClient(token, {
    clientCode: "WORKFLOW",
    primaryContact: {
      firstName: "Test",
      lastName: "Contact",
      email: "contact@example.test",
      phone: "5551234567",
    },
    legalName: "Workflow Client",
    entityTypeId: entity.id,
    primaryOfficeId: office.id,
    status: "Active",
    serviceLineIds: [service.id],
  });
  const users = [];
  for (const [i, alias] of [
    "manager",
    "reviewer",
    "preparer",
    "other",
  ].entries()) {
    const u = await db.user.create({
      data: {
        firmId: f.firm.id,
        roleId: f.roles[Math.min(i + 2, 4)].id,
        firstName: alias,
        lastName: "Test",
        email: `${label}-${alias}-${suffix}@test.invalid`,
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
    manager: users[0],
    reviewer: users[1],
    preparer: users[2],
    other: users[3],
  };
}
beforeAll(async () => {
  a = await fixture("a");
  b = await fixture("b");
});
afterAll(() => db.$disconnect());
const definition = (f = a) => ({
  name: "Template " + randomUUID(),
  serviceLineId: f.service.id,
  engagementTypeId: f.type.id,
  stages: [
    {
      name: "Received",
      isStart: true,
      defaultOwnerType: "Preparer",
      category: "Queue",
    },
    {
      name: "Preparation",
      defaultOwnerType: "Preparer",
      category: "Preparation",
      targetDays: 3,
      instructions: "Reconcile accounts.",
    },
    {
      name: "Questions",
      required: false,
      defaultOwnerType: "Preparer",
      category: "Waiting",
    },
    {
      name: "Review",
      defaultOwnerType: "Reviewer",
      category: "Review",
      targetDays: 2,
    },
    {
      name: "Filed",
      isCompletion: true,
      defaultOwnerType: "Manager",
      category: "Completion",
    },
  ],
});
const payload = (f = a) => ({
  engagementCode: randomUUID(),
  engagementName: "Workflow Engagement",
  clientId: f.client.id,
  serviceLineId: f.service.id,
  engagementTypeId: f.type.id,
  officeId: f.office.id,
  partnerId: f.admin.id,
  managerId: f.manager.id,
  reviewerId: f.reviewer.id,
  preparerId: f.preparer.id,
  dueDate: "2026-10-10",
});
async function published(f = a) {
  const d = await saveTemplate(f.token, definition(f));
  await templateAction(f.token, d.id, { action: "publish", revision: 1 });
  return getTemplate(f.token, d.id);
}
async function running(f = a) {
  const t = await published(f),
    e = await saveEngagement(f.token, payload(f));
  await applyWorkflow(f.token, e.id, { templateId: t.id });
  return { t, e, w: (await getWorkflow(f.token, e.id))! };
}
const dates = firmDates("America/Chicago");
const day = (offset: number) => {
  const d = new Date(dates.weekStart);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const allocation = (
  engagementId: string,
  extra: Record<string, unknown> = {},
) => ({
  engagementId,
  assignedUserId: a.preparer.id,
  allocationDate: dates.today,
  allocatedHours: 2,
  ...extra,
});
async function created(extra: Record<string, unknown> = {}) {
  const e = await saveEngagement(a.token, payload());
  const result = await createAllocations(a.manager.token, {
    rows: [allocation(e.id, extra)],
  });
  return { e, id: result.items[0].id };
}

test("manager creates single and multiple dates without overwriting records; audit is transactional", async () => {
  const e = await saveEngagement(a.token, payload());
  const r = await createAllocations(a.manager.token, {
    rows: [
      allocation(e.id, { allocationDate: day(0), allocatedHours: 3 }),
      allocation(e.id, { allocationDate: day(1), allocatedHours: 2 }),
      allocation(e.id, { allocationDate: day(2), allocatedHours: 3 }),
    ],
  });
  expect(r.items).toHaveLength(3);
  expect((await allocationBudget(a.token, e.id)).planned).toBe(8);
  expect(
    await db.auditLog.count({
      where: {
        firmId: a.firm.id,
        entityId: { in: r.items.map((i) => i.id) },
        action: "allocation.created",
      },
    }),
  ).toBe(3);
});
test.each([0, -1, 1.001])(
  "invalid allocated hours %s rejected",
  async (hours) => {
    const e = await saveEngagement(a.token, payload());
    await expect(
      createAllocations(a.token, {
        rows: [allocation(e.id, { allocatedHours: hours })],
      }),
    ).rejects.toThrow();
  },
);
test.each(["2026-02-30", "not-a-date"])(
  "invalid allocation date %s rejected",
  async (date) => {
    const e = await saveEngagement(a.token, payload());
    await expect(
      createAllocations(a.token, {
        rows: [allocation(e.id, { allocationDate: date })],
      }),
    ).rejects.toThrow();
  },
);
test("optional clock times validate order and require explicit offsets", async () => {
  const e = await saveEngagement(a.token, payload());
  await expect(
    createAllocations(a.token, {
      rows: [
        allocation(e.id, {
          plannedStartAt: "2026-10-03T15:00:00Z",
          plannedEndAt: "2026-10-03T14:00:00Z",
        }),
      ],
    }),
  ).rejects.toThrow();
});
test("foreign, inactive, unknown and invisible employees rejected", async () => {
  const e = await saveEngagement(a.token, payload());
  for (const uid of [b.preparer.id, a.other.id, randomUUID()])
    await expect(
      createAllocations(a.token, {
        rows: [allocation(e.id, { assignedUserId: uid })],
      }),
    ).rejects.toThrow(/Employee/);
  await db.user.update({
    where: { id: a.preparer.id },
    data: { status: "Inactive" },
  });
  try {
    await expect(
      createAllocations(a.token, { rows: [allocation(e.id)] }),
    ).rejects.toThrow(/Employee/);
  } finally {
    await db.user.update({
      where: { id: a.preparer.id },
      data: { status: "Active" },
    });
  }
});
test("normal employee cannot allocate; unrelated manager cannot allocate", async () => {
  const e = await saveEngagement(a.token, {
    ...payload(),
    managerId: a.admin.id,
  });
  await expect(
    createAllocations(a.preparer.token, { rows: [allocation(e.id)] }),
  ).rejects.toThrow();
  await expect(
    createAllocations(a.manager.token, { rows: [allocation(e.id)] }),
  ).rejects.toThrow(/scope/);
});
test("foreign engagements and stages rejected; same-firm wrong stage rejected", async () => {
  const first = await running(),
    second = await running(),
    foreign = await running(b);
  await expect(
    createAllocations(a.token, { rows: [allocation(foreign.e.id)] }),
  ).rejects.toThrow();
  for (const stage of [second.w.currentStageId, foreign.w.currentStageId])
    await expect(
      createAllocations(a.token, {
        rows: [allocation(first.e.id, { engagementWorkflowStageId: stage })],
      }),
    ).rejects.toThrow(/Stage/);
});
test("batch validates all rows and rolls back on invalid engagement", async () => {
  const e = await saveEngagement(a.token, payload());
  const before = await db.workAllocation.count({
    where: { firmId: a.firm.id },
  });
  await expect(
    createAllocations(a.token, {
      rows: [allocation(e.id), allocation(randomUUID())],
    }),
  ).rejects.toThrow();
  expect(await db.workAllocation.count({ where: { firmId: a.firm.id } })).toBe(
    before,
  );
});
test("budget warning requires acknowledgement; preview writes nothing and budget is not consumed", async () => {
  const e = await saveEngagement(a.token, { ...payload(), budgetHours: 1 });
  const input = { rows: [allocation(e.id)] };
  const p = await createAllocations(a.token, input, true);
  expect(p.warnings.some((w) => w.kind === "budget")).toBe(true);
  expect(await db.workAllocation.count({ where: { engagementId: e.id } })).toBe(
    0,
  );
  await expect(createAllocations(a.token, input)).rejects.toThrow(
    /acknowledge/,
  );
  await createAllocations(a.token, { ...input, acknowledgeBudget: true });
  expect(await allocationBudget(a.token, e.id)).toEqual({
    budget: 1,
    planned: 2,
    unallocated: -1,
  });
  expect((await getEngagement(a.token, e.id)).budgetHours).toBe(1);
});
test("configured weekly capacity warns without inventing a daily limit", async () => {
  const e = await saveEngagement(a.token, payload());
  const r = await createAllocations(
    a.token,
    { rows: [allocation(e.id, { allocatedHours: 41 })] },
    true,
  );
  expect(r.warnings.some((w) => w.kind === "capacity")).toBe(true);
});
test("own work only, including explicit employeeId tampering and foreign firm filters", async () => {
  const { e, id } = await created();
  const mine = await listAllocations(a.preparer.token, {
    engagementId: e.id,
    view: "all",
  });
  expect(mine.items.map((i) => i.id)).toEqual([id]);
  expect(
    (await listAllocations(a.other.token, { engagementId: e.id, view: "all" }))
      .total,
  ).toBe(0);
  expect(
    (await listAllocations(b.token, { engagementId: e.id, view: "all" }, true))
      .total,
  ).toBe(0);
  await expect(
    listAllocations(a.preparer.token, { employeeId: a.manager.id }),
  ).rejects.toThrow(/own/);
  await expect(listAllocations(a.preparer.token, {}, true)).rejects.toThrow();
});
test("today, week, upcoming, completed, blocked and planned totals", async () => {
  const e = await saveEngagement(a.token, payload());
  const result = await createAllocations(a.token, {
    rows: [
      allocation(e.id, { allocationDate: dates.today, allocatedHours: 3 }),
      allocation(e.id, { allocationDate: day(7), allocatedHours: 2 }),
      allocation(e.id, { allocationDate: day(-1), allocatedHours: 4 }),
    ],
  });
  const input = { engagementId: e.id };
  expect(
    (await listAllocations(a.preparer.token, { ...input, view: "today" }))
      .total,
  ).toBe(1);
  expect(
    (await listAllocations(a.preparer.token, { ...input, view: "week" }))
      .summary.plannedWeek,
  ).toBe(3);
  expect(
    (await listAllocations(a.preparer.token, { ...input, view: "upcoming" }))
      .total,
  ).toBe(1);
  await changeAllocation(a.preparer.token, result.items[0].id, {
    revision: 1,
    action: "status",
    status: "Blocked",
    blockedReason: "System Access Pending",
    reason: "Access requested",
  });
  expect(
    (await listAllocations(a.preparer.token, { ...input, view: "blocked" }))
      .total,
  ).toBe(1);
  await changeAllocation(a.preparer.token, result.items[0].id, {
    revision: 2,
    action: "status",
    status: "Completed",
  });
  expect(
    (await listAllocations(a.preparer.token, { ...input, view: "completed" }))
      .total,
  ).toBe(1);
  expect(
    (await listAllocations(a.preparer.token, { ...input, view: "week" }))
      .summary.plannedWeek,
  ).toBe(3);
});
test("overdue allocation and engagement labels are independently derived", async () => {
  const e = await saveEngagement(a.token, { ...payload(), dueDate: day(-5) });
  await createAllocations(a.token, {
    rows: [
      allocation(e.id, { allocationDate: day(7) }),
      allocation(e.id, { allocationDate: day(-1) }),
    ],
  });
  const list = await listAllocations(a.preparer.token, {
    engagementId: e.id,
    view: "overdue",
  });
  expect(list.items).toHaveLength(2);
  expect(list.items.every((r) => r.overdueEngagement)).toBe(true);
  expect(list.items.filter((r) => r.overdueAllocation)).toHaveLength(1);
  expect(list.items.every((r) => r.status === "Assigned")).toBe(true);
});
test("firm timezone and Monday-Sunday dates, including Sunday boundary", async () => {
  expect(
    firmDates("America/Chicago", new Date("2026-10-05T02:00:00Z")),
  ).toEqual({
    today: "2026-10-04",
    weekStart: "2026-09-28",
    weekEnd: "2026-10-04",
  });
  const e = await saveEngagement(a.token, payload());
  await createAllocations(a.token, {
    rows: [allocation(e.id, { allocationDate: "2026-10-04" })],
  });
  expect(
    (
      await listAllocations(
        a.preparer.token,
        { engagementId: e.id, view: "today" },
        false,
        new Date("2026-10-05T02:00:00Z"),
      )
    ).total,
  ).toBe(1);
});
test("unscheduled current-stage responsibility disappears with relevant allocation and returns when completed", async () => {
  const { e, w } = await running();
  const find = async () => {
    const r = await listAllocations(a.preparer.token, {});
    return r.responsibilities.some((x) => x.engagementId === e.id);
  };
  expect(await find()).toBe(true);
  const r = await createAllocations(a.token, {
    rows: [allocation(e.id, { engagementWorkflowStageId: w.currentStageId })],
  });
  expect(await find()).toBe(false);
  await changeAllocation(a.preparer.token, r.items[0].id, {
    revision: 1,
    action: "status",
    status: "Completed",
  });
  expect(await find()).toBe(true);
  const after = await getWorkflow(a.token, e.id);
  expect(after?.currentStageId).toBe(w.currentStageId);
  expect(after?.revision).toBe(w.revision);
  expect(after?.status).toBe("Active");
});
test("unlinked allocation prevents duplicate unscheduled responsibility", async () => {
  const { e } = await running();
  await createAllocations(a.token, { rows: [allocation(e.id)] });
  expect(
    (await listAllocations(a.preparer.token, {})).responsibilities.some(
      (x) => x.engagementId === e.id,
    ),
  ).toBe(false);
});
test("workflow stage movement preserves historical allocation stage", async () => {
  const { e, w } = await running();
  const r = await createAllocations(a.token, {
    rows: [allocation(e.id, { engagementWorkflowStageId: w.currentStageId })],
  });
  await transitionWorkflow(a.token, e.id, {
    action: "Forward",
    revision: w.revision,
    currentStageId: w.currentStageId,
  });
  expect(
    (
      await db.workAllocation.findUniqueOrThrow({
        where: { id: r.items[0].id },
      })
    ).engagementWorkflowStageId,
  ).toBe(w.currentStageId);
});
test("edit hours/date audited; cancel preserved and excluded from budget", async () => {
  const { e, id } = await created();
  await changeAllocation(a.manager.token, id, {
    revision: 1,
    action: "edit",
    fields: allocation(e.id, { allocationDate: day(7), allocatedHours: 5 }),
  });
  expect((await allocationBudget(a.token, e.id)).planned).toBe(5);
  const history = await allocationHistory(a.manager.token, id);
  expect(JSON.stringify(history)).toContain("allocatedHours");
  expect(JSON.stringify(history)).toContain("allocationDate");
  await changeAllocation(a.manager.token, id, {
    revision: 2,
    action: "cancel",
    reason: "Rescheduled separately",
  });
  expect((await allocationBudget(a.token, e.id)).planned).toBe(0);
  expect(
    (await db.workAllocation.findUniqueOrThrow({ where: { id } })).cancelledAt,
  ).not.toBeNull();
  await expect(
    changeAllocation(a.manager.token, id, {
      revision: 3,
      action: "note",
      reason: "Cannot edit cancelled",
    }),
  ).rejects.toThrow();
  await expect(db.workAllocation.delete({ where: { id } })).rejects.toThrow();
});
test("reassignment preserves employee history without silently changing workflow ownership", async () => {
  const { e, w } = await running();
  const r = await createAllocations(a.token, {
    rows: [allocation(e.id, { engagementWorkflowStageId: w.currentStageId })],
  });
  const id = r.items[0].id;
  await changeAllocation(a.manager.token, id, {
    revision: 1,
    action: "reassign",
    assignedUserId: a.reviewer.id,
    reason: "Reviewer takes over allocation",
  });
  expect((await getWorkflow(a.token, e.id))?.currentStage?.assignedUserId).toBe(
    a.preparer.id,
  );
  const history = JSON.stringify(await allocationHistory(a.manager.token, id));
  expect(history).toContain(a.preparer.id);
  expect(history).toContain(a.reviewer.id);
  expect(history).toContain("Reviewer takes over allocation");
  await expect(allocationHistory(a.preparer.token, id)).rejects.toThrow();
});
test("explicit linked reassignment is atomic and records stage visits", async () => {
  const { e, w } = await running();
  const r = await createAllocations(a.token, {
    rows: [allocation(e.id, { engagementWorkflowStageId: w.currentStageId })],
  });
  const id = r.items[0].id;
  await expect(
    changeAllocation(a.manager.token, id, {
      revision: 1,
      action: "reassign",
      assignedUserId: a.reviewer.id,
      reason: "Both owners",
      changeStageOwner: true,
      workflowRevision: 99,
    }),
  ).rejects.toThrow(/changed/);
  expect(
    (await db.workAllocation.findUniqueOrThrow({ where: { id } }))
      .assignedUserId,
  ).toBe(a.preparer.id);
  await changeAllocation(a.manager.token, id, {
    revision: 1,
    action: "reassign",
    assignedUserId: a.reviewer.id,
    reason: "Both owners",
    changeStageOwner: true,
    workflowRevision: w.revision,
  });
  expect((await getWorkflow(a.token, e.id))?.currentStage?.assignedUserId).toBe(
    a.reviewer.id,
  );
});
test("own status and notes allowed; colleague, budget, reassign and cancel disallowed", async () => {
  const { id, e } = await created();
  await changeAllocation(a.preparer.token, id, {
    revision: 1,
    action: "note",
    reason: "Reconciliation underway",
  });
  await expect(
    changeAllocation(a.other.token, id, {
      revision: 2,
      action: "status",
      status: "Completed",
    }),
  ).rejects.toThrow();
  await expect(
    changeAllocation(a.preparer.token, id, {
      revision: 2,
      action: "edit",
      fields: allocation(e.id, { allocatedHours: 10 }),
    }),
  ).rejects.toThrow();
  await expect(
    changeAllocation(a.preparer.token, id, {
      revision: 2,
      action: "reassign",
      assignedUserId: a.reviewer.id,
      reason: "Not allowed",
    }),
  ).rejects.toThrow();
  await expect(
    changeAllocation(a.preparer.token, id, {
      revision: 2,
      action: "cancel",
      reason: "Not allowed",
    }),
  ).rejects.toThrow();
  await expect(
    changeAllocation(a.preparer.token, id, {
      revision: 2,
      action: "status",
      status: "Blocked",
    }),
  ).rejects.toThrow(/reason/);
});
test("cross-tenant edits, history and budget cannot expose records", async () => {
  const { id, e } = await created();
  await expect(
    changeAllocation(b.token, id, {
      revision: 1,
      action: "cancel",
      reason: "Attack",
    }),
  ).rejects.toThrow(/not found/);
  await expect(allocationHistory(b.token, id)).rejects.toThrow();
  await expect(allocationBudget(b.token, e.id)).rejects.toThrow();
});
test("composite database constraints reject a foreign employee and wrong workflow stage", async () => {
  const { id } = await created();
  await expect(
    db.workAllocation.update({
      where: { id },
      data: { assignedUserId: b.preparer.id },
    }),
  ).rejects.toThrow();
  const other = await running();
  await expect(
    db.workAllocation.update({
      where: { id },
      data: {
        engagementWorkflowId: other.w.id,
        engagementWorkflowStageId: other.w.currentStageId,
      },
    }),
  ).rejects.toThrow();
});
test("simultaneous changes: exactly one wins; stale cancellation fails", async () => {
  const { id } = await created();
  const results = await Promise.allSettled([
    changeAllocation(a.token, id, {
      revision: 1,
      action: "status",
      status: "InProgress",
    }),
    changeAllocation(a.manager.token, id, {
      revision: 1,
      action: "status",
      status: "Completed",
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  await expect(
    changeAllocation(a.token, id, {
      revision: 1,
      action: "cancel",
      reason: "Stale",
    }),
  ).rejects.toThrow(/changed/);
  expect(
    (await db.workAllocation.findUniqueOrThrow({ where: { id } })).revision,
  ).toBe(2);
});
test("server pagination and filters never duplicate allocations across pages", async () => {
  const e = await saveEngagement(a.token, payload());
  await createAllocations(a.token, {
    rows: Array.from({ length: 27 }, (_, i) =>
      allocation(e.id, { allocatedHours: 0.1, description: `Work ${i}` }),
    ),
  });
  const p1 = await listAllocations(a.preparer.token, {
      view: "all",
      engagementId: e.id,
    }),
    p2 = await listAllocations(a.preparer.token, {
      view: "all",
      engagementId: e.id,
      page: 2,
    });
  expect(p1.items).toHaveLength(25);
  expect(p2.items).toHaveLength(2);
  expect(new Set([...p1.items, ...p2.items].map((r) => r.id)).size).toBe(27);
  expect(p1.summary.plannedWeek).toBe(2.7);
});

test("custom-role management visibility does not remove own-work rights or grant management edits", async () => {
  const { id } = await created({ assignedUserId: a.manager.id });
  const permissions = await db.rolePermission.findMany({
    where: { firmId: a.firm.id, roleId: a.manager.roleId },
  });
  const role = await db.role.create({
    data: {
      firmId: a.firm.id,
      roleName: "Allocation reader " + randomUUID(),
      description: "Custom role",
      active: true,
    },
  });
  await db.rolePermission.createMany({
    data: permissions
      .filter((p) => p.permissionKey !== "allocations.edit")
      .map((p) => ({
        firmId: a.firm.id,
        roleId: role.id,
        permissionKey: p.permissionKey,
      })),
  });
  await db.user.update({
    where: { id: a.manager.id },
    data: { roleId: role.id },
  });
  try {
    await changeAllocation(a.manager.token, id, {
      revision: 1,
      action: "status",
      status: "InProgress",
    });
    expect(
      (await listAllocations(a.manager.token, { view: "all" })).items.find(
        (r) => r.id === id,
      )?.canUpdate,
    ).toBe(true);
    await expect(
      changeAllocation(a.manager.token, id, {
        revision: 2,
        action: "status",
        status: "Planned",
      }),
    ).rejects.toThrow();
  } finally {
    await db.user.update({
      where: { id: a.manager.id },
      data: { roleId: a.manager.roleId },
    });
  }
});
test("submitted tenant fields cannot override session tenant", async () => {
  const e = await saveEngagement(a.token, payload());
  const r = await createAllocations(a.token, {
    firmId: b.firm.id,
    rows: [{ ...allocation(e.id), firmId: b.firm.id, firm_id: b.firm.id }],
  });
  expect(
    (
      await db.workAllocation.findUniqueOrThrow({
        where: { id: r.items[0].id },
      })
    ).firmId,
  ).toBe(a.firm.id);
});

test("assignment breakdown totals span all dates and pages, exclude cancelled and retain completed plans", async () => {
  const e = await saveEngagement(a.token, { ...payload(), budgetHours: 40 });
  const result = await createAllocations(a.token, {
    rows: [
      ...Array.from({ length: 26 }, () =>
        allocation(e.id, { allocatedHours: 1 }),
      ),
      allocation(e.id, { allocationDate: day(14), allocatedHours: 3 }),
      allocation(e.id, { assignedUserId: a.reviewer.id, allocatedHours: 2 }),
      allocation(e.id, { allocatedHours: 4 }),
    ],
  });
  await changeAllocation(a.token, result.items[27].id, {
    action: "status",
    revision: 1,
    status: "Completed",
  });
  await changeAllocation(a.token, result.items[28].id, {
    action: "cancel",
    revision: 1,
    reason: "Cancelled plan",
  });
  const totals = await allocationEmployeeTotals(a.manager.token, e.id);
  expect(totals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: a.preparer.id,
        firstName: a.preparer.firstName,
        engagementRole: "Preparer",
        plannedHours: 29,
      }),
      expect.objectContaining({
        id: a.reviewer.id,
        engagementRole: "Reviewer",
        plannedHours: 2,
      }),
    ]),
  );
  expect(totals).toHaveLength(2);
  expect(totals.reduce((sum, employee) => sum + employee.plannedHours, 0)).toBe(
    (await allocationBudget(a.manager.token, e.id)).planned,
  );
  await expect(allocationEmployeeTotals(b.token, e.id)).rejects.toThrow();
  await expect(
    allocationEmployeeTotals(a.preparer.token, e.id),
  ).rejects.toThrow(/Management/);
});

test("assignment breakdown labels reflect engagement staffing, including multiple roles and additional assignees", () => {
  const staff = {
    partnerId: a.admin.id,
    managerId: a.manager.id,
    reviewerId: a.manager.id,
    preparerId: a.preparer.id,
  };
  expect(allocationEngagementRoles(a.admin.id, staff)).toBe("Partner");
  expect(allocationEngagementRoles(a.manager.id, staff)).toBe(
    "Manager / Reviewer",
  );
  expect(allocationEngagementRoles(a.preparer.id, staff)).toBe("Preparer");
  expect(allocationEngagementRoles(a.other.id, staff)).toBe(
    "Additional assignee",
  );
});

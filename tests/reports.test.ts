import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient } from "../src/lib/clients";
import { saveEngagement } from "../src/lib/engagements";
import { saveTemplate, templateAction } from "../src/lib/workflow-templates";
import { applyWorkflow, getWorkflow } from "../src/lib/workflows";
import { getChecklist } from "../src/lib/checklists";
import { dashboardData } from "../src/lib/dashboard";
import { portfolio } from "../src/lib/insights";
import { reportData, exportReport, REPORTS } from "../src/lib/reports";
import { checklistProgress } from "../src/lib/checklist-validation";
import { createPoint } from "../src/lib/points";
import { firmDates } from "../src/lib/engagement-constants";
import { shiftDate } from "../src/lib/capacity-math";
import { createAllocations } from "../src/lib/allocations";
import { createTime, changeTime } from "../src/lib/time";
import { teamCapacity } from "../src/lib/capacity";
import { parse } from "csv-parse/sync";
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
        targetDays: 3,
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
const today = firmDates("America/Chicago").today;
const now = new Date(`${shiftDate(today, 12)}T18:00:00Z`);
const asOf = firmDates("America/Chicago", now).today;
test("scopes dashboard, reports and CSV before aggregating tenant or hidden records", async () => {
  const own = await running(),
    foreign = await running(b);
  expect(
    (await portfolio(a.token, { engagementId: foreign.e.id })).records,
  ).toHaveLength(0);
  expect(
    (await dashboardData(a.other.token, { engagementId: own.e.id })).summary
      .active,
  ).toBe(0);
  expect(
    (await reportData(a.token, { engagementId: foreign.e.id })).total,
  ).toBe(0);
  expect(
    parse((await exportReport(a.token, { engagementId: foreign.e.id })).csv, {
      bom: true,
    }),
  ).toHaveLength(1);
  await expect(reportData(a.preparer.token)).rejects.toMatchObject({
    status: 403,
  });
  await expect(exportReport(undefined)).rejects.toThrow();
});
test("report grants cannot bypass source permissions, visibility or export grant", async () => {
  const { e } = await running();
  const role = await db.role.create({
    data: {
      firmId: a.firm.id,
      roleName: `Report only ${randomUUID()}`,
    },
  });
  await db.rolePermission.createMany({
    data: ["engagements.view", "reports.view"].map((permissionKey) => ({
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey,
    })),
  });
  const u = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: role.id,
      firstName: "Restricted",
      lastName: "Report",
      email: `${randomUUID()}@test.invalid`,
      status: "Active",
    },
  });
  const token = await mint(u.id, a.firm.id);
  expect((await reportData(token)).total).toBe(0);
  await db.engagement.update({
    where: { id: e.id },
    data: { preparerId: u.id },
  });
  const status = await reportData(token, { engagementId: e.id });
  expect(status.total).toBe(1);
  expect(status.rows[0].cells[5]).toBeNull();
  expect(status.rows[0].cells[9]).toBeNull();
  expect(status.rows[0].cells[10]).toBeNull();
  for (const report of [
    "budget",
    "points",
    "workflow",
    "checklist",
    "capacity",
  ])
    await expect(reportData(token, { report })).rejects.toMatchObject({
      status: 403,
    });
  await expect(exportReport(token)).rejects.toMatchObject({ status: 403 });
  const view = await dashboardData(token);
  expect(view.rights).toEqual({
    workflow: false,
    checklist: false,
    points: false,
    budget: false,
  });
  expect(view.capacity).toBeNull();
});
test("deadline, stage, checklist and actionable point exceptions use source semantics", async () => {
  const { e, w } = await running();
  await db.engagement.update({
    where: { id: e.id },
    data: { dueDate: new Date(shiftDate(asOf, -1)) },
  });
  await db.engagementWorkflowStage.update({
    where: { id: w.currentStageId! },
    data: { enteredAt: new Date(`${today}T18:00:00Z`) },
  });
  const c = await db.engagementChecklistItem.findFirstOrThrow({
    where: { engagementId: e.id },
  });
  await db.engagementChecklistItem.update({
    where: { id: c.id },
    data: { isRequired: true, status: "Blocked", reason: "Awaiting evidence", dueDate: new Date(today) },
  });
  await createPoint(a.token, e.id, {
    pointType: "Question",
    title: "Open blocker",
    description: "Investigate",
    assignedToUserId: a.preparer.id,
    blocking: true,
    dueDate: today,
  });
  await createPoint(a.token, e.id, {
    pointType: "KnowledgeInstruction",
    title: "Guidance",
    assignedToUserId: a.preparer.id,
    description: "Read this",
  });
  const p = await portfolio(a.token, { engagementId: e.id }, now);
  expect(p.records[0].stageDays).toBe(12);
  expect(p.points).toHaveLength(1);
  expect(p.points[0].bucket).toBe("over 10");
  expect(p.exceptions.map((e) => e.type)).toEqual(
    expect.arrayContaining([
      "ENGAGEMENT_OVERDUE",
      "WORKFLOW_STAGNANT",
      "BLOCKING_POINT",
      "POINT_OVERDUE",
      "CHECKLIST_BLOCKED",
      "CHECKLIST_AT_RISK",
    ]),
  );
  expect(p.exceptions.find((e) => e.type === "BLOCKING_POINT")?.priority).toBe(
    "Critical",
  );
  const own = await dashboardData(
    a.preparer.token,
    { engagementId: e.id },
    now,
  );
  expect(own.management).toBe(false);
  expect(own.summary.checklistAttention).toBe(1);
  expect(own.ownPoints).toHaveLength(1);
  expect(own.summary.overdue).toBe(own.healthTotal);
  await db.engagementWorkflowStage.update({
    where: { id: w.currentStageId! },
    data: { enteredAt: now },
  });
  expect(
    (await reportData(a.token, { report: "workflow", engagementId: e.id }, now))
      .rows[0].cells[5],
  ).toBe(0);
  await db.engagement.update({
    where: { id: e.id },
    data: { dueDate: new Date(shiftDate(asOf, 2)) },
  });
  expect(
    (await portfolio(a.token, { engagementId: e.id }, now)).exceptions.some(
      (e) => e.type === "ENGAGEMENT_DUE_SOON",
    ),
  ).toBe(true);
  expect(
    (
      await reportData(
        a.token,
        { engagementId: e.id, deadline: "overdue" },
        now,
      )
    ).total,
  ).toBe(0);
});
test("budget reports use submitted actuals, preserve decimal thresholds and separate planning", async () => {
  const { e } = await running();
  await db.engagement.update({
    where: { id: e.id },
    data: { budgetHours: 10 },
  });
  await createAllocations(a.token, {
    acknowledgeBudget: true,
    rows: [
      {
        engagementId: e.id,
        assignedUserId: a.preparer.id,
        allocationDate: today,
        allocatedHours: 43,
      },
    ],
  });
  const t = await createTime(a.preparer.token, {
    requestId: randomUUID(),
    engagementId: e.id,
    workDate: today,
    hours: "8",
    description: "Report test",
  });
  expect(
    (await portfolio(a.token, { engagementId: e.id })).records[0].hours?.actual,
  ).toBe("0.00");
  await changeTime(a.preparer.token, t.id, { action: "submit", revision: 1 });
  const p = await portfolio(a.token, { engagementId: e.id });
  expect(p.records[0].hours).toMatchObject({
    planned: "43.00",
    actual: "8.00",
    remaining: "2.00",
    used: "80.0",
  });
  expect(p.exceptions.some((e) => e.type === "BUDGET_WARNING")).toBe(true);
  await db.engagement.update({ where: { id: e.id }, data: { budgetHours: 7 } });
  expect(
    (await portfolio(a.token, { engagementId: e.id })).exceptions.find(
      (e) => e.type === "BUDGET_EXCEEDED",
    )?.priority,
  ).toBe("Critical");
  const d = await dashboardData(a.token);
  expect(d.exceptions.some((e) => e.type === "CAPACITY_OVERLOAD")).toBe(true);
  const filtered = await teamCapacity(a.token, { load: "Overloaded" });
  expect(filtered.rows.every((r) => r.status === "Overloaded")).toBe(true);
  expect(filtered.rows.some((r) => r.id === a.preparer.id)).toBe(true);
});
test("six report CSVs preserve filters, escape formulas, export beyond page and avoid view audits", async () => {
  const { e } = await running();
  await db.engagement.update({
    where: { id: e.id },
    data: { engagementName: "=1+1" },
  });
  await createPoint(a.token, e.id, {
    pointType: "Question",
    title: "Report point",
    description: "Investigate",
    assignedToUserId: a.preparer.id,
  });
  const before = await db.auditLog.count({ where: { firmId: a.firm.id } });
  for (const report of Object.keys(REPORTS)) {
    const input = {
      report,
      engagementId: e.id,
      page: 999,
      ...(report === "capacity" ? { employee: a.preparer.id } : {}),
    };
    const data = await reportData(a.token, { ...input, page: 1 });
    expect(data.total).toBeGreaterThan(0);
    const exported = parse((await exportReport(a.token, input)).csv, {
      bom: true,
    }) as string[][];
    expect(exported[0]).toEqual(data.columns);
    expect(exported).toHaveLength(data.total + 1);
    if (report !== "capacity") expect(exported[1][1]).toBe("'=1+1");
  }
  expect(await db.auditLog.count({ where: { firmId: a.firm.id } })).toBe(
    before,
  );
  await expect(
    reportData(a.token, { dueFrom: "2026-10-09", dueTo: "2026-10-01" }),
  ).rejects.toThrow();
  await expect(reportData(a.token, { report: "bogus" })).rejects.toThrow();
  const dashboard = await dashboardData(a.token, { engagementId: e.id });
  expect(
    dashboard.exceptions.some((e) => e.type === "UNSCHEDULED_RESPONSIBILITY"),
  ).toBe(true);
});
test("grouped checklist progress retains existing denominator and required-item rules", () => {
  const items = [
    { status: "Completed", isRequired: true },
    { status: "Completed", isRequired: true },
    { status: "Blocked", isRequired: true },
    { status: "NotApplicable", isRequired: true },
  ];
  expect(checklistProgress(items)).toEqual(
    checklistProgress([
      { status: "Completed", isRequired: true, count: 2 },
      { status: "Blocked", isRequired: true, count: 1 },
      { status: "NotApplicable", isRequired: true, count: 1 },
    ]),
  );
  expect(checklistProgress(items)).toMatchObject({
    applicable: 3,
    percent: 67,
    requiredOutstanding: 1,
  });
});


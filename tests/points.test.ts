import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient } from "../src/lib/clients";
import { saveEngagement } from "../src/lib/engagements";
import { saveTemplate, templateAction } from "../src/lib/workflow-templates";
import {
  applyWorkflow,
  getWorkflow,
  transitionWorkflow,
} from "../src/lib/workflows";
import {
  createPoint,
  changePoint,
  listPoints,
  getPoint,
  pointSummary,
  pointOptions,
  pointAttachmentUnavailable,
} from "../src/lib/points";
import {
  getChecklist,
  updateChecklistItem,
  checklistDetail,
} from "../src/lib/checklists";
import { pointAge, ageBucket, pointOverdue } from "../src/lib/point-constants";
import { allocationBudget } from "../src/lib/allocations";
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
      firmName: `Points ${s}`,
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
    legalName: "Points client",
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
test("custom roles enforce independent point capabilities and permit explicitly granted resolution", async () => {
  const { e } = await running(),
    p = await point(e.id);
  const role = await db.role.create({
    data: { firmId: a.firm.id, roleName: `Point Reader ${randomUUID()}` },
  });
  await db.rolePermission.createMany({
    data: [
      "engagements.view",
      "engagements.view_all",
      "points.view",
      "my_work.view",
    ].map((permissionKey) => ({
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey,
    })),
  });
  const u = await db.user.create({
      data: {
        firmId: a.firm.id,
        roleId: role.id,
        firstName: "Custom",
        lastName: "Reader",
        email: `${randomUUID()}@test.invalid`,
        status: "Active",
      },
    }),
    token = await mint(u.id, a.firm.id);
  expect((await getPoint(token, p.id)).point.id).toBe(p.id);
  await expect(
    act(p.id, { action: "resolve", reason: "Not granted" }, token),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    pointAttachmentUnavailable(token, p.id, true),
  ).rejects.toMatchObject({ status: 403 });
  await db.rolePermission.create({
    data: {
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey: "points.resolve",
    },
  });
  await act(
    p.id,
    { action: "resolve", reason: "Explicitly granted capability" },
    token,
  );
  expect((await getPoint(token, p.id)).point.resolvedByUserId).toBe(u.id);
  await db.rolePermission.deleteMany({
    where: { firmId: a.firm.id, roleId: role.id, permissionKey: "points.view" },
  });
  await expect(getPoint(token, p.id)).rejects.toMatchObject({ status: 403 });
});
test("point override audit rolls back when the independent checklist gate refuses movement", async () => {
  const { e, c, w } = await running(),
    item = c.items[0];
  await updateChecklistItem(a.token, item.id, {
    action: "edit",
    revision: item.revision,
    fields: { itemTitle: item.itemTitle, isRequired: true },
  });
  await point(e.id, { blocking: true });
  await expect(
    move(e.id, { pointOverrideReason: "Point exception only" }),
  ).rejects.toThrow(/Required checklist/);
  expect(
    await db.auditLog.count({
      where: {
        firmId: a.firm.id,
        entityId: w.id,
        action: "point.blocking_override",
      },
    }),
  ).toBe(0);
  await move(e.id, {
    pointOverrideReason: "Point exception",
    checklistOverrideReason: "Checklist exception",
  });
  expect(
    await db.auditLog.count({
      where: {
        firmId: a.firm.id,
        entityId: w.id,
        action: "point.blocking_override",
      },
    }),
  ).toBe(1);
  expect(
    await db.auditLog.count({
      where: {
        firmId: a.firm.id,
        entityId: w.id,
        action: "checklist.required_override",
      },
    }),
  ).toBe(1);
});
async function running(f = a) {
  const t = await saveTemplate(f.token, {
    name: `Points ${randomUUID()}`,
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
    engagementName: "Points engagement",
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
const payload = (extra: Record<string, unknown> = {}) => ({
  pointType: "Question",
  title: "Bank difference",
  description: "Investigate the reconciliation difference.",
  assignedToUserId: a.preparer.id,
  ...extra,
});
async function point(e: string, extra: Record<string, unknown> = {}) {
  return createPoint(a.token, e, payload(extra));
}
async function act(
  pid: string,
  data: Record<string, unknown>,
  token = a.token,
) {
  const p = await db.engagementPoint.findUniqueOrThrow({ where: { id: pid } });
  return changePoint(token, pid, { revision: p.revision, ...data });
}
async function move(
  e: string,
  extra: Record<string, unknown> = {},
  token = a.token,
) {
  const w = (await getWorkflow(a.token, e))!;
  return transitionWorkflow(token, e, {
    action: "Forward",
    currentStageId: w.currentStageId,
    revision: w.revision,
    ...extra,
  });
}
test("all four point types, actor provenance, decimal references and serialized concurrent numbering", async () => {
  const { e } = await running();
  const rows = await Promise.all(
    ["Question", "ReviewPoint", "KnowledgeInstruction", "InternalIssue"].map(
      (pointType) =>
        point(e.id, {
          pointType,
          raisedByUserId: b.admin.id,
          firmId: b.firm.id,
          referenceAmount: "2450.25",
          priorYearAmount: "2000.00",
        }),
    ),
  );
  const points = await db.engagementPoint.findMany({
    where: { engagementId: e.id },
    orderBy: { pointSequence: "asc" },
  });
  expect(points.map((p) => p.pointSequence)).toEqual([1, 2, 3, 4]);
  expect(new Set(points.map((p) => p.pointNumber)).size).toBe(4);
  expect(
    points.every(
      (p) => p.raisedByUserId === a.admin.id && p.firmId === a.firm.id,
    ),
  ).toBe(true);
  expect(
    points.find((p) => p.pointType === "KnowledgeInstruction")!.status,
  ).toBe("Active");
  const detail = await getPoint(a.token, rows[0].id);
  expect(detail.point.referenceAmount).toBe("2450.25");
  expect(detail.history[0].action).toBe("point.created");
  await expect(point(e.id, { referenceAmount: "12.345" })).rejects.toThrow();
});
test("assignment validates active tenant members and record visibility; reassignment preserves responses and audit", async () => {
  const { e } = await running(),
    p = await point(e.id);
  await act(
    p.id,
    { action: "reply", commentText: "Investigating" },
    a.preparer.token,
  );
  await expect(
    act(p.id, {
      action: "assign",
      assignedToUserId: b.admin.id,
      reason: "Foreign",
    }),
  ).rejects.toThrow(/firm/);
  await expect(
    act(p.id, {
      action: "assign",
      assignedToUserId: a.other.id,
      reason: "Hidden",
    }),
  ).rejects.toThrow(/access/);
  await expect(
    act(p.id, { action: "assign", assignedToUserId: a.admin.id, reason: "" }),
  ).rejects.toThrow();
  await act(p.id, {
    action: "assign",
    assignedToUserId: a.admin.id,
    reason: "Manager to review",
  });
  const d = await getPoint(a.token, p.id);
  expect(d.point.assignedToUserId).toBe(a.admin.id);
  expect(d.responses).toHaveLength(1);
  expect(d.history.some((h) => h.action === "point.reassigned")).toBe(true);
  await db.user.update({
    where: { id: a.other.id },
    data: { status: "Inactive" },
  });
  await expect(point(e.id, { assignedToUserId: a.other.id })).rejects.toThrow(
    /active/,
  );
  await db.user.update({
    where: { id: a.other.id },
    data: { status: "Active" },
  });
});
test("threaded replies are chronological and parent-scoped; replies never resolve; histories cannot be deleted", async () => {
  const { e } = await running(),
    p = await point(e.id),
    q = await point(e.id);
  await act(p.id, {
    action: "reply",
    commentText: "Please inspect the deposit.",
    markResponded: false,
  });
  let d = await getPoint(a.token, p.id);
  expect(d.point.status).toBe("Open");
  const parent = d.responses[0];
  await act(
    p.id,
    {
      action: "reply",
      commentText: "Deposit was recorded next month.",
      parentCommentId: parent.id,
    },
    a.preparer.token,
  );
  d = await getPoint(a.token, p.id);
  expect(d.point.status).toBe("Responded");
  expect(d.responses[1].parent?.id).toBe(parent.id);
  expect(d.responses[1].author.id).toBe(a.preparer.id);
  await expect(
    act(q.id, {
      action: "reply",
      commentText: "Wrong thread",
      parentCommentId: parent.id,
    }),
  ).rejects.toThrow(/parent/);
  await expect(
    db.pointResponse.delete({ where: { id: parent.id } }),
  ).rejects.toThrow(/history/);
  await expect(
    db.pointResponse.update({
      where: { id: parent.id },
      data: { commentText: "Rewrite" },
    }),
  ).rejects.toThrow(/history/);
});
test("explicit resolution, clarification, closing and reasoned reopening preserve past completion and responses", async () => {
  const { e } = await running(),
    p = await point(e.id);
  await expect(
    act(p.id, { action: "resolve", reason: "Unauthorized" }, a.preparer.token),
  ).rejects.toThrow();
  await act(p.id, {
    action: "status",
    status: "ClarificationRequired",
    reason: "Explain the difference",
  });
  await act(p.id, { action: "reply", commentText: "Explained" });
  await expect(
    act(p.id, { action: "close", reason: "Skip review" }),
  ).rejects.toThrow(/Resolve/);
  await act(p.id, { action: "resolve", reason: "Evidence reviewed" });
  let d = await getPoint(a.token, p.id);
  expect(d.point.resolvedByUserId).toBe(a.admin.id);
  expect(d.point.resolvedAt).toBeTruthy();
  await expect(
    act(p.id, { action: "status", status: "Open", reason: "Bypass" }),
  ).rejects.toThrow();
  await act(p.id, { action: "close", reason: "Final review complete" });
  await expect(act(p.id, { action: "reopen", reason: "" })).rejects.toThrow();
  await act(p.id, { action: "reopen", reason: "Additional evidence" });
  d = await getPoint(a.token, p.id);
  expect(d.point.status).toBe("Reopened");
  expect(d.point.resolvedAt).toBeNull();
  expect(d.responses).toHaveLength(1);
  expect(d.history.some((h) => h.action === "point.resolved")).toBe(true);
  expect(d.history.some((h) => h.action === "point.closed")).toBe(true);
  expect(d.history.some((h) => h.action === "point.reopened")).toBe(true);
});
test("Knowledge / Instruction uses Active/Archived, cannot block or enter resolution lifecycle", async () => {
  const { e } = await running();
  await expect(
    point(e.id, { pointType: "KnowledgeInstruction", blocking: true }),
  ).rejects.toThrow(/cannot block/);
  const p = await point(e.id, { pointType: "KnowledgeInstruction" });
  await act(p.id, { action: "reply", commentText: "Noted" });
  expect((await getPoint(a.token, p.id)).point.status).toBe("Active");
  await expect(
    act(p.id, { action: "resolve", reason: "Unnecessary" }),
  ).rejects.toThrow();
  await act(p.id, { action: "close", reason: "Superseded instruction" });
  expect((await getPoint(a.token, p.id)).point.status).toBe("Archived");
  await act(p.id, { action: "reopen", reason: "Use again" });
  expect((await getPoint(a.token, p.id)).point.status).toBe("Active");
  await move(e.id);
});
test("calendar-day aging handles firm timezone, DST, reopened dates and resolved exclusions", () => {
  const p = {
    pointType: "Question",
    status: "Reopened",
    createdAt: "2026-03-08T05:59:00Z",
    dueDate: "2026-03-07",
  };
  const now = new Date("2026-03-09T04:01:00Z");
  expect(pointAge(p, "America/Chicago", now)).toBe(1);
  expect(pointAge(p, "Asia/Kolkata", now)).toBe(1);
  expect(
    pointAge({ ...p, status: "Resolved" }, "America/Chicago", now),
  ).toBeNull();
  expect(
    pointAge(
      { ...p, pointType: "KnowledgeInstruction", status: "Active" },
      "UTC",
      now,
    ),
  ).toBeNull();
  expect(pointOverdue(p, "America/Chicago", now)).toBe(true);
  expect([0, 2, 3, 5, 6, 10, 11].map(ageBucket)).toEqual([
    "0–2",
    "0–2",
    "3–5",
    "3–5",
    "6–10",
    "6–10",
    "over 10",
  ]);
  expect(pointAge({ ...p, createdAt: "2030-01-01" }, "UTC", now)).toBe(0);
  const boundary = new Date("2026-10-04T00:30:00Z"),
    raised = { ...p, createdAt: "2026-10-03T22:30:00Z" };
  expect(pointAge(raised, "UTC", boundary)).toBe(1);
  expect(pointAge(raised, "America/Chicago", boundary)).toBe(0);
});
test("workflow blockers apply to current stage and engagement; override audited and final completion rechecks earlier points", async () => {
  const { e, w } = await running(),
    p = await point(e.id, {
      blocking: true,
      workflowStageId: w.currentStageId,
    });
  await expect(move(e.id)).rejects.toThrow(/blocking point/);
  await expect(
    move(e.id, { pointOverrideReason: "Urgent" }, a.preparer.token),
  ).rejects.toThrow();
  await move(e.id, { pointOverrideReason: "Approved temporary exception" });
  expect(
    await db.auditLog.count({
      where: { entityId: w.id, action: "point.blocking_override" },
    }),
  ).toBe(1);
  await move(e.id);
  await expect(move(e.id, { action: "Complete" })).rejects.toThrow(
    /blocking point/,
  );
  await act(p.id, {
    action: "resolve",
    reason: "Prior-stage evidence reviewed",
  });
  await move(e.id, { action: "Complete" });
  await expect(
    act(p.id, { action: "reopen", reason: "Needs work" }),
  ).rejects.toThrow(/Reopen/);
});
test("future-stage blocker permits earlier movement and then blocks its own stage; global blockers block every stage", async () => {
  const { e, w } = await running();
  const future = await point(e.id, {
    blocking: true,
    workflowStageId: w.stages[1].id,
  });
  await move(e.id);
  await expect(move(e.id)).rejects.toThrow(/blocking point/);
  await act(future.id, { action: "resolve", reason: "Reviewed" });
  const global = await point(e.id, { blocking: true });
  await expect(move(e.id)).rejects.toThrow(/blocking point/);
  await act(global.id, { action: "resolve", reason: "Reviewed" });
  await move(e.id);
});
test("checklist links are explicit, tenant/engagement/stage scoped, and neither engine auto-completes the other", async () => {
  const { e, c, w } = await running(),
    other = await running(),
    foreign = await running(b),
    item = c.items[0];
  await expect(
    point(e.id, { checklistItemId: foreign.c.items[0].id }),
  ).rejects.toThrow(/checklist/);
  await expect(
    point(e.id, { checklistItemId: other.c.items[0].id }),
  ).rejects.toThrow(/checklist/);
  await expect(
    point(e.id, { checklistItemId: item.id, workflowStageId: w.stages[1].id }),
  ).rejects.toThrow(/different/);
  const p = await point(e.id, { checklistItemId: item.id });
  expect((await getPoint(a.token, p.id)).point.workflowStageId).toBe(
    item.engagementWorkflowStageId,
  );
  expect(
    (await checklistDetail(a.token, item.id)).relatedPoints.some(
      (r) => r.id === p.id,
    ),
  ).toBe(true);
  await updateChecklistItem(a.token, item.id, {
    revision: item.revision,
    action: "status",
    status: "Completed",
  });
  expect((await getPoint(a.token, p.id)).point.status).toBe("Open");
  await act(p.id, { action: "resolve", reason: "Resolved independently" });
  expect((await getChecklist(a.token, e.id)).items[0].status).toBe("Completed");
  const p2 = await point(e.id);
  await expect(
    db.engagementPoint.update({
      where: { id: p2.id },
      data: {
        checklistItemId: other.c.items[0].id,
        workflowStageId: item.engagementWorkflowStageId,
        engagementWorkflowId: item.engagementWorkflowId,
      },
    }),
  ).rejects.toThrow();
});
test("tenant and record-level checks cover reads, replies, history, assignees and attachments", async () => {
  const { e } = await running(),
    p = await point(e.id);
  for (const token of [b.token, a.other.token]) {
    await expect(getPoint(token, p.id)).rejects.toMatchObject({ status: 404 });
    await expect(listPoints(token, e.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      act(p.id, { action: "reply", commentText: "Forged" }, token),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      pointAttachmentUnavailable(token, p.id, true),
    ).rejects.toMatchObject({ status: 404 });
  }
  await expect(
    pointAttachmentUnavailable(a.token, p.id, true),
  ).rejects.toMatchObject({ status: 503 });
  await expect(
    pointAttachmentUnavailable(a.token, p.id, false),
  ).rejects.toMatchObject({ status: 503 });
  await expect(
    pointAttachmentUnavailable(a.token, p.id, true, randomUUID()),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    createPoint(b.token, e.id, payload({ assignedToUserId: b.admin.id })),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    db.engagementPoint.update({
      where: { id: p.id },
      data: { assignedToUserId: b.admin.id },
    }),
  ).rejects.toThrow();
  await expect(
    db.engagementPoint.update({
      where: { id: p.id },
      data: { raisedByUserId: a.preparer.id },
    }),
  ).rejects.toThrow(/immutable/);
  await expect(
    db.engagementPoint.delete({ where: { id: p.id } }),
  ).rejects.toThrow(/history/);
});
test("simultaneous resolution and reassignment have one winner; failed updates write no partial events", async () => {
  const { e } = await running(),
    p = await point(e.id),
    revision = 1;
  const outcomes = await Promise.allSettled([
    changePoint(a.token, p.id, {
      action: "resolve",
      reason: "Checked",
      revision,
    }),
    changePoint(a.token, p.id, {
      action: "assign",
      assignedToUserId: a.admin.id,
      reason: "Checked",
      revision,
    }),
  ]);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
  expect(
    await db.auditLog.count({
      where: { entityId: p.id, entityType: "EngagementPoint" },
    }),
  ).toBe(2);
});
test("point creation and workflow movement serialize safely and stale workflow forms fail", async () => {
  const { e, w } = await running();
  const outcomes = await Promise.allSettled([
    point(e.id, { blocking: true, workflowStageId: w.currentStageId }),
    transitionWorkflow(a.token, e.id, {
      action: "Forward",
      currentStageId: w.currentStageId,
      revision: w.revision,
    }),
  ]);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
});
test("filtered pagination, summaries, aging and My Work never change planned hours", async () => {
  const { e } = await running(),
    before = await allocationBudget(a.token, e.id);
  for (let i = 0; i < 27; i++)
    await point(e.id, {
      title: `PAGE-${i}`,
      blocking: i === 0,
      dueDate: "2020-01-01",
      priority: i === 0 ? "Urgent" : "Normal",
    });
  const first = await listPoints(a.token, e.id, { q: "PAGE-" }),
    next = await listPoints(a.token, e.id, { q: "PAGE-", page: 2 });
  expect(first.items).toHaveLength(25);
  expect(next.items).toHaveLength(2);
  expect(new Set([...first.items, ...next.items].map((p) => p.id)).size).toBe(
    27,
  );
  expect(first.summary.total).toBe(27);
  expect(
    (
      await listPoints(a.token, e.id, {
        view: "blocking",
        priority: "Urgent",
        raisedByUserId: a.admin.id,
        assignedToUserId: a.preparer.id,
      })
    ).items,
  ).toHaveLength(1);
  expect((await pointSummary(a.token, e.id)).overdue).toBe(27);
  expect(
    (await listPoints(a.preparer.token, null, { q: "PAGE-" }, true)).summary
      .total,
  ).toBe(27);
  await expect(
    listPoints(a.preparer.token, null, { assignedToUserId: a.admin.id }, true),
  ).rejects.toMatchObject({ status: 403 });
  expect(await allocationBudget(a.token, e.id)).toEqual(before);
  expect(
    (await pointOptions(a.token, e.id)).users.some((u) => u.id === a.other.id),
  ).toBe(false);
});

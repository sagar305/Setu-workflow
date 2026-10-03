import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient } from "../src/lib/clients";
import {
  saveEngagement,
  getEngagement,
  changeEngagement,
  listEngagements,
} from "../src/lib/engagements";
import {
  saveTemplate,
  getTemplate,
  listTemplates,
  templateAction,
  setDefaultTemplate,
} from "../src/lib/workflow-templates";
import {
  applyWorkflow,
  getWorkflow,
  transitionWorkflow,
  myWork,
  compatibleTemplates,
} from "../src/lib/workflows";
import { daysInStage } from "../src/lib/workflow-constants";
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
    firmName: `Workflow ${label} ${suffix}`,
    adminEmail: `wf-${label}-${suffix}@test.invalid`,
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
    primaryContact: {firstName:'Test',lastName:'Contact',email:'contact@example.test',phone:'5551234567'},
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
async function move(
  e: string,
  action = "Forward",
  extra: Record<string, unknown> = {},
  token = a.token,
) {
  const w = (await getWorkflow(a.token, e))!;
  return transitionWorkflow(token, e, {
    action,
    revision: w.revision,
    currentStageId: w.currentStageId,
    ...extra,
  });
}
test("admin creates, adds, reorders draft stages and publishes explicit semantics", async () => {
  const d = await saveTemplate(a.token, definition());
  let t = await getTemplate(a.token, d.id);
  expect(t.status).toBe("Draft");
  const stages = [...t.stages];
  [stages[1], stages[2]] = [stages[2], stages[1]];
  stages.splice(3, 0, { ...stages[1], name: "Additional Check" });
  await saveTemplate(a.token, { ...t, stages }, t.id);
  t = await getTemplate(a.token, t.id);
  expect(t.stages.map((s) => s.sequence)).toEqual([10, 20, 30, 40, 50, 60]);
  expect(t.stages[1].name).toBe("Questions");
  await templateAction(a.token, t.id, {
    action: "publish",
    revision: t.revision,
  });
  expect((await getTemplate(a.token, t.id)).status).toBe("Published");
});
test("publish validates start/completion semantics and active meaningful stages", async () => {
  for (const stages of [
    [{ name: "Only", isStart: true, isCompletion: true }],
    [{ name: "A" }, { name: "B", isCompletion: true }],
    [
      { name: "A", isStart: true },
      { name: "B", isCompletion: true, required: false },
    ],
    [
      { name: "A", isStart: true },
      { name: "A", isCompletion: true },
    ],
  ]) {
    const t = await saveTemplate(a.token, { ...definition(), stages });
    await expect(
      templateAction(a.token, t.id, { action: "publish", revision: 1 }),
    ).rejects.toThrow();
  }
});
test("published definitions are immutable in services and database; edits use a new version", async () => {
  const t = await published();
  await expect(
    saveTemplate(a.token, { ...t, name: "Changed" }, t.id),
  ).rejects.toThrow(/new draft/);
  await expect(
    db.workflowTemplate.update({
      where: { id: t.id },
      data: { name: "Changed" },
    }),
  ).rejects.toThrow(/immutable/);
  await expect(
    db.workflowTemplateStage.update({
      where: { id: t.stages[0].id },
      data: { name: "Changed" },
    }),
  ).rejects.toThrow(/immutable/);
  const v = await templateAction(a.token, t.id, {
    action: "version",
    revision: t.revision,
  });
  const next = await getTemplate(a.token, v.id);
  expect(next.versionNumber).toBe(2);
  expect(next.status).toBe("Draft");
  expect(next.familyId).toBe(t.familyId);
  await saveTemplate(
    a.token,
    {
      ...next,
      stages: next.stages.map((s) => ({ ...s, name: s.name + " V2" })),
    },
    next.id,
  );
  expect((await getTemplate(a.token, t.id)).stages[0].name).toBe("Received");
});
test("duplicate copies only blueprint into a separate version-one family", async () => {
  const t = await published(),
    r = await templateAction(a.token, t.id, {
      action: "duplicate",
      revision: t.revision,
    });
  const copy = await getTemplate(a.token, r.id);
  expect(copy.familyId).not.toBe(t.familyId);
  expect(copy.versionNumber).toBe(1);
  expect(copy.stages[1].instructions).toBe("Reconcile accounts.");
  expect(
    await db.engagementWorkflow.count({
      where: { sourceWorkflowTemplateId: copy.id },
    }),
  ).toBe(0);
});
test("draft, archived and incompatible templates cannot be applied", async () => {
  const d = await saveTemplate(a.token, definition()),
    e = await saveEngagement(a.token, payload());
  await expect(
    applyWorkflow(a.token, e.id, { templateId: d.id }),
  ).rejects.toThrow(/Published/);
  const t = await published();
  await templateAction(a.token, t.id, {
    action: "archive",
    revision: t.revision,
  });
  await expect(
    applyWorkflow(a.token, e.id, { templateId: t.id }),
  ).rejects.toThrow(/Published/);
  const other = await db.serviceLine.findFirstOrThrow({
    where: { firmId: a.firm.id, name: "Audit" },
  });
  const x = await saveTemplate(a.token, {
    ...definition(),
    serviceLineId: other.id,
  });
  await templateAction(a.token, x.id, { action: "publish", revision: 1 });
  await expect(
    applyWorkflow(a.token, e.id, { templateId: x.id }),
  ).rejects.toThrow(/compatible/);
});
test("instantiation snapshots every definition, resolves start owner and records audits", async () => {
  const { t, e, w } = await running();
  expect(w.stages).toHaveLength(5);
  expect(w.stages[1]).toMatchObject({
    name: "Preparation",
    instructions: "Reconcile accounts.",
    targetDays: 3,
    sourceTemplateStageId: t.stages[1].id,
  });
  expect(w.currentStage?.assignedUserId).toBe(a.preparer.id);
  expect(w.visits).toHaveLength(1);
  expect(w.movements[0].movementType).toBe("Start");
  expect((await getEngagement(a.token, e.id)).status).toBe("InProgress");
  expect(await db.auditLog.count({ where: { entityId: w.id } })).toBe(2);
});
test("archiving and publishing later versions preserve running snapshots", async () => {
  const { t, e, w } = await running();
  const v = await templateAction(a.token, t.id, {
    action: "version",
    revision: t.revision,
  });
  const draft = await getTemplate(a.token, v.id);
  await saveTemplate(
    a.token,
    {
      ...draft,
      stages: draft.stages.map((s) => ({ ...s, name: s.name + " New" })),
    },
    draft.id,
  );
  await templateAction(a.token, t.id, {
    action: "archive",
    revision: t.revision,
  });
  await move(e.id);
  expect((await getWorkflow(a.token, e.id))!.stages.map((s) => s.name)).toEqual(
    w.stages.map((s) => s.name),
  );
});
test("forward, return and repeat visits preserve structured history and owner transfers", async () => {
  const { e } = await running();
  await move(e.id);
  await move(e.id);
  await move(e.id, "Skip", { comment: "No questions" });
  let w = (await getWorkflow(a.token, e.id))!;
  expect(w.currentStage?.assignedUserId).toBe(a.reviewer.id);
  const preparation = w.stages[1];
  await expect(
    move(e.id, "Return", { targetStageId: preparation.id }),
  ).rejects.toThrow(/reason/);
  await move(
    e.id,
    "Return",
    { targetStageId: preparation.id, comment: "Reconciliation does not tie" },
    a.reviewer.token,
  );
  w = (await getWorkflow(a.token, e.id))!;
  expect(
    w.visits.filter((v) => v.engagementWorkflowStageId === preparation.id),
  ).toHaveLength(2);
  expect(w.stages.filter((s) => s.state === "Current")).toHaveLength(1);
  expect(w.visits.filter((v) => !v.exitedAt)).toHaveLength(1);
  expect(w.lastMove).toMatchObject({
    movementType: "Return",
    fromUserId: a.reviewer.id,
    toUserId: a.preparer.id,
    movedByUserId: a.reviewer.id,
  });
  expect(
    w.visits.filter((v) => v.exitedAt).every((v) => v.exitedAt! >= v.enteredAt),
  ).toBe(true);
});
test("required stages cannot be skipped and non-adjacent forward targets fail", async () => {
  const { e, w } = await running();
  await expect(move(e.id, "Skip", { comment: "Shortcut" })).rejects.toThrow(
    /Required/,
  );
  await expect(
    move(e.id, "Forward", { targetStageId: w.stages[3].id }),
  ).rejects.toThrow(/next stage/);
});
test("reassignment retains assignment segments and original stage age", async () => {
  const { e, w } = await running();
  await move(e.id, "Reassign", {
    assignedUserId: a.manager.id,
    comment: "Cover absence",
  });
  const next = (await getWorkflow(a.token, e.id))!;
  expect(next.currentStage?.enteredAt).toEqual(w.currentStage?.enteredAt);
  expect(next.visits).toHaveLength(2);
  expect(next.movements[0]).toMatchObject({
    movementType: "Reassign",
    fromUserId: a.preparer.id,
    toUserId: a.manager.id,
  });
  expect(
    (await myWork(a.manager.token)).items.some((i) => i.engagementId === e.id),
  ).toBe(true);
});
test("completion and reopening preserve historical completion and synchronize Engagement", async () => {
  const { e } = await running();
  for (let i = 0; i < 4; i++) await move(e.id);
  await move(e.id, "Complete");
  const completed = (await getWorkflow(a.token, e.id))!;
  expect(completed.status).toBe("Completed");
  expect(completed.visits.every((v) => v.exitedAt)).toBe(true);
  expect((await getEngagement(a.token, e.id)).status).toBe("Completed");
  await expect(
    move(e.id, "Reopen", { targetStageId: completed.stages[1].id }),
  ).rejects.toThrow(/reason/);
  await move(
    e.id,
    "Reopen",
    { targetStageId: completed.stages[1].id, comment: "Client correction" },
    a.manager.token,
  );
  const reopened = (await getWorkflow(a.token, e.id))!;
  expect(reopened.status).toBe("Active");
  expect(reopened.completedAt).toEqual(completed.completedAt);
  expect(reopened.movements.some((m) => m.movementType === "Complete")).toBe(
    true,
  );
  const eng = await getEngagement(a.token, e.id);
  expect(eng.status).toBe("InProgress");
  expect(eng.completedDate).toBeNull();
  expect(
    await db.engagementStatusHistory.count({
      where: {
        engagementId: e.id,
        oldStatus: "Completed",
        oldCompletedDate: { not: null },
      },
    }),
  ).toBe(1);
});
test("simultaneous stale transitions yield one winner and one safe conflict", async () => {
  const { e, w } = await running();
  const input = {
    action: "Forward",
    revision: w.revision,
    currentStageId: w.currentStageId,
  };
  const results = await Promise.allSettled([
    transitionWorkflow(a.token, e.id, input),
    transitionWorkflow(a.token, e.id, input),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason,
  ).toMatchObject({ status: 409 });
  const next = (await getWorkflow(a.token, e.id))!;
  expect(next.total).toBe(2);
  expect(next.visits.filter((v) => !v.exitedAt)).toHaveLength(1);
  expect(next.stages.filter((s) => s.state === "Current")).toHaveLength(1);
});
test("failed owner resolution rolls back every transition record", async () => {
  const { e, w } = await running();
  await expect(
    move(e.id, "Forward", { assignedUserId: b.admin.id }),
  ).rejects.toThrow(/firm/);
  const unchanged = (await getWorkflow(a.token, e.id))!;
  expect(unchanged.revision).toBe(w.revision);
  expect(unchanged.total).toBe(w.total);
  expect(unchanged.visits).toEqual(w.visits);
});
test("Firm A cannot read copy edit archive apply or move Firm B resources/history", async () => {
  const { t, e, w } = await running(b);
  expect(
    (await listTemplates(a.token)).items.every((t) => t.firmId === a.firm.id),
  ).toBe(true);
  for (const action of [
    () => getTemplate(a.token, t.id),
    () => saveTemplate(a.token, { ...t }, t.id),
    () =>
      templateAction(a.token, t.id, {
        action: "duplicate",
        revision: t.revision,
      }),
    () =>
      templateAction(a.token, t.id, {
        action: "archive",
        revision: t.revision,
      }),
    () => getWorkflow(a.token, e.id),
    () => compatibleTemplates(a.token, e.id),
    () =>
      transitionWorkflow(a.token, e.id, {
        action: "Forward",
        revision: w.revision,
        currentStageId: w.currentStageId,
      }),
  ])
    await expect(action()).rejects.toMatchObject({ status: 404 });
  const local = await saveEngagement(a.token, payload());
  await expect(
    applyWorkflow(a.token, local.id, { templateId: t.id }),
  ).rejects.toMatchObject({ status: 404 });
});
test("permission and record visibility prevent unauthorized transitions and history access", async () => {
  const { e, w } = await running();
  await expect(getWorkflow(a.other.token, e.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    move(e.id, "Forward", {}, a.reviewer.token),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    move(
      e.id,
      "Reopen",
      { targetStageId: w.stages[0].id, comment: "No" },
      a.preparer.token,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    saveTemplate(a.preparer.token, definition()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    move(e.id, "Reassign", { assignedUserId: a.other.id }),
  ).rejects.toThrow(/access/);
  await move(e.id, "Forward", {}, a.preparer.token);
});
test("database compound keys prevent foreign owners and targets; snapshots and history resist mutation", async () => {
  const { e, w } = await running(),
    foreign = await running(b);
  await expect(
    db.engagementWorkflowStage.update({
      where: { id: w.currentStageId! },
      data: { assignedUserId: b.admin.id },
    }),
  ).rejects.toThrow();
  await expect(
    db.engagementWorkflow.update({
      where: { id: w.id },
      data: { currentStageId: foreign.w.currentStageId },
    }),
  ).rejects.toThrow();
  await expect(
    db.engagementWorkflowStage.update({
      where: { id: w.currentStageId! },
      data: { instructions: "Tamper" },
    }),
  ).rejects.toThrow(/immutable/);
  await expect(
    db.workflowMovement.delete({ where: { id: w.movements[0].id } }),
  ).rejects.toThrow();
  await expect(
    db.stageVisit.delete({ where: { id: w.visits[0].id } }),
  ).rejects.toThrow();
  await expect(
    db.engagementWorkflowStage.update({
      where: { id: w.currentStageId! },
      data: { state: "Completed" },
    }),
  ).rejects.toThrow(/current stage/);
  expect((await getWorkflow(a.token, e.id))!.revision).toBe(1);
});
test("workflow cannot be applied twice and draft edits reject stale revision", async () => {
  const { t, e } = await running();
  await expect(
    applyWorkflow(a.token, e.id, { templateId: t.id }),
  ).rejects.toMatchObject({ status: 409 });
  const d = await saveTemplate(a.token, definition());
  const before = await getTemplate(a.token, d.id);
  await saveTemplate(a.token, before, d.id);
  await expect(saveTemplate(a.token, before, d.id)).rejects.toMatchObject({
    status: 409,
  });
});
test("default template validates compatibility; creation can atomically apply selected workflow", async () => {
  const t = await published();
  await setDefaultTemplate(a.token, a.type.id, { templateId: t.id });
  const e = await saveEngagement(a.token, {
    ...payload(),
    workflowTemplateId: t.id,
  });
  expect((await getWorkflow(a.token, e.id))!.sourceWorkflowTemplateId).toBe(
    t.id,
  );
  await expect(
    setDefaultTemplate(a.token, a.type.id, {
      templateId: (await published(b)).id,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await templateAction(a.token, t.id, {
    action: "archive",
    revision: t.revision,
  });
  expect(
    (await db.engagementType.findUniqueOrThrow({ where: { id: a.type.id } }))
      .defaultWorkflowTemplateId,
  ).toBeNull();
});
test("hold prevents movement, history retains hold and list filters stay paginated", async () => {
  const { e, t } = await running();
  let eng = await getEngagement(a.token, e.id);
  await changeEngagement(
    a.token,
    e.id,
    { status: "OnHold", version: eng.version, statusComment: "Waiting" },
    "status",
  );
  await expect(move(e.id)).rejects.toThrow(/Resume/);
  eng = await getEngagement(a.token, e.id);
  await changeEngagement(
    a.token,
    e.id,
    { status: "InProgress", version: eng.version },
    "status",
  );
  await move(e.id);
  const list = await listEngagements(a.token, {
    workflowTemplateId: t.id,
    workflowOwnerId: a.preparer.id,
    workflowStage: "Preparation",
  });
  expect(list.total).toBe(1);
  expect(list.items[0].id).toBe(e.id);
});
test("manual engagement completion cannot bypass running workflow", async () => {
  const { e } = await running();
  const eng = await getEngagement(a.token, e.id);
  await expect(
    changeEngagement(
      a.token,
      e.id,
      {
        status: "Completed",
        completedDate: "2026-09-29",
        version: eng.version,
      },
      "status",
    ),
  ).rejects.toThrow(/Workflow tab/);
});
test("calendar days use firm-local dates across midnight and DST", () => {
  expect(
    daysInStage(
      "2026-09-29T04:59:00Z",
      "America/Chicago",
      new Date("2026-09-29T05:01:00Z"),
    ),
  ).toBe(1);
  expect(
    daysInStage(
      "2026-03-08T06:00:00Z",
      "America/Chicago",
      new Date("2026-03-09T05:00:00Z"),
    ),
  ).toBe(1);
});

test("Engagement reads do not bypass the separate workflow view permission", async () => {
  const { e, t } = await running();
  const role = await db.role.create({
    data: { firmId: a.firm.id, roleName: "Engagement only " + randomUUID() },
  });
  await db.rolePermission.createMany({
    data: ["engagements.view", "engagements.view_all"].map((permissionKey) => ({
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey,
    })),
  });
  const u = await db.user.create({
      data: {
        firmId: a.firm.id,
        roleId: role.id,
        firstName: "Read",
        lastName: "Engagement",
        email: randomUUID() + "@test.invalid",
        status: "Active",
      },
    }),
    token = await mint(u.id, a.firm.id);
  expect((await getEngagement(token, e.id)).workflow).toBeNull();
  expect(
    (await listEngagements(token, {})).items.every((row) => !row.workflow),
  ).toBe(true);
  await expect(getWorkflow(token, e.id)).rejects.toMatchObject({ status: 403 });
  await expect(
    listEngagements(token, { workflowTemplateId: t.id }),
  ).rejects.toMatchObject({ status: 403 });
});

test("authorized override can recover work when the default owner becomes inactive", async () => {
  const { e } = await running();
  await db.user.update({
    where: { id: a.preparer.id },
    data: { status: "Inactive" },
  });
  try {
    await expect(move(e.id)).rejects.toThrow(/active owner/);
    await move(e.id, "Forward", { assignedUserId: a.manager.id });
    expect(
      (await getWorkflow(a.token, e.id))!.currentStage?.assignedUserId,
    ).toBe(a.manager.id);
  } finally {
    await db.user.update({
      where: { id: a.preparer.id },
      data: { status: "Active" },
    });
  }
});

test("cancelled Engagement retains workflow history and leaves the current work queue", async () => {
  const { e, w } = await running();
  const eng = await getEngagement(a.token, e.id);
  await changeEngagement(
    a.token,
    e.id,
    {
      status: "Cancelled",
      version: eng.version,
      statusComment: "Client withdrew",
    },
    "status",
  );
  await expect(move(e.id)).rejects.toThrow(/Resume/);
  expect(
    (await myWork(a.preparer.token)).items.some((i) => i.engagementId === e.id),
  ).toBe(false);
  expect((await getWorkflow(a.token, e.id))!.total).toBe(w.total);
});

test("workflow-manager capability preserves record visibility and custom role control", async () => {
  const { e, w } = await running();
  const role = await db.role.create({
    data: {
      firmId: a.firm.id,
      roleName: "Custom workflow manager " + randomUUID(),
    },
  });
  await db.rolePermission.createMany({
    data: [
      "engagements.view",
      "workflows.view",
      "workflows.move",
      "workflows.manage",
    ].map((permissionKey) => ({
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey,
    })),
  });
  const user = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: role.id,
      firstName: "Custom",
      lastName: "Manager",
      email: randomUUID() + "@test.invalid",
      status: "Active",
    },
  });
  const token = await mint(user.id, a.firm.id);
  await expect(
    transitionWorkflow(token, e.id, {
      action: "Forward",
      revision: w.revision,
      currentStageId: w.currentStageId,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await db.rolePermission.create({
    data: {
      firmId: a.firm.id,
      roleId: role.id,
      permissionKey: "engagements.view_all",
    },
  });
  await transitionWorkflow(token, e.id, {
    action: "Forward",
    revision: w.revision,
    currentStageId: w.currentStageId,
  });
  await expect(
    move(e.id, "Reassign", { assignedUserId: a.manager.id }, token),
  ).rejects.toMatchObject({ status: 403 });
});

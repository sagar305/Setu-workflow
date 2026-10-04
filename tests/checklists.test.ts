import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient } from "../src/lib/clients";
import { saveEngagement } from "../src/lib/engagements";
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
  getChecklist,
  createChecklistItem,
  updateChecklistItem,
  checklistDetail,
  checklistAttachmentUnavailable,
  myChecklist,
} from "../src/lib/checklists";
import { checklistProgress } from "../src/lib/checklist-validation";
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
  const suffix = randomUUID();
  const f = await provisionFirm({
    firmName: `Checklist ${suffix}`,
    adminEmail: `${suffix}@test.invalid`,
    adminPassword: `Test-${suffix}`,
    timezone: "Asia/Kolkata",
  });
  const token = await mint(f.admin.id, f.firm.id);
  const office = await db.office.create({
    data: {
      firmId: f.firm.id,
      officeName: "Main",
      city: "Delhi",
      state: "DL",
      country: "IN",
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
    clientCode: "CHECK",
    legalName: "Checklist client",
    entityTypeId: entity.id,
    primaryOfficeId: office.id,
    status: "Active",
    serviceLineIds: [service.id],
    primaryContact: {
      firstName: "Test",
      lastName: "Contact",
      email: "contact@example.test",
      phone: "5551234567",
    },
  });
  const preparer = await db.user.create({
    data: {
      firmId: f.firm.id,
      roleId: f.roles[4].id,
      firstName: "Preparer",
      lastName: "Test",
      email: `preparer-${suffix}@test.invalid`,
      status: "Active",
    },
  });
  const other = await db.user.create({
    data: {
      firmId: f.firm.id,
      roleId: f.roles[4].id,
      firstName: "Other",
      lastName: "Test",
      email: `other-${suffix}@test.invalid`,
      status: "Active",
    },
  });
  return {
    ...f,
    token,
    office,
    service,
    type,
    client,
    preparer,
    preparerToken: await mint(preparer.id, f.firm.id),
    other,
    otherToken: await mint(other.id, f.firm.id),
  };
}
let a: Awaited<ReturnType<typeof fixture>>,
  b: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  a = await fixture();
  b = await fixture();
});
afterAll(() => db.$disconnect());
async function running(evidence = false) {
  const t = await saveTemplate(a.token, {
    name: `Checklist ${randomUUID()}`,
    serviceLineId: a.service.id,
    engagementTypeId: a.type.id,
    stages: [
      {
        name: "Preparation",
        isStart: true,
        defaultOwnerType: "Preparer",
        checklistItems: [
          {
            itemTitle: "Bank reconciliation",
            instructions: "Original instructions",
            defaultOwnerType: "Preparer",
            estimatedHours: 2,
            relativeDueDays: 3,
            evidenceRequired: evidence,
          },
          {
            itemTitle: "Optional review",
            isRequired: false,
            defaultOwnerType: "StageOwner",
          },
        ],
      },
      { name: "Final", isCompletion: true },
    ],
  });
  await templateAction(a.token, t.id, { action: "publish", revision: 1 });
  const e = await saveEngagement(a.token, {
    engagementCode: randomUUID(),
    engagementName: "Checklist engagement",
    clientId: a.client.id,
    serviceLineId: a.service.id,
    engagementTypeId: a.type.id,
    officeId: a.office.id,
    partnerId: a.admin.id,
    preparerId: a.preparer.id,
    budgetHours: 20,
  });
  await applyWorkflow(a.token, e.id, { templateId: t.id });
  return { t, e, c: await getChecklist(a.token, e.id) };
}
async function change(
  id: string,
  input: Record<string, unknown>,
  token = a.token,
) {
  const item = await db.engagementChecklistItem.findUniqueOrThrow({
    where: { id },
  });
  return updateChecklistItem(token, id, { revision: item.revision, ...input });
}
async function move(
  eid: string,
  extra: Record<string, unknown> = {},
  token = a.token,
) {
  const w = (await getWorkflow(a.token, eid))!;
  return transitionWorkflow(token, eid, {
    revision: w.revision,
    currentStageId: w.currentStageId,
    action: "Forward",
    ...extra,
  });
}
test("draft definitions reorder, remove, version independently; published definitions are immutable", async () => {
  const { t, e, c } = await running();
  const source = await getTemplate(a.token, t.id);
  expect(c.items).toHaveLength(2);
  expect(c.items[0].assignedUserId).toBe(a.preparer.id);
  expect(c.items[0].dueDate).toBeTruthy();
  await expect(saveTemplate(a.token, source, t.id)).rejects.toThrow(/draft/i);
  await expect(
    db.workflowTemplateChecklistItem.update({
      where: { id: source.stages[0].checklistItems[0].id },
      data: { instructions: "bad" },
    }),
  ).rejects.toThrow(/immutable/i);
  const version = await templateAction(a.token, t.id, {
    action: "version",
    revision: source.revision,
  });
  const draft = await getTemplate(a.token, version.id);
  draft.stages[0].checklistItems.reverse();
  draft.stages[0].checklistItems[0].instructions = "Changed draft";
  draft.stages[0].checklistItems.pop();
  await saveTemplate(a.token, draft, draft.id);
  expect(
    (await getTemplate(a.token, draft.id)).stages[0].checklistItems,
  ).toHaveLength(1);
  expect(
    (await getChecklist(a.token, e.id)).items[0].instructionsSnapshot,
  ).toBe("Original instructions");
  await expect(
    applyWorkflow(a.token, e.id, { templateId: t.id }),
  ).rejects.toThrow(/already/);
  expect((await getChecklist(a.token, e.id)).items).toHaveLength(2);
});
test("completion and reopening retain actor, timestamps, reasons, comments and original completion history", async () => {
  const { c } = await running(),
    item = c.items[0];
  await expect(
    change(item.id, { action: "status", status: "Blocked" }),
  ).rejects.toThrow(/reason/i);
  await expect(
    change(item.id, { action: "status", status: "NotApplicable" }),
  ).rejects.toThrow(/reason/i);
  await change(
    item.id,
    { action: "status", status: "InProgress" },
    a.preparerToken,
  );
  await change(item.id, {
    action: "status",
    status: "Blocked",
    reason: "Awaiting statement",
  });
  await change(
    item.id,
    { action: "comment", commentText: "Statement received" },
    a.preparerToken,
  );
  await change(
    item.id,
    { action: "status", status: "Completed" },
    a.preparerToken,
  );
  const completed = await db.engagementChecklistItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(completed.completedByUserId).toBe(a.preparer.id);
  expect(completed.completedAt).toBeTruthy();
  await expect(
    change(item.id, { action: "status", status: "NotStarted" }),
  ).rejects.toThrow(/Reopen/);
  await change(item.id, { action: "reopen", reason: "Review adjustment" });
  const d = await checklistDetail(a.token, item.id);
  expect(d.comments[0].author?.id).toBe(a.preparer.id);
  expect(d.history.some((h) => h.action === "checklist.completed")).toBe(true);
  expect(d.history.some((h) => h.action === "checklist.reopened")).toBe(true);
  const latest = await db.engagementChecklistItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(latest.completedAt).toBeNull();
  expect(latest.status).toBe("InProgress");
});
test("Not Applicable excluded from deterministic progress; zero applicable defined", () => {
  const items = [
    ...Array.from({ length: 6 }, () => ({ status: "Completed" })),
    { status: "NotStarted" },
    { status: "Blocked" },
    { status: "NotApplicable" },
    { status: "NotApplicable" },
  ];
  expect(checklistProgress(items)).toMatchObject({
    total: 10,
    applicable: 8,
    completed: 6,
    percent: 75,
  });
  expect(checklistProgress([]).percent).toBe(0);
});
test("manual items, ownership, estimates, My Work and planned hours remain separate", async () => {
  const { e, c, t } = await running();
  const before = await allocationBudget(a.token, e.id);
  const result = await createChecklistItem(a.token, e.id, {
    itemTitle: "Extra check",
    stageId: c.workflow!.currentStageId,
    workflowRevision: c.workflow!.revision,
    assignedUserId: a.preparer.id,
    estimatedHours: 12,
  });
  expect(
    (await myChecklist(a.preparerToken)).items.some((i) => i.id === result.id),
  ).toBe(true);
  await change(result.id, {
    action: "assign",
    assignedUserId: a.admin.id,
    reason: "Manager review",
  });
  expect(
    (await myChecklist(a.preparerToken)).items.some((i) => i.id === result.id),
  ).toBe(false);
  expect(await allocationBudget(a.token, e.id)).toEqual(before);
  expect(
    (await getTemplate(a.token, t.id)).stages[0].checklistItems,
  ).toHaveLength(2);
  await expect(
    change(result.id, {
      action: "assign",
      assignedUserId: b.admin.id,
      reason: "bad",
    }),
  ).rejects.toThrow(/firm/);
  await expect(
    change(result.id, {
      action: "assign",
      assignedUserId: a.other.id,
      reason: "hidden",
    }),
  ).rejects.toThrow(/access/);
});
test("required items block movement, authorized override is audited, and N/A satisfies required checks", async () => {
  const { e, c } = await running();
  await expect(move(e.id)).rejects.toThrow(/Required checklist/);
  await expect(
    move(e.id, { checklistOverrideReason: "Urgent" }, a.preparerToken),
  ).rejects.toThrow();
  await move(e.id, { checklistOverrideReason: "Approved exception" });
  expect(
    await db.auditLog.count({
      where: {
        firmId: a.firm.id,
        entityId: c.workflow!.id,
        action: "checklist.required_override",
      },
    }),
  ).toBe(1);
  await expect(
    change(c.items[0].id, { action: "status", status: "Completed" }),
  ).rejects.toThrow(/workflow stage/);
  await expect(move(e.id, { action: "Complete" })).rejects.toThrow(
    /Required checklist/,
  );
  await move(e.id, {
    action: "Return",
    targetStageId: c.workflow!.currentStageId,
    comment: "Resolve checklist",
  });
  await change(c.items[0].id, {
    action: "status",
    status: "NotApplicable",
    reason: "No bank account",
  });
  await move(e.id);
  await move(e.id, { action: "Complete" });
});
test("tenant and record visibility apply to reads, mutations, comments, templates and attachments", async () => {
  const { e, c, t } = await running();
  const item = c.items[0];
  for (const token of [b.token, a.otherToken]) {
    await expect(getChecklist(token, e.id)).rejects.toThrow();
    await expect(checklistDetail(token, item.id)).rejects.toThrow();
    await expect(
      change(item.id, { action: "comment", commentText: "forged" }, token),
    ).rejects.toThrow();
    await expect(
      checklistAttachmentUnavailable(token, item.id, true),
    ).rejects.toThrow();
  }
  await expect(getTemplate(b.token, t.id)).rejects.toThrow();
  await expect(
    change(
      item.id,
      { action: "assign", assignedUserId: a.admin.id, reason: "no permission" },
      a.preparerToken,
    ),
  ).rejects.toThrow();
  await expect(
    checklistAttachmentUnavailable(a.token, item.id, true),
  ).rejects.toMatchObject({ status: 503 });
  await expect(
    checklistAttachmentUnavailable(a.token, item.id, false),
  ).rejects.toMatchObject({ status: 503 });
});
test("evidence cannot be faked by metadata; concurrent status writes have one winner and stale workflow movement fails", async () => {
  const { e, c } = await running(true);
  const item = c.items[0];
  await expect(
    change(item.id, { action: "status", status: "Completed" }),
  ).rejects.toThrow(/storage/);
  const results = await Promise.allSettled(
    ["InProgress", "Blocked"].map((status) =>
      updateChecklistItem(a.token, item.id, {
        action: "status",
        status,
        reason: "Waiting",
        revision: item.revision,
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  await expect(
    transitionWorkflow(a.token, e.id, {
      action: "Forward",
      currentStageId: c.workflow!.currentStageId,
      revision: c.workflow!.revision,
      checklistOverrideReason: "Stale screen",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
test("database rejects cross-tenant owners, missing reasons and deletion of operational history", async () => {
  const { c } = await running();
  const item = c.items[0];
  await expect(
    db.engagementChecklistItem.update({
      where: { id: item.id },
      data: { assignedUserId: b.admin.id },
    }),
  ).rejects.toThrow();
  await expect(
    db.engagementChecklistItem.update({
      where: { id: item.id },
      data: { status: "NotApplicable", reason: "" },
    }),
  ).rejects.toThrow();
  await expect(
    db.engagementChecklistItem.delete({ where: { id: item.id } }),
  ).rejects.toThrow(/cannot be deleted/);
});

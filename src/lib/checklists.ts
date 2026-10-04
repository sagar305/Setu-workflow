import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  audit,
  requirePermission,
  type Database,
  type Principal,
} from "./auth";
import {
  engagementActor,
  engagementMutation,
  engagementVisibility,
  findEngagement,
} from "./engagements";
import { invariant } from "./errors";
import { id } from "./validation";
import {
  checklistAction,
  checklistCreate,
  checklistProgress,
} from "./checklist-validation";
import { workflowPerson } from "./workflow-constants";
const include = {
  assignedUser: workflowPerson,
  completedBy: workflowPerson,
  stage: true,
} as const;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function itemFor(tx: Database, actor: Principal, itemId: string) {
  requirePermission(actor, "checklist.view");
  const item = await tx.engagementChecklistItem.findFirst({
    where: { firmId: actor.firmId, id: id.parse(itemId) },
    include: { assignedUser: workflowPerson, completedBy: workflowPerson },
  });
  invariant(item, "Checklist item not found.", 404);
  await findEngagement(tx, actor, item.engagementId);
  return item;
}
export async function checklistOwner(
  tx: Database,
  actor: Principal,
  engagementId: string,
  userId: string | null,
) {
  if (!userId) return null;
  const user = await tx.user.findFirst({
    where: {
      firmId: actor.firmId,
      id: userId,
      status: "Active",
      role: { active: true },
    },
    include: {
      firm: true,
      primaryOffice: true,
      role: { include: { permissions: true } },
    },
  });
  invariant(user, "Choose an active employee in your firm.");
  requirePermission(user, "engagements.view");
  requirePermission(user, "checklist.view");
  invariant(
    await tx.engagement.findFirst({
      where: { AND: [engagementVisibility(user), { id: engagementId }] },
    }),
    "The employee must already have access to this engagement.",
  );
  return userId;
}
export async function getChecklist(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "checklist.view");
  const e = await findEngagement(db, actor, engagementId);
  const workflow = await db.engagementWorkflow.findFirst({
    where: { firmId: actor.firmId, engagementId: e.id },
    include: { stages: { orderBy: { sequence: "asc" } } },
  });
  const items = await db.engagementChecklistItem.findMany({
    where: { firmId: actor.firmId, engagementId: e.id },
    include,
    orderBy: [
      { stage: { sequence: "asc" } },
      { sequence: "asc" },
      { id: "asc" },
    ],
  });
  const candidates = await db.user.findMany({
    where: { firmId: actor.firmId, status: "Active", role: { active: true } },
    include: {
      firm: true,
      primaryOffice: true,
      role: { include: { permissions: true } },
    },
    orderBy: { firstName: "asc" },
  });
  const users = [];
  for (const u of candidates) {
    if (
      !u.role.permissions.some((p) => p.permissionKey === "checklist.view") ||
      !u.role.permissions.some((p) => p.permissionKey === "engagements.view")
    )
      continue;
    if (
      await db.engagement.findFirst({
        where: { AND: [engagementVisibility(u), { id: e.id }] },
        select: { id: true },
      })
    )
      users.push({ id: u.id, firstName: u.firstName, lastName: u.lastName });
  }
  return {
    items,
    workflow,
    users,
    progress: checklistProgress(items),
    permissions: actor.role.permissions.map((p) => p.permissionKey),
  };
}
export async function checklistDetail(
  token: string | undefined,
  itemId: string,
) {
  const actor = await engagementActor(token, "checklist.view");
  const item = await itemFor(db, actor, itemId);
  const [comments, attachments, history] = await Promise.all([
    db.checklistComment.findMany({
      where: { firmId: actor.firmId, checklistItemId: item.id },
      include: { author: workflowPerson },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.checklistAttachment.findMany({
      where: {
        firmId: actor.firmId,
        checklistItemId: item.id,
        removedAt: null,
      },
      select: {
        id: true,
        fileName: true,
        mediaType: true,
        byteSize: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.auditLog.findMany({
      where: {
        firmId: actor.firmId,
        entityType: "EngagementChecklistItem",
        entityId: item.id,
      },
      include: { actor: workflowPerson },
      orderBy: { timestamp: "asc" },
    }),
  ]);
  return { comments, attachments, history, storageAvailable: false };
}
export function createChecklistItem(
  token: string | undefined,
  engagementId: string,
  input: unknown,
) {
  const data = checklistCreate.parse(input);
  return engagementMutation(token, "checklist.create", async (tx, actor) => {
    requirePermission(actor, "checklist.view");
    const e = await findEngagement(tx, actor, engagementId);
    const w = await tx.engagementWorkflow.findFirst({
      where: { firmId: actor.firmId, engagementId: e.id },
      include: { stages: true },
    });
    invariant(w && w.status === "Active", "An active workflow is required.");
    invariant(
      w.revision === data.workflowRevision,
      "Workflow changed. Refresh and try again.",
      409,
    );
    const stage = w.stages.find((s) => s.id === data.stageId);
    invariant(
      stage && ["NotStarted", "Current"].includes(stage.state),
      "Choose an unfinished workflow stage. Return or reopen the workflow to change a completed stage.",
    );
    if (data.assignedUserId) requirePermission(actor, "checklist.assign");
    const assignedUserId = await checklistOwner(
      tx,
      actor,
      e.id,
      data.assignedUserId,
    );
    const last = await tx.engagementChecklistItem.aggregate({
      where: { firmId: actor.firmId, engagementWorkflowStageId: stage.id },
      _max: { sequence: true },
    });
    const {
      instructions,
      stageId: _stage,
      workflowRevision: _revision,
      dueDate,
      ...fields
    } = data;
    void _stage;
    void _revision;
    const item = await tx.engagementChecklistItem.create({
      data: {
        ...fields,
        assignedUserId,
        dueDate: dueDate ? new Date(dueDate) : null,
        instructionsSnapshot: instructions,
        firmId: actor.firmId,
        engagementId: e.id,
        engagementWorkflowId: w.id,
        engagementWorkflowStageId: stage.id,
        sequence: (last._max.sequence ?? 0) + 10,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
    });
    await tx.engagementWorkflow.update({
      where: { id: w.id },
      data: { revision: { increment: 1 } },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "checklist.created",
      "EngagementChecklistItem",
      item.id,
      json({ after: item }),
    );
    return { id: item.id, message: "Checklist item created." };
  });
}
export function updateChecklistItem(
  token: string | undefined,
  itemId: string,
  input: unknown,
) {
  const data = checklistAction.parse(input);
  const permission =
    data.action === "status"
      ? data.status === "Completed"
        ? "checklist.complete"
        : "checklist.update_status"
      : (
          {
            edit: "checklist.edit",
            assign: "checklist.assign",
            reopen: "checklist.reopen",
            comment: "checklist.comment",
          } as const
        )[data.action];
  return engagementMutation(token, permission, async (tx, actor) => {
    const before = await itemFor(tx, actor, itemId);
    invariant(
      before.revision === data.revision,
      "This checklist item changed. Refresh and try again.",
      409,
    );
    const stage = await tx.engagementWorkflowStage.findUniqueOrThrow({
      where: { id: before.engagementWorkflowStageId },
      include: { workflow: true },
    });
    if (data.action !== "comment")
      invariant(
        stage.workflow.status === "Active" &&
          ["Current", "NotStarted"].includes(stage.state),
        "Return or reopen the workflow stage before changing this item.",
      );
    const patch: Prisma.EngagementChecklistItemUncheckedUpdateInput = {
      revision: { increment: 1 },
      updatedByUserId: actor.id,
    };
    let event: string = data.action;
    if (data.action === "edit") {
      invariant(
        !["Completed", "NotApplicable"].includes(before.status),
        "Reopen the item before editing its requirements.",
      );
      const { instructions, dueDate, ...fields } = data.fields;
      Object.assign(patch, fields, {
        instructionsSnapshot: instructions,
        dueDate: dueDate ? new Date(dueDate) : null,
      });
      event =
        instructions !== before.instructionsSnapshot
          ? "instructions_updated"
          : "edited";
    } else if (data.action === "assign") {
      patch.assignedUserId = await checklistOwner(
        tx,
        actor,
        before.engagementId,
        data.assignedUserId,
      );
      invariant(
        patch.assignedUserId !== before.assignedUserId,
        "Choose a different employee.",
      );
      event = before.assignedUserId ? "reassigned" : "assigned";
    } else if (data.action === "comment") {
      await tx.checklistComment.create({
        data: {
          firmId: actor.firmId,
          checklistItemId: before.id,
          authorUserId: actor.id,
          commentText: data.commentText,
        },
      });
      event = "comment_added";
    } else if (data.action === "reopen") {
      invariant(
        ["Completed", "NotApplicable"].includes(before.status),
        "Only completed or not applicable items can be reopened.",
      );
      Object.assign(patch, {
        status: "InProgress",
        reason: data.reason,
        completedAt: null,
        completedByUserId: null,
        startedAt: before.startedAt ?? new Date(),
      });
      event = "reopened";
    } else {
      invariant(
        !["Completed", "NotApplicable"].includes(before.status),
        "Use Reopen to change a completed or not applicable item.",
      );
      invariant(data.status !== before.status, "Choose a different status.");
      if (["Blocked", "NotApplicable"].includes(data.status))
        invariant(data.reason.length > 0, "A reason is required.");
      if (data.status === "Completed") {
        // Metadata alone is not proof of persisted evidence. Storage is unavailable in this build.
        invariant(
          !before.evidenceRequired,
          "Persistent evidence storage is not configured. This evidence-required item cannot be completed.",
        );
        patch.completedAt = new Date();
        patch.completedByUserId = actor.id;
      }
      Object.assign(patch, { status: data.status, reason: data.reason });
      if (data.status !== "NotStarted")
        patch.startedAt = before.startedAt ?? new Date();
      event = {
        Completed: "completed",
        Blocked: "blocked",
        NotApplicable: "not_applicable",
        InProgress: "status_changed",
        NotStarted: "status_changed",
      }[data.status];
    }
    const changed = await tx.engagementChecklistItem.updateMany({
      where: { firmId: actor.firmId, id: before.id, revision: data.revision },
      data: patch,
    });
    invariant(
      changed.count === 1,
      "Checklist changed. Refresh and try again.",
      409,
    );
    const after = await tx.engagementChecklistItem.findUniqueOrThrow({
      where: { id: before.id },
      include: { assignedUser: workflowPerson, completedBy: workflowPerson },
    });
    if (data.action !== "comment" && data.action !== "assign")
      await tx.engagementWorkflow.update({
        where: { id: before.engagementWorkflowId },
        data: { revision: { increment: 1 } },
      });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      `checklist.${event}`,
      "EngagementChecklistItem",
      before.id,
      json({
        before,
        after,
        ...("reason" in data ? { reason: data.reason } : {}),
        ...(data.action === "comment" ? { commentText: data.commentText } : {}),
      }),
    );
    return { message: "Checklist updated." };
  });
}
export async function checklistAttachmentUnavailable(
  token: string | undefined,
  itemId: string,
  write = false,
) {
  const actor = await engagementActor(
    token,
    write ? "checklist.attach" : "checklist.view",
  );
  await itemFor(db, actor, itemId);
  invariant(
    false,
    "Persistent attachment storage is not configured. Uploads and downloads are unavailable.",
    503,
  );
}
export async function myChecklist(token: string | undefined, page = 1) {
  z.number().int().min(1).max(100000).parse(page);
  const actor = await engagementActor(token, "my_work.view");
  requirePermission(actor, "checklist.view");
  const where: Prisma.EngagementChecklistItemWhereInput = {
    firmId: actor.firmId,
    assignedUserId: actor.id,
    engagement: engagementVisibility(actor),
  };
  const [items, total] = await Promise.all([
    db.engagementChecklistItem.findMany({
      where,
      include: {
        ...include,
        engagement: { include: { client: { select: { displayName: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    db.engagementChecklistItem.count({ where }),
  ]);
  return { items, total, page };
}

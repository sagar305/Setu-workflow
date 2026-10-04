import { checklistOwner } from "./checklists";
import { checklistProgress } from "./checklist-validation";
import { z } from "zod";
import type {
  Engagement,
  EngagementWorkflowStage,
  Prisma,
} from "@prisma/client";
import { db } from "./db";
import {
  requirePermission,
  hasPermission,
  audit,
  type Database,
  type Principal,
} from "./auth";
import {
  engagementActor,
  engagementMutation,
  findEngagement,
  engagementVisibility,
  engagementEvent,
} from "./engagements";
import {
  findTemplate,
  templateInclude,
  visibleTemplateChecklist,
} from "./workflow-templates";
import { invariant } from "./errors";
import { id } from "./validation";
import { transitionInput } from "./workflow-validation";
import { workflowPerson, daysInStage } from "./workflow-constants";
import { firmDates } from "./engagement-constants";
import { nullableId } from "./engagement-validation";
export const movementInclude = {
  fromStage: { select: { name: true } },
  toStage: { select: { name: true } },
  fromUser: workflowPerson,
  toUser: workflowPerson,
  movedBy: workflowPerson,
} as const;
export const workflowSummaryInclude = {
  currentStage: { include: { assignedUser: workflowPerson } },
  movements: {
    take: 1,
    orderBy: { revision: "desc" as const },
    include: movementInclude,
  },
};
export async function compatibleTemplates(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "workflows.apply");
  const e = await findEngagement(db, actor, engagementId);
  const templates = await db.workflowTemplate.findMany({
    where: {
      firmId: actor.firmId,
      status: "Published",
      active: true,
      serviceLineId: e.serviceLineId,
      OR: [
        { engagementTypeId: null },
        { engagementTypeId: e.engagementTypeId },
      ],
    },
    include: templateInclude,
    orderBy: [{ name: "asc" }, { versionNumber: "desc" }],
  });
  return templates.map((t) => visibleTemplateChecklist(actor, t));
}
export async function getWorkflow(
  token: string | undefined,
  engagementId: string,
  page = 1,
) {
  const actor = await engagementActor(token, "workflows.view");
  const e = await findEngagement(db, actor, engagementId);
  z.number().int().min(1).max(100000).parse(page);
  const workflow = await db.engagementWorkflow.findFirst({
    where: { firmId: actor.firmId, engagementId: e.id },
    include: {
      stages: {
        orderBy: { sequence: "asc" },
        include: { assignedUser: workflowPerson },
      },
      ...workflowSummaryInclude,
      checklistItems: {
        select: {
          status: true,
          isRequired: true,
          engagementWorkflowStageId: true,
        },
      },
    },
  });
  if (!workflow) return null;
  const where = { firmId: actor.firmId, engagementWorkflowId: workflow.id };
  const [movements, total, visits, visitTotal] = await Promise.all([
    db.workflowMovement.findMany({
      where,
      include: movementInclude,
      orderBy: { revision: "desc" },
      skip: (page - 1) * 25,
      take: 25,
    }),
    db.workflowMovement.count({ where }),
    db.stageVisit.findMany({
      where,
      include: {
        stage: { select: { name: true } },
        assignedUser: workflowPerson,
      },
      orderBy: [{ enteredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 25,
      take: 25,
    }),
    db.stageVisit.count({ where }),
  ]);
  return {
    ...workflow,
    checklistProgress: checklistProgress(
      workflow.checklistItems.filter(
        (i) => i.engagementWorkflowStageId === workflow.currentStageId,
      ),
    ),
    movements,
    total,
    visits,
    visitTotal,
    page,
    timezone: actor.firm.timezone,
    daysInStage: daysInStage(
      workflow.currentStage?.enteredAt,
      actor.firm.timezone,
    ),
    lastMove: workflow.movements[0] ?? null,
  };
}
export function canManageWorkflow(
  actor: Principal,
  e: Pick<Engagement, "partnerId" | "managerId">,
) {
  return (
    hasPermission(actor, "workflows.manage") ||
    e.partnerId === actor.id ||
    e.managerId === actor.id
  );
}
function defaultOwner(
  e: Engagement,
  stage: Pick<EngagementWorkflowStage, "defaultOwnerType" | "specificUserId">,
) {
  const slot = (
    {
      Partner: "partnerId",
      Manager: "managerId",
      Reviewer: "reviewerId",
      Preparer: "preparerId",
    } as const
  )[stage.defaultOwnerType as "Partner"];
  return stage.defaultOwnerType === "SpecificUser"
    ? stage.specificUserId
    : slot
      ? e[slot]
      : null;
}
export async function resolveOwner(
  tx: Database,
  actor: Principal,
  e: Engagement,
  stage: Pick<EngagementWorkflowStage, "defaultOwnerType" | "specificUserId">,
  override?: string | null,
) {
  const userId = override !== undefined ? override : defaultOwner(e, stage);
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
  invariant(user, "Select an active owner in your firm.");
  requirePermission(user, "engagements.view");
  requirePermission(user, "workflows.view");
  // Current ownership never grants access to an otherwise hidden engagement.
  invariant(
    await tx.engagement.findFirst({
      where: { AND: [engagementVisibility(user), { id: e.id }] },
      select: { id: true },
    }),
    "The selected owner must have access to this Engagement. Assign an appropriate Engagement staffing slot first.",
  );
  return userId;
}
async function syncStatus(
  tx: Database,
  actor: Principal,
  e: Engagement,
  status: "InProgress" | "Completed",
  comment: string,
  now: Date,
) {
  const completedDate =
    status === "Completed"
      ? new Date(firmDates(actor.firm.timezone, now).today)
      : null;
  invariant(
    !completedDate || !e.actualStartDate || completedDate >= e.actualStartDate,
    "Completion cannot precede the Engagement actual start date.",
  );
  await tx.engagement.update({
    where: { firmId_id: { firmId: actor.firmId, id: e.id } },
    data: {
      status,
      completedDate,
      updatedByUserId: actor.id,
      version: { increment: 1 },
    },
  });
  if (e.status !== status) {
    await tx.engagementStatusHistory.create({
      data: {
        firmId: actor.firmId,
        engagementId: e.id,
        oldStatus: e.status,
        newStatus: status,
        oldCompletedDate: e.completedDate,
        newCompletedDate: completedDate,
        actorUserId: actor.id,
        comment,
      },
    });
    await engagementEvent(
      tx,
      actor,
      e.id,
      "status_changed",
      `${e.status} → ${status}. ${comment}`,
      {
        oldCompletedDate: e.completedDate?.toISOString() ?? null,
        newCompletedDate: completedDate?.toISOString() ?? null,
      },
    );
  }
}
export async function applyWorkflowInTransaction(
  tx: Database,
  actor: Principal,
  engagementId: string,
  templateId: string,
) {
  requirePermission(actor, "workflows.apply");
  requirePermission(actor, "workflows.start");
  requirePermission(actor, "workflows.view");
  const e = await findEngagement(tx, actor, engagementId);
  invariant(
    canManageWorkflow(actor, e),
    "Only the Engagement Manager, Partner, or workflow manager can apply a workflow.",
    403,
  );
  invariant(
    !["Completed", "Cancelled", "OnHold"].includes(e.status),
    "Apply a workflow to an active Engagement.",
  );
  invariant(
    !(await tx.engagementWorkflow.findFirst({
      where: { firmId: actor.firmId, engagementId: e.id },
    })),
    "This Engagement already has a workflow.",
    409,
  );
  const template = await findTemplate(tx, actor, templateId);
  invariant(
    template.status === "Published" && template.active,
    "Choose an active Published workflow template.",
  );
  invariant(
    template.serviceLineId === e.serviceLineId &&
      (!template.engagementTypeId ||
        template.engagementTypeId === e.engagementTypeId),
    "This workflow template is not compatible with the Engagement.",
  );
  const definitions = template.stages.filter((s) => s.active),
    now = new Date();
  invariant(
    definitions.length >= 2 &&
      definitions.filter((s) => s.isStart).length === 1 &&
      definitions[0].isStart &&
      definitions.filter((s) => s.isCompletion).length === 1 &&
      definitions.at(-1)!.isCompletion,
    "Template stage semantics are invalid.",
  );
  const workflow = await tx.engagementWorkflow.create({
    data: {
      firmId: actor.firmId,
      engagementId: e.id,
      sourceWorkflowTemplateId: template.id,
      sourceTemplateVersion: template.versionNumber,
      templateNameSnapshot: template.name,
      startedAt: now,
    },
  });
  for (const s of definitions) {
    const runtimeStage = await tx.engagementWorkflowStage.create({
      data: {
        firmId: actor.firmId,
        engagementWorkflowId: workflow.id,
        sourceTemplateStageId: s.id,
        name: s.name,
        description: s.description,
        sequence: s.sequence,
        category: s.category,
        targetDays: s.targetDays,
        instructions: s.instructions,
        defaultOwnerType: s.defaultOwnerType,
        specificUserId: s.specificUserId,
        required: s.required,
        isStart: s.isStart,
        isCompletion: s.isCompletion,
      },
    });
    for (const item of s.checklistItems.filter((i) => i.active)) {
      const slots = {
        Preparer: e.preparerId,
        Reviewer: e.reviewerId,
        Manager: e.managerId,
        Partner: e.partnerId,
      };
      const candidate =
        item.defaultOwnerType === "StageOwner"
          ? defaultOwner(e, runtimeStage)
          : item.defaultOwnerType === "SpecificUser"
            ? item.specificUserId
            : (slots[item.defaultOwnerType as keyof typeof slots] ?? null);
      const assignedUserId = await checklistOwner(tx, actor, e.id, candidate);
      const dueDate =
        item.relativeDueDays === null
          ? null
          : new Date(firmDates(actor.firm.timezone, now).today);
      if (dueDate)
        dueDate.setUTCDate(dueDate.getUTCDate() + item.relativeDueDays!);
      const created = await tx.engagementChecklistItem.create({
        data: {
          firmId: actor.firmId,
          engagementId: e.id,
          engagementWorkflowId: workflow.id,
          engagementWorkflowStageId: runtimeStage.id,
          sourceTemplateChecklistItemId: item.id,
          itemCode: item.itemCode,
          itemTitle: item.itemTitle,
          description: item.description,
          instructionsSnapshot: item.instructions,
          sequence: item.sequence,
          estimatedHours: item.estimatedHours,
          isRequired: item.isRequired,
          evidenceRequired: item.evidenceRequired,
          assignedUserId,
          dueDate,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        },
      });
      await audit(
        tx,
        actor.firmId,
        actor.id,
        "checklist.created",
        "EngagementChecklistItem",
        created.id,
        { sourceId: item.id, assignedUserId, instructions: item.instructions },
      );
    }
  }
  const start = await tx.engagementWorkflowStage.findFirstOrThrow({
    where: {
      firmId: actor.firmId,
      engagementWorkflowId: workflow.id,
      isStart: true,
    },
  });
  const assignedUserId = await resolveOwner(tx, actor, e, start);
  await tx.engagementWorkflowStage.update({
    where: { id: start.id },
    data: { state: "Current", enteredAt: now, assignedUserId },
  });
  await tx.stageVisit.create({
    data: {
      firmId: actor.firmId,
      engagementWorkflowId: workflow.id,
      engagementWorkflowStageId: start.id,
      assignedUserId,
      enteredAt: now,
    },
  });
  await tx.engagementWorkflow.update({
    where: { id: workflow.id },
    data: { currentStageId: start.id },
  });
  await tx.workflowMovement.create({
    data: {
      firmId: actor.firmId,
      engagementWorkflowId: workflow.id,
      toStageId: start.id,
      movementType: "Start",
      toUserId: assignedUserId,
      movedByUserId: actor.id,
      movedAt: now,
      revision: 1,
    },
  });
  await syncStatus(tx, actor, e, "InProgress", "Workflow started.", now);
  await audit(
    tx,
    actor.firmId,
    actor.id,
    "workflow.applied",
    "EngagementWorkflow",
    workflow.id,
    { templateId: template.id, version: template.versionNumber },
  );
  await audit(
    tx,
    actor.firmId,
    actor.id,
    "workflow.started",
    "EngagementWorkflow",
    workflow.id,
    { stageId: start.id, assignedUserId },
  );
  return { id: workflow.id, message: "Workflow applied and started." };
}
export function applyWorkflow(
  token: string | undefined,
  engagementId: string,
  input: unknown,
) {
  const data = z.object({ templateId: id }).parse(input);
  return engagementMutation(token, "workflows.apply", (tx, actor) =>
    applyWorkflowInTransaction(tx, actor, engagementId, data.templateId),
  );
}
export function transitionWorkflow(
  token: string | undefined,
  engagementId: string,
  input: unknown,
) {
  return engagementMutation(token, "workflows.view", (tx, actor) =>
    transitionWorkflowInTransaction(tx, actor, engagementId, input),
  );
}
export async function transitionWorkflowInTransaction(
  tx: Database,
  actor: Principal,
  engagementId: string,
  input: unknown,
) {
  const data = transitionInput.parse(input);
  const permission = (
    {
      Forward: "workflows.move",
      Return: "workflows.return",
      Reassign: "workflows.reassign",
      Skip: "workflows.skip",
      Complete: "workflows.complete",
      Reopen: "workflows.reopen",
    } as const
  )[data.action];
  requirePermission(actor, permission);
  requirePermission(actor, "workflows.view");
  const e = await findEngagement(tx, actor, engagementId);
  const w = await tx.engagementWorkflow.findFirst({
    where: { firmId: actor.firmId, engagementId: e.id },
    include: { stages: { orderBy: { sequence: "asc" } } },
  });
  invariant(w, "Workflow not found.", 404);
  invariant(
    w.revision === data.revision && w.currentStageId === data.currentStageId,
    "This workflow has changed since you opened it. Refresh to see the latest stage.",
    409,
  );
  const current = w.stages.find((s) => s.id === w.currentStageId)!;
  const manager = canManageWorkflow(actor, e);
  invariant(
    manager || current.assignedUserId === actor.id,
    "Only the current owner or an Engagement workflow manager can perform this action.",
    403,
  );
  if (data.action === "Reopen")
    invariant(
      manager,
      "Only an Engagement Manager, Partner, or workflow manager may reopen.",
      403,
    );
  invariant(
    !["OnHold", "Cancelled"].includes(e.status),
    "Resume the Engagement before moving its workflow.",
  );
  invariant(
    data.action === "Reopen" ? w.status === "Completed" : w.status === "Active",
    "This action is not available for the workflow status.",
  );
  invariant(
    data.action === "Reopen" || current.state === "Current",
    "The stage is no longer Current.",
    409,
  );
  if (["Return", "Skip", "Reopen"].includes(data.action))
    invariant(data.comment.length > 0, "A reason is required.");
  let target = current;
  if (data.action === "Forward" || data.action === "Skip") {
    const next = w.stages.find((s) => s.sequence > current.sequence);
    invariant(next, "Use Complete Workflow at the final stage.");
    target = next;
    invariant(
      !data.targetStageId || data.targetStageId === next.id,
      "Forward movement must use the next stage.",
    );
    if (data.action === "Skip")
      invariant(
        !current.required && !current.isStart && !current.isCompletion,
        "Required stages cannot be skipped.",
      );
  } else if (data.action === "Return" || data.action === "Reopen") {
    const found = w.stages.find((s) => s.id === data.targetStageId);
    invariant(
      found &&
        !found.isCompletion &&
        (data.action === "Reopen" || found.sequence < current.sequence),
      "Select a previous stage in this workflow.",
    );
    target = found;
  } else
    invariant(
      !data.targetStageId || data.targetStageId === current.id,
      "The target must be the current stage.",
    );
  if (data.action === "Complete") {
    invariant(current.isCompletion, "Complete the designated final stage.");
    invariant(
      w.stages.every(
        (s) => s.id === current.id || !s.required || s.state === "Completed",
      ),
      "Complete all required stages before completing the workflow.",
    );
  }
  if (["Forward", "Skip", "Complete"].includes(data.action)) {
    const items = await tx.engagementChecklistItem.findMany({
      where: {
        firmId: actor.firmId,
        engagementWorkflowId: w.id,
        ...(data.action === "Complete"
          ? {}
          : { engagementWorkflowStageId: current.id }),
        isRequired: true,
        status: { notIn: ["Completed", "NotApplicable"] },
      },
    });
    if (items.length) {
      invariant(
        data.checklistOverrideReason.length > 0,
        "Required checklist items are outstanding. Complete them or provide an authorized override reason.",
      );
      requirePermission(actor, "checklist.override_required");
      invariant(
        manager,
        "Only an engagement workflow manager may override required items.",
        403,
      );
      await audit(
        tx,
        actor.firmId,
        actor.id,
        "checklist.required_override",
        "EngagementWorkflow",
        w.id,
        {
          reason: data.checklistOverrideReason,
          itemIds: items.map((i) => i.id),
          stageId: current.id,
          revision: w.revision,
        },
      );
    }
  }
  if (data.action === "Reassign")
    invariant(data.assignedUserId !== undefined, "Select the new owner.");
  let owner = current.assignedUserId;
  if (data.action !== "Complete") {
    const resolved = defaultOwner(e, target);
    if (data.assignedUserId !== undefined && data.assignedUserId !== resolved)
      requirePermission(actor, "workflows.reassign");
    owner = await resolveOwner(tx, actor, e, target, data.assignedUserId);
  }
  if (data.action === "Reassign")
    invariant(owner !== current.assignedUserId, "Select a different owner.");
  const now = new Date(),
    revision = w.revision + 1;
  if (data.action !== "Reopen") {
    const closed = await tx.stageVisit.updateMany({
      where: {
        firmId: actor.firmId,
        engagementWorkflowId: w.id,
        engagementWorkflowStageId: current.id,
        exitedAt: null,
      },
      data: { exitedAt: now, exitType: data.action },
    });
    invariant(
      closed.count === 1,
      "Current visit is inconsistent. Refresh and contact your administrator.",
      409,
    );
  }
  if (data.action !== "Reassign" && data.action !== "Reopen")
    await tx.engagementWorkflowStage.update({
      where: { id: current.id },
      data: {
        state: data.action === "Skip" ? "Skipped" : "Completed",
        ...(data.action === "Skip" ? { skippedAt: now } : { completedAt: now }),
      },
    });
  // A return/reopen invalidates downstream progress, while visits and movements remain immutable history.
  if (data.action === "Return" || data.action === "Reopen")
    await tx.engagementWorkflowStage.updateMany({
      where: {
        firmId: actor.firmId,
        engagementWorkflowId: w.id,
        sequence: { gt: target.sequence },
      },
      data: { state: "NotStarted" },
    });
  if (data.action !== "Complete") {
    await tx.engagementWorkflowStage.update({
      where: { id: target.id },
      data: {
        state: "Current",
        assignedUserId: owner,
        ...(data.action === "Reassign" ? {} : { enteredAt: now }),
      },
    });
    await tx.stageVisit.create({
      data: {
        firmId: actor.firmId,
        engagementWorkflowId: w.id,
        engagementWorkflowStageId: target.id,
        assignedUserId: owner,
        enteredAt: now,
      },
    });
  }
  await tx.engagementWorkflow.update({
    where: { id: w.id },
    data: {
      revision,
      currentStageId: target.id,
      status: data.action === "Complete" ? "Completed" : "Active",
      ...(data.action === "Complete" ? { completedAt: now } : {}),
    },
  });
  await tx.workflowMovement.create({
    data: {
      firmId: actor.firmId,
      engagementWorkflowId: w.id,
      fromStageId: current.id,
      toStageId: target.id,
      movementType: data.action,
      fromUserId: current.assignedUserId,
      toUserId: owner,
      movedByUserId: actor.id,
      comment: data.comment,
      movedAt: now,
      revision,
    },
  });
  if (data.action === "Complete" || data.action === "Reopen")
    await syncStatus(
      tx,
      actor,
      e,
      data.action === "Complete" ? "Completed" : "InProgress",
      `${data.action}: ${data.comment}`,
      now,
    );
  await audit(
    tx,
    actor.firmId,
    actor.id,
    `workflow.${data.action.toLowerCase()}`,
    "EngagementWorkflow",
    w.id,
    {
      fromStageId: current.id,
      toStageId: target.id,
      fromUserId: current.assignedUserId,
      toUserId: owner,
      comment: data.comment,
      revision,
    },
  );
  return { message: "Workflow updated." };
}
export async function myWork(token: string | undefined, input: unknown = {}) {
  const actor = await engagementActor(token, "workflows.view");
  const f = z
    .object({
      due: z.enum(["", "today", "week", "overdue"]).default(""),
      stage: z.string().max(150).default(""),
      clientId: nullableId,
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .parse(input);
  const dates = firmDates(actor.firm.timezone);
  const where: Prisma.EngagementWorkflowWhereInput = {
    firmId: actor.firmId,
    status: "Active",
    currentStage: {
      assignedUserId: actor.id,
      ...(f.stage ? { name: f.stage } : {}),
    },
    engagement: {
      AND: [
        engagementVisibility(actor),
        { status: { notIn: ["Completed", "Cancelled"] } },
        {
          ...(f.clientId ? { clientId: f.clientId } : {}),
          ...(f.due
            ? {
                dueDate:
                  f.due === "today"
                    ? new Date(dates.today)
                    : f.due === "week"
                      ? {
                          gte: new Date(dates.weekStart),
                          lte: new Date(dates.weekEnd),
                        }
                      : { lt: new Date(dates.today) },
              }
            : {}),
        },
      ],
    },
  };
  const [items, total] = await Promise.all([
    db.engagementWorkflow.findMany({
      where,
      include: {
        currentStage: true,
        engagement: {
          include: {
            client: { select: { id: true, displayName: true } },
            manager: workflowPerson,
          },
        },
      },
      orderBy: [{ engagement: { dueDate: "asc" } }, { id: "asc" }],
      skip: (f.page - 1) * 25,
      take: 25,
    }),
    db.engagementWorkflow.count({ where }),
  ]);
  const clients = await db.client.findMany({
    where: {
      firmId: actor.firmId,
      engagements: {
        some: {
          AND: [
            engagementVisibility(actor),
            {
              workflow: {
                status: "Active",
                currentStage: { assignedUserId: actor.id },
              },
            },
          ],
        },
      },
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  return { items, total, clients, filters: f, timezone: actor.firm.timezone };
}

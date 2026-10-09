import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  audit,
  hasPermission,
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
import { workflowPerson } from "./workflow-constants";
import {
  pointCreate,
  pointAction,
  pointFields,
  pointFilters,
  POINT_OPEN_STATUSES,
} from "./point-validation";
import { pointAge, ageBucket, pointOverdue } from "./point-constants";
import { firmDates } from "./engagement-constants";
export const pointInclude = {
  raisedBy: workflowPerson,
  assignedTo: workflowPerson,
  resolvedBy: workflowPerson,
  stage: { select: { id: true, name: true } },
  checklistItem: { select: { id: true, itemTitle: true } },
  engagement: {
    select: {
      id: true,
      engagementName: true,
      client: { select: { displayName: true } },
    },
  },
} as const;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function findPoint(
  tx: Database,
  actor: Principal,
  pointId: string,
) {
  requirePermission(actor, "points.view");
  const p = await tx.engagementPoint.findFirst({
    where: { firmId: actor.firmId, id: id.parse(pointId) },
    include: pointInclude,
  });
  invariant(p, "Point not found.", 404);
  await findEngagement(tx, actor, p.engagementId);
  return p;
}
async function assignee(
  tx: Database,
  actor: Principal,
  engagementId: string,
  userId: string,
) {
  const user = await tx.user.findFirst({
    where: {
      id: userId,
      firmId: actor.firmId,
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
  requirePermission(user, "points.view");
  requirePermission(user, "engagements.view");
  invariant(
    await tx.engagement.findFirst({
      where: { AND: [engagementVisibility(user), { id: engagementId }] },
      select: { id: true },
    }),
    "The employee must already have access to this engagement.",
  );
  return userId;
}
async function links(
  tx: Database,
  actor: Principal,
  engagementId: string,
  data: { workflowStageId: string | null; checklistItemId: string | null },
) {
  let stageId = data.workflowStageId;
  let workflowId: string | null = null;
  if (data.checklistItemId) {
    requirePermission(actor, "checklist.view");
    const item = await tx.engagementChecklistItem.findFirst({
      where: { firmId: actor.firmId, engagementId, id: data.checklistItemId },
    });
    invariant(item, "Choose a checklist item in this engagement.");
    invariant(
      !stageId || stageId === item.engagementWorkflowStageId,
      "The checklist item belongs to a different workflow stage.",
    );
    stageId = item.engagementWorkflowStageId;
    workflowId = item.engagementWorkflowId;
  }
  if (stageId) {
    requirePermission(actor, "workflows.view");
    const stage = await tx.engagementWorkflowStage.findFirst({
      where: {
        firmId: actor.firmId,
        id: stageId,
        workflow: { engagementId, firmId: actor.firmId },
      },
    });
    invariant(stage, "Choose a workflow stage in this engagement.");
    workflowId = stage.engagementWorkflowId;
  }
  return {
    workflowStageId: stageId,
    engagementWorkflowId: workflowId,
    checklistItemId: data.checklistItemId,
  };
}
async function workflowRevision(
  tx: Database,
  actor: Principal,
  engagementId: string,
) {
  await tx.engagementWorkflow.updateMany({
    where: { firmId: actor.firmId, engagementId },
    data: { revision: { increment: 1 } },
  });
}
async function allowBlocking(
  tx: Database,
  actor: Principal,
  engagementId: string,
  stageId: string | null,
  blocking: boolean,
) {
  if (!blocking) return;
  const w = await tx.engagementWorkflow.findFirst({
    where: { firmId: actor.firmId, engagementId },
    include: { stages: true },
  });
  invariant(
    !w || w.status !== "Completed",
    "Reopen the workflow before raising or reopening a blocking point.",
  );
  const stage = w?.stages.find((s) => s.id === stageId);
  invariant(
    !stage || !["Completed", "Skipped"].includes(stage.state),
    "Return the workflow to this stage before introducing an unresolved blocker.",
  );
}
export function createPoint(
  token: string | undefined,
  engagementId: string,
  input: unknown,
  now = new Date(),
) {
  const data = pointCreate.parse(input);
  return engagementMutation(token, "points.create", async (tx, actor) => {
    requirePermission(actor, "points.view");
    requirePermission(actor, "points.assign");
    const e = await findEngagement(tx, actor, engagementId);
    invariant(
      !["Completed", "Cancelled"].includes(e.status),
      "Reopen or resume the engagement before raising points.",
    );
    invariant(
      data.pointType !== "KnowledgeInstruction" || !data.blocking,
      "Knowledge / Instruction points cannot block workflow movement.",
    );
    const assignedToUserId = await assignee(
        tx,
        actor,
        e.id,
        data.assignedToUserId,
      ),
      linked = await links(tx, actor, e.id, data);
    await allowBlocking(tx, actor, e.id, linked.workflowStageId, data.blocking);
    const latest = await tx.engagementPoint.aggregate({
        where: { firmId: actor.firmId, engagementId: e.id },
        _max: { pointSequence: true },
      }),
      pointSequence = (latest._max.pointSequence ?? 0) + 1;
    const row = await tx.engagementPoint.create({
      data: {
        ...data,
        ...linked,
        assignedToUserId,
        firmId: actor.firmId,
        engagementId: e.id,
        pointSequence,
        pointNumber: `${e.engagementCode}-Q${String(pointSequence).padStart(3, "0")}`,
        status: data.pointType === "KnowledgeInstruction" ? "Active" : "Open",
        raisedByUserId: actor.id,
        updatedByUserId: actor.id,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdAt: now,
        updatedAt: now,
      },
      include: pointInclude,
    });
    await workflowRevision(tx, actor, e.id);
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "point.created",
      "EngagementPoint",
      row.id,
      json({ after: row }),
    );
    return { id: row.id, message: "Point raised." };
  });
}
export function changePoint(
  token: string | undefined,
  pointId: string,
  input: unknown,
) {
  const data = pointAction.parse(input);
  const permission = (
    {
      reply: "points.reply",
      assign: "points.assign",
      edit: "points.edit",
      status: "points.edit",
      resolve: "points.resolve",
      reopen: "points.reopen",
      close: "points.close",
    } as const
  )[data.action];
  return engagementMutation(token, permission, async (tx, actor) => {
    const before = await findPoint(tx, actor, pointId);
    invariant(
      before.revision === data.revision,
      "This point changed. Refresh and try again.",
      409,
    );
    const info = before.pointType === "KnowledgeInstruction",
      terminal = ["Resolved", "Closed", "Archived"].includes(before.status);
    const patch: Prisma.EngagementPointUncheckedUpdateInput = {
      revision: { increment: 1 },
      updatedByUserId: actor.id,
    };
    let responseId: string | undefined;
    if (data.action === "reply") {
      invariant(!terminal, "Reopen the point before adding a response.");
      if (data.parentCommentId)
        invariant(
          await tx.pointResponse.findFirst({
            where: {
              firmId: actor.firmId,
              pointId: before.id,
              id: data.parentCommentId,
            },
          }),
          "Reply parent must belong to this point.",
        );
      const response = await tx.pointResponse.create({
        data: {
          firmId: actor.firmId,
          pointId: before.id,
          authorUserId: actor.id,
          commentText: data.commentText,
          parentCommentId: data.parentCommentId,
        },
      });
      responseId = response.id;
      if (!info && data.markResponded) patch.status = "Responded";
    } else if (data.action === "assign") {
      invariant(
        data.assignedToUserId !== before.assignedToUserId,
        "Choose a different employee.",
      );
      patch.assignedToUserId = await assignee(
        tx,
        actor,
        before.engagementId,
        data.assignedToUserId,
      );
    } else if (data.action === "edit") {
      invariant(!terminal, "Reopen the point before editing it.");
      invariant(
        !info || !data.fields.blocking,
        "Knowledge / Instruction points cannot block workflow movement.",
      );
      const linked = await links(tx, actor, before.engagementId, data.fields);
      if (
        data.fields.blocking &&
        (!before.blocking || linked.workflowStageId !== before.workflowStageId)
      )
        await allowBlocking(
          tx,
          actor,
          before.engagementId,
          linked.workflowStageId,
          true,
        );
      Object.assign(patch, data.fields, linked, {
        dueDate: data.fields.dueDate ? new Date(data.fields.dueDate) : null,
      });
    } else if (data.action === "status") {
      invariant(
        !info && !terminal,
        "Use the explicit resolve, reopen or close action for this lifecycle.",
      );
      invariant(data.status !== before.status, "Choose a different status.");
      patch.status = data.status;
    } else if (data.action === "resolve") {
      invariant(
        !info && !terminal,
        "Only an unresolved actionable point can be resolved.",
      );
      Object.assign(patch, {
        status: "Resolved",
        resolvedByUserId: actor.id,
        resolvedAt: new Date(),
      });
    } else if (data.action === "close") {
      invariant(
        info ? before.status === "Active" : before.status === "Resolved",
        info
          ? "Only active instructions can be archived."
          : "Resolve the point before closing it.",
      );
      Object.assign(patch, {
        status: info ? "Archived" : "Closed",
        closedAt: new Date(),
      });
    } else {
      invariant(
        terminal,
        "Only resolved, closed or archived points can be reopened.",
      );
      const e = await findEngagement(tx, actor, before.engagementId);
      invariant(
        !["Completed", "Cancelled"].includes(e.status),
        "Reopen or resume the engagement before reopening a point.",
      );
      await allowBlocking(
        tx,
        actor,
        before.engagementId,
        before.workflowStageId,
        before.blocking,
      );
      Object.assign(patch, {
        status: info ? "Active" : "Reopened",
        resolvedAt: null,
        resolvedByUserId: null,
        closedAt: null,
      });
    }
    const changed = await tx.engagementPoint.updateMany({
      where: { firmId: actor.firmId, id: before.id, revision: data.revision },
      data: patch,
    });
    invariant(
      changed.count === 1,
      "Point changed. Refresh and try again.",
      409,
    );
    const after = await tx.engagementPoint.findUniqueOrThrow({
      where: { id: before.id },
      include: pointInclude,
    });
    if (data.action !== "assign")
      await workflowRevision(tx, actor, before.engagementId);
    const action = {
      reply: "replied",
      assign: "reassigned",
      edit: "edited",
      status: "status_changed",
      resolve: "resolved",
      reopen: "reopened",
      close: info ? "archived" : "closed",
    }[data.action];
    await audit(
      tx,
      actor.firmId,
      actor.id,
      `point.${action}`,
      "EngagementPoint",
      before.id,
      json({
        before,
        after,
        ...("reason" in data ? { reason: data.reason } : {}),
        ...(responseId ? { responseId } : {}),
      }),
    );
    return { message: "Point updated." };
  });
}
export async function pointOptions(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "points.view"),
    e = await findEngagement(db, actor, engagementId);
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
  for (const u of candidates)
    if (
      hasPermission(u, "points.view") &&
      hasPermission(u, "engagements.view") &&
      (await db.engagement.findFirst({
        where: { AND: [engagementVisibility(u), { id: e.id }] },
        select: { id: true },
      }))
    )
      users.push({ id: u.id, firstName: u.firstName, lastName: u.lastName });
  const [stages, checklistItems, participants] = await Promise.all([
    hasPermission(actor, "workflows.view")
      ? db.engagementWorkflowStage.findMany({
          where: { firmId: actor.firmId, workflow: { engagementId: e.id } },
          select: { id: true, name: true },
          orderBy: { sequence: "asc" },
        })
      : [],
    hasPermission(actor, "checklist.view")
      ? db.engagementChecklistItem.findMany({
          where: { firmId: actor.firmId, engagementId: e.id },
          select: {
            id: true,
            itemTitle: true,
            engagementWorkflowStageId: true,
          },
          orderBy: { sequence: "asc" },
        })
      : [],
    db.user.findMany({
      where: {
        firmId: actor.firmId,
        OR: [
          {
            raisedPoints: {
              some: { firmId: actor.firmId, engagementId: e.id },
            },
          },
          {
            assignedPoints: {
              some: { firmId: actor.firmId, engagementId: e.id },
            },
          },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  return {
    users,
    participants: [
      ...new Map([...users, ...participants].map((u) => [u.id, u])).values(),
    ],
    stages,
    checklistItems,
    permissions: actor.role.permissions.map((p) => p.permissionKey),
    userId: actor.id,
    timezone: actor.firm.timezone,
  };
}
async function totals(
  where: Prisma.EngagementPointWhereInput,
  timezone: string,
  now: Date,
) {
  const [total, resolved, open] = await Promise.all([
    db.engagementPoint.count({ where }),
    db.engagementPoint.count({
      where: { AND: [where, { status: "Resolved" }] },
    }),
    db.engagementPoint.findMany({
      where: {
        AND: [
          where,
          {
            pointType: { not: "KnowledgeInstruction" },
            status: { in: [...POINT_OPEN_STATUSES] },
          },
        ],
      },
      select: {
        pointType: true,
        status: true,
        createdAt: true,
        dueDate: true,
        blocking: true,
      },
    }),
  ]);
  const aging = { "0–2": 0, "3–5": 0, "6–10": 0, "over 10": 0 };
  for (const p of open)
    aging[ageBucket(pointAge(p, timezone, now))! as keyof typeof aging]++;
  return {
    total,
    open: open.length,
    awaitingResponse: open.filter((p) => p.status !== "Responded").length,
    resolved,
    blocking: open.filter((p) => p.blocking).length,
    overdue: open.filter((p) => pointOverdue(p, timezone, now)).length,
    aging,
  };
}
export async function pointSummary(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "points.view");
  await findEngagement(db, actor, engagementId);
  return totals(
    { firmId: actor.firmId, engagementId },
    actor.firm.timezone,
    new Date(),
  );
}
export async function listPoints(
  token: string | undefined,
  engagementId: string | null,
  input: unknown = {},
  mine = false,
  now = new Date(),
) {
  const actor = await engagementActor(token, "points.view");
  if (mine) requirePermission(actor, "my_work.view");
  if (engagementId) await findEngagement(db, actor, engagementId);
  else invariant(mine, "Engagement required.");
  const f = pointFilters.parse(input);
  invariant(
    !mine || !f.assignedToUserId || f.assignedToUserId === actor.id,
    "You may only view your own assigned queue.",
    403,
  );
  const where: Prisma.EngagementPointWhereInput = {
    firmId: actor.firmId,
    engagement: engagementVisibility(actor),
    ...(engagementId ? { engagementId } : {}),
    ...(f.q
      ? {
          OR: [
            { title: { contains: f.q, mode: "insensitive" } },
            { description: { contains: f.q, mode: "insensitive" } },
            { pointNumber: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(f.pointType ? { pointType: f.pointType } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(mine
      ? { assignedToUserId: actor.id }
      : f.assignedToUserId
        ? { assignedToUserId: f.assignedToUserId }
        : {}),
    ...(f.raisedByUserId ? { raisedByUserId: f.raisedByUserId } : {}),
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.dueDate ? { dueDate: new Date(f.dueDate) } : {}),
    ...(f.blocking ? { blocking: f.blocking === "yes" } : {}),
    ...(f.workflowStageId ? { workflowStageId: f.workflowStageId } : {}),
    ...(f.checklistItemId ? { checklistItemId: f.checklistItemId } : {}),
    ...(f.view
      ? {
          AND: [
            {
              pointType: { not: "KnowledgeInstruction" },
              status: { in: [...POINT_OPEN_STATUSES] },
            },
            ...(f.view === "blocking" ? [{ blocking: true }] : []),
            ...(f.view === "overdue"
              ? [
                  {
                    dueDate: {
                      lt: new Date(firmDates(actor.firm.timezone, now).today),
                    },
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
  const [rows, summary] = await Promise.all([
    db.engagementPoint.findMany({
      where,
      include: pointInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (f.page - 1) * 25,
      take: 25,
    }),
    totals(where, actor.firm.timezone, now),
  ]);
  const items = rows.map((p) => ({
    ...p,
    referenceAmount: p.referenceAmount?.toString() ?? null,
    priorYearAmount: p.priorYearAmount?.toString() ?? null,
    age: pointAge(p, actor.firm.timezone, now),
    raisedDate: firmDates(actor.firm.timezone, p.createdAt).today,
    overdue: pointOverdue(p, actor.firm.timezone, now),
  }));
  return { items, summary, filters: f, timezone: actor.firm.timezone };
}
export async function getPoint(
  token: string | undefined,
  pointId: string,
  page = 1,
) {
  z.number().int().min(1).max(100000).parse(page);
  const actor = await engagementActor(token, "points.view"),
    point = await findPoint(db, actor, pointId);
  const where = { firmId: actor.firmId, pointId: point.id },
    historyWhere = {
      firmId: actor.firmId,
      entityType: "EngagementPoint",
      entityId: point.id,
    };
  const [responses, responseCount, history, historyCount, attachments] =
    await Promise.all([
      db.pointResponse.findMany({
        where,
        include: {
          author: workflowPerson,
          parent: {
            select: { id: true, commentText: true, author: workflowPerson },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * 25,
        take: 25,
      }),
      db.pointResponse.count({ where }),
      db.auditLog.findMany({
        where: historyWhere,
        include: { actor: workflowPerson },
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        skip: (page - 1) * 25,
        take: 25,
      }),
      db.auditLog.count({ where: historyWhere }),
      db.pointAttachment.findMany({
        where: { ...where, removedAt: null },
        select: {
          id: true,
          responseId: true,
          fileName: true,
          mediaType: true,
          byteSize: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
  return {
    point: {
      ...point,
      referenceAmount: point.referenceAmount?.toString() ?? null,
      priorYearAmount: point.priorYearAmount?.toString() ?? null,
      age: pointAge(point, actor.firm.timezone),
      raisedDate: firmDates(actor.firm.timezone, point.createdAt).today,
      overdue: pointOverdue(point, actor.firm.timezone),
    },
    responses,
    responseCount,
    history,
    historyCount,
    attachments,
    page,
    storageAvailable: false,
    permissions: actor.role.permissions.map((p) => p.permissionKey),
    timezone: actor.firm.timezone,
  };
}
export async function pointAttachmentUnavailable(
  token: string | undefined,
  pointId: string,
  write = false,
  responseId?: string,
) {
  const actor = await engagementActor(
    token,
    write ? "points.attach" : "points.view",
  );
  const point = await findPoint(db, actor, pointId);
  if (responseId)
    invariant(
      await db.pointResponse.findFirst({
        where: {
          firmId: actor.firmId,
          pointId: point.id,
          id: id.parse(responseId),
        },
      }),
      "Response not found.",
      404,
    );
  invariant(
    false,
    "Persistent attachment storage is not configured. Uploads and downloads are unavailable.",
    503,
  );
}
export type PointFields = z.infer<typeof pointFields>;

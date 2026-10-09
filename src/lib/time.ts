import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  audit,
  hasPermission,
  requirePermission,
  tenantMutation,
  type Database,
  type Principal,
} from "./auth";
import {
  engagementActor,
  engagementVisibility,
  findEngagement,
} from "./engagements";
import { firmDates } from "./engagement-constants";
import { invariant } from "./errors";
import { id } from "./validation";
import {
  timeFields,
  timeCreate,
  timeChange,
  hourMetrics,
  businessDate,
} from "./time-validation";
import { z } from "zod";
const snapshot = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const person = {
  select: { id: true, firstName: true, lastName: true },
} as const;
const include = {
  user: person,
  engagement: {
    select: { engagementName: true, client: { select: { displayName: true } } },
  },
  stage: { select: { name: true } },
  checklistItem: { select: { itemTitle: true } },
} as const;

async function validateLinks(
  tx: Database,
  actor: Principal,
  data: z.infer<typeof timeFields>,
) {
  requirePermission(actor, "engagements.view");
  await findEngagement(tx, actor, data.engagementId);
  const checklist = data.checklistItemId
    ? await tx.engagementChecklistItem.findFirst({
        where: {
          id: data.checklistItemId,
          firmId: actor.firmId,
          engagementId: data.engagementId,
        },
      })
    : null;
  invariant(
    !data.checklistItemId || checklist,
    "Checklist item must belong to this engagement.",
  );
  const allocation = data.workAllocationId
    ? await tx.workAllocation.findFirst({
        where: {
          id: data.workAllocationId,
          firmId: actor.firmId,
          engagementId: data.engagementId,
          assignedUserId: actor.id,
          status: { not: "Cancelled" },
        },
      })
    : null;
  invariant(
    !data.workAllocationId || allocation,
    "Select your own active allocation on this engagement.",
  );
  const stageId =
    data.engagementWorkflowStageId ??
    checklist?.engagementWorkflowStageId ??
    allocation?.engagementWorkflowStageId ??
    null;
  const stage = stageId
    ? await tx.engagementWorkflowStage.findFirst({
        where: {
          id: stageId,
          firmId: actor.firmId,
          workflow: { engagementId: data.engagementId },
        },
      })
    : null;
  invariant(!stageId || stage, "Stage must belong to this engagement.");
  invariant(
    !checklist || checklist.engagementWorkflowStageId === stageId,
    "Checklist item and stage must match.",
  );
  invariant(
    !allocation?.engagementWorkflowStageId ||
      allocation.engagementWorkflowStageId === stageId,
    "Allocation and stage must match.",
  );
  return {
    ...data,
    workDate: new Date(data.workDate + "T00:00:00Z"),
    hours: new Prisma.Decimal(data.hours),
    engagementWorkflowStageId: stageId,
    engagementWorkflowId: stage?.engagementWorkflowId ?? null,
  };
}
async function dailyLimit(
  tx: Database,
  actor: Principal,
  date: Date,
  hours: Prisma.Decimal,
  excludeId?: string,
) {
  const total = await tx.timeEntry.aggregate({
    where: {
      firmId: actor.firmId,
      userId: actor.id,
      workDate: date,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    _sum: { hours: true },
  });
  invariant(
    hours.plus(total._sum.hours ?? 0).lte(24),
    "Total time for one work date cannot exceed 24 hours.",
  );
}
export async function createTime(token: string | undefined, input: unknown) {
  const data = timeCreate.parse(input);
  return tenantMutation(token, "time.create", async (tx, actor) => {
    const fields = await validateLinks(tx, actor, data);
    const existing = await tx.timeEntry.findUnique({
      where: {
        firmId_userId_requestId: {
          firmId: actor.firmId,
          userId: actor.id,
          requestId: data.requestId,
        },
      },
    });
    invariant(
      !existing,
      "This time entry was already saved. Refresh to see it.",
      409,
    );
    await dailyLimit(tx, actor, fields.workDate, fields.hours);
    const entry = await tx.timeEntry.create({
      data: {
        ...fields,
        requestId: data.requestId,
        firmId: actor.firmId,
        userId: actor.id,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "time.created",
      "TimeEntry",
      entry.id,
      { engagementId: entry.engagementId, after: snapshot(entry) },
    );
    return entry;
  });
}
export async function changeTime(
  token: string | undefined,
  entryId: string,
  input: unknown,
) {
  id.parse(entryId);
  const data = timeChange.parse(input);
  const permission =
    data.action === "correct"
      ? "time.correct"
      : data.action === "submit"
        ? "time.submit"
        : "time.edit_own";
  return tenantMutation(token, permission, async (tx, actor) => {
    requirePermission(actor, "engagements.view");
    const before = await tx.timeEntry.findFirst({
      where: {
        id: entryId,
        firmId: actor.firmId,
        engagement: engagementVisibility(actor),
        ...(data.action === "correct" ? {} : { userId: actor.id }),
      },
    });
    invariant(before, "Time entry not found.", 404);
    invariant(
      before.revision === data.revision,
      "This entry has changed. Refresh before trying again.",
      409,
    );
    invariant(
      before.status === (data.action === "correct" ? "Submitted" : "Draft"),
      "Finalized time requires an authorized correction; only drafts can be edited, deleted or submitted.",
      409,
    );
    invariant(
      data.action !== "delete" || !before.submittedAt,
      "Previously finalized time cannot be deleted. Correct and resubmit it instead.",
      409,
    );
    let fields: Prisma.TimeEntryUncheckedUpdateManyInput = {};
    if (data.action === "edit") {
      invariant(data.fields, "Time fields are required.");
      invariant(
        data.fields.engagementId === before.engagementId,
        "The engagement cannot change. Create a separate entry.",
      );
      fields = await validateLinks(tx, actor, data.fields);
      await dailyLimit(
        tx,
        actor,
        new Date(data.fields.workDate + "T00:00:00Z"),
        new Prisma.Decimal(data.fields.hours),
        before.id,
      );
    }
    if (data.action === "correct") {
      requirePermission(actor, "time.view_engagement");
      invariant(data.reason, "Enter a correction reason.");
      fields = { status: "Draft" };
    }
    if (data.action === "submit")
      fields = { status: "Submitted", submittedAt: new Date() };
    const where = {
      id: entryId,
      firmId: actor.firmId,
      revision: data.revision,
      status: before.status,
    };
    const changed =
      data.action === "delete"
        ? await tx.timeEntry.deleteMany({ where })
        : await tx.timeEntry.updateMany({
            where,
            data: {
              ...fields,
              updatedByUserId: actor.id,
              revision: { increment: 1 },
            },
          });
    invariant(
      changed.count === 1,
      "This entry has changed. Refresh before trying again.",
      409,
    );
    const after = await tx.timeEntry.findFirst({
      where: { id: entryId, firmId: actor.firmId },
    });
    const action = {
      edit: "edited",
      delete: "deleted",
      submit: "submitted",
      correct: "corrected",
    }[data.action];
    await audit(
      tx,
      actor.firmId,
      actor.id,
      `time.${action}`,
      "TimeEntry",
      entryId,
      {
        engagementId: before.engagementId,
        before: snapshot(before),
        after: snapshot(after),
        reason: data.reason ?? "",
      },
    );
    return {
      message:
        data.action === "correct"
          ? "Returned to draft. The employee can amend and resubmit; previous values remain in audit history."
          : "Time updated.",
    };
  });
}
export async function timeOptions(
  token: string | undefined,
  engagementId?: string,
) {
  const actor = await engagementActor(token);
  invariant(
    hasPermission(actor, "time.create") ||
      hasPermission(actor, "time.edit_own"),
    "You do not have access to this action.",
    403,
  );
  const engagements = await db.engagement.findMany({
    where: engagementVisibility(actor),
    select: {
      id: true,
      engagementName: true,
      client: { select: { displayName: true } },
    },
    orderBy: { engagementName: "asc" },
  });
  if (!engagementId) return { engagements, stages: [], checklist: [] };
  await findEngagement(db, actor, engagementId);
  const [stages, checklist] = await Promise.all([
    db.engagementWorkflowStage.findMany({
      where: { firmId: actor.firmId, workflow: { engagementId } },
      select: { id: true, name: true },
      orderBy: { sequence: "asc" },
    }),
    db.engagementChecklistItem.findMany({
      where: { firmId: actor.firmId, engagementId },
      select: { id: true, itemTitle: true, engagementWorkflowStageId: true },
      orderBy: { sequence: "asc" },
    }),
  ]);
  return { engagements, stages, checklist };
}
export async function myTime(
  token: string | undefined,
  view = "week",
  weekOf?: string,
) {
  const actor = await engagementActor(token, "time.view_own");
  const dates = firmDates(actor.firm.timezone);
  const selected = weekOf
    ? firmDates("UTC", new Date(businessDate.parse(weekOf) + "T00:00:00Z"))
    : null;
  const previous = new Date(dates.weekStart + "T00:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 7);
  const rows = await db.timeEntry.findMany({
    where: {
      firmId: actor.firmId,
      userId: actor.id,
      engagement: engagementVisibility(actor),
      OR: [
        { workDate: { gte: previous, lte: new Date(dates.weekEnd) } },
        ...(selected
          ? [
              {
                workDate: {
                  gte: new Date(selected.weekStart),
                  lte: new Date(selected.weekEnd),
                },
              },
            ]
          : []),
      ],
    },
    include,
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
  });
  const sum = (items: typeof rows) =>
    items.reduce((s, r) => s.plus(r.hours), new Prisma.Decimal(0)).toFixed(2);
  const items = rows.filter((r) => {
    const d = r.workDate.toISOString().slice(0, 10);
    if (selected) return d >= selected.weekStart && d <= selected.weekEnd;
    return view === "today"
      ? d === dates.today
      : view === "previous"
        ? r.workDate >= previous && d < dates.weekStart
        : d >= dates.weekStart && d <= dates.weekEnd;
  });
  return {
    dates,
    selected,
    items,
    today: sum(
      rows.filter((r) => r.workDate.toISOString().slice(0, 10) === dates.today),
    ),
    week: sum(
      rows.filter(
        (r) =>
          r.workDate >= new Date(dates.weekStart) &&
          r.workDate <= new Date(dates.weekEnd),
      ),
    ),
    total: sum(items),
  };
}
export async function engagementHours(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "budget.view");
  const e = await findEngagement(db, actor, engagementId);
  const [planned, actual] = await Promise.all([
    db.workAllocation.groupBy({
      by: ["assignedUserId"],
      where: {
        firmId: actor.firmId,
        engagementId,
        status: { not: "Cancelled" },
      },
      _sum: { allocatedHours: true },
    }),
    db.timeEntry.groupBy({
      by: ["userId"],
      where: { firmId: actor.firmId, engagementId, status: "Submitted" },
      _sum: { hours: true },
    }),
  ]);
  const staff = [e.partnerId, e.managerId, e.reviewerId, e.preparerId].filter(
    (v): v is string => !!v,
  );
  const users = await db.user.findMany({
    where: {
      firmId: actor.firmId,
      id: {
        in: [
          ...new Set([
            ...staff,
            ...planned.map((r) => r.assignedUserId),
            ...actual.map((r) => r.userId),
          ]),
        ],
      },
    },
    select: person.select,
    orderBy: { firstName: "asc" },
  });
  const employees = users.map((u) => {
    const p =
      planned.find((r) => r.assignedUserId === u.id)?._sum.allocatedHours ??
      new Prisma.Decimal(0);
    const a =
      actual.find((r) => r.userId === u.id)?._sum.hours ??
      new Prisma.Decimal(0);
    const role =
      (["partner", "manager", "reviewer", "preparer"] as const)
        .filter((r) => e[`${r}Id`] === u.id)
        .join(", ") || "Contributor";
    return {
      ...u,
      role,
      planned: p.toFixed(2),
      actual: a.toFixed(2),
      difference: p.minus(a).toFixed(2),
    };
  });
  return {
    ...hourMetrics(
      e.budgetHours,
      planned.reduce(
        (s, r) => s.plus(r._sum.allocatedHours ?? 0),
        new Prisma.Decimal(0),
      ),
      actual.reduce((s, r) => s.plus(r._sum.hours ?? 0), new Prisma.Decimal(0)),
    ),
    employees,
  };
}
export async function engagementTime(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "time.view_engagement");
  await findEngagement(db, actor, engagementId);
  return db.timeEntry.findMany({
    where: { firmId: actor.firmId, engagementId },
    include,
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
  });
}

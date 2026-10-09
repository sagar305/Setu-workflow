import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { hasPermission, type Principal } from "./auth";
import { engagementActor, engagementVisibility } from "./engagements";
import { firmDates, isOverdue, STAFF } from "./engagement-constants";
import { businessDate, hourMetrics } from "./time-validation";
import { daysInStage, workflowPerson } from "./workflow-constants";
import { checklistProgress } from "./checklist-validation";
import { pointAge, ageBucket, pointOverdue } from "./point-constants";
import { POINT_OPEN_STATUSES } from "./point-validation";
import { shiftDate } from "./capacity-math";
import { invariant } from "./errors";
import { id } from "./validation";
const optionalDate = z.preprocess(
  (v) => (v === "" ? undefined : v),
  businessDate.optional(),
);
const optionalId = z.preprocess(
  (v) => (v === "" ? undefined : v),
  id.optional(),
);
export const portfolioFilters = z
  .object({
    q: z.string().trim().max(100).default(""),
    scope: z.enum(["active", "all", "completed"]).default("active"),
    engagementId: optionalId,
    clientId: optionalId,
    managerId: optionalId,
    serviceLineId: optionalId,
    dueFrom: optionalDate,
    dueTo: optionalDate,
  })
  .refine(
    (v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo,
    "Due date range is reversed.",
  );
export function managementDashboard(actor: Principal) {
  return (
    hasPermission(actor, "visibility.firm") ||
    hasPermission(actor, "visibility.team") ||
    hasPermission(actor, "capacity.view_team")
  );
}
const name = (u: { firstName: string; lastName: string } | null | undefined) =>
  u ? `${u.firstName} ${u.lastName}` : "Unassigned";
export const EXCEPTION_TYPES = [
  "ENGAGEMENT_OVERDUE",
  "ENGAGEMENT_DUE_SOON",
  "WORKFLOW_STAGNANT",
  "BLOCKING_POINT",
  "POINT_OVERDUE",
  "CHECKLIST_BLOCKED",
  "CHECKLIST_AT_RISK",
  "BUDGET_WARNING",
  "BUDGET_EXCEEDED",
  "CAPACITY_OVERLOAD",
  "UNSCHEDULED_RESPONSIBILITY",
] as const;
export type Exception = {
  id: string;
  type: (typeof EXCEPTION_TYPES)[number];
  priority: "Critical" | "Attention" | "Informational";
  engagementId: string | null;
  subject: string;
  owner: string;
  due: string | null;
  reason: string;
  href: string;
};
export function exceptionPriority(
  type: Exception["type"],
  urgent = false,
): Exception["priority"] {
  if (
    type === "ENGAGEMENT_OVERDUE" ||
    (urgent && ["BLOCKING_POINT", "BUDGET_EXCEEDED"].includes(type))
  )
    return "Critical";
  return type === "UNSCHEDULED_RESPONSIBILITY" ? "Informational" : "Attention";
}
export const priorityOrder = { Critical: 0, Attention: 1, Informational: 2 };
export async function portfolio(
  token: string | undefined,
  input: unknown = {},
  now = new Date(),
  own = false,
) {
  const actor = await engagementActor(token),
    filters = portfolioFilters.parse(input),
    dates = firmDates(actor.firm.timezone, now);
  const rights = {
    workflow: hasPermission(actor, "workflows.view"),
    checklist: hasPermission(actor, "checklist.view"),
    points: hasPermission(actor, "points.view"),
    budget: hasPermission(actor, "budget.view"),
  };
  const where: Prisma.EngagementWhereInput = {
    AND: [
      engagementVisibility(actor),
      {
        ...(filters.scope === "active"
          ? { status: { notIn: ["Completed", "Cancelled"] } }
          : filters.scope === "completed"
            ? { status: "Completed" }
            : {}),
        ...(filters.engagementId ? { id: filters.engagementId } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.managerId ? { managerId: filters.managerId } : {}),
        ...(filters.serviceLineId
          ? { serviceLineId: filters.serviceLineId }
          : {}),
        ...(filters.q
          ? {
              OR: [
                {
                  engagementName: { contains: filters.q, mode: "insensitive" },
                },
                {
                  client: {
                    displayName: { contains: filters.q, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
        ...(filters.dueFrom || filters.dueTo
          ? {
              dueDate: {
                ...(filters.dueFrom ? { gte: new Date(filters.dueFrom) } : {}),
                ...(filters.dueTo ? { lte: new Date(filters.dueTo) } : {}),
              },
            }
          : {}),
      },
      ...(own
        ? [
            {
              OR: [
                ...STAFF.map((k) => ({ [k]: actor.id })),
                { workflow: { currentStage: { assignedUserId: actor.id } } },
                {
                  workAllocations: {
                    some: {
                      firmId: actor.firmId,
                      assignedUserId: actor.id,
                      status: { not: "Cancelled" as const },
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
  // Minimal engagement DTOs, with bounded detailed exports; never silently truncate.
  const engagements = await db.engagement.findMany({
    where,
    select: {
      id: true,
      engagementName: true,
      status: true,
      dueDate: true,
      budgetHours: rights.budget,
      client: { select: { displayName: true } },
      serviceLine: { select: { name: true } },
      partner: workflowPerson,
      manager: workflowPerson,
      preparer: workflowPerson,
      workflow: {
        select: {
          status: true,
          currentStage: {
            select: {
              id: true,
              name: true,
              category: true,
              assignedUser: workflowPerson,
              enteredAt: true,
              targetDays: true,
            },
          },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: 5001,
  });
  invariant(
    engagements.length <= 5000,
    "More than 5,000 engagements match. Narrow the client/name or due-date filters.",
    400,
  );
  const ids = engagements.map((e) => e.id),
    base = { firmId: actor.firmId, engagementId: { in: ids } };
  const [checklist, points, planned, actual, overdueChecklist] =
    await Promise.all([
      rights.checklist
        ? db.engagementChecklistItem.groupBy({
            by: ["engagementId", "status", "isRequired"],
            where: { ...base, ...(own ? { assignedUserId: actor.id } : {}) },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      rights.points
        ? db.engagementPoint.findMany({
            where: {
              ...base,
              pointType: { not: "KnowledgeInstruction" },
              status: { in: [...POINT_OPEN_STATUSES] },
              ...(own ? { assignedToUserId: actor.id } : {}),
            },
            select: {
              id: true,
              engagementId: true,
              pointNumber: true,
              pointType: true,
              status: true,
              priority: true,
              blocking: true,
              dueDate: true,
              createdAt: true,
              raisedBy: workflowPerson,
              assignedTo: workflowPerson,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 10001,
          })
        : Promise.resolve([]),
      rights.budget
        ? db.workAllocation.groupBy({
            by: ["engagementId"],
            where: { ...base, status: { not: "Cancelled" } },
            _sum: { allocatedHours: true },
          })
        : Promise.resolve([]),
      rights.budget
        ? db.timeEntry.groupBy({
            by: ["engagementId"],
            where: { ...base, status: "Submitted" },
            _sum: { hours: true },
          })
        : Promise.resolve([]),
      rights.checklist
        ? db.engagementChecklistItem.groupBy({
            by: ["engagementId"],
            where: {
              ...base,
              status: { notIn: ["Completed", "NotApplicable"] },
              dueDate: { lt: new Date(dates.today) },
              ...(own ? { assignedUserId: actor.id } : {}),
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
  invariant(
    points.length <= 10000,
    "More than 10,000 open points match. Narrow the engagement or date filters.",
    400,
  );
  const pointRows = points.map((p) => ({
    ...p,
    raisedDate: firmDates(actor.firm.timezone, p.createdAt).today,
    age: pointAge(p, actor.firm.timezone, now)!,
    bucket: ageBucket(pointAge(p, actor.firm.timezone, now))!,
    overdue: pointOverdue(p, actor.firm.timezone, now),
    raisedByName: name(p.raisedBy),
    assignedToName: name(p.assignedTo),
    href: `/engagements/${p.engagementId}/points/${p.id}`,
  }));
  const exceptions: Exception[] = [];
  const records = engagements.map((e) => {
    const due = e.dueDate?.toISOString().slice(0, 10) ?? null,
      active = !["Completed", "Cancelled"].includes(e.status);
    const stage = rights.workflow ? e.workflow?.currentStage : null;
    const owner = name(stage?.assignedUser ?? e.preparer ?? e.manager);
    const progress = rights.checklist
      ? checklistProgress(
          checklist
            .filter((c) => c.engagementId === e.id)
            .map((c) => ({
              status: c.status,
              isRequired: c.isRequired,
              count: c._count._all,
            })),
        )
      : null;
    const ep = pointRows.filter((p) => p.engagementId === e.id);
    const hours = rights.budget
      ? hourMetrics(
          e.budgetHours ?? null,
          planned.find((p) => p.engagementId === e.id)?._sum.allocatedHours ??
            new Prisma.Decimal(0),
          actual.find((p) => p.engagementId === e.id)?._sum.hours ??
            new Prisma.Decimal(0),
        )
      : null;
    const stagnant = !!(
      active &&
      e.workflow?.status === "Active" &&
      stage?.enteredAt &&
      stage.targetDays !== null &&
      daysInStage(stage.enteredAt, actor.firm.timezone, now) > stage.targetDays
    );
    const soon = !!(
      active &&
      due &&
      due >= dates.today &&
      due <= shiftDate(dates.today, 3)
    );
    const nearDeadline = !!(active && due && due <= shiftDate(dates.today, 3));
    const add = (
      type: Exception["type"],
      reason: string,
      href = `/engagements/${e.id}`,
      urgent = false,
      key: string = type,
      exceptionOwner = owner,
      exceptionDue = due,
    ) =>
      exceptions.push({
        id: `${e.id}:${key}`,
        engagementId: e.id,
        type,
        priority: exceptionPriority(type, urgent),
        subject: `${e.client.displayName} · ${e.engagementName}`,
        owner: exceptionOwner,
        due: exceptionDue,
        reason,
        href,
      });
    if (isOverdue(e, dates.today))
      add("ENGAGEMENT_OVERDUE", "Engagement deadline has passed.");
    if (soon)
      add("ENGAGEMENT_DUE_SOON", "Engagement is due within 3 calendar days.");
    if (stagnant)
      add(
        "WORKFLOW_STAGNANT",
        `${daysInStage(stage!.enteredAt, actor.firm.timezone, now)} days in ${stage!.name}; target ${stage!.targetDays} days.`,
        `/engagements/${e.id}?tab=workflow`,
      );
    for (const p of ep) {
      if (p.blocking)
        add(
          "BLOCKING_POINT",
          `${p.pointNumber}: unresolved blocking point.`,
          p.href,
          nearDeadline,
          `blocking:${p.id}`,
          p.assignedToName,
          p.dueDate?.toISOString().slice(0, 10) ?? due,
        );
      if (p.overdue)
        add(
          "POINT_OVERDUE",
          `${p.pointNumber}: point deadline has passed.`,
          p.href,
          false,
          `point:${p.id}`,
          p.assignedToName,
          p.dueDate?.toISOString().slice(0, 10) ?? null,
        );
    }
    if (progress?.blocked)
      add(
        "CHECKLIST_BLOCKED",
        `${progress.blocked} checklist item(s) blocked.`,
        `/engagements/${e.id}?tab=checklist`,
      );
    if (progress?.requiredOutstanding && nearDeadline)
      add(
        "CHECKLIST_AT_RISK",
        `${progress.requiredOutstanding} required item(s) outstanding near deadline.`,
        `/engagements/${e.id}?tab=checklist`,
      );
    if (hours?.warnings.includes("Budget exceeded"))
      add(
        "BUDGET_EXCEEDED",
        `${hours.actual}h actual against ${hours.budget}h budget.`,
        `/engagements/${e.id}?tab=hours`,
        new Prisma.Decimal(hours.actual).gte(
          new Prisma.Decimal(hours.budget ?? 0).mul("1.1"),
        ),
      );
    else if (hours?.warnings.some((w) => w.includes("budget consumed")))
      add(
        "BUDGET_WARNING",
        `${hours.used}% of budget consumed.`,
        `/engagements/${e.id}?tab=hours`,
      );
    const reasons = exceptions.filter((x) => x.engagementId === e.id);
    return {
      id: e.id,
      client: e.client.displayName,
      engagement: e.engagementName,
      service: e.serviceLine.name,
      partner: name(e.partner),
      manager: name(e.manager),
      owner,
      due,
      status: e.status,
      active,
      stage: stage?.name ?? null,
      stageCategory: rights.workflow
        ? e.status === "Completed"
          ? "Completed"
          : (stage?.category ?? "Not Started")
        : null,
      stageEntered: stage?.enteredAt ?? null,
      stageDays: stage?.enteredAt
        ? daysInStage(stage.enteredAt, actor.firm.timezone, now)
        : null,
      targetDays: stage?.targetDays ?? null,
      stagnant,
      progress,
      overdueChecklist:
        overdueChecklist.find((c) => c.engagementId === e.id)?._count._all ?? 0,
      openPoints: rights.points ? ep.length : null,
      blockingPoints: rights.points
        ? ep.filter((p) => p.blocking).length
        : null,
      hours,
      exceptions: reasons,
      health: reasons.some((r) => r.priority === "Critical")
        ? "Critical"
        : reasons.length
          ? "Attention"
          : "No exceptions",
      href: `/engagements/${e.id}`,
    };
  });
  exceptions.sort(
    (a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.id.localeCompare(b.id),
  );
  return { dates, filters, rights, records, points: pointRows, exceptions };
}

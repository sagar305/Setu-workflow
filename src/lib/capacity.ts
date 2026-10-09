import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  audit,
  hasPermission,
  requirePermission,
  tenantMutation,
  type Database,
  type Principal,
} from "./auth";
import { engagementActor, engagementVisibility } from "./engagements";
import { managementScope } from "./allocations";
import { businessDate } from "./time-validation";
import { id } from "./validation";
import { invariant } from "./errors";
import {
  capacityPeriod,
  dailyCapacity,
  capacityMetrics,
  dateKey,
} from "./capacity-math";
const optionalId = z.preprocess(
  (v) => (v === "" ? undefined : v),
  id.optional(),
);
const queryInput = z.object({
  week: z.preprocess(
    (v) => (v === "" ? undefined : v),
    businessDate.optional(),
  ),
  weeks: z.coerce
    .number()
    .refine((v) => [1, 2, 4].includes(v))
    .default(1),
  q: z.string().max(100).default(""),
  role: optionalId,
  office: optionalId,
  employee: optionalId,
  inactive: z.enum(["true", "false"]).default("false"),
  available: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().min(0).max(672).optional(),
  ),
  sort: z.enum(["name", "available", "load"]).default("name"),
  load: z
    .enum(["all", "Available", "Near Capacity", "Overloaded", "No capacity"])
    .default("all"),
});
export const adjustmentFields = z
  .object({
    userId: id,
    startDate: businessDate,
    endDate: businessDate,
    adjustmentType: z.enum(["Leave", "Training", "Holiday", "Other"]),
    hoursReduction: z.coerce
      .number()
      .gt(0)
      .max(24)
      .refine(
        (v) => new Prisma.Decimal(v).decimalPlaces() <= 2,
        "Use at most two decimal places.",
      ),
    reason: z.string().trim().min(1).max(1000),
  })
  .refine(
    (v) =>
      v.endDate >= v.startDate &&
      new Date(v.endDate).valueOf() - new Date(v.startDate).valueOf() <=
        365 * 86400000,
    "Choose an ordered period of at most 366 days.",
  )
  .refine((v) => {
    const start = new Date(v.startDate);
    const count = Math.min(
      7,
      (new Date(v.endDate).valueOf() - start.valueOf()) / 86400000 + 1,
    );
    return Array.from(
      { length: Math.max(0, count) },
      (_, i) => (start.getUTCDay() + i) % 7,
    ).some((d) => d >= 1 && d <= 5);
  }, "Select at least one working day (Monday–Friday).");
export function capacityUserScope(actor: Principal): Prisma.UserWhereInput {
  if (hasPermission(actor, "visibility.firm")) return { firmId: actor.firmId };
  const managed = managementScope(actor);
  return {
    firmId: actor.firmId,
    OR: [
      { id: actor.id },
      { managerId: actor.id },
      ...(
        [
          "partnerEngagements",
          "managerEngagements",
          "reviewerEngagements",
          "preparerEngagements",
        ] as const
      ).map((key) => ({ [key]: { some: managed } })),
      {
        workAllocations: {
          some: {
            firmId: actor.firmId,
            status: { not: "Cancelled" },
            engagement: managed,
          },
        },
      },
      {
        workflowStageOwners: {
          some: {
            firmId: actor.firmId,
            currentFor: { some: { status: "Active", engagement: managed } },
          },
        },
      },
      {
        checklistAssigned: {
          some: {
            firmId: actor.firmId,
            status: { notIn: ["Completed", "NotApplicable"] },
            engagement: managed,
          },
        },
      },
    ],
  };
}
async function employee(
  tx: Database,
  actor: Principal,
  userId: string,
  active = true,
) {
  const user = await tx.user.findFirst({
    where: {
      AND: [
        capacityUserScope(actor),
        {
          id: id.parse(userId),
          ...(active ? { status: "Active", role: { active: true } } : {}),
        },
      ],
    },
  });
  invariant(user, "Employee not found in your capacity scope.", 404);
  return user;
}
export async function saveCapacityAdjustment(
  token: string | undefined,
  input: unknown,
  adjustmentId?: string,
) {
  const data = adjustmentFields.parse(input);
  const revision = adjustmentId
    ? z.object({ revision: z.number().int().positive() }).parse(input).revision
    : undefined;
  if (adjustmentId) id.parse(adjustmentId);
  return tenantMutation(token, "capacity.adjust", async (tx, actor) => {
    requirePermission(actor, "capacity.view_team");
    requirePermission(actor, "engagements.view");
    await employee(tx, actor, data.userId);
    const before = adjustmentId
      ? await tx.capacityAdjustment.findFirst({
          where: {
            id: adjustmentId,
            firmId: actor.firmId,
            userId: data.userId,
          },
        })
      : null;
    invariant(!adjustmentId || before, "Adjustment not found.", 404);
    invariant(
      !before || (!before.cancelledAt && before.revision === revision),
      "This adjustment has changed or was cancelled. Refresh first.",
      409,
    );
    const fields = {
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      updatedByUserId: actor.id,
    };
    const result = before
      ? await tx.capacityAdjustment.update({
          where: { firmId_id: { firmId: actor.firmId, id: before.id } },
          data: { ...fields, revision: { increment: 1 } },
        })
      : await tx.capacityAdjustment.create({
          data: { ...fields, firmId: actor.firmId, createdByUserId: actor.id },
        });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      before ? "capacity.adjustment_edited" : "capacity.adjustment_created",
      "CapacityAdjustment",
      result.id,
      {
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: JSON.parse(JSON.stringify(result)),
      },
    );
    return { id: result.id, message: "Capacity adjustment saved." };
  });
}
export async function cancelCapacityAdjustment(
  token: string | undefined,
  adjustmentId: string,
  input: unknown,
) {
  id.parse(adjustmentId);
  const data = z
    .object({
      revision: z.number().int().positive(),
      reason: z.string().trim().min(1).max(1000),
    })
    .parse(input);
  return tenantMutation(token, "capacity.adjust", async (tx, actor) => {
    requirePermission(actor, "capacity.view_team");
    requirePermission(actor, "engagements.view");
    const before = await tx.capacityAdjustment.findFirst({
      where: { id: adjustmentId, firmId: actor.firmId },
    });
    invariant(before, "Adjustment not found.", 404);
    await employee(tx, actor, before.userId, false);
    invariant(
      !before.cancelledAt && before.revision === data.revision,
      "This adjustment has changed or was cancelled. Refresh first.",
      409,
    );
    const after = await tx.capacityAdjustment.update({
      where: { firmId_id: { firmId: actor.firmId, id: before.id } },
      data: {
        cancelledAt: new Date(),
        updatedByUserId: actor.id,
        revision: { increment: 1 },
      },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "capacity.adjustment_cancelled",
      "CapacityAdjustment",
      before.id,
      {
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
        reason: data.reason,
      },
    );
    return { message: "Capacity adjustment cancelled." };
  });
}
export async function teamCapacity(
  token: string | undefined,
  input: unknown = {},
  now = new Date(),
) {
  const actor = await engagementActor(token, "capacity.view_team");
  const f = queryInput.parse(input),
    period = capacityPeriod(actor.firm.timezone, f.week, f.weeks, now);
  if (f.employee) await employee(db, actor, f.employee, false);
  const users = await db.user.findMany({
    where: {
      AND: [
        capacityUserScope(actor),
        {
          ...(f.inactive === "false"
            ? { status: "Active", role: { active: true } }
            : { status: { in: ["Active", "Inactive"] } }),
          ...(f.role ? { roleId: f.role } : {}),
          ...(f.office ? { primaryOfficeId: f.office } : {}),
          ...(f.q
            ? {
                OR: [
                  {
                    firstName: { contains: f.q, mode: "insensitive" as const },
                  },
                  { lastName: { contains: f.q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      weeklyCapacityHours: true,
      status: true,
      roleId: true,
      role: { select: { roleName: true, active: true } },
      primaryOfficeId: true,
      primaryOffice: { select: { officeName: true } },
    },
    orderBy: [{ firstName: "asc" }, { id: "asc" }],
  });
  const ids = users.map((u) => u.id),
    dateRange = { gte: new Date(period.start), lte: new Date(period.end) };
  const visible = engagementVisibility(actor);
  const [planned, adjustments, actual, stages, checklist] = await Promise.all([
    db.workAllocation.groupBy({
      by: ["assignedUserId", "allocationDate"],
      where: {
        firmId: actor.firmId,
        assignedUserId: { in: ids },
        allocationDate: dateRange,
        status: { not: "Cancelled" },
      },
      _sum: { allocatedHours: true },
    }),
    db.capacityAdjustment.findMany({
      where: {
        firmId: actor.firmId,
        userId: { in: ids },
        startDate: { lte: new Date(period.end) },
        endDate: { gte: new Date(period.start) },
        cancelledAt: null,
      },
    }),
    hasPermission(actor, "time.view_engagement") && period.start <= period.today
      ? db.timeEntry.groupBy({
          by: ["userId"],
          where: {
            firmId: actor.firmId,
            userId: { in: ids },
            workDate: {
              gte: new Date(period.start),
              lte: new Date(
                period.end < period.today ? period.end : period.today,
              ),
            },
            status: "Submitted",
            engagement: visible,
          },
          _sum: { hours: true },
        })
      : Promise.resolve([]),
    db.engagementWorkflowStage.findMany({
      where: {
        firmId: actor.firmId,
        assignedUserId: { in: ids },
        currentFor: {
          some: {
            status: "Active",
            engagement: {
              AND: [visible, { status: { notIn: ["Completed", "Cancelled"] } }],
            },
          },
        },
      },
      select: {
        id: true,
        assignedUserId: true,
        name: true,
        workflow: {
          select: {
            engagementId: true,
            engagement: { select: { engagementName: true, dueDate: true } },
          },
        },
      },
    }),
    db.engagementChecklistItem.findMany({
      where: {
        firmId: actor.firmId,
        assignedUserId: { in: ids },
        status: { notIn: ["Completed", "NotApplicable"] },
        stage: { currentFor: { some: { status: "Active" } } },
        engagement: {
          AND: [visible, { status: { notIn: ["Completed", "Cancelled"] } }],
        },
      },
      select: {
        id: true,
        assignedUserId: true,
        engagementId: true,
        engagementWorkflowStageId: true,
        itemTitle: true,
      },
    }),
  ]);
  // Current responsibilities are live, not forecasts. A dated unfinished allocation anywhere covers a responsibility, matching Build #5.
  const responsibilityEngagements = [
    ...new Set([
      ...stages.map((s) => s.workflow.engagementId),
      ...checklist.map((c) => c.engagementId),
    ]),
  ];
  const coverage = responsibilityEngagements.length
    ? await db.workAllocation.findMany({
        where: {
          firmId: actor.firmId,
          assignedUserId: { in: ids },
          engagementId: { in: responsibilityEngagements },
          status: { notIn: ["Completed", "Cancelled"] },
        },
        select: {
          assignedUserId: true,
          engagementId: true,
          engagementWorkflowStageId: true,
        },
        distinct: [
          "assignedUserId",
          "engagementId",
          "engagementWorkflowStageId",
        ],
      })
    : [];
  const covered = (
    userId: string | null,
    engagementId: string,
    stageId: string,
  ) =>
    coverage.some(
      (a) =>
        a.assignedUserId === userId &&
        a.engagementId === engagementId &&
        (!a.engagementWorkflowStageId ||
          a.engagementWorkflowStageId === stageId),
    );
  const responsibilities = [
    ...stages
      .filter((s) => !covered(s.assignedUserId, s.workflow.engagementId, s.id))
      .map((s) => ({
        userId: s.assignedUserId!,
        id: s.id,
        engagementId: s.workflow.engagementId,
        title: `Stage: ${s.name}`,
        href: `/engagements/${s.workflow.engagementId}?tab=workflow`,
      })),
    ...checklist
      .filter(
        (c) =>
          !covered(
            c.assignedUserId,
            c.engagementId,
            c.engagementWorkflowStageId,
          ),
      )
      .map((c) => ({
        userId: c.assignedUserId!,
        id: c.id,
        engagementId: c.engagementId,
        title: `Checklist: ${c.itemTitle}`,
        href: `/engagements/${c.engagementId}?tab=checklist`,
      })),
  ];
  let rows = users.map((u) => {
    const daily = dailyCapacity(
      u.weeklyCapacityHours,
      period.start,
      f.weeks * 7,
      adjustments.filter((a) => a.userId === u.id),
      u.status === "Active" && u.role.active,
    ).map((d) => ({
      date: d.date,
      ...capacityMetrics(
        d.capacity,
        planned.find(
          (p) =>
            p.assignedUserId === u.id && dateKey(p.allocationDate) === d.date,
        )?._sum.allocatedHours ?? new Prisma.Decimal(0),
      ),
    }));
    const capacity = daily.reduce(
      (s, d) => s.plus(d.capacity),
      new Prisma.Decimal(0),
    );
    const hours = daily.reduce(
      (s, d) => s.plus(d.planned),
      new Prisma.Decimal(0),
    );
    return {
      ...u,
      employeeStatus: u.status,
      ...capacityMetrics(capacity, hours),
      daily,
      actual:
        hasPermission(actor, "time.view_engagement") &&
        period.start <= period.today
          ? (
              actual.find((a) => a.userId === u.id)?._sum.hours ??
              new Prisma.Decimal(0)
            ).toFixed(2)
          : null,
      unscheduled: responsibilities.filter((r) => r.userId === u.id),
    };
  });
  if (f.load !== "all") rows = rows.filter((r) => r.status === f.load);
  if (f.available !== undefined)
    rows = rows.filter((r) => new Prisma.Decimal(r.available).gt(f.available!));
  if (f.sort === "available")
    rows.sort((a, b) => new Prisma.Decimal(b.available).cmp(a.available));
  if (f.sort === "load")
    rows.sort(
      (a, b) =>
        (b.status === "Overloaded" ? 1 : 0) -
          (a.status === "Overloaded" ? 1 : 0) ||
        Number(b.load ?? 0) - Number(a.load ?? 0),
    );
  const selected = f.employee
    ? rows.find((r) => r.id === f.employee)
    : undefined;
  const assignments = selected
    ? await db.workAllocation.findMany({
        where: {
          firmId: actor.firmId,
          assignedUserId: selected.id,
          allocationDate: dateRange,
          status: { not: "Cancelled" },
          engagement: visible,
        },
        include: {
          stage: { select: { name: true } },
          engagement: {
            select: {
              id: true,
              engagementName: true,
              dueDate: true,
              client: { select: { displayName: true } },
              workflow: {
                select: { currentStage: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: [{ allocationDate: "asc" }, { id: "asc" }],
      })
    : [];
  const restrictedPlanned = selected
    ? new Prisma.Decimal(selected.planned)
        .minus(
          assignments.reduce(
            (s, a) => s.plus(a.allocatedHours),
            new Prisma.Decimal(0),
          ),
        )
        .toFixed(2)
    : "0.00";
  return {
    filters: f,
    period,
    rows,
    selected,
    assignments,
    restrictedPlanned,
    adjustments: selected
      ? adjustments.filter((a) => a.userId === selected.id)
      : [],
    summary: {
      ...capacityMetrics(
        rows.reduce((s, r) => s.plus(r.capacity), new Prisma.Decimal(0)),
        rows.reduce((s, r) => s.plus(r.planned), new Prisma.Decimal(0)),
      ),
      overloaded: rows.filter((r) => r.status === "Overloaded").length,
    },
    roles: [
      ...new Map(users.map((u) => [u.roleId, u.role.roleName])).entries(),
    ],
    offices: [
      ...new Map(
        users
          .filter((u) => u.primaryOfficeId)
          .map((u) => [u.primaryOfficeId!, u.primaryOffice!.officeName]),
      ).entries(),
    ],
  };
}

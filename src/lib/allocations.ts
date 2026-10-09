import { Prisma, type Engagement } from "@prisma/client";
import { db } from "./db";
import { dailyCapacity, capacityMetrics } from "./capacity-math";
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
  canSeeEngagement,
  findEngagement,
} from "./engagements";
import { firmDates, isOverdue } from "./engagement-constants";
import { invariant } from "./errors";
import { id } from "./validation";
import {
  allocationFields,
  batchInput,
  changeInput,
  queueInput,
} from "./allocation-validation";
import { transitionWorkflowInTransaction } from "./workflows";

const person = {
  select: { id: true, firstName: true, lastName: true },
} as const;
const include = {
  assignedUser: person,
  assignedBy: person,
  stage: { select: { id: true, name: true } },
  engagement: {
    select: {
      id: true,
      engagementName: true,
      client: { select: { id: true, displayName: true } },
      dueDate: true,
      status: true,
      managerId: true,
      partnerId: true,
      reviewerId: true,
      preparerId: true,
    },
  },
} satisfies Prisma.WorkAllocationInclude;
const unfinished: Prisma.WorkAllocationWhereInput = {
  status: { notIn: ["Completed", "Cancelled"] },
};
const active: Prisma.WorkAllocationWhereInput = {
  status: { not: "Cancelled" },
};
export function managementScope(actor: Principal): Prisma.EngagementWhereInput {
  return {
    AND: [
      engagementVisibility(actor),
      hasPermission(actor, "engagements.view_all")
        ? {}
        : { OR: [{ managerId: actor.id }, { partnerId: actor.id }] },
    ],
  };
}
export function canManageAllocations(
  actor: Principal,
  e: Pick<Engagement, "managerId" | "partnerId" | "reviewerId" | "preparerId">,
) {
  return (
    hasPermission(actor, "allocations.manage_team") &&
    canSeeEngagement(actor, e) &&
    (hasPermission(actor, "engagements.view_all") ||
      e.managerId === actor.id ||
      e.partnerId === actor.id)
  );
}
async function managedEngagement(
  tx: Database,
  actor: Principal,
  engagementId: string,
) {
  requirePermission(actor, "engagements.view");
  requirePermission(actor, "allocations.manage_team");
  const e = await tx.engagement.findFirst({
    where: {
      AND: [
        { id: id.parse(engagementId), firmId: actor.firmId },
        managementScope(actor),
      ],
    },
  });
  invariant(e, "Engagement not found in your management scope.", 404);
  return e;
}
async function validateEmployee(
  tx: Database,
  actor: Principal,
  e: Engagement,
  employeeId: string,
) {
  const user = await tx.user.findFirst({
    where: {
      firmId: actor.firmId,
      id: employeeId,
      status: "Active",
      role: { active: true },
    },
    include: {
      firm: true,
      primaryOffice: true,
      role: { include: { permissions: true } },
    },
  });
  invariant(
    user &&
      hasPermission(user, "engagements.view") &&
      hasPermission(user, "my_work.view") &&
      canSeeEngagement(user, e),
    "Employee must be active in this firm and able to view this engagement.",
  );
  return user;
}
async function validated(
  tx: Database,
  actor: Principal,
  input: Prisma.JsonObject | unknown,
) {
  const data = allocationFields.parse(input),
    e = await managedEngagement(tx, actor, data.engagementId);
  invariant(
    !["Completed", "Cancelled"].includes(e.status),
    `${e.engagementName} is ${e.status.toLowerCase()}. Select an open engagement to allocate work.`,
  );
  const user = await validateEmployee(tx, actor, e, data.assignedUserId);
  const stage = data.engagementWorkflowStageId
    ? await tx.engagementWorkflowStage.findFirst({
        where: {
          id: data.engagementWorkflowStageId,
          firmId: actor.firmId,
          workflow: { engagementId: e.id },
        },
      })
    : null;
  invariant(
    !data.engagementWorkflowStageId || stage,
    "Stage must belong to this engagement's workflow.",
  );
  return {
    e,
    user,
    data: {
      ...data,
      allocationDate: new Date(data.allocationDate),
      plannedStartAt: data.plannedStartAt
        ? new Date(data.plannedStartAt)
        : null,
      plannedEndAt: data.plannedEndAt ? new Date(data.plannedEndAt) : null,
      engagementWorkflowId: stage?.engagementWorkflowId ?? null,
    },
  };
}
type Validated = Awaited<ReturnType<typeof validated>>;
async function warnings(
  tx: Database,
  actor: Principal,
  rows: Validated[],
  excludeId?: string,
) {
  const engagementIds = [...new Set(rows.map((r) => r.e.id))],
    userIds = [...new Set(rows.map((r) => r.user.id))];
  const weeks = rows.map((r) => firmDates("UTC", r.data.allocationDate));
  const [budgets, capacities, adjustments] = await Promise.all([
    tx.workAllocation.groupBy({
      by: ["engagementId"],
      where: {
        firmId: actor.firmId,
        engagementId: { in: engagementIds },
        ...active,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      _sum: { allocatedHours: true },
    }),
    tx.workAllocation.groupBy({
      by: ["assignedUserId", "allocationDate"],
      where: {
        firmId: actor.firmId,
        assignedUserId: { in: userIds },
        ...active,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        allocationDate: {
          gte: new Date(weeks.map((w) => w.weekStart).sort()[0]),
          lte: new Date(
            weeks
              .map((w) => w.weekEnd)
              .sort()
              .at(-1)!,
          ),
        },
      },
      _sum: { allocatedHours: true },
    }),
    tx.capacityAdjustment.findMany({ where: { firmId: actor.firmId, userId: { in: userIds }, cancelledAt: null, startDate: { lte: new Date(weeks.map(w => w.weekEnd).sort().at(-1)!) }, endDate: { gte: new Date(weeks.map(w => w.weekStart).sort()[0]) } } }),
  ]);
  const result: { kind: "budget" | "capacity"; message: string }[] = [];
  for (const eid of engagementIds) {
    const e = rows.find((r) => r.e.id === eid)!.e;
    const total =
      Number(
        budgets.find((b) => b.engagementId === eid)?._sum.allocatedHours ?? 0,
      ) +
      rows
        .filter((r) => r.e.id === eid)
        .reduce((s, r) => s + r.data.allocatedHours, 0);
    if (e.budgetHours !== null && total > e.budgetHours)
      result.push({
        kind: "budget",
        message: `${e.engagementName}: Planned allocation exceeds engagement budget (${total.toFixed(2)}h / ${e.budgetHours}h).`,
      });
  }
  const seen = new Set<string>();
  for (const r of rows) {
    const w = firmDates("UTC", r.data.allocationDate),
      key = r.user.id + w.weekStart;
    if (seen.has(key)) continue;
    seen.add(key);
    const inWeek = (d: Date) =>
      d >= new Date(w.weekStart) && d <= new Date(w.weekEnd);
    const total =
      capacities
        .filter(
          (c) => c.assignedUserId === r.user.id && inWeek(c.allocationDate),
        )
        .reduce((s, c) => s + Number(c._sum.allocatedHours ?? 0), 0) +
      rows
        .filter((x) => x.user.id === r.user.id && inWeek(x.data.allocationDate))
        .reduce((s, x) => s + x.data.allocatedHours, 0);
    const capacity = dailyCapacity(r.user.weeklyCapacityHours, w.weekStart, 7, adjustments.filter(a => a.userId === r.user.id)).reduce((s,d) => s.plus(d.capacity), new Prisma.Decimal(0));
    const metrics = capacityMetrics(capacity, new Prisma.Decimal(total.toFixed(2)));
    if (new Prisma.Decimal(total.toFixed(2)).gt(capacity))
      result.push({
        kind: "capacity",
        message: `${r.user.firstName} ${r.user.lastName}, week ${w.weekStart}: This allocation would bring planned work to ${total.toFixed(2)}h against ${capacity.toFixed(2)}h adjusted capacity (${metrics.load === null ? "no available capacity" : metrics.load + "% planned load"}). You may continue.`,
      });
  }
  return result;
}
const snapshot = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Notice = { kind: "budget" | "capacity"; message: string };
export function createAllocations(
  token: string | undefined,
  input: unknown,
  preview?: false,
): Promise<{
  items: { id: string; revision: number }[];
  warnings: Notice[];
  message: string;
}>;
export function createAllocations(
  token: string | undefined,
  input: unknown,
  preview: true,
): Promise<{
  preview: boolean;
  items: { engagement: string; employee: string; date: Date; hours: number }[];
  warnings: Notice[];
}>;
export async function createAllocations(
  token: string | undefined,
  input: unknown,
  preview = false,
) {
  const data = batchInput.parse(input);
  return tenantMutation(token, "allocations.create", async (tx, actor) => {
    const rows: Validated[] = [];
    for (const row of data.rows) rows.push(await validated(tx, actor, row));
    const notices = await warnings(tx, actor, rows);
    if (preview)
      return {
        preview: true,
        warnings: notices,
        items: rows.map((r) => ({
          engagement: r.e.engagementName,
          employee: `${r.user.firstName} ${r.user.lastName}`,
          date: r.data.allocationDate,
          hours: r.data.allocatedHours,
        })),
      };
    invariant(
      data.acknowledgeBudget || !notices.some((n) => n.kind === "budget"),
      "Planned allocation exceeds engagement budget. Review and acknowledge before saving.",
      409,
    );
    const items = [];
    for (const r of rows) {
      const item = await tx.workAllocation.create({
        data: { ...r.data, firmId: actor.firmId, assignedByUserId: actor.id },
      });
      await audit(
        tx,
        actor.firmId,
        actor.id,
        "allocation.created",
        "WorkAllocation",
        item.id,
        {
          schemaVersion: 1,
          engagementId: item.engagementId,
          employeeNames: {
            [r.user.id]: `${r.user.firstName} ${r.user.lastName}`,
          },
          after: snapshot(item),
        },
      );
      items.push({ id: item.id, revision: item.revision });
    }
    return {
      items,
      warnings: notices,
      message: `${items.length} allocation(s) created. ${notices.map((n) => n.message).join(" ")}`,
    };
  });
}
export async function changeAllocation(
  token: string | undefined,
  allocationId: string,
  input: unknown,
) {
  const data = changeInput.parse(input);
  id.parse(allocationId);
  const permission = (
    {
      edit: "allocations.edit",
      reassign: "allocations.reassign",
      cancel: "allocations.cancel",
      status: "allocations.view",
      note: "allocations.view",
    } as const
  )[data.action];
  return tenantMutation(token, permission, async (tx, actor) => {
    requirePermission(actor, "engagements.view");
    const before = await tx.workAllocation.findFirst({
      where: {
        id: allocationId,
        firmId: actor.firmId,
        engagement: engagementVisibility(actor),
      },
      include: { engagement: true },
    });
    invariant(before, "Allocation not found.", 404);
    const manager = canManageAllocations(actor, before.engagement);
    if (data.action === "status" || data.action === "note") {
      if (
        before.assignedUserId === actor.id &&
        hasPermission(actor, "my_work.update_status")
      ) {
        // Own-work permission remains independent of management editing permission.
      } else if (manager) requirePermission(actor, "allocations.edit");
      else {
        requirePermission(actor, "my_work.update_status");
        invariant(
          before.assignedUserId === actor.id,
          "Allocation not found.",
          404,
        );
      }
    } else {
      invariant(manager, "Allocation not found in your management scope.", 404);
    }
    invariant(
      before.revision === data.revision,
      "This allocation has changed. Refresh before trying again.",
      409,
    );
    invariant(
      before.status !== "Cancelled",
      "Cancelled allocations cannot be changed.",
    );
    let update: Prisma.WorkAllocationUncheckedUpdateInput = {
      revision: { increment: 1 },
    };
    let notices: { kind: "budget" | "capacity"; message: string }[] = [];
    if (data.action === "edit") {
      invariant(data.fields, "Allocation fields are required.");
      invariant(
        data.fields.engagementId === before.engagementId &&
          data.fields.assignedUserId === before.assignedUserId,
        "Use the separate reassignment action; the engagement cannot change.",
      );
      const row = await validated(tx, actor, data.fields);
      notices = await warnings(tx, actor, [row], before.id);
      invariant(
        data.acknowledgeBudget || !notices.some((n) => n.kind === "budget"),
        "Planned allocation exceeds engagement budget. Acknowledge before saving.",
        409,
      );
      update = { ...update, ...row.data, status: before.status };
    }
    if (data.action === "reassign") {
      invariant(
        data.assignedUserId && data.reason,
        "Select an employee and enter a reassignment reason.",
      );
      invariant(
        data.assignedUserId !== before.assignedUserId,
        "Choose a different employee.",
      );
      const user = await validateEmployee(
        tx,
        actor,
        before.engagement,
        data.assignedUserId,
      );
      update.assignedUserId = user.id;
      const row = await validated(tx, actor, {
        ...before,
        assignedUserId: user.id,
        allocatedHours: Number(before.allocatedHours),
        allocationDate: before.allocationDate.toISOString().slice(0, 10),
        plannedStartAt: before.plannedStartAt?.toISOString(),
        plannedEndAt: before.plannedEndAt?.toISOString(),
        status: "Assigned",
      });
      notices = (await warnings(tx, actor, [row], before.id)).filter(
        (n) => n.kind === "capacity",
      );
      if (data.changeStageOwner) {
        invariant(
          before.engagementWorkflowStageId && data.workflowRevision,
          "A linked current stage and current workflow revision are required.",
        );
        await transitionWorkflowInTransaction(tx, actor, before.engagementId, {
          action: "Reassign",
          revision: data.workflowRevision,
          currentStageId: before.engagementWorkflowStageId,
          assignedUserId: user.id,
          comment: data.reason,
        });
      }
    } else
      invariant(
        !data.changeStageOwner,
        "Stage ownership can only change through explicit reassignment.",
      );
    if (data.action === "status") {
      invariant(
        data.status && data.status !== "Cancelled",
        "Use the cancellation action.",
      );
      invariant(
        (manager && hasPermission(actor, "allocations.edit")) ||
          ["InProgress", "Blocked", "Completed"].includes(data.status),
        "Employees can start, block or complete their own work.",
        403,
      );
      if (data.status === "Blocked")
        invariant(data.blockedReason, "A blocked reason is required.");
      update.status = data.status;
      update.blockedReason =
        data.status === "Blocked" ? data.blockedReason! : "";
    }
    if (data.action === "cancel") {
      invariant(data.reason, "Enter a cancellation reason.");
      update.status = "Cancelled";
      update.cancelledAt = new Date();
    }
    if (data.action === "note")
      invariant(data.reason, "Enter a progress note.");
    const changed = await tx.workAllocation.updateMany({
      where: { id: before.id, firmId: actor.firmId, revision: data.revision },
      data: update,
    });
    invariant(
      changed.count === 1,
      "This allocation has changed. Refresh before trying again.",
      409,
    );
    const after = await tx.workAllocation.findUniqueOrThrow({
      where: { id: before.id },
    });
    const { engagement: _engagement, ...old } = before;
    void _engagement;
    const changes = Object.keys(after).filter(
      (k) =>
        JSON.stringify(old[k as keyof typeof old]) !==
        JSON.stringify(after[k as keyof typeof after]),
    );
    const people = await tx.user.findMany({
      where: {
        firmId: actor.firmId,
        id: { in: [before.assignedUserId, after.assignedUserId] },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      `allocation.${data.action}`,
      "WorkAllocation",
      before.id,
      {
        schemaVersion: 1,
        engagementId: before.engagementId,
        employeeNames: Object.fromEntries(
          people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
        ),
        before: snapshot(old),
        after: snapshot(after),
        changes,
        reason: data.reason,
        stageOwnerChanged: data.changeStageOwner,
      },
    );
    return {
      message: `Allocation updated. ${notices.map((n) => n.message).join(" ")}`,
      warnings: notices,
    };
  });
}

export async function listAllocations(
  token: string | undefined,
  input: unknown = {},
  team = false,
  now = new Date(),
) {
  const actor = await engagementActor(
    token,
    team ? "allocations.manage_team" : "my_work.view",
  );
  requirePermission(actor, "allocations.view");
  const f = queueInput.parse(input),
    dates = firmDates(actor.firm.timezone, now);
  invariant(
    team || !f.employeeId || f.employeeId === actor.id,
    "You can only view your own work.",
    403,
  );
  const e: Prisma.EngagementWhereInput = {
    AND: [
      team ? managementScope(actor) : engagementVisibility(actor),
      {
        ...(f.client
          ? {
              client: {
                displayName: { contains: f.client, mode: "insensitive" },
              },
            }
          : {}),
        ...(f.engagement
          ? { engagementName: { contains: f.engagement, mode: "insensitive" } }
          : {}),
        ...(f.serviceLine
          ? {
              serviceLine: {
                name: { contains: f.serviceLine, mode: "insensitive" },
              },
            }
          : {}),
        ...(f.office
          ? {
              office: {
                officeName: { contains: f.office, mode: "insensitive" },
              },
            }
          : {}),
        ...(f.manager
          ? {
              manager: {
                OR: [
                  { firstName: { contains: f.manager, mode: "insensitive" } },
                  { lastName: { contains: f.manager, mode: "insensitive" } },
                ],
              },
            }
          : {}),
        ...(f.clientId ? { clientId: f.clientId } : {}),
        ...(f.serviceLineId ? { serviceLineId: f.serviceLineId } : {}),
        ...(f.managerId ? { managerId: f.managerId } : {}),
        ...(f.officeId ? { officeId: f.officeId } : {}),
        ...(f.dueFrom || f.dueTo
          ? {
              dueDate: {
                ...(f.dueFrom ? { gte: new Date(f.dueFrom) } : {}),
                ...(f.dueTo ? { lte: new Date(f.dueTo) } : {}),
              },
            }
          : {}),
      },
    ],
  };
  const base: Prisma.WorkAllocationWhereInput = {
    firmId: actor.firmId,
    engagement: e,
    ...(!team
      ? { assignedUserId: actor.id }
      : f.employeeId
        ? { assignedUserId: f.employeeId }
        : {}),
    ...(f.engagementId ? { engagementId: f.engagementId } : {}),
    ...(f.stage
      ? { stage: { name: { contains: f.stage, mode: "insensitive" } } }
      : {}),
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.from || f.to
      ? {
          allocationDate: {
            ...(f.from ? { gte: new Date(f.from) } : {}),
            ...(f.to ? { lte: new Date(f.to) } : {}),
          },
        }
      : {}),
  };
  const week = { gte: new Date(dates.weekStart), lte: new Date(dates.weekEnd) };
  if (f.employee)
    base.assignedUser = {
      OR: [
        { firstName: { contains: f.employee, mode: "insensitive" } },
        { lastName: { contains: f.employee, mode: "insensitive" } },
      ],
    };
  const overdue: Prisma.WorkAllocationWhereInput = {
    AND: [
      unfinished,
      {
        OR: [
          { allocationDate: { lt: new Date(dates.today) } },
          { plannedEndAt: { lt: now } },
          {
            engagement: {
              dueDate: { lt: new Date(dates.today) },
              status: { notIn: ["Completed", "Cancelled"] },
            },
          },
        ],
      },
    ],
  };
  const views: Record<typeof f.view, Prisma.WorkAllocationWhereInput> = {
    today: { AND: [unfinished, { allocationDate: new Date(dates.today) }] },
    week: { AND: [active, { allocationDate: week }] },
    upcoming: {
      AND: [unfinished, { allocationDate: { gt: new Date(dates.weekEnd) } }],
    },
    overdue,
    blocked: {
      AND: [
        unfinished,
        { OR: [{ status: "Blocked" }, { engagement: { status: "OnHold" } }] },
      ],
    },
    completed: { status: "Completed" },
    all: {},
  };
  const where: Prisma.WorkAllocationWhereInput = { AND: [base, views[f.view]] };
  const order: Record<
    typeof f.sort,
    Prisma.WorkAllocationOrderByWithRelationInput
  > = {
    allocationDate: { allocationDate: f.direction },
    dueDate: { engagement: { dueDate: f.direction } },
    priority: { priority: f.direction },
    client: { engagement: { client: { displayName: f.direction } } },
    engagement: { engagement: { engagementName: f.direction } },
  };
  const [
    items,
    total,
    dueToday,
    dueWeek,
    overdueCount,
    blocked,
    daily,
    weekly,
  ] = await Promise.all([
    db.workAllocation.findMany({
      where,
      include,
      orderBy: [order[f.sort], { id: "asc" }],
      take: 25,
      skip: (f.page - 1) * 25,
    }),
    db.workAllocation.count({ where }),
    db.workAllocation.count({
      where: {
        AND: [
          base,
          unfinished,
          {
            engagement: {
              dueDate: new Date(dates.today),
              status: { notIn: ["Completed", "Cancelled"] },
            },
          },
        ],
      },
    }),
    db.workAllocation.count({
      where: {
        AND: [
          base,
          unfinished,
          {
            engagement: {
              dueDate: week,
              status: { notIn: ["Completed", "Cancelled"] },
            },
          },
        ],
      },
    }),
    db.workAllocation.count({ where: { AND: [base, overdue] } }),
    db.workAllocation.count({ where: { AND: [base, views.blocked] } }),
    db.workAllocation.groupBy({
      by: ["allocationDate"],
      where: { AND: [base, active, { allocationDate: week }] },
      _sum: { allocatedHours: true },
    }),
    team
      ? db.workAllocation.groupBy({
          by: ["assignedUserId"],
          where: { AND: [base, active, { allocationDate: week }] },
          _sum: { allocatedHours: true },
        })
      : Promise.resolve([]),
  ]);
  const people =
    team && weekly.length
      ? await db.user.findMany({
          where: {
            firmId: actor.firmId,
            id: { in: weekly.map((w) => w.assignedUserId) },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            weeklyCapacityHours: true,
          },
        })
      : [];
  // Unlinked allocations cover the engagement; linked allocations cover only that stage.
  const responsibilitiesWhere: Prisma.EngagementWorkflowWhereInput = {
    firmId: actor.firmId,
    status: "Active",
    currentStage: {
      assignedUserId: actor.id,
      workAllocations: { none: { assignedUserId: actor.id, ...unfinished } },
    },
    engagement: {
      AND: [
        engagementVisibility(actor),
        {
          status: { notIn: ["Completed", "Cancelled"] },
          workAllocations: {
            none: {
              assignedUserId: actor.id,
              engagementWorkflowStageId: null,
              ...unfinished,
            },
          },
        },
      ],
    },
  };
  const [responsibilities, responsibilityTotal] = team
    ? ([[], 0] as const)
    : await Promise.all([
        db.engagementWorkflow.findMany({
          where: responsibilitiesWhere,
          include: {
            currentStage: { select: { name: true } },
            engagement: {
              select: {
                engagementName: true,
                client: { select: { displayName: true } },
                dueDate: true,
              },
            },
          },
          orderBy: [{ engagement: { dueDate: "asc" } }, { id: "asc" }],
          take: 25,
          skip: (f.responsibilityPage - 1) * 25,
        }),
        db.engagementWorkflow.count({ where: responsibilitiesWhere }),
      ]);
  return {
    items: items.map((r) => ({
      ...r,
      allocatedHours: Number(r.allocatedHours),
      overdueEngagement: isOverdue(r.engagement, dates.today),
      overdueAllocation:
        !["Completed", "Cancelled"].includes(r.status) &&
        (r.allocationDate < new Date(dates.today) ||
          Boolean(r.plannedEndAt && r.plannedEndAt < now)),
      canManage: canManageAllocations(actor, r.engagement),
      canUpdate:
        (r.assignedUserId === actor.id &&
          hasPermission(actor, "my_work.update_status")) ||
        (canManageAllocations(actor, r.engagement) &&
          hasPermission(actor, "allocations.edit")),
    })),
    total,
    filters: f,
    dates,
    timezone: actor.firm.timezone,
    summary: {
      dueToday,
      dueWeek,
      overdue: overdueCount,
      blocked,
      plannedWeek: daily.reduce(
        (s, d) => s + Number(d._sum.allocatedHours ?? 0),
        0,
      ),
      plannedToday: Number(
        daily.find(
          (d) => d.allocationDate.toISOString().slice(0, 10) === dates.today,
        )?._sum.allocatedHours ?? 0,
      ),
    },
    daily: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(dates.weekStart);
      d.setUTCDate(d.getUTCDate() + i);
      return {
        date: d.toISOString().slice(0, 10),
        hours: Number(
          daily.find((x) => x.allocationDate.getTime() === d.getTime())?._sum
            .allocatedHours ?? 0,
        ),
      };
    }),
    weekly: weekly.map((w) => ({
      ...people.find((p) => p.id === w.assignedUserId)!,
      hours: Number(w._sum.allocatedHours ?? 0),
    })),
    responsibilities,
    responsibilityTotal,
  };
}

export async function allocationOptions(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "allocations.manage_team");
  const e = await managedEngagement(db, actor, engagementId);
  const users = await db.user.findMany({
    where: { firmId: actor.firmId, status: "Active", role: { active: true } },
    include: {
      firm: true,
      primaryOffice: true,
      role: { include: { permissions: true } },
    },
  });
  const workflow = await db.engagementWorkflow.findFirst({
    where: { firmId: actor.firmId, engagementId: e.id },
    select: {
      revision: true,
      currentStageId: true,
      currentStage: { select: { name: true, assignedUser: person } },
      stages: {
        select: { id: true, name: true },
        orderBy: { sequence: "asc" },
      },
    },
  });
  return {
    users: users
      .filter(
        (u) =>
          hasPermission(u, "engagements.view") &&
          hasPermission(u, "my_work.view") &&
          canSeeEngagement(u, e),
      )
      .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` })),
    engagement: { engagementName: e.engagementName, status: e.status },
    workflow,
  };
}
export async function allocationHistory(
  token: string | undefined,
  allocationId: string,
  page = 1,
) {
  const actor = await engagementActor(token, "allocations.view");
  const row = await db.workAllocation.findFirst({
    where: {
      id: id.parse(allocationId),
      firmId: actor.firmId,
      engagement: engagementVisibility(actor),
    },
    include: { engagement: true },
  });
  invariant(
    row &&
      (row.assignedUserId === actor.id ||
        canManageAllocations(actor, row.engagement)),
    "Allocation not found.",
    404,
  );
  invariant(
    Number.isInteger(page) && page > 0 && page <= 100000,
    "Invalid page.",
  );
  return db.auditLog.findMany({
    where: {
      firmId: actor.firmId,
      entityType: "WorkAllocation",
      entityId: row.id,
    },
    select: {
      id: true,
      action: true,
      timestamp: true,
      metadata: true,
      actor: person,
    },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    skip: (page - 1) * 25,
    take: 25,
  });
}
export async function allocationBudget(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "allocations.view");
  const e = await findEngagement(db, actor, engagementId);
  invariant(canManageAllocations(actor, e), "Management access required.", 403);
  const totals = await db.workAllocation.aggregate({
    where: { firmId: actor.firmId, engagementId: e.id, ...active },
    _sum: { allocatedHours: true },
  });
  const hours = Number(totals._sum.allocatedHours ?? 0);
  return {
    budget: e.budgetHours,
    planned: hours,
    unallocated: e.budgetHours === null ? null : e.budgetHours - hours,
  };
}

export function allocationEngagementRoles(
  employeeId: string,
  engagement: Pick<
    Engagement,
    "partnerId" | "managerId" | "reviewerId" | "preparerId"
  >,
) {
  const slots = [
    ["partnerId", "Partner"],
    ["managerId", "Manager"],
    ["reviewerId", "Reviewer"],
    ["preparerId", "Preparer"],
  ] as const;
  const roles = slots
    .filter(([key]) => engagement[key] === employeeId)
    .map(([, label]) => label);
  return roles.length ? roles.join(" / ") : "Additional assignee";
}

// Engagement-wide totals are independent of the allocation table's filters/page.
export async function allocationEmployeeTotals(
  token: string | undefined,
  engagementId: string,
) {
  const actor = await engagementActor(token, "allocations.view");
  const engagement = await findEngagement(db, actor, engagementId);
  invariant(
    canManageAllocations(actor, engagement),
    "Management access required.",
    403,
  );
  const totals = await db.workAllocation.groupBy({
    by: ["assignedUserId"],
    where: { firmId: actor.firmId, engagementId: engagement.id, ...active },
    _sum: { allocatedHours: true },
  });
  const employees = await db.user.findMany({
    where: {
      firmId: actor.firmId,
      id: { in: totals.map((row) => row.assignedUserId) },
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
  });
  const hours = new Map(
    totals.map((row) => [
      row.assignedUserId,
      Number(row._sum.allocatedHours ?? 0),
    ]),
  );
  return employees.map((employee) => ({
    ...employee,
    engagementRole: allocationEngagementRoles(employee.id, engagement),
    plannedHours: hours.get(employee.id) ?? 0,
  }));
}

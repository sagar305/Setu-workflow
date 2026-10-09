import { db } from "./db";
import { hasPermission } from "./auth";
import { engagementActor, engagementVisibility } from "./engagements";
import {
  portfolio,
  managementDashboard,
  exceptionPriority,
  priorityOrder,
  type Exception,
} from "./insights";
import { teamCapacity } from "./capacity";
import { insightFilters, matchesDeadline } from "./reports";
export async function dashboardData(
  token: string | undefined,
  input: unknown = {},
  now = new Date(),
) {
  const actor = await engagementActor(token);
  const management = managementDashboard(actor),
    f = insightFilters.parse(input);
  const data = await portfolio(token, input, now, !management);
  const capacity =
    management && hasPermission(actor, "capacity.view_team")
      ? await teamCapacity(token, {}, now)
      : null;
  const exceptions: Exception[] = [...data.exceptions];
  if (capacity)
    for (const row of capacity.rows) {
      if (row.status === "Overloaded")
        exceptions.push({
          id: `capacity:${row.id}`,
          type: "CAPACITY_OVERLOAD",
          priority: "Attention",
          engagementId: null,
          subject: `${row.firstName} ${row.lastName}`,
          owner: `${row.firstName} ${row.lastName}`,
          due: capacity.period.end,
          reason: `${row.planned}h planned against ${row.capacity}h capacity (${row.load ?? "no capacity"}${row.load ? "%" : ""}).`,
          href: `/team/capacity?employee=${row.id}&week=${capacity.period.start}`,
        });
      for (const responsibility of row.unscheduled) {
        if (!data.records.some((r) => r.id === responsibility.engagementId))
          continue;
        if (
          (responsibility.href.includes("tab=workflow") &&
            !data.rights.workflow) ||
          (responsibility.href.includes("tab=checklist") &&
            !data.rights.checklist)
        )
          continue;
        exceptions.push({
          id: `unscheduled:${responsibility.id}`,
          type: "UNSCHEDULED_RESPONSIBILITY",
          priority: exceptionPriority("UNSCHEDULED_RESPONSIBILITY"),
          engagementId: responsibility.engagementId,
          subject:
            data.records.find((r) => r.id === responsibility.engagementId)
              ?.engagement ?? "Current responsibility",
          owner: `${row.firstName} ${row.lastName}`,
          due: null,
          reason: responsibility.title + " has no unfinished allocation.",
          href: responsibility.href,
        });
      }
    }
  const active = data.records.filter((r) => r.active);
  const health = data.records.filter(
    (r) =>
      matchesDeadline(r, f.deadline, data.dates) &&
      (!f.pipeline || r.stageCategory === f.pipeline),
  );
  const selectedExceptions = exceptions
    .filter((e) => f.flag === "all" || e.type === f.flag)
    .sort(
      (a, b) =>
        priorityOrder[a.priority] - priorityOrder[b.priority] ||
        (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
        a.id.localeCompare(b.id),
    );
  const checklistTotals = data.records.reduce(
    (s, r) => ({
      applicable: s.applicable + (r.progress?.applicable ?? 0),
      completed: s.completed + (r.progress?.completed ?? 0),
      blocked: s.blocked + (r.progress?.blocked ?? 0),
      required: s.required + (r.progress?.requiredOutstanding ?? 0),
      overdue: s.overdue + r.overdueChecklist,
    }),
    { applicable: 0, completed: 0, blocked: 0, required: 0, overdue: 0 },
  );
  // Own work counts are scoped before aggregation. Source links use the same dated own-allocation filters.
  const work =
    !management &&
    hasPermission(actor, "my_work.view") &&
    hasPermission(actor, "allocations.view")
      ? await db.workAllocation.count({
          where: {
            firmId: actor.firmId,
            assignedUserId: actor.id,
            status: { notIn: ["Completed", "Cancelled"] },
            engagement: engagementVisibility(actor),
          },
        })
      : null;
  const ownChecklist =
    !management && data.rights.checklist
      ? await db.engagementChecklistItem.findMany({
          where: {
            firmId: actor.firmId,
            engagementId: { in: data.records.map((r) => r.id) },
            assignedUserId: actor.id,
            status: { notIn: ["Completed", "NotApplicable"] },
            OR: [
              { isRequired: true },
              { status: "Blocked" },
              { dueDate: { lt: new Date(data.dates.today) } },
            ],
          },
          select: {
            id: true,
            engagementId: true,
            itemTitle: true,
            status: true,
            dueDate: true,
          },
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        })
      : [];
  return {
    ownChecklist,
    ownPoints: !management ? data.points : [],
    management,
    rights: data.rights,
    dates: data.dates,
    summary: {
      active: active.length,
      today: active.filter((r) => matchesDeadline(r, "today", data.dates))
        .length,
      week: active.filter((r) => matchesDeadline(r, "week", data.dates)).length,
      overdue: active.filter((r) => matchesDeadline(r, "overdue", data.dates))
        .length,
      blocking: data.points.filter((p) => p.blocking).length,
      points: data.points.length,
      checklistAttention: ownChecklist.length,
    },
    exceptions: selectedExceptions.slice((f.page - 1) * 25, f.page * 25),
    exceptionTotal: selectedExceptions.length,
    page: f.page,
    health: health.slice((f.page - 1) * 25, f.page * 25),
    healthTotal: health.length,
    pipeline: data.rights.workflow
      ? Object.entries(
          data.records.reduce(
            (s, r) => {
              if (r.stageCategory)
                s[r.stageCategory] = (s[r.stageCategory] ?? 0) + 1;
              return s;
            },
            {} as Record<string, number>,
          ),
        )
      : [],
    checklist: checklistTotals,
    points: {
      open: data.points.length,
      blocking: data.points.filter((p) => p.blocking).length,
      overdue: data.points.filter((p) => p.overdue).length,
      aged: data.points.filter((p) => p.age > 5).length,
    },
    budget: {
      warning: data.exceptions.filter((e) => e.type === "BUDGET_WARNING")
        .length,
      exceeded: data.exceptions.filter((e) => e.type === "BUDGET_EXCEEDED")
        .length,
    },
    capacity: capacity
      ? {
          period: capacity.period,
          available: capacity.rows.filter((r) => r.status === "Available")
            .length,
          near: capacity.rows.filter((r) => r.status === "Near Capacity")
            .length,
          overloaded: capacity.rows.filter((r) => r.status === "Overloaded")
            .length,
        }
      : null,
    work,
    reports: hasPermission(actor, "reports.view"),
    canWork: hasPermission(actor, "my_work.view"),
  };
}

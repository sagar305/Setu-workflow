import { z } from "zod";
import { db } from "./db";
import { hasPermission, requirePermission } from "./auth";
import { engagementActor, engagementVisibility } from "./engagements";
import { portfolio, EXCEPTION_TYPES } from "./insights";
import { teamCapacity } from "./capacity";
import { toCsv } from "./client-csv";
import { shiftDate } from "./capacity-math";
import { invariant } from "./errors";
import type { PermissionKey } from "./permissions";
export const REPORTS = {
  status: { title: "Engagement Status", permission: "engagements.view" },
  budget: { title: "Budget vs Actual", permission: "budget.view" },
  points: { title: "Open Points Aging", permission: "points.view" },
  capacity: { title: "Team Capacity", permission: "capacity.view_team" },
  workflow: { title: "Workflow Aging", permission: "workflows.view" },
  checklist: { title: "Checklist Progress", permission: "checklist.view" },
} satisfies Record<string, { title: string; permission: PermissionKey }>;
export type ReportKind = keyof typeof REPORTS;
export const insightFilters = z.object({
  report: z
    .enum(["status", "budget", "points", "capacity", "workflow", "checklist"])
    .default("status"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  deadline: z
    .enum(["all", "today", "week", "next7", "overdue", "soon"])
    .default("all"),
  pipeline: z
    .enum([
      "",
      "Not Started",
      "Queue",
      "Preparation",
      "Waiting",
      "Review",
      "Approval",
      "Completion",
      "Other",
      "Completed",
    ])
    .default(""),
  flag: z
    .enum([
      "all",
      "blocking",
      "overdue",
      "aged",
      "blocked",
      "required",
      "stagnant",
      "Available",
      "Near Capacity",
      "Overloaded",
      ...EXCEPTION_TYPES,
    ])
    .default("all"),
  age: z.enum(["all", "0–2", "3–5", "6–10", "over 10"]).default("all"),
});
export type InsightRecord = Awaited<
  ReturnType<typeof portfolio>
>["records"][number];
export function matchesDeadline(
  r: InsightRecord,
  deadline: z.infer<typeof insightFilters>["deadline"],
  dates: { today: string; weekStart: string; weekEnd: string },
) {
  if (deadline === "all") return true;
  if (!r.active || !r.due) return false;
  if (deadline === "overdue") return r.due < dates.today;
  if (deadline === "today") return r.due === dates.today;
  if (deadline === "week")
    return r.due >= dates.weekStart && r.due <= dates.weekEnd;
  return (
    r.due >= dates.today &&
    r.due <= shiftDate(dates.today, deadline === "soon" ? 3 : 7)
  );
}
export type ReportRow = {
  id: string;
  href: string;
  cells: (string | number | null)[];
};
export async function reportData(
  token: string | undefined,
  input: unknown = {},
  now = new Date(),
  exporting = false,
) {
  const actor = await engagementActor(token, "reports.view"),
    f = insightFilters.parse(input);
  requirePermission(actor, REPORTS[f.report].permission);
  if (exporting) requirePermission(actor, "reports.export");
  let columns: string[] = [],
    rows: ReportRow[] = [],
    description =
      "Current operational state. Engagement due-date filters apply; budget figures are lifetime engagement totals.";
  if (f.report === "capacity") {
    const capacity = await teamCapacity(token, input, now);
    const ids = capacity.rows.map((r) => r.id);
    const open = hasPermission(actor, "allocations.view")
      ? await db.workAllocation.groupBy({
          by: ["assignedUserId"],
          where: {
            firmId: actor.firmId,
            assignedUserId: { in: ids },
            allocationDate: {
              gte: new Date(capacity.period.start),
              lte: new Date(capacity.period.end),
            },
            status: { notIn: ["Completed", "Cancelled"] },
            engagement: engagementVisibility(actor),
          },
          _count: { _all: true },
        })
      : [];
    columns = [
      "Employee",
      "Role",
      "Capacity Hours",
      "Planned Hours",
      "Available Hours",
      "Planned Load %",
      "Actual Hours (visible, through today)",
      "Open Work (visible)",
      "Status",
    ];
    rows = capacity.rows
      .filter((r) => f.flag === "all" || r.status === f.flag)
      .map((r) => ({
        id: r.id,
        href: `/team/capacity?week=${capacity.period.start}&weeks=${capacity.period.weeks}&employee=${r.id}`,
        cells: [
          `${r.firstName} ${r.lastName}`,
          r.role.roleName,
          r.capacity,
          r.planned,
          r.available,
          r.load,
          r.actual,
          hasPermission(actor, "allocations.view")
            ? (open.find((a) => a.assignedUserId === r.id)?._count._all ?? 0)
            : null,
          r.status,
        ],
      }));
    description = `${capacity.period.start} – ${capacity.period.end}. Adjusted capacity and planned work use Build #9; actual hours are secondary, permission-scoped context and are never subtracted. Open Work counts unfinished visible allocations in this period.`;
  } else {
    const data = await portfolio(token, input, now);
    const records = data.records.filter(
      (r) =>
        matchesDeadline(r, f.deadline, data.dates) &&
        (!f.pipeline || r.stageCategory === f.pipeline),
    );
    const ids = new Set(records.map((r) => r.id));
    const selected = (r: InsightRecord) =>
      f.flag === "all" || r.exceptions.some((x) => x.type === f.flag);
    if (f.report === "status") {
      columns = [
        "Client",
        "Engagement",
        "Service Line",
        "Partner",
        "Manager",
        "Current Stage",
        "Current Owner",
        "Due Date",
        "Status",
        "Checklist %",
        "Open Points",
        "Blocking Points",
        "Health / Reason",
      ];
      rows = records
        .filter(selected)
        .map((r) => ({
          id: r.id,
          href: r.href,
          cells: [
            r.client,
            r.engagement,
            r.service,
            r.partner,
            r.manager,
            r.stage,
            r.owner,
            r.due,
            r.status,
            r.progress?.percent ?? null,
            r.openPoints,
            r.blockingPoints,
            r.exceptions.map((e) => e.reason).join(" ") || "No exceptions",
          ],
        }));
    } else if (f.report === "budget") {
      columns = [
        "Client",
        "Engagement",
        "Budget Hours",
        "Planned Hours",
        "Actual Hours",
        "Remaining Hours",
        "Budget Used %",
        "Manager",
        "Service Line",
      ];
      rows = records
        .filter(selected)
        .map((r) => ({
          id: r.id,
          href: r.href + "?tab=hours",
          cells: [
            r.client,
            r.engagement,
            r.hours!.budget,
            r.hours!.planned,
            r.hours!.actual,
            r.hours!.remaining,
            r.hours!.used,
            r.manager,
            r.service,
          ],
        }));
    } else if (f.report === "points") {
      columns = [
        "Client",
        "Engagement",
        "Point Number",
        "Type",
        "Raised By",
        "Assigned To",
        "Raised Date",
        "Age (days)",
        "Aging Bucket",
        "Due Date",
        "Priority",
        "Status",
        "Blocking",
      ];
      rows = data.points
        .filter(
          (p) =>
            ids.has(p.engagementId) &&
            (f.age === "all" || p.bucket === f.age) &&
            (f.flag === "all" ||
              (f.flag === "blocking" && p.blocking) ||
              (f.flag === "overdue" && p.overdue) ||
              (f.flag === "aged" && p.age > 5)),
        )
        .map((p) => {
          const e = records.find((r) => r.id === p.engagementId)!;
          return {
            id: p.id,
            href: p.href,
            cells: [
              e.client,
              e.engagement,
              p.pointNumber,
              p.pointType,
              p.raisedByName,
              p.assignedToName,
              p.raisedDate,
              p.age,
              p.bucket,
              p.dueDate?.toISOString().slice(0, 10) ?? null,
              p.priority,
              p.status,
              p.blocking ? "Yes" : "No",
            ],
          };
        });
      description =
        "Open actionable points only; knowledge/instruction and resolved/closed points are excluded. Aging uses firm-local calendar dates. Due-date filters apply to engagements; overdue point filters use each point's own deadline.";
    } else if (f.report === "workflow") {
      columns = [
        "Client",
        "Engagement",
        "Current Stage",
        "Current Owner",
        "Entered Stage (UTC)",
        "Days in Stage",
        "Target Days",
        "Due Date",
        "Exception",
      ];
      rows = records
        .filter(
          (r) =>
            r.stage &&
            (f.flag === "all" ||
              ((f.flag === "stagnant" || f.flag === "WORKFLOW_STAGNANT") &&
                r.stagnant)),
        )
        .map((r) => ({
          id: r.id,
          href: r.href + "?tab=workflow",
          cells: [
            r.client,
            r.engagement,
            r.stage,
            r.owner,
            r.stageEntered?.toISOString() ?? null,
            r.stageDays,
            r.targetDays,
            r.due,
            r.stagnant ? "Beyond target" : "Within target / no target",
          ],
        }));
      description =
        "Age uses the current stage's actual entry timestamp and the existing firm-local day calculation, never engagement creation time. Target exceptions apply only to active workflows.";
    } else {
      columns = [
        "Client",
        "Engagement",
        "Total Applicable Items",
        "Completed",
        "In Progress",
        "Blocked",
        "Outstanding Required",
        "Completion %",
        "Overdue Items",
      ];
      rows = records
        .filter(
          (r) =>
            f.flag === "all" ||
            (f.flag === "blocked" && r.progress!.blocked > 0) ||
            (f.flag === "required" && r.progress!.requiredOutstanding > 0) ||
            (f.flag === "overdue" && r.overdueChecklist > 0) ||
            r.exceptions.some((e) => e.type === f.flag),
        )
        .map((r) => ({
          id: r.id,
          href: r.href + "?tab=checklist",
          cells: [
            r.client,
            r.engagement,
            r.progress!.applicable,
            r.progress!.completed,
            r.progress!.inProgress,
            r.progress!.blocked,
            r.progress!.requiredOutstanding,
            r.progress!.percent,
            r.overdueChecklist,
          ],
        }));
      description =
        "Not Applicable items are excluded from the completion denominator, following Build #6. Required outstanding excludes completed and not-applicable items.";
    }
  }
  invariant(
    !exporting || rows.length <= 5000,
    "CSV exports support up to 5,000 rows. Narrow the report filters.",
    400,
  );
  const total = rows.length;
  return {
    kind: f.report,
    title: REPORTS[f.report].title,
    description,
    columns,
    rows: exporting ? rows : rows.slice((f.page - 1) * 25, f.page * 25),
    total,
    page: f.page,
    pages: Math.max(1, Math.ceil(total / 25)),
    canExport: hasPermission(actor, "reports.export"),
  };
}
export async function exportReport(
  token: string | undefined,
  input: unknown = {},
  now = new Date(),
) {
  const data = await reportData(token, input, now, true);
  return {
    kind: data.kind,
    csv: toCsv([data.columns, ...data.rows.map((r) => r.cells)]),
  };
}

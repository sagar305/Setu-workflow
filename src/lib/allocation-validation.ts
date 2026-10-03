import { z } from "zod";
import { id } from "./validation";
import { PRIORITIES } from "./engagement-constants";
export const ALLOCATION_STATUSES = [
  "Planned",
  "Assigned",
  "InProgress",
  "Blocked",
  "Completed",
  "Cancelled",
] as const;
export const BLOCK_REASONS = [
  "Awaiting Client Information",
  "System Access Pending",
  "Waiting for Documents",
  "Technical Issue",
  "Internal Dependency",
  "Other",
] as const;
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Enter a valid calendar date.");
const optionalId = z.preprocess(
  (v) => (v === "" ? undefined : v),
  id.optional(),
);
const optionalDate = z.preprocess(
  (v) => (v === "" ? undefined : v),
  calendarDate.optional(),
);
const instant = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.iso.datetime({ offset: true }).nullable(),
);
export const allocationFields = z
  .object({
    engagementId: id,
    assignedUserId: id,
    engagementWorkflowStageId: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      id.nullable(),
    ),
    allocationDate: calendarDate,
    allocatedHours: z.coerce
      .number()
      .finite()
      .positive()
      .max(999999.99)
      .refine(
        (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
        "Use at most two decimal places.",
      ),
    plannedStartAt: instant,
    plannedEndAt: instant,
    priority: z.enum(PRIORITIES).default("Normal"),
    description: z.string().trim().max(1000).default(""),
    allocationNote: z.string().trim().max(2000).default(""),
    status: z.enum(["Planned", "Assigned"]).default("Assigned"),
  })
  .refine(
    (v) =>
      !v.plannedStartAt ||
      !v.plannedEndAt ||
      new Date(v.plannedEndAt) > new Date(v.plannedStartAt),
    {
      message: "Planned end must be after planned start.",
      path: ["plannedEndAt"],
    },
  );
export const batchInput = z.object({
  rows: z.array(allocationFields).min(1).max(100),
  acknowledgeBudget: z.boolean().default(false),
});
export const changeInput = z.object({
  revision: z.number().int().positive(),
  action: z.enum(["edit", "reassign", "status", "cancel", "note"]),
  fields: allocationFields.optional(),
  assignedUserId: id.optional(),
  status: z.enum(ALLOCATION_STATUSES).optional(),
  reason: z.string().trim().max(2000).default(""),
  blockedReason: z.enum(BLOCK_REASONS).optional(),
  acknowledgeBudget: z.boolean().default(false),
  changeStageOwner: z.boolean().default(false),
  workflowRevision: z.number().int().positive().optional(),
});
export const queueInput = z
  .object({
    view: z
      .enum([
        "today",
        "week",
        "upcoming",
        "overdue",
        "blocked",
        "completed",
        "all",
      ])
      .default("week"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    responsibilityPage: z.coerce.number().int().min(1).max(100000).default(1),
    employeeId: optionalId,
    engagementId: optionalId,
    clientId: optionalId,
    serviceLineId: optionalId,
    managerId: optionalId,
    officeId: optionalId,
    stage: z.string().trim().max(150).default(""),
    client: z.string().trim().max(150).default(""),
    engagement: z.string().trim().max(150).default(""),
    serviceLine: z.string().trim().max(150).default(""),
    employee: z.string().trim().max(150).default(""),
    manager: z.string().trim().max(150).default(""),
    office: z.string().trim().max(150).default(""),
    from: optionalDate,
    to: optionalDate,
    dueFrom: optionalDate,
    dueTo: optionalDate,
    priority: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(PRIORITIES).optional(),
    ),
    status: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(ALLOCATION_STATUSES).optional(),
    ),
    sort: z
      .enum(["allocationDate", "dueDate", "priority", "client", "engagement"])
      .default("allocationDate"),
    direction: z.enum(["asc", "desc"]).default("asc"),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Allocation date range is reversed.",
  )
  .refine(
    (v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo,
    "Due date range is reversed.",
  );

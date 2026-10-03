import { z } from "zod";
import { id } from "./validation";
import { dateOnly, clientInput } from "./client-validation";
import {
  ENGAGEMENT_STATUSES,
  PRIORITIES,
  PERIODS,
} from "./engagement-constants";
export const nullableId = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  id.nullable(),
);
export const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  dateOnly.nullable(),
);
const text = (max = 250) => z.string().trim().max(max).default("");
export const engagementInput = z
  .object({
    engagementCode: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
      .transform((v) => v.toUpperCase()),
    engagementName: z.string().trim().min(1).max(250),
    clientId: id,
    serviceLineId: id,
    engagementTypeId: id,
    workflowTemplateId: nullableId,
    officeId: id,
    partnerId: nullableId,
    managerId: nullableId,
    reviewerId: nullableId,
    preparerId: nullableId,
    status: z.enum(ENGAGEMENT_STATUSES).default("Planned"),
    priority: z.enum(PRIORITIES).default("Normal"),
    periodType: z.enum(PERIODS).default("NotApplicable"),
    periodStartDate: optionalDate,
    periodEndDate: optionalDate,
    reportingYear: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.coerce.number().int().min(1900).max(9999).nullable(),
    ),
    allocationDate: optionalDate,
    plannedStartDate: optionalDate,
    actualStartDate: optionalDate,
    dueDate: optionalDate,
    completedDate: optionalDate,
    budgetHours: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.coerce.number().finite().min(0).max(1000000).nullable(),
    ),
    recurring: z.boolean().default(false),
    description: text(8000),
    internalNotes: text(8000),
    version: z.number().int().positive().optional(),
    associateService: z.boolean().default(false),
    customFields: clientInput.shape.customFields,
    statusComment: text(2000),
  })
  .superRefine((v, ctx) => {
    const error = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if ((v.periodStartDate === null) !== (v.periodEndDate === null))
      error("periodEndDate", "Enter both period dates.");
    if (
      v.periodStartDate &&
      v.periodEndDate &&
      v.periodEndDate < v.periodStartDate
    )
      error("periodEndDate", "Period end cannot precede period start.");
    if (
      v.periodType === "NotApplicable" &&
      (v.periodStartDate || v.periodEndDate || v.reportingYear)
    )
      error(
        "periodType",
        "Not Applicable cannot have period dates or a reporting year.",
      );
    if (
      ["Monthly", "Quarterly", "Annual", "Custom"].includes(v.periodType) &&
      !v.periodStartDate
    )
      error(
        "periodStartDate",
        "This period type requires start and end dates.",
      );
    if (v.periodType === "TaxYear" && !v.reportingYear && !v.periodStartDate)
      error(
        "reportingYear",
        "Enter a reporting year or explicit period dates.",
      );
    if (v.status === "Completed" && !v.completedDate)
      error(
        "completedDate",
        "Completed engagements require a completion date.",
      );
    if (v.status !== "Completed" && v.completedDate)
      error(
        "completedDate",
        "Only Completed engagements can have a completion date.",
      );
    if (
      v.actualStartDate &&
      v.completedDate &&
      v.completedDate < v.actualStartDate
    )
      error("completedDate", "Completion cannot precede actual start.");
    if (v.plannedStartDate && v.dueDate && v.dueDate < v.plannedStartDate)
      error("dueDate", "Due date cannot precede planned start.");
    if (v.allocationDate && !v.preparerId)
      error("allocationDate", "Select a preparer for an allocation date.");
  });
export type EngagementInput = z.infer<typeof engagementInput>;
export const engagementListInput = z
  .object({
    q: text(200),
    workflowTemplateId: nullableId,
    workflowOwnerId: nullableId,
    workflowStage: text(150),
    clientId: nullableId,
    serviceLineId: nullableId,
    engagementTypeId: nullableId,
    officeId: nullableId,
    partnerId: nullableId,
    managerId: nullableId,
    reviewerId: nullableId,
    preparerId: nullableId,
    status: z.union([z.literal(""), z.enum(ENGAGEMENT_STATUSES)]).default(""),
    priority: z.union([z.literal(""), z.enum(PRIORITIES)]).default(""),
    periodType: z.union([z.literal(""), z.enum(PERIODS)]).default(""),
    periodFrom: optionalDate,
    periodTo: optionalDate,
    dueFrom: optionalDate,
    dueTo: optionalDate,
    recurring: z.enum(["", "true", "false"]).default(""),
    scope: z
      .enum(["all", "active", "completed", "overdue", "week"])
      .default("all"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
    sort: z
      .enum([
        "dueDate",
        "engagementName",
        "engagementCode",
        "status",
        "priority",
        "budgetHours",
        "createdAt",
        "updatedAt",
      ])
      .default("dueDate"),
    direction: z.enum(["asc", "desc"]).default("asc"),
  })
  .refine((v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo, {
    message: "Due range is reversed.",
    path: ["dueTo"],
  })
  .refine((v) => !v.periodFrom || !v.periodTo || v.periodFrom <= v.periodTo, {
    message: "Period range is reversed.",
    path: ["periodTo"],
  });
export type EngagementFilters = z.infer<typeof engagementListInput>;

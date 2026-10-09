import { z } from "zod";
import { id } from "./validation";
import { nullableId } from "./engagement-validation";
export const POINT_TYPES = [
  "Question",
  "ReviewPoint",
  "KnowledgeInstruction",
  "InternalIssue",
] as const;
export const POINT_STATUSES = [
  "Open",
  "Responded",
  "ClarificationRequired",
  "Resolved",
  "Closed",
  "Reopened",
  "Active",
  "Archived",
] as const;
export const POINT_OPEN_STATUSES = [
  "Open",
  "Responded",
  "ClarificationRequired",
  "Reopened",
] as const;
export const POINT_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
const labels: Record<string, string> = {
  KnowledgeInstruction: "Knowledge / Instruction",
  External: "Client-facing / External",
  ReviewPoint: "Review Point",
  ClarificationRequired: "Clarification Required",
};
export const pointLabel = (value: string) => labels[value] ?? value;
// Keep monetary inputs as decimal strings; never round through binary floating point.
const amount = z.preprocess(
  (v) =>
    v === "" || v === undefined ? null : typeof v === "number" ? String(v) : v,
  z
    .string()
    .regex(
      /^-?\d{1,16}(\.\d{1,2})?$/,
      "Use at most 16 integer digits and two decimal places.",
    )
    .nullable(),
);
const date = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.iso.date().nullable(),
);
export const pointFields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  priority: z.enum(POINT_PRIORITIES).default("Normal"),
  audience: z.enum(["Internal", "External"]).default("Internal"),
  workflowStageId: nullableId,
  checklistItemId: nullableId,
  referenceNumber: z.string().trim().max(150).default(""),
  referenceAmount: amount,
  priorYearAmount: amount,
  dueDate: date,
  blocking: z.boolean().default(false),
});
export const pointCreate = pointFields.extend({
  pointType: z.enum(POINT_TYPES),
  assignedToUserId: id,
});
const base = { revision: z.number().int().positive() },
  reason = z.string().trim().min(1).max(4000);
export const pointAction = z.discriminatedUnion("action", [
  z.object({
    ...base,
    action: z.literal("reply"),
    commentText: z.string().trim().min(1).max(8000),
    parentCommentId: nullableId,
    markResponded: z.boolean().default(true),
  }),
  z.object({
    ...base,
    action: z.literal("assign"),
    assignedToUserId: id,
    reason,
  }),
  z.object({ ...base, action: z.literal("edit"), fields: pointFields, reason }),
  z.object({
    ...base,
    action: z.literal("status"),
    status: z.enum(["Open", "Responded", "ClarificationRequired"]),
    reason,
  }),
  z.object({ ...base, action: z.literal("resolve"), reason }),
  z.object({ ...base, action: z.literal("reopen"), reason }),
  z.object({ ...base, action: z.literal("close"), reason }),
]);
export const pointFilters = z.object({
  q: z.string().trim().max(200).default(""),
  pointType: z.enum(["", ...POINT_TYPES]).default(""),
  status: z.enum(["", ...POINT_STATUSES]).default(""),
  assignedToUserId: nullableId,
  raisedByUserId: nullableId,
  priority: z.enum(["", ...POINT_PRIORITIES]).default(""),
  dueDate: date,
  blocking: z.enum(["", "yes", "no"]).default(""),
  view: z.enum(["", "open", "overdue", "blocking"]).default(""),
  workflowStageId: nullableId,
  checklistItemId: nullableId,
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

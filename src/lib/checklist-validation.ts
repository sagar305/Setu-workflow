import { z } from "zod";
import { id } from "./validation";
import { nullableId } from "./engagement-validation";
export const CHECKLIST_STATUSES = [
  "NotStarted",
  "InProgress",
  "Blocked",
  "Completed",
  "NotApplicable",
] as const;
export const CHECKLIST_OWNERS = [
  "StageOwner",
  "Preparer",
  "Reviewer",
  "Manager",
  "Partner",
  "SpecificUser",
  "Manual",
] as const;
export const checklistDefinition = z.object({
  itemCode: z.string().trim().max(60).default(""),
  itemTitle: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  instructions: z.string().trim().max(8000).default(""),
  defaultOwnerType: z.enum(CHECKLIST_OWNERS).default("StageOwner"),
  specificUserId: nullableId,
  estimatedHours: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().positive().max(100000).nullable(),
  ),
  relativeDueDays: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().int().min(-3650).max(3650).nullable(),
  ),
  isRequired: z.boolean().default(true),
  evidenceRequired: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const checklistFields = checklistDefinition
  .pick({
    itemCode: true,
    itemTitle: true,
    description: true,
    instructions: true,
    estimatedHours: true,
    isRequired: true,
    evidenceRequired: true,
  })
  .extend({
    dueDate: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.iso.date().nullable(),
    ),
  });
export const checklistCreate = checklistFields.extend({
  stageId: id,
  workflowRevision: z.number().int().positive(),
  assignedUserId: nullableId,
});
export const checklistAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    revision: z.number().int().positive(),
    fields: checklistFields,
  }),
  z.object({
    action: z.literal("assign"),
    revision: z.number().int().positive(),
    assignedUserId: nullableId,
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("status"),
    revision: z.number().int().positive(),
    status: z.enum(CHECKLIST_STATUSES),
    reason: z.string().trim().max(2000).default(""),
  }),
  z.object({
    action: z.literal("reopen"),
    revision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("comment"),
    revision: z.number().int().positive(),
    commentText: z.string().trim().min(1).max(8000),
  }),
]);
export function checklistProgress(
  items: { status: string; isRequired?: boolean }[],
) {
  const count = (status: string) =>
    items.filter((i) => i.status === status).length;
  const completed = count("Completed"),
    applicable = items.length - count("NotApplicable");
  return {
    total: items.length,
    applicable,
    completed,
    inProgress: count("InProgress"),
    blocked: count("Blocked"),
    notStarted: count("NotStarted"),
    notApplicable: count("NotApplicable"),
    percent: applicable ? Math.round((completed / applicable) * 100) : 0,
    requiredCompleted: items.filter(
      (i) => i.isRequired && i.status === "Completed",
    ).length,
    requiredOutstanding: items.filter(
      (i) => i.isRequired && !["Completed", "NotApplicable"].includes(i.status),
    ).length,
  };
}

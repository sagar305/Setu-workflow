import { checklistDefinition } from "./checklist-validation";
import { z } from "zod";
import { id } from "./validation";
import { nullableId } from "./engagement-validation";
export const OWNER_TYPES = [
  "Manual",
  "Partner",
  "Manager",
  "Reviewer",
  "Preparer",
  "SpecificUser",
] as const;
export const CATEGORIES = [
  "Queue",
  "Preparation",
  "Waiting",
  "Review",
  "Approval",
  "Completion",
  "Other",
] as const;
export const stageInput = z.object({
  checklistItems: z.array(checklistDefinition).max(100).default([]),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).default(""),
  category: z.enum(CATEGORIES).default("Other"),
  defaultOwnerType: z.enum(OWNER_TYPES).default("Manual"),
  specificUserId: nullableId,
  targetDays: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(3650).nullable(),
  ),
  instructions: z.string().trim().max(4000).default(""),
  required: z.boolean().default(true),
  isStart: z.boolean().default(false),
  isCompletion: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const templateInput = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(4000).default(""),
  serviceLineId: id,
  engagementTypeId: nullableId,
  stages: z.array(stageInput).min(1).max(60),
  revision: z.number().int().positive().optional(),
});
export const transitionInput = z.object({
  checklistOverrideReason: z.string().trim().max(2000).default(""),
  revision: z.number().int().positive(),
  currentStageId: id,
  action: z.enum([
    "Forward",
    "Return",
    "Reassign",
    "Skip",
    "Complete",
    "Reopen",
  ]),
  targetStageId: nullableId,
  assignedUserId: id.nullable().optional(),
  comment: z.string().trim().max(2000).default(""),
});

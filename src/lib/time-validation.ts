import { z } from "zod";
import { Prisma } from "@prisma/client";
import { id } from "./validation";
const optionalId = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  id.nullable(),
);
export const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Enter a valid work date.");
export const timeFields = z.object({
  engagementId: id,
  workDate: businessDate,
  hours: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(
      z
        .string()
        .regex(
          /^\d{1,2}(\.\d{1,2})?$/,
          "Use decimal hours with up to two decimal places.",
        ),
    )
    .refine(
      (v) =>
        /^\d{1,2}(\.\d{1,2})?$/.test(v) &&
        new Prisma.Decimal(v).gt(0) &&
        new Prisma.Decimal(v).lte(24),
      "Hours must be greater than zero and at most 24.",
    ),
  description: z.string().trim().min(1).max(2000),
  engagementWorkflowStageId: optionalId,
  checklistItemId: optionalId,
  workAllocationId: optionalId,
});
export const timeCreate = timeFields.extend({ requestId: id });
export const timeChange = z.object({
  action: z.enum(["edit", "delete", "submit", "correct"]),
  revision: z.number().int().positive(),
  fields: timeFields.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
});
export function hourMetrics(
  budget: number | null,
  planned: Prisma.Decimal,
  actual: Prisma.Decimal,
) {
  const b = budget === null ? null : new Prisma.Decimal(String(budget));
  const used = b?.gt(0) ? actual.div(b).mul(100) : null;
  const warnings: string[] = [];
  if (b !== null && actual.gt(b)) warnings.push("Budget exceeded");
  else if (used?.gte(90)) warnings.push("90% of budget consumed");
  else if (used?.gte(80)) warnings.push("80% of budget consumed");
  if (actual.gt(planned))
    warnings.push("Actual hours exceed planned allocation");
  return {
    budget: b?.toFixed(2) ?? null,
    planned: planned.toFixed(2),
    actual: actual.toFixed(2),
    remaining: b?.minus(actual).toFixed(2) ?? null,
    used: used?.toFixed(1) ?? null,
    warnings,
  };
}

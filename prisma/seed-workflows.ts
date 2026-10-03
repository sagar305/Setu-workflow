import { db } from "../src/lib/db";
import { audit } from "../src/lib/auth";
import { newToken, tokenHash } from "../src/lib/crypto";
import { applyWorkflow } from "../src/lib/workflows";
import { normalizeName } from "../src/lib/client-constants";
import type { WorkflowCategory, WorkflowOwnerType } from "@prisma/client";
export async function seedDemoWorkflows() {
  const admin = await db.user.findUnique({
    where: { email: "admin@demo.setu.test" },
  });
  if (!admin) return;
  const definitions = [
    [
      "Monthly Close",
      "Month-End Close",
      "Monthly Close",
      [
        "Assigned",
        "Preparation",
        "Questions",
        "Reviewer Review",
        "Manager Review",
        "Complete",
      ],
    ],
    [
      "Monthly Bookkeeping",
      "Bookkeeping",
      "Monthly Bookkeeping",
      ["Assigned", "Processing", "Reconciliation", "Review", "Complete"],
    ],
    [
      "Form 1040",
      "Tax",
      "Individual Tax Return",
      [
        "Assigned",
        "Preparation",
        "Open Questions",
        "Reviewer Review",
        "Manager Review",
        "Ready to File",
        "Complete",
      ],
    ],
    [
      "Form 1065",
      "Tax",
      "Partnership Tax Return",
      [
        "Assigned",
        "Preparation",
        "Open Questions",
        "Reviewer Review",
        "Manager Review",
        "Partner Review",
        "Ready to File",
        "Complete",
      ],
    ],
    [
      "Form 1120S",
      "Tax",
      "S Corporation Tax Return",
      [
        "Assigned",
        "Preparation",
        "Open Questions",
        "Reviewer Review",
        "Manager Review",
        "Partner Review",
        "Ready to File",
        "Complete",
      ],
    ],
    [
      "Audit / Assurance",
      "Audit",
      "Financial Statement Audit",
      [
        "Planning",
        "Fieldwork",
        "Open Items",
        "Senior Review",
        "Manager Review",
        "Partner Review",
        "Finalization",
        "Complete",
      ],
    ],
  ] as const;
  for (const [name, serviceName, typeName, names] of definitions)
    await db.$transaction(async (tx) => {
      const firmId = admin.firmId;
      if (
        await tx.workflowTemplate.findFirst({
          where: { firmId, normalizedName: normalizeName(name) },
        })
      )
        return;
      const service = await tx.serviceLine.findFirstOrThrow({
          where: { firmId, name: serviceName },
        }),
        type = await tx.engagementType.findFirstOrThrow({
          where: { firmId, name: typeName },
        });
      const t = await tx.workflowTemplate.create({
        data: {
          firmId,
          name,
          normalizedName: normalizeName(name),
          description:
            "Demo template. Create a new version to adapt it for your firm.",
          serviceLineId: service.id,
          engagementTypeId: type.id,
          createdByUserId: admin.id,
        },
      });
      for (const [i, stageName] of names.entries()) {
        const category: WorkflowCategory =
          i === names.length - 1
            ? "Completion"
            : i === 0
              ? "Queue"
              : /Questions|Items/.test(stageName)
                ? "Waiting"
                : /Review/.test(stageName)
                  ? "Review"
                  : "Preparation";
        const defaultOwnerType: WorkflowOwnerType = /Partner/.test(stageName)
          ? "Partner"
          : /Manager/.test(stageName)
            ? "Manager"
            : /Review/.test(stageName)
              ? "Reviewer"
              : "Preparer";
        await tx.workflowTemplateStage.create({
          data: {
            firmId,
            workflowTemplateId: t.id,
            name: stageName,
            sequence: (i + 1) * 10,
            category,
            defaultOwnerType,
            targetDays:
              category === "Review" ? 2 : category === "Preparation" ? 3 : null,
            instructions: "",
            required: category !== "Waiting",
            isStart: i === 0,
            isCompletion: i === names.length - 1,
          },
        });
      }
      await tx.workflowTemplate.update({
        where: { id: t.id },
        data: { status: "Published" },
      });
      if (!type.defaultWorkflowTemplateId)
        await tx.engagementType.update({
          where: { id: type.id },
          data: { defaultWorkflowTemplateId: t.id },
        });
      await audit(
        tx,
        firmId,
        admin.id,
        "workflow_template.created",
        "WorkflowTemplate",
        t.id,
        { source: "demo-seed" },
      );
      await audit(
        tx,
        firmId,
        admin.id,
        "workflow_template.published",
        "WorkflowTemplate",
        t.id,
        { source: "demo-seed" },
      );
    });
  // Apply only to untouched compatible demo records; reruns never reset live work.
  const token = newToken();
  await db.session.create({
    data: {
      firmId: admin.firmId,
      userId: admin.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  try {
    for (const code of ["ABC001-2026-TAX", "SMITH-102-2026-TAX"]) {
      const e = await db.engagement.findFirst({
        where: {
          firmId: admin.firmId,
          engagementCode: code,
          status: { in: ["Planned", "Draft"] },
          workflow: null,
        },
      });
      if (!e) continue;
      const template = await db.workflowTemplate.findFirst({
        where: {
          firmId: admin.firmId,
          serviceLineId: e.serviceLineId,
          engagementTypeId: e.engagementTypeId,
          status: "Published",
          active: true,
        },
        orderBy: { versionNumber: "desc" },
      });
      if (template)
        await applyWorkflow(token, e.id, { templateId: template.id });
    }
  } finally {
    await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }
  console.log(
    "Demo workflow templates ready (six blueprints; existing versions preserved).",
  );
}

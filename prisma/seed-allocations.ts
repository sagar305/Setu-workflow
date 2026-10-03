import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import { createAllocations, changeAllocation } from "../src/lib/allocations";
import { firmDates } from "../src/lib/engagement-constants";
import { saveTemplate, templateAction } from "../src/lib/workflow-templates";
import { applyWorkflow } from "../src/lib/workflows";
export async function seedDemoAllocations() {
  for (const domain of ["demo.setu.test", "sample.setu.test"]) {
    const admin = await db.user.findUnique({
      where: { email: `admin@${domain}` },
      include: { firm: true },
    });
    if (!admin) continue;
    if (
      await db.auditLog.findFirst({
        where: {
          firmId: admin.firmId,
          action: "allocation.created",
          metadata: {
            path: ["after", "allocationNote"],
            equals: "Build 5 demo",
          },
        },
      })
    )
      continue;
    const engagements = await db.engagement.findMany({
      where: {
        firmId: admin.firmId,
        status: { notIn: ["Completed", "Cancelled"] },
        preparerId: { not: null },
      },
      orderBy: { engagementCode: "asc" },
      take: 3,
    });
    if (!engagements.length) continue;
    const token = newToken();
    await db.session.create({
      data: {
        firmId: admin.firmId,
        userId: admin.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    try {
      // Each firm receives its own compatible runtime example; no shared snapshots.
      for (const e of engagements)
        if (
          !(await db.engagementWorkflow.findFirst({
            where: { engagementId: e.id },
          }))
        ) {
          let t = await db.workflowTemplate.findFirst({
            where: {
              firmId: admin.firmId,
              name: `Build 5 ${e.engagementCode}`,
              status: "Published",
            },
          });
          if (!t) {
            const draft = await saveTemplate(token, {
              name: `Build 5 ${e.engagementCode}`,
              serviceLineId: e.serviceLineId,
              engagementTypeId: e.engagementTypeId,
              stages: [
                {
                  name: "Preparation",
                  category: "Preparation",
                  isStart: true,
                  defaultOwnerType: "Preparer",
                },
                {
                  name: "Reviewer Review",
                  category: "Review",
                  defaultOwnerType: "Reviewer",
                },
                {
                  name: "Manager Review",
                  category: "Completion",
                  isCompletion: true,
                  defaultOwnerType: "Manager",
                },
              ],
            });
            await templateAction(token, draft.id, {
              action: "publish",
              revision: 1,
            });
            t = await db.workflowTemplate.findUniqueOrThrow({
              where: { id: draft.id },
            });
          }
          await applyWorkflow(token, e.id, { templateId: t.id });
        }
      const e = engagements[0],
        w = await db.engagementWorkflow.findUniqueOrThrow({
          where: { engagementId: e.id },
        });
      const dates = firmDates(admin.firm.timezone);
      const day = (offset: number) => {
        const d = new Date(dates.weekStart);
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      };
      const rows = [-7, 0, 1, 2, 3, 7].map((offset, i) => ({
        engagementId: e.id,
        assignedUserId: e.preparerId!,
        engagementWorkflowStageId: w.currentStageId,
        allocationDate: day(offset),
        allocatedHours: [2, 3, 2, 2, 1, 3][i],
        status: i === 1 ? "Planned" : "Assigned",
        description: [
          "Prior period reconciliation",
          "Preparation",
          "Bank reconciliation",
          "Review supporting documents",
          "Manager review preparation",
          "Next period planning",
        ][i],
        allocationNote: "Build 5 demo",
      }));
      const created = await createAllocations(token, {
        rows,
        acknowledgeBudget: true,
      });
      const items = created.items as { id: string; revision: number }[];
      await changeAllocation(token, items[2].id, {
        revision: 1,
        action: "status",
        status: "InProgress",
      });
      await changeAllocation(token, items[3].id, {
        revision: 1,
        action: "status",
        status: "Blocked",
        blockedReason: "Waiting for Documents",
        reason: "Client bank statement outstanding.",
      });
      await changeAllocation(token, items[4].id, {
        revision: 1,
        action: "status",
        status: "Completed",
      });
      if (e.reviewerId)
        await changeAllocation(token, items[5].id, {
          revision: 1,
          action: "reassign",
          assignedUserId: e.reviewerId,
          reason: "Reviewer will prepare next period review plan.",
        });
      console.log(
        `Build 5 allocations seeded for ${admin.firm.displayName}; remaining current stages stay unscheduled.`,
      );
    } finally {
      await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
  }
}

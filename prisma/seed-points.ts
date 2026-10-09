import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import { createPoint, changePoint } from "../src/lib/points";
import { firmDates } from "../src/lib/engagement-constants";
import { saveEngagement } from "../src/lib/engagements";
export async function seedDemoPoints() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is development-only.");
  for (const domain of ["demo.setu.test", "sample.setu.test"]) {
    const actor = await db.user.findUnique({
      where: { email: `admin@${domain}` },
      include: { firm: true },
    });
    if (!actor) continue;
    const token = newToken(),
      session = await db.session.create({
        data: {
          firmId: actor.firmId,
          userId: actor.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    try {
      const engagements = await db.engagement.findMany({
        where: {
          firmId: actor.firmId,
          status: { notIn: ["Completed", "Cancelled"] },
        },
        include: { engagementType: true, serviceLine: true },
        orderBy: { createdAt: "asc" },
      });
      if (
        !engagements.some((e) =>
          /audit/i.test(`${e.engagementType.name} ${e.serviceLine.name}`),
        )
      ) {
        const service = await db.serviceLine.findFirstOrThrow({
          where: { firmId: actor.firmId, name: "Audit", active: true },
        });
        const type = await db.engagementType.findFirstOrThrow({
          where: {
            firmId: actor.firmId,
            name: "Financial Statement Audit",
            active: true,
          },
        });
        const client =
          (await db.client.findFirst({
            where: {
              firmId: actor.firmId,
              status: "Active",
              services: { some: { serviceLineId: service.id } },
            },
          })) ??
          (await db.client.findFirst({
            where: { firmId: actor.firmId, status: "Active" },
            orderBy: { clientCode: "asc" },
          }));
        if (
          client &&
          !(await db.engagement.findFirst({
            where: { firmId: actor.firmId, engagementCode: "DEMO-B7-AUDIT" },
          }))
        ) {
          const saved = await saveEngagement(token, {
            engagementCode: "DEMO-B7-AUDIT",
            engagementName: "Demo Financial Statement Audit",
            clientId: client.id,
            serviceLineId: service.id,
            engagementTypeId: type.id,
            officeId: client.primaryOfficeId,
            partnerId: actor.id,
            preparerId: actor.id,
            status: "Planned",
            associateService: true,
          });
          engagements.push(
            await db.engagement.findUniqueOrThrow({
              where: { id: saved.id },
              include: { engagementType: true, serviceLine: true },
            }),
          );
        }
      }
      const examples = [
        {
          pattern: /monthly close/i,
          titles: [
            "Unexplained bank reconciliation difference",
            "Missing credit card statement",
            "Accrual support required",
            "Prepayment calculation review",
          ],
        },
        {
          pattern: /tax/i,
          titles: [
            "Missing K-1",
            "Prior-year carryforward clarification",
            "Reviewer observation",
          ],
        },
        {
          pattern: /audit/i,
          titles: [
            "Missing supporting documentation",
            "Sample-testing discrepancy",
            "Review observation",
          ],
        },
      ];
      let index = 0;
      for (const group of examples) {
        const e = engagements.find((e) =>
          group.pattern.test(
            `${e.engagementType.name} ${e.serviceLine.name} ${e.engagementName}`,
          ),
        );
        if (!e) continue;
        for (const title of group.titles) {
          const referenceNumber = `DEMO-B7-${++index}`;
          if (
            await db.engagementPoint.findFirst({
              where: {
                firmId: actor.firmId,
                engagementId: e.id,
                referenceNumber,
              },
            })
          )
            continue;
          const raised = new Date(Date.now() - (index + 1) * 86400000),
            due = new Date(Date.now() - 86400000);
          const row = await createPoint(
            token,
            e.id,
            {
              title,
              description: `Demo observation: ${title.toLowerCase()}. Document your investigation and have the reviewer confirm the outcome.`,
              pointType: index % 3 === 0 ? "ReviewPoint" : "Question",
              assignedToUserId: e.preparerId ?? actor.id,
              referenceNumber,
              referenceAmount: index === 1 ? "2450.00" : null,
              priority: index % 2 ? "High" : "Normal",
              blocking: index % 3 === 1,
              dueDate: firmDates(actor.firm.timezone, due).today,
            },
            raised,
          );
          const act = async (data: Record<string, unknown>) => {
            const p = await db.engagementPoint.findUniqueOrThrow({
              where: { id: row.id },
            });
            return changePoint(token, row.id, {
              revision: p.revision,
              ...data,
            });
          };
          if (index % 4 !== 1) {
            await act({
              action: "reply",
              commentText: "Please confirm the source document and period.",
            });
            const response = await db.pointResponse.findFirstOrThrow({
              where: { firmId: actor.firmId, pointId: row.id },
              orderBy: { createdAt: "asc" },
            });
            await act({
              action: "reply",
              parentCommentId: response.id,
              commentText:
                "Source reviewed; the timing difference is documented.",
            });
          }
          if (index % 4 === 3 || index % 4 === 0)
            await act({
              action: "resolve",
              reason: "Reviewed the explanation and agreed the treatment.",
            });
          if (index % 4 === 0)
            await act({
              action: "reopen",
              reason: "Additional review requires updated support.",
            });
        }
      }
      const e = engagements[0];
      if (
        e &&
        !(await db.engagementPoint.findFirst({
          where: {
            firmId: actor.firmId,
            engagementId: e.id,
            referenceNumber: "DEMO-B7-INSTRUCTION",
          },
        }))
      )
        await createPoint(token, e.id, {
          title: "Document period-end cut-off rationale",
          description:
            "Record the source and period used when explaining timing differences. This is reusable guidance, not an unanswered question.",
          pointType: "KnowledgeInstruction",
          assignedToUserId: e.preparerId ?? actor.id,
          referenceNumber: "DEMO-B7-INSTRUCTION",
        });
    } finally {
      await db.session.delete({ where: { id: session.id } });
    }
  }
}

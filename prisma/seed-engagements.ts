import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveEngagement, seedEngagementCatalogs } from "../src/lib/engagements";
import { normalizeName } from "../src/lib/client-constants";
export async function seedDemoEngagements() {
  for (const domain of ["demo.setu.test", "sample.setu.test"]) {
    const admin = await db.user.findUnique({
      where: { email: `admin@${domain}` },
    });
    if (!admin) continue;
    await seedEngagementCatalogs(db, admin.firmId);
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
      const [users, offices, services, types] = await Promise.all([
        db.user.findMany({ where: { firmId: admin.firmId, status: "Active" } }),
        db.office.findMany({
          where: { firmId: admin.firmId, active: true },
          orderBy: { officeName: "asc" },
        }),
        db.serviceLine.findMany({
          where: { firmId: admin.firmId, active: true },
        }),
        db.engagementType.findMany({
          where: { firmId: admin.firmId, active: true },
        }),
      ]);
      const staff = (alias: string) =>
        users.find((u) => u.email === `${alias}@${domain}`)?.id ?? null;
      const field = await db.engagementCustomFieldDefinition.upsert({
        where: {
          firmId_normalizedName: {
            firmId: admin.firmId,
            normalizedName: normalizeName("Complexity"),
          },
        },
        create: {
          firmId: admin.firmId,
          name: "Complexity",
          normalizedName: normalizeName("Complexity"),
          fieldType: "Dropdown",
          options: ["Standard", "Complex", "Specialist"],
        },
        update: {},
      });
      const records = [
        [
          "ABC001",
          "2026-09-CLOSE",
          "September 2026 Monthly Close",
          "Bookkeeping",
          "Monthly Close",
          "Assigned",
          "Normal",
          24,
          "2026-10-10",
        ],
        [
          "ABC001",
          "2026-Q3-SALES",
          "Q3 2026 Sales Tax",
          "Sales Tax",
          "Sales Tax",
          "InProgress",
          "High",
          8,
          "2026-09-25",
        ],
        [
          "ABC001",
          "2026-TAX",
          "2026 Corporate Tax Return",
          "Tax",
          "S Corporation Tax Return",
          "Planned",
          "High",
          36,
          "2027-03-15",
        ],
        [
          "SMITH-102",
          "2026-09-BOOK",
          "September 2026 Bookkeeping",
          "Bookkeeping",
          "Monthly Bookkeeping",
          "Completed",
          "Normal",
          16,
          "2026-09-28",
        ],
        [
          "SMITH-102",
          "2026-TAX",
          "2026 Partnership Tax Return",
          "Tax",
          "Partnership Tax Return",
          "Draft",
          "Low",
          30,
          "2027-03-15",
        ],
        [
          "C000245",
          "2026-09-CLOSE",
          "September 2026 Monthly Close",
          "CAS / Client Accounting Services",
          "Monthly Close",
          "OnHold",
          "Urgent",
          28,
          "2026-09-30",
        ],
        [
          "C000245",
          "2026-REVIEW",
          "FY2026 Financial Statement Review",
          "Review",
          "Review",
          "Planned",
          "Normal",
          64,
          "2027-02-28",
        ],
        [
          "NORTH-004",
          "2026-ADVISORY",
          "Q3 Advisory Project",
          "Advisory",
          "Advisory",
          "Cancelled",
          "Low",
          12,
          "2026-09-20",
        ],
      ] as const;
      for (const [index, item] of records.entries()) {
        const [
          code,
          suffix,
          name,
          serviceName,
          typeName,
          status,
          priority,
          budget,
          due,
        ] = item;
        const engagementCode = `${code}-${suffix}`;
        if (
          await db.engagement.findUnique({
            where: {
              firmId_engagementCode: { firmId: admin.firmId, engagementCode },
            },
          })
        )
          continue;
        const client = await db.client.findUnique({
          where: {
            firmId_clientCode: { firmId: admin.firmId, clientCode: code },
          },
        });
        if (!client) continue;
        const tax = name.includes("Tax Return");
        const quarterly = name.startsWith("Q3");
        const annual = name.startsWith("FY");
        const preparer = index % 3 === 2 ? staff("senior") : staff("associate");
        await saveEngagement(token, {
          clientId: client.id,
          engagementCode,
          engagementName: name,
          serviceLineId: services.find((s) => s.name === serviceName)!.id,
          engagementTypeId: types.find((t) => t.name === typeName)!.id,
          officeId:
            index % 2
              ? (offices.find((o) => o.id !== client.primaryOfficeId)?.id ??
                client.primaryOfficeId)
              : client.primaryOfficeId,
          partnerId: staff("partner"),
          managerId: staff("manager"),
          reviewerId: staff("senior"),
          preparerId: preparer,
          status,
          priority,
          budgetHours: budget,
          periodType: tax
            ? "TaxYear"
            : annual
              ? "Annual"
              : quarterly
                ? "Quarterly"
                : "Monthly",
          reportingYear: 2026,
          periodStartDate: tax
            ? null
            : annual
              ? "2026-01-01"
              : quarterly
                ? "2026-07-01"
                : "2026-09-01",
          periodEndDate: tax ? null : annual ? "2026-12-31" : "2026-09-30",
          allocationDate: preparer ? "2026-09-01" : null,
          plannedStartDate: "2026-09-01",
          actualStartDate: ["Completed", "InProgress"].includes(status)
            ? "2026-09-02"
            : null,
          dueDate: due,
          completedDate: status === "Completed" ? "2026-09-28" : null,
          recurring: !name.includes("Advisory"),
          associateService: true,
          customFields: { [field.id]: index % 2 ? "Complex" : "Standard" },
          description:
            "Demonstration engagement for Client Master integration.",
        });
      }
      console.log(`Engagement Master seed ready for ${domain}.`);
    } finally {
      await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
  }
}

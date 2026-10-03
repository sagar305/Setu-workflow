import { db } from "../src/lib/db";
import { principal } from "../src/lib/auth";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient, seedClientCatalogs } from "../src/lib/clients";
import { normalizeName } from "../src/lib/client-constants";
export async function seedDemoClients() {
  for (const [index, domain] of [
    "demo.setu.test",
    "sample.setu.test",
  ].entries()) {
    const admin = await db.user.findUnique({
      where: { email: `admin@${domain}` },
    });
    if (!admin) continue;
    await seedClientCatalogs(db, admin.firmId);
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
      const actor = await principal(token);
      const offices = await db.office.findMany({
        where: {
          firmId: admin.firmId,
          active: true,
          officeName: {
            in:
              index === 0
                ? ["Dallas Office", "Houston Office"]
                : ["New York Office", "Boston Office"],
          },
        },
        orderBy: { officeName: "asc" },
      });
      const partner = await db.user.findUniqueOrThrow({
        where: { email: `partner@${domain}` },
      });
      const manager = await db.user.findUniqueOrThrow({
        where: { email: `manager@${domain}` },
      });
      const fields = [];
      for (const [name, fieldType, options] of [
        ["Accounting Software", "Text", []],
        ["Client Tier", "Dropdown", ["A", "B", "C"]],
        ["Complexity", "Number", []],
        ["Priority Client", "Boolean", []],
        ["Relationship Review", "Date", []],
      ] as const)
        fields.push(
          await db.clientCustomFieldDefinition.upsert({
            where: {
              firmId_normalizedName: {
                firmId: admin.firmId,
                normalizedName: normalizeName(name),
              },
            },
            create: {
              firmId: admin.firmId,
              name,
              normalizedName: normalizeName(name),
              fieldType,
              options: [...options],
            },
            update: {},
          }),
        );
      const names =
        index === 0
          ? [
              "ABC Manufacturing LLC",
              "Smith Family Holdings",
              "Greenfield Medical Inc.",
              "Northstar Consulting LLC",
              "Riverbend Foundation",
            ]
          : [
              "Harbor Manufacturing LLC",
              "Baker Family Holdings",
              "Lakeside Medical Inc.",
              "Summit Consulting LLC",
              "Cedar Foundation",
            ];
      for (const [i, name] of names.entries()) {
        const clientCode = [
          "ABC001",
          "SMITH-102",
          "C000245",
          "NORTH-004",
          "RIVER-005",
        ][i];
        if (
          await db.client.findUnique({
            where: { firmId_clientCode: { firmId: admin.firmId, clientCode } },
          })
        )
          continue;
        const entity = await db.entityType.findFirstOrThrow({
          where: {
            firmId: admin.firmId,
            name: ["LLC", "Partnership", "S Corporation", "LLC", "Nonprofit"][
              i
            ],
          },
        });
        const serviceNames = [
          ["Tax", "Bookkeeping"],
          ["Advisory", "Tax"],
          ["Payroll", "CAS / Client Accounting Services"],
          ["Tax"],
          ["Audit", "Compilation"],
        ][i];
        const services = await db.serviceLine.findMany({
          where: { firmId: admin.firmId, name: { in: serviceNames } },
        });
        await saveClient(token, {
          clientCode,
          legalName: name,
          displayName: name,
          entityTypeId: entity.id,
          status: ["Active", "Onboarding", "OnHold", "Prospect", "Inactive"][i],
          primaryOfficeId: offices[i % offices.length].id,
          responsiblePartnerId: partner.id,
          responsibleManagerId: manager.id,
          industry: [
            "Manufacturing",
            "Investment",
            "Healthcare",
            "Consulting",
            "Nonprofit",
          ][i],
          taxYearEndMonth: 12,
          taxYearEndDay: 31,
          onboardingDate: `2026-0${i + 1}-15`,
          address: {
            addressLine1: `${100 + i * 20} Business Avenue`,
            city: offices[i % offices.length].city,
            stateProvince: offices[i % offices.length].state,
            postalCode: index === 0 ? "75201" : "10001",
            country: "United States",
          },
          serviceLineIds: services.map((s) => s.id),
          primaryContact: {
            firstName: ["Taylor", "Sam", "Robin", "Casey", "Jamie"][i],
            lastName: index === 0 ? "Morgan" : "Park",
            email: `contact${i + 1}@${domain}`,
            jobTitle: "Controller",
            contactType: "Accounting",
            isPrimary: true,
          },
          customFields: {
            [fields[0].id]: "QuickBooks Online",
            [fields[1].id]: i < 2 ? "A" : "B",
            [fields[2].id]: i + 1,
            [fields[3].id]: i === 0,
            [fields[4].id]: "2026-12-01",
          },
          acknowledgeDuplicate: true,
          internalNotes: "Demonstration client record.",
        });
      }
      console.log(`Client Master seed ready for ${actor.firm.displayName}.`);
    } finally {
      await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
  }
}

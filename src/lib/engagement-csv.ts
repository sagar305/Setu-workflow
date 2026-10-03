import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { requirePermission, audit } from "./auth";
import { invariant } from "./errors";
import { id } from "./validation";
import { parseFile, toCsv } from "./client-csv";
import { normalizeName } from "./client-constants";
import {
  engagementInput,
  engagementListInput,
  type EngagementInput,
} from "./engagement-validation";
import {
  engagementActor,
  engagementMutation,
  validateEngagementReferences,
  saveEngagementInTransaction,
  engagementWhere,
  engagementInclude,
  canSeeEngagement,
} from "./engagements";
import { engagementLabel } from "./engagement-constants";
export const ENGAGEMENT_COLUMNS = [
  "Engagement Code",
  "Client Code",
  "Engagement Name",
  "Service Line",
  "Engagement Type",
  "Period Type",
  "Period Start",
  "Period End",
  "Reporting Year",
  "Office",
  "Partner Email",
  "Manager Email",
  "Reviewer Email",
  "Preparer Email",
  "Allocation Date",
  "Planned Start Date",
  "Due Date",
  "Budget Hours",
  "Priority",
  "Status",
  "Recurring",
  "Description",
  "Completed Date",
] as const;
export const engagementTemplate = () =>
  toCsv([
    [...ENGAGEMENT_COLUMNS],
    [
      "ABC-2026-09-CLOSE",
      "ABC001",
      "September 2026 Monthly Close",
      "Bookkeeping",
      "Monthly Close",
      "Monthly",
      "2026-09-01",
      "2026-09-30",
      "2026",
      "Dallas Office",
      "",
      "",
      "",
      "",
      "",
      "2026-10-01",
      "2026-10-10",
      "24",
      "Normal",
      "Planned",
      "Yes",
      "",
      "",
    ],
  ]);
export async function inspectEngagementImport(
  token: string | undefined,
  input: unknown,
) {
  await engagementActor(token, "engagements.import");
  const data = z.object({ csv: z.string().max(1000000) }).parse(input);
  const file = parseFile(data.csv);
  return {
    headers: file.headers,
    count: file.records.length,
    sample: file.records.slice(0, 3),
  };
}
type ImportRow = {
  row: number;
  code: string;
  name: string;
  errors: string[];
  warnings: string[];
  data?: EngagementInput;
};
export async function previewEngagementImport(
  token: string | undefined,
  input: unknown,
) {
  const data = z
    .object({
      csv: z.string().max(1000000),
      fileName: z.string().max(200),
      mapping: z
        .partialRecord(z.enum(ENGAGEMENT_COLUMNS), z.string())
        .default({}),
      associateServices: z.boolean().default(false),
    })
    .parse(input);
  const file = parseFile(data.csv);
  for (const column of [
    "Engagement Code",
    "Client Code",
    "Engagement Name",
    "Service Line",
    "Engagement Type",
    "Office",
  ] as const)
    invariant(
      file.headers.includes(data.mapping[column] ?? column),
      `Map required column: ${column}.`,
    );
  return engagementMutation(token, "engagements.import", async (tx, actor) => {
    requirePermission(actor, "engagements.create");
    const firmId = actor.firmId;
    const [clients, offices, users, services, types] = await Promise.all([
      tx.client.findMany({
        where: {
          firmId,
          clientCode: {
            in: file.records.map((row) =>
              (
                row[
                  file.headers.indexOf(
                    data.mapping["Client Code"] ?? "Client Code",
                  )
                ] ?? ""
              )
                .trim()
                .toUpperCase(),
            ),
          },
        },
        select: { id: true, clientCode: true },
      }),
      tx.office.findMany({ where: { firmId, active: true } }),
      tx.user.findMany({
        where: { firmId, status: "Active", role: { active: true } },
        select: { id: true, email: true },
      }),
      tx.serviceLine.findMany({ where: { firmId, active: true } }),
      tx.engagementType.findMany({ where: { firmId, active: true } }),
    ]);
    const rows: ImportRow[] = [];
    const codes = new Set<string>();
    for (const [index, row] of file.records.entries()) {
      const get = (column: (typeof ENGAGEMENT_COLUMNS)[number]) =>
        (
          row[file.headers.indexOf(data.mapping[column] ?? column)] ?? ""
        ).trim();
      const errors: string[] = [];
      const warnings: string[] = [];
      const lookup = <T extends { id: string }>(
        items: T[],
        match: (item: T) => boolean,
        label: string,
      ) => {
        const result = items.find(match);
        if (!result)
          errors.push(`${label} not found or inactive in your firm.`);
        return result?.id ?? null;
      };
      const staff = (
        column:
          | "Partner Email"
          | "Manager Email"
          | "Reviewer Email"
          | "Preparer Email",
      ) =>
        get(column)
          ? lookup(users, (u) => u.email === get(column).toLowerCase(), column)
          : null;
      const labelValue = (value: string) =>
        ({
          "In Progress": "InProgress",
          "On Hold": "OnHold",
          "Tax Year": "TaxYear",
          "Not Applicable": "NotApplicable",
        })[value] ?? value;
      if (
        get("Recurring") &&
        !["yes", "no", "true", "false"].includes(get("Recurring").toLowerCase())
      )
        errors.push("Recurring must be Yes or No.");
      const candidate = {
        engagementCode: get("Engagement Code"),
        engagementName: get("Engagement Name"),
        clientId: lookup(
          clients,
          (c) => c.clientCode === get("Client Code").toUpperCase(),
          "Client Code",
        ),
        serviceLineId: lookup(
          services,
          (s) => normalizeName(s.name) === normalizeName(get("Service Line")),
          "Service Line",
        ),
        engagementTypeId: lookup(
          types,
          (t) =>
            normalizeName(t.name) === normalizeName(get("Engagement Type")),
          "Engagement Type",
        ),
        officeId: lookup(
          offices,
          (o) => normalizeName(o.officeName) === normalizeName(get("Office")),
          "Office",
        ),
        partnerId: staff("Partner Email"),
        managerId: staff("Manager Email"),
        reviewerId: staff("Reviewer Email"),
        preparerId: staff("Preparer Email"),
        periodType: labelValue(get("Period Type") || "NotApplicable"),
        periodStartDate: get("Period Start"),
        periodEndDate: get("Period End"),
        reportingYear: get("Reporting Year"),
        allocationDate: get("Allocation Date"),
        plannedStartDate: get("Planned Start Date"),
        dueDate: get("Due Date"),
        budgetHours: get("Budget Hours"),
        status: labelValue(get("Status") || "Planned"),
        priority: get("Priority") || "Normal",
        recurring: ["yes", "true"].includes(get("Recurring").toLowerCase()),
        description: get("Description"),
        completedDate: get("Completed Date"),
        associateService: data.associateServices,
      };
      const parsed = engagementInput.safeParse(candidate);
      if (!parsed.success)
        errors.push(
          ...parsed.error.issues
            .filter(
              (e) =>
                ![
                  "clientId",
                  "serviceLineId",
                  "engagementTypeId",
                  "officeId",
                ].includes(String(e.path[0])),
            )
            .map((e) => `${e.path.join(".")}: ${e.message}`),
        );
      if (parsed.success) {
        if (codes.has(parsed.data.engagementCode))
          errors.push("Engagement Code is repeated in this file.");
        codes.add(parsed.data.engagementCode);
        try {
          invariant(
            canSeeEngagement(actor, parsed.data),
            "Assign yourself to a permitted staffing slot.",
          );
          if (parsed.data.budgetHours !== null)
            requirePermission(actor, "engagements.manage_budget");
          if (
            [
              parsed.data.partnerId,
              parsed.data.managerId,
              parsed.data.reviewerId,
              parsed.data.preparerId,
            ].some(Boolean)
          )
            requirePermission(actor, "engagements.assign");
          if (!["Draft", "Planned"].includes(parsed.data.status))
            requirePermission(actor, "engagements.change_status");
          const refs = await validateEngagementReferences(
            tx,
            actor,
            parsed.data,
          );
          if (refs.needsAssociation)
            warnings.push(
              "This service will be added to the Client, as explicitly permitted for this preview.",
            );
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Validation failed.");
        }
      }
      rows.push({
        row: index + 2,
        code: get("Engagement Code"),
        name: get("Engagement Name"),
        errors,
        warnings,
        ...(parsed.success && !errors.length ? { data: parsed.data } : {}),
      });
    }
    const job = await tx.engagementImportJob.create({
      data: {
        firmId,
        actorUserId: actor.id,
        fileName: data.fileName,
        rows: rows as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return {
      jobId: job.id,
      valid: rows.filter((r) => r.data).length,
      errors: rows.filter((r) => r.errors.length).length,
      warnings: rows.filter((r) => r.warnings.length).length,
      rows: rows.map(({ data: _data, ...row }) => {
        void _data;
        return row;
      }),
    };
  });
}
export function commitEngagementImport(
  token: string | undefined,
  input: unknown,
) {
  const data = z.object({ jobId: id, confirmed: z.literal(true) }).parse(input);
  return engagementMutation(token, "engagements.import", async (tx, actor) => {
    requirePermission(actor, "engagements.create");
    const job = await tx.engagementImportJob.findFirst({
      where: { firmId: actor.firmId, id: data.jobId, actorUserId: actor.id },
    });
    invariant(job, "Import preview not found.", 404);
    if (job.status === "Completed")
      return {
        count: job.importedCount,
        message: "This import was already completed.",
      };
    invariant(
      job.expiresAt > new Date(),
      "Import preview expired. Upload again.",
    );
    const rows = job.rows as unknown as ImportRow[];
    const valid = rows.filter((r) => r.data);
    invariant(valid.length, "No valid records to import.");
    for (const row of valid)
      await saveEngagementInTransaction(tx, actor, row.data);
    await tx.engagementImportJob.update({
      where: { id: job.id },
      data: {
        status: "Completed",
        completedAt: new Date(),
        importedCount: valid.length,
        rows: rows.map(({ data: _data, ...r }) => {
          void _data;
          return r;
        }),
      },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "engagements.imported",
      "EngagementImportJob",
      job.id,
      { imported: valid.length, rejected: rows.length - valid.length },
    );
    return {
      count: valid.length,
      message: `${valid.length} engagements imported. ${rows.length - valid.length} invalid rows skipped.`,
    };
  });
}
export async function exportEngagements(
  token: string | undefined,
  input: unknown,
) {
  const actor = await engagementActor(token, "engagements.export");
  const f = engagementListInput.parse(input);
  const where = engagementWhere(actor, f);
  return db.$transaction(
    async (tx) => {
      invariant(
        (await tx.engagement.count({ where })) <= 10000,
        "Export is limited to 10,000 engagements. Narrow the filters.",
      );
      const rows = await tx.engagement.findMany({
        where,
        include: engagementInclude,
        take: 10000,
        orderBy: [{ [f.sort]: f.direction }, { id: "asc" }],
      });
      const date = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "";
      return toCsv([
        [...ENGAGEMENT_COLUMNS],
        ...rows.map((r) => [
          r.engagementCode,
          r.client.clientCode,
          r.engagementName,
          r.serviceLine.name,
          r.engagementType.name,
          engagementLabel(r.periodType),
          date(r.periodStartDate),
          date(r.periodEndDate),
          r.reportingYear,
          r.office.officeName,
          r.partner?.email ?? "",
          r.manager?.email ?? "",
          r.reviewer?.email ?? "",
          r.preparer?.email ?? "",
          date(r.allocationDate),
          date(r.plannedStartDate),
          date(r.dueDate),
          r.budgetHours,
          r.priority,
          engagementLabel(r.status),
          r.recurring ? "Yes" : "No",
          r.description,
          date(r.completedDate),
        ]),
      ]);
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}

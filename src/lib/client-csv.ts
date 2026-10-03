import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { db } from "./db";
import { audit, requirePermission } from "./auth";
import { invariant, AppError } from "./errors";
import { id } from "./validation";
import { clientInput, listInput, type ClientInput } from "./client-validation";
import {
  clientActor,
  clientMutation,
  clientWhere,
  clientInclude,
  validateClientReferences,
  similarClients,
  saveClientInTransaction,
} from "./clients";
import { normalizeName, statusLabel } from "./client-constants";
import { Prisma } from "@prisma/client";

export const IMPORT_COLUMNS = [
  "Client Code",
  "Legal Name",
  "Display Name",
  "Entity Type",
  "Status",
  "Industry",
  "Office",
  "Partner Email",
  "Manager Email",
  "Service Lines",
  "Tax Year End",
  "Onboarding Date",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Postal Code",
  "Country",
  "Primary Contact First Name",
  "Primary Contact Last Name",
  "Primary Contact Email",
  "Primary Contact Phone",
] as const;
export function toCsv(rows: unknown[][]) {
  return stringify(rows, {
    bom: true,
    escape_formulas: true,
    record_delimiter: "\r\n",
  });
}
export const importTemplate = () =>
  toCsv([
    [...IMPORT_COLUMNS],
    [
      "EXAMPLE-001",
      "Example Company LLC",
      "Example Company",
      "LLC",
      "Prospect",
      "",
      "Dallas Office",
      "",
      "",
      "Tax;Bookkeeping",
      "12-31",
      "2026-01-01",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
  ]);
export function parseFile(csv: string) {
  invariant(
    Buffer.byteLength(csv, "utf8") <= 1_000_000,
    "CSV must be smaller than 1 MB.",
  );
  let records: string[][];
  try {
    records = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 16000,
      relax_column_count: false,
    });
  } catch {
    throw new AppError(
      "Invalid CSV structure. Use the template and check quoted values and column counts.",
    );
  }
  invariant(
    records.length >= 2 && records.length <= 501,
    "Upload between 1 and 500 client rows.",
  );
  const headers = records[0].map((h) => h.trim());
  invariant(
    headers.length <= 60 &&
      headers.every(Boolean) &&
      new Set(headers).size === headers.length,
    "CSV headers must be nonempty and unique (maximum 60).",
  );
  return { headers, records: records.slice(1) };
}
export async function inspectImport(token: string | undefined, input: unknown) {
  await clientActor(token, "clients.import");
  const data = z.object({ csv: z.string().max(1_000_000) }).parse(input);
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
  data?: ClientInput;
};
export async function previewImport(token: string | undefined, input: unknown) {
  const data = z
    .object({
      csv: z.string().max(1_000_000),
      fileName: z.string().max(200),
      mapping: z.partialRecord(z.enum(IMPORT_COLUMNS), z.string()).default({}),
    })
    .parse(input);
  const file = parseFile(data.csv);
  for (const column of [
    "Client Code",
    "Legal Name",
    "Entity Type",
    "Status",
    "Office",
  ])
    invariant(
      file.headers.includes(
        data.mapping[column as keyof typeof data.mapping] ?? column,
      ),
      `Map the required column: ${column}.`,
    );
  return clientMutation(token, "clients.import", async (tx, actor) => {
    requirePermission(actor, "clients.create");
    const firmId = actor.firmId;
    const [offices, users, entities, services] = await Promise.all([
      tx.office.findMany({ where: { firmId, active: true } }),
      tx.user.findMany({
        where: { firmId, status: "Active", role: { active: true } },
        select: { id: true, email: true },
      }),
      tx.entityType.findMany({ where: { firmId, active: true } }),
      tx.serviceLine.findMany({ where: { firmId, active: true } }),
    ]);
    const results: ImportRow[] = [];
    const codes = new Set<string>();
    const names = new Set<string>();
    for (const [index, row] of file.records.entries()) {
      const get = (column: (typeof IMPORT_COLUMNS)[number]) =>
        (
          row[file.headers.indexOf(data.mapping[column] ?? column)] ?? ""
        ).trim();
      const errors: string[] = [],
        warnings: string[] = [];
      const lookup = <T extends { id: string }>(
        rows: T[],
        predicate: (r: T) => boolean,
        label: string,
        required = true,
      ) => {
        const result = rows.find(predicate);
        if (!result && required)
          errors.push(`${label} not found or inactive in your firm.`);
        return result?.id ?? null;
      };
      const office = lookup(
        offices,
        (o) => normalizeName(o.officeName) === normalizeName(get("Office")),
        "Office",
      );
      const entity = lookup(
        entities,
        (e) => normalizeName(e.name) === normalizeName(get("Entity Type")),
        "Entity type",
      );
      const partner = get("Partner Email")
        ? lookup(
            users,
            (u) => u.email === get("Partner Email").toLowerCase(),
            "Partner email",
          )
        : null;
      const manager = get("Manager Email")
        ? lookup(
            users,
            (u) => u.email === get("Manager Email").toLowerCase(),
            "Manager email",
          )
        : null;
      const serviceIds = get("Service Lines")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) =>
          lookup(
            services,
            (s) => normalizeName(s.name) === normalizeName(name),
            `Service line '${name}'`,
          ),
        )
        .filter(Boolean);
      const [month, day] = get("Tax Year End")
        ? get("Tax Year End").split("-")
        : [null, null];
      if (get("Tax Year End") && !/^\d{2}-\d{2}$/.test(get("Tax Year End")))
        errors.push("Tax Year End must be MM-DD.");
      const contactPresent = [
        "Primary Contact First Name",
        "Primary Contact Last Name",
        "Primary Contact Email",
        "Primary Contact Phone",
      ].some((c) => get(c as (typeof IMPORT_COLUMNS)[number]));
      const candidate = {
        clientCode: get("Client Code"),
        legalName: get("Legal Name"),
        displayName: get("Display Name"),
        entityTypeId: entity,
        status:
          get("Status").toLowerCase() === "on hold" ? "OnHold" : get("Status"),
        primaryOfficeId: office,
        responsiblePartnerId: partner,
        responsibleManagerId: manager,
        industry: get("Industry"),
        serviceLineIds: serviceIds,
        taxYearEndMonth: month,
        taxYearEndDay: day,
        onboardingDate: get("Onboarding Date"),
        address: {
          addressLine1: get("Address Line 1"),
          addressLine2: get("Address Line 2"),
          city: get("City"),
          stateProvince: get("State"),
          postalCode: get("Postal Code"),
          country: get("Country"),
        },
        ...(contactPresent
          ? {
              primaryContact: {
                firstName: get("Primary Contact First Name"),
                lastName: get("Primary Contact Last Name"),
                email: get("Primary Contact Email"),
                phone: get("Primary Contact Phone"),
                isPrimary: true,
              },
            }
          : {}),
        acknowledgeDuplicate: true,
      };
      const parsed = clientInput.safeParse(candidate);
      if (!parsed.success)
        errors.push(
          ...parsed.error.issues.map(
            (e) => `${e.path.join(".")}: ${e.message}`,
          ),
        );
      if (parsed.success) {
        if (codes.has(parsed.data.clientCode))
          errors.push("Client Code is repeated in this file.");
        codes.add(parsed.data.clientCode);
        try {
          await validateClientReferences(tx, firmId, parsed.data);
          if (serviceIds.length)
            requirePermission(actor, "clients.manage_services");
          if (contactPresent)
            requirePermission(actor, "clients.manage_contacts");
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Validation failed.");
        }
        if (
          (await similarClients(tx, firmId, parsed.data)).length ||
          names.has(normalizeName(parsed.data.legalName))
        )
          warnings.push(
            "Another client with a similar name already exists or appears in this file.",
          );
        names.add(normalizeName(parsed.data.legalName));
      }
      results.push({
        row: index + 2,
        code: get("Client Code"),
        name: get("Legal Name"),
        errors,
        warnings,
        ...(parsed.success && !errors.length ? { data: parsed.data } : {}),
      });
    }
    const job = await tx.clientImportJob.create({
      data: {
        firmId,
        actorUserId: actor.id,
        fileName: data.fileName,
        rows: results as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    return {
      jobId: job.id,
      valid: results.filter((r) => r.data).length,
      errors: results.filter((r) => r.errors.length).length,
      warnings: results.filter((r) => r.warnings.length).length,
      rows: results.map(({ data: _data, ...row }) => {
        void _data;
        return row;
      }),
    };
  });
}
export async function commitImport(token: string | undefined, input: unknown) {
  const data = z.object({ jobId: id, confirmed: z.literal(true) }).parse(input);
  return clientMutation(token, "clients.import", async (tx, actor) => {
    requirePermission(actor, "clients.create");
    const job = await tx.clientImportJob.findFirst({
      where: { firmId: actor.firmId, id: data.jobId, actorUserId: actor.id },
    });
    invariant(job, "Import preview not found.", 404);
    if (job.status === "Completed")
      return {
        message: `${job.importedCount} clients already imported.`,
        count: job.importedCount,
      };
    invariant(
      job.expiresAt > new Date(),
      "Preview expired. Upload and validate the file again.",
    );
    const rows = job.rows as unknown as ImportRow[];
    const valid = rows.filter((r) => r.data);
    invariant(valid.length, "No valid rows to import.");
    // All valid rows commit together. Any changed mapping/code/permission rolls back the entire import.
    for (const row of valid)
      await saveClientInTransaction(tx, actor, row.data!);
    await tx.clientImportJob.update({
      where: { firmId_id: { firmId: actor.firmId, id: job.id } },
      data: {
        status: "Completed",
        completedAt: new Date(),
        importedCount: valid.length,
        rows: rows.map(({ data: _data, ...r }) => {
          void _data;
          return r;
        }) as Prisma.InputJsonValue,
      },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "clients.imported",
      "ClientImportJob",
      job.id,
      {
        imported: valid.length,
        rejected: rows.length - valid.length,
        fileName: job.fileName,
      },
    );
    return {
      message: `${valid.length} clients imported. ${rows.length - valid.length} invalid rows skipped.`,
      count: valid.length,
    };
  });
}
export async function exportClients(token: string | undefined, input: unknown) {
  const actor = await clientActor(token, "clients.export");
  const filters = listInput.parse(input);
  return db.$transaction(
    async (tx) => {
      const where = clientWhere(actor.firmId, filters);
      invariant(
        (await tx.client.count({ where })) <= 10000,
        "Export is limited to 10,000 clients. Narrow the filters and try again.",
      );
      const clients = await tx.client.findMany({
        where,
        include: clientInclude,
        orderBy: [{ [filters.sort]: filters.direction }, { id: "asc" }],
        take: 10000,
      });
      return toCsv([
        [...IMPORT_COLUMNS],
        ...clients.map((c) => [
          c.clientCode,
          c.legalName,
          c.displayName,
          c.entityType.name,
          statusLabel(c.status),
          c.industry,
          c.primaryOffice.officeName,
          c.responsiblePartner?.email ?? "",
          c.responsibleManager?.email ?? "",
          c.services.map((s) => s.serviceLine.name).join(";"),
          c.taxYearEndMonth
            ? `${String(c.taxYearEndMonth).padStart(2, "0")}-${String(c.taxYearEndDay).padStart(2, "0")}`
            : "",
          c.onboardingDate?.toISOString().slice(0, 10) ?? "",
          c.address?.addressLine1 ?? "",
          c.address?.addressLine2 ?? "",
          c.address?.city ?? "",
          c.address?.stateProvince ?? "",
          c.address?.postalCode ?? "",
          c.address?.country ?? "",
          c.contacts[0]?.firstName ?? "",
          c.contacts[0]?.lastName ?? "",
          c.contacts[0]?.email ?? "",
          c.contacts[0]?.phone ?? "",
        ]),
      ]);
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}

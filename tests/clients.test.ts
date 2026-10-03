import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import {
  saveClient,
  getClient,
  listClients,
  saveContact,
  getContact,
  saveClientServices,
  saveClientFields,
  saveClientCatalog,
  clientActivity,
  bulkClients,
  clientOptions,
} from "../src/lib/clients";
import {
  inspectImport,
  previewImport,
  commitImport,
  exportClients,
  toCsv,
} from "../src/lib/client-csv";
const suffix = randomUUID().slice(0, 12);
let a: Awaited<ReturnType<typeof provisionFirm>>, b: typeof a;
let ta: string,
  tb: string,
  reader: string,
  officeA: string,
  officeB: string,
  entityA: string,
  entityB: string,
  serviceA: string,
  serviceA2: string,
  serviceB: string,
  clientA: string,
  clientB: string;
const fields: Record<string, string> = {};
const mint = async (userId: string, firmId: string) => {
  const t = newToken();
  await db.session.create({
    data: {
      firmId,
      userId,
      tokenHash: tokenHash(t),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return t;
};
const payload = (code = `T-${randomUUID()}`) => ({
  primaryContact: { firstName: 'Client', lastName: 'Contact', email: 'client@example.test', phone: '5551234567' },
  clientCode: code,
  legalName: `Client ${code}`,
  displayName: `Display ${code}`,
  entityTypeId: entityA,
  status: "Active",
  primaryOfficeId: officeA,
  responsiblePartnerId: a.admin.id,
  responsibleManagerId: a.admin.id,
  serviceLineIds: [serviceA, serviceA2],
});
async function editData(clientId = clientA) {
  const c = await getClient(ta, clientId);
  return {
    ...c,
    address: c.address ?? undefined,
    onboardingDate: c.onboardingDate?.toISOString().slice(0, 10) ?? null,
    terminationDate: c.terminationDate?.toISOString().slice(0, 10) ?? null,
    serviceLineIds: c.services.map((s) => s.serviceLineId),
    customFields: {},
    acknowledgeDuplicate: true,
  };
}
beforeAll(async () => {
  a = await provisionFirm({
    firmName: `Clients A ${suffix}`,
    adminEmail: `ca-${suffix}@test.invalid`,
    adminPassword: "Testing-" + randomUUID(),
    timezone: "UTC",
  });
  b = await provisionFirm({
    firmName: `Clients B ${suffix}`,
    adminEmail: `cb-${suffix}@test.invalid`,
    adminPassword: "Testing-" + randomUUID(),
    timezone: "UTC",
  });
  ta = await mint(a.admin.id, a.firm.id);
  tb = await mint(b.admin.id, b.firm.id);
  const u = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: a.roles[4].id,
      firstName: "Read",
      lastName: "Only",
      email: `ro-${suffix}@test.invalid`,
      status: "Active",
    },
  });
  reader = await mint(u.id, a.firm.id);
  officeA = (
    await db.office.create({
      data: {
        firmId: a.firm.id,
        officeName: "Dallas",
        city: "Dallas",
        state: "TX",
        country: "US",
      },
    })
  ).id;
  officeB = (
    await db.office.create({
      data: {
        firmId: b.firm.id,
        officeName: "Foreign Office",
        city: "Boston",
        state: "MA",
        country: "US",
      },
    })
  ).id;
  entityA = (
    await db.entityType.findFirstOrThrow({
      where: { firmId: a.firm.id, name: "LLC" },
    })
  ).id;
  entityB = (
    await db.entityType.findFirstOrThrow({
      where: { firmId: b.firm.id, name: "LLC" },
    })
  ).id;
  serviceA = (
    await db.serviceLine.findFirstOrThrow({
      where: { firmId: a.firm.id, name: "Tax" },
    })
  ).id;
  serviceA2 = (
    await db.serviceLine.findFirstOrThrow({
      where: { firmId: a.firm.id, name: "Payroll" },
    })
  ).id;
  serviceB = (
    await db.serviceLine.findFirstOrThrow({
      where: { firmId: b.firm.id, name: "Tax" },
    })
  ).id;
  clientA = (await saveClient(ta, payload("SAME001"))).id;
  clientB = (
    await saveClient(tb, {
      ...payload("SAME001"),
      entityTypeId: entityB,
      primaryOfficeId: officeB,
      responsiblePartnerId: b.admin.id,
      responsibleManagerId: null,
      serviceLineIds: [serviceB],
    })
  ).id;
  for (const type of [
    "Text",
    "Number",
    "Date",
    "Boolean",
    "Dropdown",
  ] as const) {
    await saveClientCatalog(ta, "fields", {
      name: `Field ${type}`,
      fieldType: type,
      options: type === "Dropdown" ? ["A", "B"] : [],
      active: true,
    });
    fields[type] = (
      await db.clientCustomFieldDefinition.findFirstOrThrow({
        where: { firmId: a.firm.id, name: `Field ${type}` },
      })
    ).id;
  }
});
afterAll(() => db.$disconnect());

test("database rejects incomplete and impossible year-end dates", async () => {
  for (const data of [
    { taxYearEndMonth: 2, taxYearEndDay: null },
    { taxYearEndMonth: null, taxYearEndDay: 28 },
    { taxYearEndMonth: 4, taxYearEndDay: 31 },
  ]) {
    await expect(
      db.client.update({ where: { id: clientA }, data }),
    ).rejects.toThrow();
  }
});

test("Unicode names round-trip through client search", async () => {
  const name = `शर्मा & Müller ${suffix}`;
  const client = await saveClient(ta, {
    ...payload(`UNICODE-${suffix}`),
    legalName: name,
    displayName: name,
  });
  expect((await listClients(ta, { q: name })).items[0].id).toBe(client.id);
});

test("one thousand clients remain paginated with stable ordering", async () => {
  await db.client.createMany({
    data: Array.from({ length: 1000 }, (_, index) => ({
      firmId: a.firm.id,
      clientCode: `SCALE-${String(index).padStart(4, "0")}`,
      legalName: `Scale ${index}`,
      displayName: `Scale ${index}`,
      normalizedLegalName: `scale ${index}`,
      normalizedDisplayName: `scale ${index}`,
      entityTypeId: entityA,
      primaryOfficeId: officeA,
      status: "Prospect",
      createdByUserId: a.admin.id,
      updatedByUserId: a.admin.id,
    })),
  });
  const first = await listClients(ta, {
    q: "SCALE-",
    pageSize: 25,
    sort: "clientCode",
  });
  const last = await listClients(ta, {
    q: "SCALE-",
    pageSize: 25,
    page: 40,
    sort: "clientCode",
  });
  expect(first.total).toBe(1000);
  expect(first.items).toHaveLength(25);
  expect(last.items).toHaveLength(25);
  expect(last.items[24].clientCode).toBe("SCALE-0999");
  expect(
    new Set([...first.items, ...last.items].map((client) => client.id)).size,
  ).toBe(50);
});
test("authorized create and same Client Code in different firms", async () => {
  expect((await getClient(ta, clientA)).clientCode).toBe("SAME001");
  expect((await getClient(tb, clientB)).clientCode).toBe("SAME001");
});
test("Client Code is case-insensitively unique within a firm", async () => {
  await expect(saveClient(ta, payload("same001"))).rejects.toThrow(
    "Client Code already exists",
  );
});
test("required fields, website, and calendar dates validate on server", async () => {
  for (const change of [
    { legalName: "" },
    { website: "javascript:alert(1)" },
    { onboardingDate: "2026-02-31" },
    { taxYearEndMonth: 4, taxYearEndDay: 31 },
    { onboardingDate: "2026-05-01", terminationDate: "2026-04-01" },
  ])
    await expect(saveClient(ta, { ...payload(), ...change })).rejects.toThrow();
});
test("similar names warn without blocking explicitly confirmed creation", async () => {
  const p = payload();
  p.legalName = " Client SAME001 ";
  p.displayName = "Display SAME001";
  await expect(saveClient(ta, p)).rejects.toThrow("similar name");
  expect(
    (await saveClient(ta, { ...p, acknowledgeDuplicate: true })).id,
  ).toBeTruthy();
});
test("authorized edit updates client and rejects stale version", async () => {
  const data = await editData();
  await saveClient(ta, { ...data, industry: "Manufacturing" }, clientA);
  expect((await getClient(ta, clientA)).industry).toBe("Manufacturing");
  await expect(saveClient(ta, data, clientA)).rejects.toThrow("changed since");
});
test("read-only users can view firm clients but cannot create or edit", async () => {
  expect((await getClient(reader, clientA)).id).toBe(clientA);
  await expect(saveClient(reader, payload())).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    saveClient(reader, await editData(), clientA),
  ).rejects.toMatchObject({ status: 403 });
});
test("unauthenticated client reads and mutations are rejected", async () => {
  await expect(getClient(undefined, clientA)).rejects.toMatchObject({
    status: 401,
  });
  await expect(saveClient(undefined, payload())).rejects.toMatchObject({
    status: 401,
  });
});
test("Firm A cannot view or update Firm B Client", async () => {
  await expect(getClient(ta, clientB)).rejects.toMatchObject({ status: 404 });
  await expect(saveClient(ta, payload(), clientB)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (await listClients(ta, {})).items.every((c) => c.firmId === a.firm.id),
  ).toBe(true);
});
test("foreign user, office, entity and service relationships are rejected", async () => {
  for (const change of [
    { responsiblePartnerId: b.admin.id },
    { responsibleManagerId: b.admin.id },
    { primaryOfficeId: officeB },
    { entityTypeId: entityB },
    { serviceLineIds: [serviceB] },
  ])
    await expect(saveClient(ta, { ...payload(), ...change })).rejects.toThrow();
});
test("inactive ownership users cannot be assigned", async () => {
  const u = await db.user.create({
    data: {
      firmId: a.firm.id,
      roleId: a.roles[2].id,
      firstName: "Inactive",
      lastName: "Owner",
      email: `inactive-client-${suffix}@test.invalid`,
      status: "Inactive",
    },
  });
  await expect(
    saveClient(ta, { ...payload(), responsiblePartnerId: u.id }),
  ).rejects.toThrow("active responsible");
});
test("database constraints reject cross-tenant core relationships", async () => {
  for (const change of [
    { primaryOfficeId: officeB },
    { entityTypeId: entityB },
    { responsibleManagerId: b.admin.id },
  ])
    await expect(
      db.client.update({ where: { id: clientA }, data: change }),
    ).rejects.toMatchObject({ code: "P2003" });
  await expect(
    db.clientServiceLine.create({
      data: { firmId: a.firm.id, clientId: clientA, serviceLineId: serviceB },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
});
test("contacts can be created and only one remains primary under concurrent writes", async () => {
  await Promise.all([
    saveContact(ta, clientA, {
      firstName: "One",
      email: 'one@example.test', phone: '5551234567',
      lastName: "Contact",
      isPrimary: true,
    }),
    saveContact(ta, clientA, {
      firstName: "Two",
      email: 'two@example.test', phone: '5551234567',
      lastName: "Contact",
      isPrimary: true,
    }),
  ]);
  expect(
    await db.clientContact.count({
      where: { firmId: a.firm.id, clientId: clientA, isPrimary: true },
    }),
  ).toBe(1);
});
test("primary contact must be replaced before deactivation; reactivation preserves history", async () => {
  const p = await db.clientContact.findFirstOrThrow({
    where: { firmId: a.firm.id, clientId: clientA, isPrimary: true },
  });
  await expect(saveContact(ta, clientA, { ...p, active: false }, p.id)).rejects.toThrow('Set another contact');
  await saveContact(ta,clientA,{firstName:'Replacement',lastName:'Contact',email:'replacement@example.test',phone:'5551234567',isPrimary:true});
  await saveContact(ta, clientA, { ...p, isPrimary: false, active: false }, p.id);
  const c = await getContact(ta, clientA, p.id);
  expect(c.isPrimary).toBe(false);
  expect(c.active).toBe(false);
  await saveContact(ta, clientA, { ...c, active: true }, c.id);
  expect((await getContact(ta, clientA, p.id)).active).toBe(true);
});
test("Firm A cannot access or edit Firm B contact", async () => {
  const contact = await saveContact(tb, clientB, {
    firstName: "Foreign",
    lastName: "Contact",
  });
  await expect(getContact(ta, clientA, contact.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    saveContact(
      ta,
      clientA,
      { firstName: "Stolen", lastName: "Contact" },
      contact.id,
    ),
  ).rejects.toMatchObject({ status: 404 });
});
test("contact permission enforced independently of client editing", async () => {
  await expect(
    saveContact(reader, clientA, { firstName: "No", lastName: "Access" }),
  ).rejects.toMatchObject({ status: 403 });
});
test("multiple services and association removal preserve service master", async () => {
  await saveClientServices(ta, clientA, [serviceA, serviceA2]);
  expect((await getClient(ta, clientA)).services).toHaveLength(2);
  await saveClientServices(ta, clientA, [serviceA]);
  expect((await getClient(ta, clientA)).services).toHaveLength(1);
  expect(
    await db.serviceLine.findUnique({ where: { id: serviceA2 } }),
  ).not.toBeNull();
});
test("foreign service changes and read-only service changes fail", async () => {
  await expect(saveClientServices(ta, clientA, [serviceB])).rejects.toThrow();
  await expect(saveClientServices(reader, clientA, [])).rejects.toMatchObject({
    status: 403,
  });
});
test("all five custom field types persist validated values", async () => {
  await saveClientFields(ta, clientA, {
    [fields.Text]: "QuickBooks",
    [fields.Number]: 2.5,
    [fields.Date]: "2026-09-28",
    [fields.Boolean]: false,
    [fields.Dropdown]: "A",
  });
  const c = await getClient(ta, clientA);
  expect(c.customValues).toHaveLength(5);
  expect(
    c.customValues.find((v) => v.definitionId === fields.Boolean)?.booleanValue,
  ).toBe(false);
});
test("invalid number, date, boolean and dropdown custom values fail", async () => {
  for (const [type, value] of [
    ["Number", "not a number"],
    ["Date", "2026-02-31"],
    ["Boolean", "yes"],
    ["Dropdown", "unknown"],
  ])
    await expect(
      saveClientFields(ta, clientA, { [fields[type]]: value }),
    ).rejects.toThrow();
});
test("custom definitions and values remain tenant-specific", async () => {
  await saveClientCatalog(tb, "fields", {
    name: "Foreign Field",
    fieldType: "Text",
  });
  const def = await db.clientCustomFieldDefinition.findFirstOrThrow({
    where: { firmId: b.firm.id, name: "Foreign Field" },
  });
  expect(
    (await clientOptions(ta)).definitions.some((d) => d.id === def.id),
  ).toBe(false);
  await expect(
    saveClientFields(ta, clientA, { [def.id]: "stolen" }),
  ).rejects.toThrow("not found");
  await expect(
    saveClientCatalog(
      ta,
      "fields",
      { name: "Stolen", fieldType: "Text" },
      def.id,
    ),
  ).rejects.toMatchObject({ status: 404 });
});
test("field types and used dropdown options cannot be changed destructively", async () => {
  await expect(
    saveClientCatalog(
      ta,
      "fields",
      { name: "Changed", fieldType: "Number" },
      fields.Text,
    ),
  ).rejects.toThrow("cannot be changed");
  await expect(
    saveClientCatalog(
      ta,
      "fields",
      { name: "Dropdown", fieldType: "Dropdown", options: ["B"] },
      fields.Dropdown,
    ),
  ).rejects.toThrow("existing clients");
});
test("deactivating definitions and masters retains historical client links", async () => {
  await saveClientCatalog(
    ta,
    "fields",
    { name: "Field Text", fieldType: "Text", active: false },
    fields.Text,
  );
  expect(
    (await getClient(ta, clientA)).customValues.some(
      (v) => v.definitionId === fields.Text,
    ),
  ).toBe(true);
  await expect(
    saveClientFields(ta, clientA, { [fields.Text]: "new" }),
  ).rejects.toThrow("inactive");
  await saveClientCatalog(
    ta,
    "services",
    { name: "Tax", active: false },
    serviceA,
  );
  expect(
    (await getClient(ta, clientA)).services.some(
      (s) => s.serviceLineId === serviceA,
    ),
  ).toBe(true);
  await expect(saveClient(ta, payload())).rejects.toThrow("active service");
  await saveClientCatalog(
    ta,
    "services",
    { name: "Tax", active: true },
    serviceA,
  );
});
const csv = (rows: string[][]) =>
  toCsv([
    [
      "Client Code",
      "Legal Name",
      "Entity Type",
      "Status",
      "Office",
      "Partner Email",
      "Service Lines",
      'Primary Contact First Name', 'Primary Contact Last Name', 'Primary Contact Email', 'Primary Contact Phone',
    ],
    ...rows.map(row=>[...row,'CSV','Contact','csv@example.test','5551234567']),
  ]);
test("CSV parser handles quoted commas and newlines", async () => {
  const result = await inspectImport(ta, {
    csv: csv([
      [
        "CSV-QUOTED",
        "Name, with\nnewline",
        "LLC",
        "Active",
        "Dallas",
        "",
        "Tax",
      ],
    ]),
  });
  expect(result.count).toBe(1);
  expect(result.sample[0][1]).toBe("Name, with\nnewline");
});
test("valid import previews without writes, commits once and records actor", async () => {
  const code = "CSV-" + randomUUID();
  const p = await previewImport(ta, {
    csv: csv([
      [
        code,
        "Imported client",
        "LLC",
        "Active",
        "Dallas",
        a.admin.email,
        "Tax;Payroll",
      ],
    ]),
    fileName: "test.csv",
  });
  expect(p.valid).toBe(1);
  expect(
    await db.client.count({
      where: { firmId: a.firm.id, clientCode: code.toUpperCase() },
    }),
  ).toBe(0);
  const result = await commitImport(ta, { jobId: p.jobId, confirmed: true });
  expect(result.count).toBe(1);
  expect(
    (await commitImport(ta, { jobId: p.jobId, confirmed: true })).count,
  ).toBe(1);
  const job = await db.clientImportJob.findUniqueOrThrow({
    where: { id: p.jobId },
  });
  expect(job.actorUserId).toBe(a.admin.id);
  expect(job.status).toBe("Completed");
});
test("duplicate codes and invalid rows are reported; valid rows import safely", async () => {
  const p = await previewImport(ta, {
    csv: csv([
      ["SAME001", "Duplicate", "LLC", "Active", "Dallas", "", ""],
      ["BAD-OFFICE", "Missing office", "LLC", "Active", "Nowhere", "", ""],
      ["GOOD-" + suffix, "Good row", "LLC", "Active", "Dallas", "", ""],
    ]),
    fileName: "mixed.csv",
  });
  expect(p.valid).toBe(1);
  expect(p.errors).toBe(2);
  expect(p.rows[0].errors.join(" ")).toContain("already exists");
  expect(p.rows[1].errors.join(" ")).toContain("Office");
  expect(
    (await commitImport(ta, { jobId: p.jobId, confirmed: true })).count,
  ).toBe(1);
});
test("CSV column mapping supports alternative header names", async () => {
  const p = await previewImport(ta, {
    csv: toCsv([
      ["Code", "Company", "Kind", "State", "Branch",'First','Last','Email','Phone'],
      ["MAP-" + suffix, "Mapped Client", "LLC", "Active", "Dallas",'CSV','Contact','csv@example.test','5551234567'],
    ]),
    mapping: {
      "Client Code": "Code",
      "Legal Name": "Company",
      "Entity Type": "Kind",
      Status: "State",
      Office: "Branch",
      'Primary Contact First Name':'First','Primary Contact Last Name':'Last','Primary Contact Email':'Email','Primary Contact Phone':'Phone',
    },
    fileName: "mapped.csv",
  });
  expect(p.valid).toBe(1);
});
test("CSV cannot map foreign office or responsible users", async () => {
  const p = await previewImport(ta, {
    csv: csv([
      [
        "FOREIGN-" + suffix,
        "Foreign",
        "LLC",
        "Active",
        "Foreign Office",
        b.admin.email,
        "Tax",
      ],
    ]),
    fileName: "foreign.csv",
  });
  expect(p.valid).toBe(0);
  expect(p.rows[0].errors.join(" ")).toContain("Office");
  expect(p.rows[0].errors.join(" ")).toContain("Partner email");
});
test("unauthorized import and cross-tenant job commits are rejected", async () => {
  await expect(
    previewImport(reader, {
      csv: csv([["X", "X", "LLC", "Active", "Dallas", "", ""]]),
      fileName: "x.csv",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const p = await previewImport(ta, {
    csv: csv([["JOB-" + suffix, "Job", "LLC", "Active", "Dallas", "", ""]]),
    fileName: "job.csv",
  });
  await expect(
    commitImport(tb, { jobId: p.jobId, confirmed: true }),
  ).rejects.toMatchObject({ status: 404 });
});
test("changed mapping after preview rolls back every row in the import", async () => {
  const code = "ROLLBACK-" + suffix;
  const p = await previewImport(ta, {
    csv: csv([
      [code, "First", "LLC", "Active", "Dallas", "", ""],
      ["ROLLBACK2-" + suffix, "Second", "LLC", "Active", "Dallas", "", "Tax"],
    ]),
    fileName: "rollback.csv",
  });
  expect(p.valid).toBe(2);
  await saveClientCatalog(
    ta,
    "services",
    { name: "Tax", active: false },
    serviceA,
  );
  await expect(
    commitImport(ta, { jobId: p.jobId, confirmed: true }),
  ).rejects.toThrow();
  expect(
    await db.client.count({
      where: { firmId: a.firm.id, clientCode: code.toUpperCase() },
    }),
  ).toBe(0);
  await saveClientCatalog(
    ta,
    "services",
    { name: "Tax", active: true },
    serviceA,
  );
});
test("expired import previews cannot be committed", async () => {
  const p = await previewImport(ta, {
    csv: csv([["EXP-" + suffix, "Expire", "LLC", "Active", "Dallas", "", ""]]),
    fileName: "expire.csv",
  });
  await db.clientImportJob.update({
    where: { id: p.jobId },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await expect(
    commitImport(ta, { jobId: p.jobId, confirmed: true }),
  ).rejects.toThrow("expired");
});
test("filtered exports contain only the current tenant and escape spreadsheet formulas", async () => {
  const foreignName = (await getClient(tb, clientB)).displayName;
  const data = await editData();
  await saveClient(
    ta,
    { ...data, legalName: "=1+1", displayName: "Formula client" },
    clientA,
  );
  const result = await exportClients(ta, { q: "Formula client" });
  expect(result).toContain("'=1+1");
  expect(result).not.toContain(b.admin.email);
  expect(result).not.toContain(foreignName);
  await expect(exportClients(reader, {})).rejects.toMatchObject({
    status: 403,
  });
});
test("pagination, filtering, search and sorting execute on server", async () => {
  const list = await listClients(ta, {
    q: "Formula client",
    status: "Active",
    officeId: officeA,
    serviceLineId: serviceA,
    pageSize: 10,
    sort: "clientCode",
    direction: "desc",
  });
  expect(list.total).toBe(1);
  expect(list.items[0].id).toBe(clientA);
  expect((await listClients(ta, { officeId: officeB })).total).toBe(0);
  expect(
    (await listClients(ta, { page: 2, pageSize: 10 })).items.length,
  ).toBeLessThanOrEqual(10);
});
test("bulk changes require confirmation, tenant checks, and preserve histories", async () => {
  await expect(
    bulkClients(ta, {
      ids: [clientA],
      field: "status",
      value: "Inactive",
      confirmed: false,
    }),
  ).rejects.toThrow();
  await expect(
    bulkClients(ta, {
      ids: [clientA, clientB],
      field: "status",
      value: "Inactive",
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await bulkClients(ta, {
    ids: [clientA],
    field: "status",
    value: "Terminated",
    confirmed: true,
  });
  const c = await getClient(ta, clientA);
  expect(c.status).toBe("Terminated");
  expect(c.contacts.length).toBeGreaterThan(0);
  expect(c.services.length).toBeGreaterThan(0);
  expect(c.customValues.length).toBeGreaterThan(0);
});
test("client activity contains safe descriptions and preserves audit history", async () => {
  const events = await clientActivity(ta, clientA);
  expect(events.total).toBeGreaterThan(5);
  expect(
    events.items.some((e) => e.description.includes("Active → Terminated")),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toContain("passwordHash");
  await expect(clientActivity(ta, clientB)).rejects.toMatchObject({
    status: 404,
  });
});

import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { newToken, tokenHash } from "../src/lib/crypto";
import { saveClient } from "../src/lib/clients";
import {
  saveEngagement,
  getEngagement,
  listEngagements,
  engagementEditData,
  changeEngagement,
  engagementActivity,
  engagementClients,
  bulkEngagements,
  saveEngagementCatalog,
} from "../src/lib/engagements";
import {
  previewEngagementImport,
  commitEngagementImport,
  exportEngagements,
  inspectEngagementImport,
} from "../src/lib/engagement-csv";
import { toCsv } from "../src/lib/client-csv";
import { firmDates, isOverdue, STAFF } from "../src/lib/engagement-constants";
const suffix = randomUUID().slice(0, 8);
let a: Awaited<ReturnType<typeof provisionFirm>>, b: typeof a;
let ta: string,
  tb: string,
  partner: string,
  manager: string,
  reviewer: string,
  preparer: string,
  other: string;
let clientA: string,
  clientB: string,
  officeA: string,
  officeB: string,
  serviceA: string,
  serviceB: string,
  typeA: string,
  typeB: string;
let managerId: string,
  reviewerId: string,
  preparerId: string,
  otherId: string,
  partnerId: string,
  inactiveId: string;
let main: string, foreign: string;
const mint = async (userId: string, firmId: string) => {
  const token = newToken();
  await db.session.create({
    data: {
      firmId,
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return token;
};
const payload = (code = "E-" + randomUUID()) => ({
  engagementCode: code,
  engagementName: `Work ${code}`,
  clientId: clientA,
  serviceLineId: serviceA,
  engagementTypeId: typeA,
  officeId: officeA,
  partnerId,
  managerId,
  reviewerId,
  preparerId,
  status: "Assigned",
  priority: "Normal",
  periodType: "Monthly",
  periodStartDate: "2026-09-01",
  periodEndDate: "2026-09-30",
  allocationDate: "2026-09-01",
  plannedStartDate: "2026-09-01",
  dueDate: "2026-10-10",
  budgetHours: 24,
});
const fresh = async () =>
  getEngagement(ta, (await saveEngagement(ta, payload())).id);
beforeAll(async () => {
  a = await provisionFirm({
    firmName: `Engagement A ${suffix}`,
    adminEmail: `ea-${suffix}@test.invalid`,
    adminPassword: "Testing-" + randomUUID(),
    timezone: "America/Chicago",
  });
  b = await provisionFirm({
    firmName: `Engagement B ${suffix}`,
    adminEmail: `eb-${suffix}@test.invalid`,
    adminPassword: "Testing-" + randomUUID(),
    timezone: "UTC",
  });
  ta = await mint(a.admin.id, a.firm.id);
  tb = await mint(b.admin.id, b.firm.id);
  const users = [];
  for (const [index, alias] of [
    "partner",
    "manager",
    "reviewer",
    "preparer",
    "other",
  ].entries()) {
    const user = await db.user.create({
      data: {
        firmId: a.firm.id,
        roleId: a.roles[Math.min(index + 1, 4)].id,
        firstName: alias,
        lastName: "Staff",
        email: `eng-${alias}-${suffix}@test.invalid`,
        status: "Active",
      },
    });
    users.push({ id: user.id, token: await mint(user.id, a.firm.id) });
  }
  [partnerId, managerId, reviewerId, preparerId, otherId] = users.map(
    (u) => u.id,
  );
  [partner, manager, reviewer, preparer, other] = users.map((u) => u.token);
  inactiveId = (
    await db.user.create({
      data: {
        firmId: a.firm.id,
        roleId: a.roles[4].id,
        firstName: "Inactive",
        lastName: "Staff",
        email: `eng-inactive-${suffix}@test.invalid`,
        status: "Inactive",
      },
    })
  ).id;
  officeA = (
    await db.office.create({
      data: {
        firmId: a.firm.id,
        officeName: "Main",
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
  serviceA = (
    await db.serviceLine.findFirstOrThrow({
      where: { firmId: a.firm.id, name: "Tax" },
    })
  ).id;
  serviceB = (
    await db.serviceLine.findFirstOrThrow({
      where: { firmId: b.firm.id, name: "Tax" },
    })
  ).id;
  typeA = (
    await db.engagementType.findFirstOrThrow({
      where: { firmId: a.firm.id, name: "Monthly Close" },
    })
  ).id;
  typeB = (
    await db.engagementType.findFirstOrThrow({
      where: { firmId: b.firm.id, name: "Monthly Close" },
    })
  ).id;
  const entityA = await db.entityType.findFirstOrThrow({
      where: { firmId: a.firm.id },
    }),
    entityB = await db.entityType.findFirstOrThrow({
      where: { firmId: b.firm.id },
    });
  clientA = (
    await saveClient(ta, {
      clientCode: "ENGCLIENT",
      primaryContact: {firstName:'Test',lastName:'Contact',email:'contact@example.test',phone:'5551234567'},
      legalName: "Engagement Client",
      entityTypeId: entityA.id,
      status: "Active",
      primaryOfficeId: officeA,
      responsiblePartnerId: partnerId,
      responsibleManagerId: managerId,
      serviceLineIds: [serviceA],
    })
  ).id;
  clientB = (
    await saveClient(tb, {
      clientCode: "ENGCLIENT",
      legalName: "Foreign Engagement Client",
      primaryContact: {firstName:'Test',lastName:'Contact',email:'contact@example.test',phone:'5551234567'},
      entityTypeId: entityB.id,
      status: "Active",
      primaryOfficeId: officeB,
      serviceLineIds: [serviceB],
    })
  ).id;
  main = (await saveEngagement(ta, payload("SAME-CODE"))).id;
  foreign = (
    await saveEngagement(tb, {
      ...payload("SAME-CODE"),
      clientId: clientB,
      serviceLineId: serviceB,
      engagementTypeId: typeB,
      officeId: officeB,
      partnerId: b.admin.id,
      managerId: null,
      reviewerId: null,
      preparerId: null,
      allocationDate: null,
    })
  ).id;
});
afterAll(() => db.$disconnect());

test('custom role edit permission does not confer budget, staffing or status powers',async()=>{
 const role=await db.role.create({data:{firmId:a.firm.id,roleName:`Editor ${suffix}`}});
 await db.rolePermission.createMany({data:['engagements.view','engagements.view_all','engagements.edit'].map(permissionKey=>({firmId:a.firm.id,roleId:role.id,permissionKey}))});
 const user=await db.user.create({data:{firmId:a.firm.id,roleId:role.id,firstName:'Custom',lastName:'Editor',email:`editor-${suffix}@test.invalid`,status:'Active'}});const token=await mint(user.id,a.firm.id);const row=await fresh();
 for(const change of [{budgetHours:99},{preparerId:otherId},{status:'OnHold'},{allocationDate:'2026-09-25'}])await expect(saveEngagement(token,{...engagementEditData(row),...change},row.id)).rejects.toMatchObject({status:403});
 await saveEngagement(token,{...engagementEditData(row),description:'Permitted general edit'},row.id);
 expect((await getEngagement(token,row.id)).description).toBe('Permitted general edit');
});

test('engagement-only role can read minimal related client data without client administration',async()=>{
 const role=await db.role.create({data:{firmId:a.firm.id,roleName:`Worker ${suffix}`}});
 await db.rolePermission.create({data:{firmId:a.firm.id,roleId:role.id,permissionKey:'engagements.view'}});
 const user=await db.user.create({data:{firmId:a.firm.id,roleId:role.id,firstName:'Custom',lastName:'Worker',email:`worker-${suffix}@test.invalid`,status:'Active'}});const token=await mint(user.id,a.firm.id);const row=await saveEngagement(ta,{...payload(),preparerId:user.id});
 expect((await getEngagement(token,row.id)).client.clientCode).toBe('ENGCLIENT');
 const clients=await engagementClients(token,{});expect(clients.map(c=>c.id)).toEqual([clientA]);expect(clients[0]).not.toHaveProperty('internalNotes');
 await expect(saveClient(token,{clientCode:'NO'})).rejects.toMatchObject({status:403});
});

test('status and assignment endpoints ignore unrelated fields instead of changing them',async()=>{
 let row=await fresh();await changeEngagement(ta,row.id,{status:'InProgress',version:row.version,budgetHours:999,clientId:clientB},'status');row=await getEngagement(ta,row.id);expect(row.budgetHours).toBe(24);expect(row.clientId).toBe(clientA);
 await changeEngagement(ta,row.id,{...engagementEditData(row),preparerId:otherId,status:'Cancelled',budgetHours:999},'assign');row=await getEngagement(ta,row.id);expect(row.status).toBe('InProgress');expect(row.budgetHours).toBe(24);
});

test('database completion, period and negative-budget constraints prevent invalid direct writes',async()=>{
 const row=await fresh();for(const data of [{budgetHours:-1},{status:'Completed' as const},{periodEndDate:new Date('2026-08-01')},{periodStartDate:null}])await expect(db.engagement.update({where:{id:row.id},data})).rejects.toThrow();
});

test('custom field direct relationships cannot cross firms',async()=>{
 const row=await fresh();const def=await db.engagementCustomFieldDefinition.create({data:{firmId:b.firm.id,name:`Cross ${suffix}`,normalizedName:`cross ${suffix}`,fieldType:'Text'}});
 await expect(db.engagementCustomFieldValue.create({data:{firmId:a.firm.id,engagementId:row.id,definitionId:def.id,textValue:'foreign'}})).rejects.toMatchObject({code:'P2003'});
});
test("authorized creation links the correct client; codes are unique per firm", async () => {
  expect((await getEngagement(ta, main)).client.id).toBe(clientA);
  expect((await getEngagement(tb, foreign)).engagementCode).toBe("SAME-CODE");
  await expect(saveEngagement(ta, payload("same-code"))).rejects.toThrow(
    "already exists",
  );
});
test("required fields, negative budget, periods and calendar dates validate", async () => {
  for (const change of [
    { engagementName: "" },
    { engagementCode: "" },
    { budgetHours: -1 },
    { periodEndDate: "2026-08-01" },
    { dueDate: "2026-02-31" },
    { plannedStartDate: "2026-11-01" },
    { status: "Completed" },
    { periodType: "NotApplicable" },
  ])
    await expect(
      saveEngagement(ta, { ...payload(), ...change }),
    ).rejects.toThrow();
});
test("client picker supplies safe deterministic ownership and service defaults", async () => {
  const [c] = await engagementClients(ta, { id: clientA });
  expect(c.primaryOfficeId).toBe(officeA);
  expect(c.responsiblePartnerId).toBe(partnerId);
  expect(c.responsibleManagerId).toBe(managerId);
  expect(c.services[0].serviceLineId).toBe(serviceA);
  expect(JSON.stringify(c)).not.toContain("passwordHash");
});
test("inactive users cannot be assigned in any staffing slot", async () => {
  for (const key of STAFF)
    await expect(
      saveEngagement(ta, { ...payload(), [key]: inactiveId }),
    ).rejects.toThrow("active staff");
});
test("foreign client, office, service and type fail server-side", async () => {
  for (const change of [
    { clientId: clientB },
    { officeId: officeB },
    { serviceLineId: serviceB },
    { engagementTypeId: typeB },
  ])
    await expect(
      saveEngagement(ta, { ...payload(), ...change }),
    ).rejects.toThrow();
});
test("all four foreign staffing assignments fail", async () => {
  for (const key of STAFF)
    await expect(
      saveEngagement(ta, { ...payload(), [key]: b.admin.id }),
    ).rejects.toThrow("active staff");
});
test("composite database foreign keys independently reject cross-tenant relationships", async () => {
  for (const change of [
    { clientId: clientB },
    { officeId: officeB },
    { serviceLineId: serviceB },
    { engagementTypeId: typeB },
    ...STAFF.map((key) => ({ [key]: b.admin.id })),
  ])
    await expect(
      db.engagement.update({ where: { id: main }, data: change }),
    ).rejects.toMatchObject({ code: "P2003" });
});
test("foreign engagement reads, edits and activity return not found", async () => {
  await expect(getEngagement(ta, foreign)).rejects.toMatchObject({
    status: 404,
  });
  await expect(saveEngagement(ta, payload(), foreign)).rejects.toMatchObject({
    status: 404,
  });
  await expect(engagementActivity(ta, foreign)).rejects.toMatchObject({
    status: 404,
  });
});
test("unauthenticated engagement access fails", async () => {
  await expect(listEngagements(undefined, {})).rejects.toMatchObject({
    status: 401,
  });
  await expect(saveEngagement(undefined, payload())).rejects.toMatchObject({
    status: 401,
  });
});
test("Admin and Partner see firm records including records they do not staff", async () => {
  const row = await saveEngagement(ta, {
    ...payload(),
    partnerId: null,
    managerId: null,
    reviewerId: null,
    preparerId: null,
    allocationDate: null,
  });
  expect((await getEngagement(partner, row.id)).id).toBe(row.id);
  expect((await getEngagement(ta, row.id)).id).toBe(row.id);
});
test("Manager sees only engagements staffing them in one of four slots", async () => {
  expect((await getEngagement(manager, main)).id).toBe(main);
  const row = await saveEngagement(ta, { ...payload(), managerId: null });
  await expect(getEngagement(manager, row.id)).rejects.toMatchObject({
    status: 404,
  });
  for (const key of STAFF) {
    const c = await saveEngagement(ta, {
      ...payload(),
      partnerId: null,
      managerId: null,
      reviewerId: null,
      preparerId: null,
      allocationDate: null,
      [key]: managerId,
    });
    expect((await getEngagement(manager, c.id)).id).toBe(c.id);
  }
});
test("Reviewer sees reviewer/preparer assignments only; Preparer sees preparer assignments only", async () => {
  expect((await getEngagement(reviewer, main)).id).toBe(main);
  expect((await getEngagement(preparer, main)).id).toBe(main);
  await expect(getEngagement(other, main)).rejects.toMatchObject({
    status: 404,
  });
  const row = await saveEngagement(ta, {
    ...payload(),
    reviewerId: null,
    partnerId: reviewerId,
    preparerId: otherId,
  });
  await expect(getEngagement(reviewer, row.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(getEngagement(preparer, row.id)).rejects.toMatchObject({
    status: 404,
  });
});
test("Manager creation requires a visible assignment and preserves scope", async () => {
  const row = await saveEngagement(manager, payload());
  expect((await getEngagement(manager, row.id)).id).toBe(row.id);
  await expect(
    saveEngagement(manager, { ...payload(), managerId: null }),
  ).rejects.toThrow("Assign yourself");
});
test("read-only staff cannot create, edit, assign, change status, export or import", async () => {
  const r = await getEngagement(ta, main);
  await expect(saveEngagement(preparer, payload())).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    saveEngagement(preparer, engagementEditData(r), main),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    changeEngagement(preparer, main, { ...engagementEditData(r) }, "assign"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    changeEngagement(
      preparer,
      main,
      { status: "InProgress", version: r.version },
      "status",
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(exportEngagements(preparer, {})).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    inspectEngagementImport(preparer, { csv: "a\nb" }),
  ).rejects.toMatchObject({ status: 403 });
});
test("reassignment preserves old/new preparer, actor, and allocation dates", async () => {
  const r = await fresh();
  await changeEngagement(
    ta,
    r.id,
    {
      ...engagementEditData(r),
      preparerId: otherId,
      allocationDate: "2026-09-29",
    },
    "assign",
  );
  const h = await db.engagementAssignmentHistory.findFirstOrThrow({
    where: { engagementId: r.id, oldUserId: preparerId, newUserId: otherId },
  });
  expect(h.actorUserId).toBe(a.admin.id);
  expect(h.oldAllocationDate?.toISOString().slice(0, 10)).toBe("2026-09-01");
  expect(h.newAllocationDate?.toISOString().slice(0, 10)).toBe("2026-09-29");
});
test("allocation-date-only correction creates history", async () => {
  const r = await fresh();
  await changeEngagement(
    ta,
    r.id,
    { ...engagementEditData(r), allocationDate: "2026-09-05" },
    "assign",
  );
  expect(
    await db.engagementAssignmentHistory.count({
      where: { engagementId: r.id, slot: "Preparer" },
    }),
  ).toBe(2);
});
test("status transitions, completion and reopening preserve completion history", async () => {
  let r = await fresh();
  await changeEngagement(
    ta,
    r.id,
    {
      status: "Completed",
      completedDate: "2026-09-29",
      statusComment: "Finished",
      version: r.version,
    },
    "status",
  );
  r = await getEngagement(ta, r.id);
  expect(r.completedDate?.toISOString().slice(0, 10)).toBe("2026-09-29");
  await changeEngagement(
    ta,
    r.id,
    {
      status: "InProgress",
      completedDate: null,
      statusComment: "Reopened for correction",
      version: r.version,
    },
    "status",
  );
  expect((await getEngagement(ta, r.id)).completedDate).toBeNull();
  expect(
    await db.engagementStatusHistory.count({
      where: { engagementId: r.id, newStatus: "Completed" },
    }),
  ).toBe(1);
  expect(
    (await engagementActivity(ta, r.id)).items.some(
      (e) => e.action === "reopened",
    ),
  ).toBe(true);
});
test("budget and due/priority changes create readable before/after audits", async () => {
  const r = await fresh();
  await saveEngagement(
    ta,
    {
      ...engagementEditData(r),
      budgetHours: 30,
      dueDate: "2026-10-15",
      priority: "Urgent",
    },
    r.id,
  );
  const activity = await engagementActivity(ta, r.id);
  expect(activity.items.some((e) => e.description.includes("24 → 30"))).toBe(
    true,
  );
  expect(
    activity.items.some((e) =>
      e.description.includes("2026-10-10 → 2026-10-15"),
    ),
  ).toBe(true);
  expect(JSON.stringify(activity)).not.toContain("passwordHash");
});
test("optimistic versions prevent lost edits", async () => {
  const r = await fresh();
  await saveEngagement(
    ta,
    { ...engagementEditData(r), description: "first" },
    r.id,
  );
  await expect(
    saveEngagement(
      ta,
      { ...engagementEditData(r), description: "stale" },
      r.id,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("overdue is derived and excludes Completed and Cancelled", () => {
  expect(
    isOverdue({ dueDate: "2026-09-28", status: "Assigned" }, "2026-09-29"),
  ).toBe(true);
  expect(
    isOverdue({ dueDate: "2026-09-29", status: "Assigned" }, "2026-09-29"),
  ).toBe(false);
  for (const status of ["Completed", "Cancelled"])
    expect(isOverdue({ dueDate: "2020-01-01", status }, "2026-09-29")).toBe(
      false,
    );
});
test("firm date and Monday-Sunday week respect timezone and DST boundaries", () => {
  expect(
    firmDates("America/Chicago", new Date("2026-09-28T02:00:00Z")),
  ).toEqual({
    today: "2026-09-27",
    weekStart: "2026-09-21",
    weekEnd: "2026-09-27",
  });
  expect(
    firmDates("Asia/Kolkata", new Date("2026-09-28T02:00:00Z")).today,
  ).toBe("2026-09-28");
  expect(
    firmDates("America/New_York", new Date("2026-11-01T06:30:00Z")).weekEnd,
  ).toBe("2026-11-01");
});
test("service association requires explicit confirmation and adds a client audit", async () => {
  const service = await db.serviceLine.findFirstOrThrow({
    where: { firmId: a.firm.id, name: "Payroll" },
  });
  await expect(
    saveEngagement(ta, { ...payload(), serviceLineId: service.id }),
  ).rejects.toThrow("Confirm adding");
  await saveEngagement(ta, {
    ...payload(),
    serviceLineId: service.id,
    associateService: true,
  });
  expect(
    await db.clientServiceLine.count({
      where: { clientId: clientA, serviceLineId: service.id },
    }),
  ).toBe(1);
});
test("filtered list restricts client, search, status, priority, staffing, dates and recurring", async () => {
  const code = "FILTER-" + suffix;
  const r = await saveEngagement(ta, {
    ...payload(code),
    priority: "Urgent",
    recurring: true,
  });
  const result = await listEngagements(ta, {
    q: code,
    clientId: clientA,
    status: "Assigned",
    priority: "Urgent",
    serviceLineId: serviceA,
    engagementTypeId: typeA,
    officeId: officeA,
    managerId,
    preparerId,
    reviewerId,
    partnerId,
    dueFrom: "2026-10-01",
    dueTo: "2026-10-31",
    periodType: "Monthly",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    recurring: "true",
  });
  expect(result.total).toBe(1);
  expect(result.items[0].id).toBe(r.id);
  expect((await listEngagements(ta, { clientId: clientB })).total).toBe(0);
});
test("bulk changes are confirmed, scope checked and atomic", async () => {
  const r = await fresh();
  await expect(
    bulkEngagements(ta, {
      ids: [r.id],
      field: "priority",
      value: "High",
      confirmed: false,
    }),
  ).rejects.toThrow();
  await expect(
    bulkEngagements(ta, {
      ids: [r.id, foreign],
      field: "priority",
      value: "High",
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect((await getEngagement(ta, r.id)).priority).toBe("Normal");
  await bulkEngagements(ta, {
    ids: [r.id],
    field: "priority",
    value: "High",
    confirmed: true,
  });
  expect(
    (await engagementActivity(ta, r.id)).items.some(
      (e) => e.action === "bulk changed",
    ),
  ).toBe(true);
});
test("custom field values validate all five shared types and tenant boundaries", async () => {
  const r = await fresh();
  const values: Record<string, string | number | boolean> = {};
  for (const type of [
    "Text",
    "Number",
    "Date",
    "Boolean",
    "Dropdown",
  ] as const) {
    const d = await db.engagementCustomFieldDefinition.create({
      data: {
        firmId: a.firm.id,
        name: `Field ${type}`,
        normalizedName: `field ${type.toLowerCase()}`,
        fieldType: type,
        options: type === "Dropdown" ? ["A", "B"] : [],
      },
    });
    values[d.id] = {
      Text: "Software",
      Number: 2.5,
      Date: "2026-09-29",
      Boolean: false,
      Dropdown: "A",
    }[type];
  }
  await saveEngagement(
    ta,
    { ...engagementEditData(r), customFields: values },
    r.id,
  );
  const updated = await getEngagement(ta, r.id);
  expect(updated.customValues).toHaveLength(5);
  const number = updated.customValues.find(
    (v) => v.definition.fieldType === "Number",
  )!;
  await expect(
    saveEngagement(
      ta,
      {
        ...engagementEditData(updated),
        customFields: { [number.definitionId]: "invalid" },
      },
      r.id,
    ),
  ).rejects.toThrow("enter a number");
  const foreignDef = await db.engagementCustomFieldDefinition.create({
    data: {
      firmId: b.firm.id,
      name: "Foreign",
      normalizedName: "foreign",
      fieldType: "Text",
    },
  });
  await expect(
    saveEngagement(
      ta,
      {
        ...engagementEditData(updated),
        customFields: { [foreignDef.id]: "x" },
      },
      r.id,
    ),
  ).rejects.toThrow("not found");
});
test("configuration protects used dropdown options and field types", async () => {
  const d = await db.engagementCustomFieldDefinition.findFirstOrThrow({
    where: { firmId: a.firm.id, fieldType: "Dropdown" },
  });
  await expect(
    saveEngagementCatalog(
      ta,
      "fields",
      { name: d.name, fieldType: "Text" },
      d.id,
    ),
  ).rejects.toThrow("cannot be changed");
  await expect(
    saveEngagementCatalog(
      ta,
      "fields",
      { name: d.name, fieldType: "Dropdown", options: ["B"] },
      d.id,
    ),
  ).rejects.toThrow("cannot be removed");
  await expect(
    saveEngagementCatalog(
      tb,
      "fields",
      { name: "Foreign", fieldType: "Text" },
      d.id,
    ),
  ).rejects.toMatchObject({ status: 404 });
});
test("engagement types configure, deactivate and preserve historical links", async () => {
  await saveEngagementCatalog(ta, "types", {
    name: "Special Advisory",
    serviceLineId: serviceA,
    active: true,
  });
  const t = await db.engagementType.findFirstOrThrow({
    where: { firmId: a.firm.id, name: "Special Advisory" },
  });
  const r = await saveEngagement(ta, { ...payload(), engagementTypeId: t.id });
  await saveEngagementCatalog(
    ta,
    "types",
    { name: "Special Advisory", serviceLineId: serviceA, active: false },
    t.id,
  );
  expect((await getEngagement(ta, r.id)).engagementType.active).toBe(false);
  await expect(
    saveEngagement(ta, { ...payload(), engagementTypeId: t.id }),
  ).rejects.toThrow("active engagement type");
  await expect(
    saveEngagementCatalog(ta, "types", {
      name: "Wrong",
      serviceLineId: serviceB,
    }),
  ).rejects.toThrow();
});
const csv = (rows: string[][]) =>
  toCsv([
    [
      "Engagement Code",
      "Client Code",
      "Engagement Name",
      "Service Line",
      "Engagement Type",
      "Office",
      "Preparer Email",
      "Due Date",
      "Budget Hours",
    ],
    ...rows,
  ]);
const csvRow = (code = "CSV-" + randomUUID()) => [
  code,
  "ENGCLIENT",
  "Imported work",
  "Tax",
  "Monthly Close",
  "Main",
  "",
  "2026-10-10",
  "12",
];
test("CSV preview has no writes; valid commit is atomic and idempotent", async () => {
  const row = csvRow();
  const p = await previewEngagementImport(ta, {
    csv: csv([row]),
    fileName: "work.csv",
  });
  expect(p.valid).toBe(1);
  expect(
    await db.engagement.count({
      where: { firmId: a.firm.id, engagementCode: row[0] },
    }),
  ).toBe(0);
  expect(
    (await commitEngagementImport(ta, { jobId: p.jobId, confirmed: true }))
      .count,
  ).toBe(1);
  expect(
    (await commitEngagementImport(ta, { jobId: p.jobId, confirmed: true }))
      .count,
  ).toBe(1);
});
test("CSV reports duplicate code, unknown client/user, dates and budget errors", async () => {
  const duplicate = csvRow("SAME-CODE"),
    client = csvRow(),
    user = csvRow(),
    date = csvRow(),
    budget = csvRow();
  client[1] = "UNKNOWN";
  user[6] = b.admin.email;
  date[7] = "2026-02-31";
  budget[8] = "-1";
  const p = await previewEngagementImport(ta, {
    csv: csv([duplicate, client, user, date, budget]),
    fileName: "bad.csv",
  });
  expect(p.valid).toBe(0);
  expect(p.errors).toBe(5);
  expect(p.rows[1].errors.join(" ")).toContain("Client Code");
  expect(p.rows[2].errors.join(" ")).toContain("Preparer Email");
});
test("CSV mapping supports alternate headers and cross-tenant jobs are invisible", async () => {
  const p = await previewEngagementImport(ta, {
    csv: csv([csvRow()]).replace("Engagement Code", "Work Code"),
    mapping: { "Engagement Code": "Work Code" },
    fileName: "mapped.csv",
  });
  expect(p.valid).toBe(1);
  await expect(
    commitEngagementImport(tb, { jobId: p.jobId, confirmed: true }),
  ).rejects.toMatchObject({ status: 404 });
});
test("import rejects expired previews and never silently creates staff", async () => {
  const p = await previewEngagementImport(ta, {
    csv: csv([csvRow()]),
    fileName: "expired.csv",
  });
  await db.engagementImportJob.update({
    where: { id: p.jobId },
    data: { expiresAt: new Date(0) },
  });
  await expect(
    commitEngagementImport(ta, { jobId: p.jobId, confirmed: true }),
  ).rejects.toThrow("expired");
});
test("changed reference after import preview rolls back all imported rows", async () => {
  const r1 = csvRow(),
    r2 = csvRow();
  const p = await previewEngagementImport(ta, {
    csv: csv([r1, r2]),
    fileName: "rollback.csv",
  });
  expect(p.valid).toBe(2);
  await db.engagementType.update({
    where: { id: typeA },
    data: { active: false },
  });
  await expect(
    commitEngagementImport(ta, { jobId: p.jobId, confirmed: true }),
  ).rejects.toThrow();
  expect(
    await db.engagement.count({
      where: { firmId: a.firm.id, engagementCode: { in: [r1[0], r2[0]] } },
    }),
  ).toBe(0);
  await db.engagementType.update({
    where: { id: typeA },
    data: { active: true },
  });
});
test("exports respect record visibility, firm and filters; formulas escaped", async () => {
  const code = "EXPORT-" + suffix;
  await saveEngagement(ta, { ...payload(code), engagementName: "=1+1" });
  const exported = await exportEngagements(ta, { q: code });
  expect(exported).toContain("'=1+1");
  expect(exported).not.toContain("Foreign Engagement Client");
  const hidden = await saveEngagement(ta, {
    ...payload("HIDDEN-" + suffix),
    managerId: null,
  });
  expect(await exportEngagements(manager, {})).not.toContain(hidden.id);
  expect(
    await exportEngagements(manager, { q: "HIDDEN-" + suffix }),
  ).not.toContain("HIDDEN-" + suffix);
});
test("10,000 historical engagements stay server-paginated with stable last page", async () => {
  await db.engagement.createMany({
    data: Array.from({ length: 10000 }, (_, i) => ({
      firmId: a.firm.id,
      clientId: clientA,
      engagementCode: `SCALE-${String(i).padStart(5, "0")}`,
      engagementName: `Historical ${i}`,
      serviceLineId: serviceA,
      engagementTypeId: typeA,
      officeId: officeA,
      createdByUserId: a.admin.id,
      updatedByUserId: a.admin.id,
      status: "Cancelled",
    })),
  });
  const first = await listEngagements(ta, {
    q: "SCALE-",
    sort: "engagementCode",
    pageSize: 25,
  });
  const last = await listEngagements(ta, {
    q: "SCALE-",
    sort: "engagementCode",
    pageSize: 25,
    page: 400,
  });
  expect(first.total).toBe(10000);
  expect(first.items).toHaveLength(25);
  expect(last.items[24].engagementCode).toBe("SCALE-09999");
});

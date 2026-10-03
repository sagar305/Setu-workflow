import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
const tokens: string[] = [];
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat/i.test(m.text())) errors.push(m.text());
  });
});
test.afterEach(async () => {
  await db.session.deleteMany({
    where: { tokenHash: { in: tokens.splice(0).map(tokenHash) } },
  });
  expect(errors).toEqual([]);
});
test.afterAll(() => db.$disconnect());
async function signIn(page: Page, email = "admin@demo.setu.test") {
  const user = await db.user.findUniqueOrThrow({ where: { email } }),
    token = newToken();
  tokens.push(token);
  await db.session.create({
    data: {
      firmId: user.firmId,
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page.context().addCookies([
    {
      name: "setu_session",
      value: token,
      url: process.env.APP_URL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return user;
}
async function shot(page: Page, name: string) {
  await mkdir(".local/ui/build5", { recursive: true });
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  });
  await page.screenshot({
    path: `.local/ui/build5/${name}.png`,
    fullPage: true,
    caret: "initial",
  });
}
async function post(page: Page, url: string, data: unknown) {
  const r = await page.request.post(url, {
    data,
    headers: { Origin: process.env.APP_URL! },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function setup(page: Page) {
  const admin = await signIn(page),
    firmId = admin.firmId;
  const client = await db.client.findFirstOrThrow({
    where: { firmId, clientCode: "ABC001" },
    include: { services: true },
  });
  const service = await db.serviceLine.findFirstOrThrow({
      where: { firmId, name: "Tax" },
    }),
    type = await db.engagementType.findFirstOrThrow({
      where: { firmId, name: "S Corporation Tax Return" },
    });
  const preparer = await db.user.findUniqueOrThrow({
      where: { email: "associate@demo.setu.test" },
    }),
    manager = await db.user.findUniqueOrThrow({
      where: { email: "manager@demo.setu.test" },
    }),
    reviewer = await db.user.findUniqueOrThrow({
      where: { email: "senior@demo.setu.test" },
    });
  return { admin, client, service, type, preparer, manager, reviewer };
}
import { firmDates } from "../src/lib/engagement-constants";
async function engagement(page: Page) {
  const f = await setup(page);
  const name = `Allocation UI ${Date.now()}`;
  const e = await post(page, "/api/engagements", {
    engagementCode: `ALLOC-${Date.now()}`,
    engagementName: name,
    clientId: f.client.id,
    serviceLineId: f.service.id,
    engagementTypeId: f.type.id,
    officeId: f.client.primaryOfficeId,
    partnerId: f.admin.id,
    managerId: f.manager.id,
    reviewerId: f.reviewer.id,
    preparerId: f.preparer.id,
    budgetHours: 4,
    dueDate: firmDates("America/Chicago").today,
  });
  return { ...f, e, name };
}
test("dated allocations preview budget, My Work actions, edit, reassignment and cancellation", async ({
  page,
}) => {
  const f = await engagement(page);
  const today = firmDates("America/Chicago").today;
  await page.goto(`/engagements/${f.e.id}?tab=assignments`);
  await page
    .getByRole("button", { name: "+ Allocate Work", exact: true })
    .click();
  await page
    .getByLabel("Assign To", { exact: true })
    .selectOption(f.preparer.id);
  await page.getByLabel("Allocated Hours 1", { exact: true }).fill("3");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Bank reconciliation");
  await page
    .getByRole("button", { name: "Add Another Date", exact: true })
    .click();
  const next = new Date(today);
  next.setUTCDate(next.getUTCDate() + 1);
  await page
    .getByLabel("Allocation Date 2", { exact: true })
    .fill(next.toISOString().slice(0, 10));
  await page.getByLabel("Allocated Hours 2", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add to Batch", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview Allocations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review Allocations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Allocations", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I acknowledge the planned allocation above engagement budget.",
    })
    .check();
  await page
    .getByRole("button", { name: "Confirm Allocations", exact: true })
    .click();
  await expect(page.locator(".allocation-table tbody tr")).toHaveCount(2);
  await shot(page, "engagement-assignments");
  await signIn(page, "associate@demo.setu.test");
  await page.goto(`/my-work?view=today&engagementId=${f.e.id}`);
  await expect(page.locator(".allocation-table tbody tr")).toHaveCount(1);
  await expect(
    page.getByText("Total Allocated Hours Today: 3.00h", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Edit Allocation", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Allocation actions").selectOption("start");
  await expect(page.locator(".allocation-table tbody .pill")).toHaveText(
    "In Progress",
  );
  await page.getByLabel("Allocation actions").selectOption("blocked");
  await page
    .getByLabel("Blocked reason", { exact: true })
    .selectOption("Waiting for Documents");
  await page
    .getByLabel("Comments (optional)", { exact: true })
    .fill("Statement requested");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".allocation-table tbody .pill")).toHaveText(
    "Blocked",
  );
  await page.goto(`/my-work?view=blocked&engagementId=${f.e.id}`);
  await expect(page.locator(".allocation-table tbody tr")).toHaveCount(1);
  await shot(page, "my-work-blocked");
  await page.getByLabel("Allocation actions").selectOption("complete");
  await expect(page.locator(".allocation-table tbody tr")).toHaveCount(0);
  await page.goto(`/my-work?view=completed&engagementId=${f.e.id}`);
  await expect(page.locator(".allocation-table tbody tr")).toHaveCount(1);
  await signIn(page);
  await page.goto(`/team/assignments?view=all&engagementId=${f.e.id}`);
  await page
    .locator(".allocation-table tbody tr")
    .first()
    .getByLabel("Allocation actions")
    .selectOption("edit");
  await page.getByLabel("Allocated Hours", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.locator(".allocation-table tbody tr").first(),
  ).toContainText("1.00h planned");
  await page
    .locator(".allocation-table tbody tr")
    .first()
    .getByLabel("Allocation actions")
    .selectOption("reassign");
  await page
    .getByLabel("New Employee", { exact: true })
    .selectOption(f.reviewer.id);
  await page
    .getByLabel("Reason / Progress Note", { exact: true })
    .fill("Reviewer owns this plan");
  await page
    .getByRole("button", { name: "Confirm Reassignment", exact: true })
    .click();
  await expect(
    page.locator(".allocation-table tbody tr").first().locator("td").first(),
  ).toContainText(f.reviewer.firstName);
  await page
    .locator(".allocation-table tbody tr")
    .first()
    .getByLabel("Allocation actions")
    .selectOption("history");
  await expect(
    page.getByText("Reviewer owns this plan", { exact: true }),
  ).toBeVisible();
  await shot(page, "allocation-history");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .locator(".allocation-table tbody tr")
    .first()
    .getByLabel("Allocation actions")
    .selectOption("cancel");
  await page
    .getByLabel("Reason / Progress Note", { exact: true })
    .fill("Cancelled after review");
  await page
    .getByRole("button", { name: "Confirm Cancellation", exact: true })
    .click();
  await expect(
    page.locator(".allocation-table tbody tr").first(),
  ).toContainText("Cancelled");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/my-work");
  await shot(page, "my-work-mobile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("bulk preview across engagements commits separate explicit hours", async ({
  page,
}) => {
  const f = await engagement(page);
  const second = await post(page, "/api/engagements", {
    engagementCode: `BULK-${Date.now()}`,
    engagementName: `Bulk second ${Date.now()}`,
    clientId: f.client.id,
    serviceLineId: f.service.id,
    engagementTypeId: f.type.id,
    officeId: f.client.primaryOfficeId,
    managerId: f.manager.id,
    preparerId: f.preparer.id,
  });
  const rows = [
    {
      engagementId: f.e.id,
      assignedUserId: f.preparer.id,
      allocationDate: firmDates("America/Chicago").today,
      allocatedHours: 1,
    },
    {
      engagementId: second.id,
      assignedUserId: f.preparer.id,
      allocationDate: firmDates("America/Chicago").today,
      allocatedHours: 2,
    },
  ];
  const preview = await post(page, "/api/allocations/preview", { rows });
  expect(preview.items.map((r: { hours: number }) => r.hours)).toEqual([1, 2]);
  const saved = await post(page, "/api/allocations", { rows });
  expect(saved.items).toHaveLength(2);
  await page.goto(`/team/assignments?view=all&engagementId=${second.id}`);
  await expect(page.locator(".allocation-table tbody tr")).toHaveCount(1);
  await shot(page, "team-assignments");
});
test("allocation HTTP security: tenant read/write/export, colleague access, origin and stale revision", async ({
  page,
}) => {
  const f = await engagement(page);
  const saved = await post(page, "/api/allocations", {
    rows: [
      {
        engagementId: f.e.id,
        assignedUserId: f.preparer.id,
        allocationDate: firmDates("America/Chicago").today,
        allocatedHours: 1,
      },
    ],
  });
  const id = saved.items[0].id;
  await signIn(page, "admin@sample.setu.test");
  const list = await page.request.get(
    `/api/allocations?scope=team&view=all&engagementId=${f.e.id}`,
  );
  expect((await list.json()).total).toBe(0);
  expect(
    (await page.request.get(`/api/allocations/${id}/history`)).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(`/api/allocations/export?engagementId=${f.e.id}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post(`/api/allocations/${id}`, {
        headers: { Origin: process.env.APP_URL! },
        data: { action: "cancel", revision: 1, reason: "Foreign attempt" },
      })
    ).status(),
  ).toBe(404);
  await signIn(page, "associate@demo.setu.test");
  expect(
    (
      await page.request.get(`/api/my-work?employeeId=${f.manager.id}`)
    ).status(),
  ).toBe(403);
  expect((await page.request.get("/api/allocations?scope=team")).status()).toBe(
    403,
  );
  expect(
    (
      await page.request.post(`/api/allocations/${id}`, {
        headers: { Origin: "https://invalid.example" },
        data: { action: "status", revision: 1, status: "Completed" },
      })
    ).status(),
  ).toBe(403);
  await post(page, `/api/allocations/${id}`, {
    action: "status",
    revision: 1,
    status: "InProgress",
  });
  expect(
    (
      await page.request.post(`/api/allocations/${id}`, {
        headers: { Origin: process.env.APP_URL! },
        data: { action: "status", revision: 1, status: "Completed" },
      })
    ).status(),
  ).toBe(409);
});

test("assignment breakdown shows employee roles, dated stage hours, employee totals and budget", async ({
  page,
}) => {
  const f = await engagement(page);
  const today = firmDates("America/Chicago").today;
  await post(page, "/api/allocations", {
    rows: [
      {
        engagementId: f.e.id,
        assignedUserId: f.preparer.id,
        allocationDate: today,
        allocatedHours: 1.5,
      },
      {
        engagementId: f.e.id,
        assignedUserId: f.reviewer.id,
        allocationDate: today,
        allocatedHours: 2,
      },
    ],
  });
  await page.goto(`/engagements/${f.e.id}?tab=assignments`);
  const totals = page.getByRole("region", {
    name: "Engagement employee allocation totals",
  });
  await expect(
    totals.getByRole("row").filter({ hasText: f.preparer.firstName }),
  ).toContainText("Preparer");
  await expect(
    totals.getByRole("row").filter({ hasText: f.preparer.firstName }),
  ).toContainText("1.50h");
  await expect(
    totals.getByRole("row").filter({ hasText: f.reviewer.firstName }),
  ).toContainText("Reviewer");
  await expect(
    totals.getByRole("row").filter({ hasText: f.reviewer.firstName }),
  ).toContainText("2.00h");
  await expect(page.locator(".allocation-summary")).toContainText("3.50h");
  await expect(page.locator(".allocation-summary")).toContainText("4h");
  await expect(page.locator(".allocation-table tbody tr")).toHaveCount(2);
  await expect(
    page.locator(".allocation-table tbody tr").first(),
  ).toContainText(today);
  await expect(
    page.locator(".allocation-table tbody tr").first(),
  ).toContainText("Engagement level");
  await shot(page, "assignment-breakdown");
});

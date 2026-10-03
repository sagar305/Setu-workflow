import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
const tokens: string[] = [];
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
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
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const token = newToken();
  tokens.push(token);
  await db.session.create({
    data: {
      firmId: user.firmId,
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page
    .context()
    .addCookies([
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
async function screenshot(page: Page, name: string) {
  await mkdir(".local/ui/build3", { recursive: true });
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  });
  await page.screenshot({
    path: `.local/ui/build3/${name}.png`,
    fullPage: true,
    caret: "initial",
  });
}
test("engagement list filters, search, columns, CSV export and responsive layout", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1536, height: 1100 });
  await page.goto("/engagements");
  await expect(
    page.getByRole("heading", { name: "Engagements", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Due This Week/ })).toBeVisible();
  await screenshot(page, "engagements");
  await page.getByLabel("Search engagements", { exact: true }).fill("ABC001");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/q=ABC001/);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeGreaterThanOrEqual(3);
  await page.getByText("Customize Columns", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Engagement Code", exact: true })
    .check();
  await expect(
    page.getByRole("columnheader", { name: "Engagement Code", exact: true }),
  ).toBeVisible();
  const response = await page.request.get("/api/engagements/export?q=ABC001");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("September 2026 Monthly Close");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/engagements");
  await expect(
    page.getByRole("heading", { name: "Engagements", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await screenshot(page, "engagements-mobile");
});
test("create from Client, smart defaults, edit, complete/reopen, reassign and audit", async ({
  page,
}) => {
  await signIn(page);
  const client = await db.client.findFirstOrThrow({
    where: { clientCode: "ABC001", firm: { firmName: "Demo CPA Firm" } },
  });
  const code = `UI-ENG-${Date.now()}`;
  await page.goto(`/clients/${client.id}?tab=engagements`);
  await expect(
    page.getByRole("heading", { name: "Client Engagements" }),
  ).toBeVisible();
  await screenshot(page, "client-engagements");
  await page
    .getByRole("link", { name: "+ New Engagement", exact: true })
    .click();
  await expect(page.getByLabel("Client", { exact: true })).toHaveValue(
    client.id,
  );
  await expect(page.getByLabel("Office", { exact: true })).toHaveValue(
    client.primaryOfficeId,
  );
  await expect(page.getByLabel("Partner", { exact: true })).toHaveValue(
    client.responsiblePartnerId!,
  );
  await expect(page.getByLabel("Manager", { exact: true })).toHaveValue(
    client.responsibleManagerId!,
  );
  await page
    .getByLabel("Service Line", { exact: true })
    .selectOption({ label: "Tax · Client service" });
  await page
    .getByLabel("Engagement Type", { exact: true })
    .selectOption({ label: "S Corporation Tax Return" });
  // Preserve the Build #3 standalone lifecycle path; Build #4 separately tests
  // the preselected workflow and its explicit application confirmation.
  await page.getByLabel('Workflow Template', { exact: true }).selectOption('');
  await page.getByLabel("Engagement Code", { exact: true }).fill(code);
  await page
    .getByLabel("Engagement Name", { exact: true })
    .fill(`Browser ${code}`);
  await page.getByLabel("Period Type", { exact: true }).selectOption("TaxYear");
  await page.getByLabel("Tax / Reporting Year", { exact: true }).fill("2026");
  await page
    .getByLabel("Preparer", { exact: true })
    .selectOption({ label: "James Wilson" });
  await page.getByLabel("Allocation Date", { exact: true }).fill("2026-09-29");
  await page
    .getByLabel("Planned Start Date", { exact: true })
    .fill("2026-10-01");
  await page.getByLabel("Due Date", { exact: true }).fill("2026-10-15");
  await page.getByLabel("Budget Hours", { exact: true }).fill("24");
  await page.getByLabel("Complexity", { exact: true }).selectOption("Complex");
  await screenshot(page, "engagement-create");
  await page
    .getByRole("button", { name: "Create Engagement", exact: true })
    .click();
  await expect(page).toHaveURL(/\/engagements\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;
  await expect(
    page.getByRole("heading", { name: `Browser ${code}` }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Edit Engagement", exact: true })
    .click();
  await page.getByLabel("Budget Hours", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(`/engagements/${id}`);
  await page
    .getByRole("button", { name: "Change Status", exact: true })
    .click();
  await page
    .getByLabel("New Status", { exact: true })
    .selectOption("Completed");
  await page.getByLabel("Completed Date", { exact: true }).fill("2026-10-15");
  await page
    .getByLabel("Status Comment", { exact: true })
    .fill("Ready for client");
  await page.getByRole("button", { name: "Save Status", exact: true }).click();
  await expect(page.locator('.client-owner-strip strong').first()).toHaveText('Completed');
  await expect(
    page.getByRole("button", { name: "Save Status", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Change Status", exact: true })
    .click();
  await page
    .getByLabel("New Status", { exact: true })
    .selectOption("InProgress");
  await page.getByRole("button", { name: "Save Status", exact: true }).click();
  await expect(page.locator('.client-owner-strip strong').first()).toHaveText('In Progress');
  await expect(
    page.getByRole("button", { name: "Save Status", exact: true }),
  ).toHaveCount(0);
  await screenshot(page, "engagement-overview");
  await page.getByRole("link", { name: "Reassign", exact: true }).click();
  await page
    .getByLabel("New Preparer", { exact: true })
    .selectOption({ label: "Maya Chen" });
  await page.getByLabel("Allocation Date", { exact: true }).fill("2026-10-02");
  await screenshot(page, "engagement-team");
  await page.getByRole("button", { name: "Save Team", exact: true }).click();
  await expect(page).toHaveURL("/engagements");
  await page.goto(`/engagements/${id}?tab=activity`);
  await expect(
    page.getByRole("cell", { name: "Budget hours: 24 → 30.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "reopened", exact: true }),
  ).toBeVisible();
  await screenshot(page, "engagement-activity");
  expect((await page.request.delete(`/api/engagements/${id}`)).status()).toBe(
    405,
  );
  await page.goto(`/engagements?q=${code}`);
  await page.getByLabel(`Select ${code}`, { exact: true }).check();
  await page
    .getByLabel("Bulk action", { exact: true })
    .selectOption("priority");
  await page.getByLabel("New value", { exact: true }).selectOption("Urgent");
  await page.getByLabel(/I confirm this change/).check();
  await page.getByRole("button", { name: "Apply bulk change" }).click();
  await expect(page.getByRole("status")).toHaveText("1 engagements updated.");
});
test("configuration creates engagement type and distinct custom fields", async ({
  page,
}) => {
  await signIn(page);
  const suffix = Date.now();
  await page.goto("/engagements/settings");
  await page
    .getByRole("button", { name: "Add Engagement Type", exact: true })
    .click();
  await page
    .getByLabel("Name", { exact: true })
    .fill(`Special Advisory ${suffix}`);
  await page
    .getByLabel("Service Line", { exact: true })
    .selectOption({ label: "Advisory" });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `Special Advisory ${suffix}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Custom Fields", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Custom Field", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill(`Tax Software ${suffix}`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `Tax Software ${suffix}`, exact: true }),
  ).toBeVisible();
  await screenshot(page, "engagement-settings");
});
test("CSV mapping and preview require confirmation and skip explicit invalid rows", async ({
  page,
}) => {
  await signIn(page);
  const code = `UI-IMPORT-${Date.now()}`;
  await page.goto("/engagements/import");
  const csv = `Engagement Code,Client Code,Engagement Name,Service Line,Engagement Type,Office,Budget Hours\n${code},ABC001,Imported Engagement,Tax,S Corporation Tax Return,Dallas Office,10\nBAD-${Date.now()},UNKNOWN,Invalid Client,Tax,S Corporation Tax Return,Dallas Office,10`;
  await page
    .getByLabel("Engagement CSV file", { exact: true })
    .setInputFiles({
      name: "engagements.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page
    .getByRole("button", { name: "Validate & Preview", exact: true })
    .click();
  await expect(page.getByText("1 valid", { exact: true })).toBeVisible();
  await expect(page.getByText("1 invalid", { exact: true })).toBeVisible();
  expect(
    (await (await page.request.get("/api/engagements?q=" + code)).json()).total,
  ).toBe(0);
  await screenshot(page, "engagement-import");
  await page.getByLabel(/I reviewed the warnings/).check();
  await page
    .getByRole("button", { name: "Import Valid Records", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "1 engagements imported. 1 invalid rows skipped.",
  );
});
test("Preparer sees only assigned engagements and is read-only on server and UI", async ({
  page,
}) => {
  const user = await signIn(page, "associate@demo.setu.test");
  await page.goto("/engagements");
  await expect(
    page.getByRole("link", { name: "+ New Engagement", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Export CSV", exact: true }),
  ).toHaveCount(0);
  const result = await (await page.request.get("/api/engagements")).json();
  expect(result.items.length).toBeGreaterThan(0);
  expect(
    result.items.every((r: { preparerId: string }) => r.preparerId === user.id),
  ).toBe(true);
  const id = result.items[0].id;
  await page.goto(`/engagements/${id}`);
  await expect(
    page.getByRole("link", { name: "Edit Engagement", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Change Status", exact: true }),
  ).toHaveCount(0);
  const hidden = await db.engagement.findFirstOrThrow({
    where: { firmId: user.firmId, NOT: { preparerId: user.id } },
  });
  const foreign = await db.engagement.findFirstOrThrow({
    where: { firmId: { not: user.firmId } },
  });
  for (const record of [hidden, foreign])
    expect(
      (await page.request.get(`/api/engagements/${record.id}`)).status(),
    ).toBe(404);
  expect(
    (
      await page.request.post(`/api/engagements/${id}/status`, {
        headers: { Origin: process.env.APP_URL! },
        data: { status: "Cancelled" },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get("/api/engagements/export")).status()).toBe(
    403,
  );
});

import { test, expect, type Page } from "@playwright/test";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import { mkdir } from "node:fs/promises";
const tokens: string[] = [];
async function capture(page: Page, options: Parameters<Page["screenshot"]>[0]) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  return page.screenshot(options);
}
const browserErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  browserErrors.length = 0;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated|server rendered/i.test(message.text())
    )
      browserErrors.push(message.text());
  });
});
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
  await page.context().addCookies([
    {
      name: "setu_session",
      value: token,
      url: process.env.APP_URL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test.afterEach(async () => {
  await db.session.deleteMany({
    where: { tokenHash: { in: tokens.splice(0).map(tokenHash) } },
  });
  expect(browserErrors).toEqual([]);
});
test.afterAll(() => db.$disconnect());
test("client list, search, filters, column preferences, export and responsive layout", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1536, height: 1100 });
  await page.goto("/clients");
  await expect(
    page.getByRole("heading", { name: "Clients", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ABC Manufacturing LLC" }),
  ).toBeVisible();
  await mkdir(".local/ui/build2", { recursive: true });
  await capture(page, {
    path: ".local/ui/build2/clients.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByLabel("Search clients").fill("ABC001");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("1 matching clients")).toBeVisible();
  await expect(page.getByText("Harbor Manufacturing LLC")).toHaveCount(0);
  await page.getByText("Customize Columns", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Industry", exact: true }).check();
  await page.reload();
  await expect(
    page.getByRole("columnheader", { name: "Industry", exact: true }),
  ).toBeVisible();
  const exported = await page.request.get("/api/clients/export?q=ABC001");
  expect(exported.status()).toBe(200);
  const csv = await exported.text();
  expect(csv).toContain("ABC Manufacturing LLC");
  expect(csv).not.toContain("Harbor Manufacturing");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clients");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await capture(page, {
    path: ".local/ui/build2/clients-mobile.png",
    fullPage: true,
    caret: "initial",
  });
});
test("create, edit, contacts, services, custom fields, activity and bulk status", async ({
  page,
}) => {
  const code = `UI-${Date.now()}`;
  await signIn(page);
  await page.goto("/clients/new");
  await page.getByLabel("Client Code", { exact: true }).fill(code);
  await page
    .getByLabel("Legal Name", { exact: true })
    .fill(`Browser Client ${code}`);
  await page
    .getByLabel("Display Name", { exact: true })
    .fill(`Browser ${code}`);
  await page
    .getByLabel("Entity Type", { exact: true })
    .selectOption({ label: "LLC" });
  await page
    .getByLabel("Primary Office", { exact: true })
    .selectOption({ label: "Dallas Office" });
  await page.getByLabel("Status", { exact: true }).selectOption("Active");
  await page
    .getByLabel("Responsible Partner", { exact: true })
    .selectOption({ label: "Priya Shah" });
  await page
    .getByLabel("Responsible Manager", { exact: true })
    .selectOption({ label: "Daniel Brooks" });
  await page.getByLabel("Tax", { exact: true }).check();
  await page.getByLabel("Payroll", { exact: true }).check();
  await page.getByLabel('Contact First Name', {exact:true}).fill('Initial');
  await page.getByLabel('Contact Last Name', {exact:true}).fill('Contact');
  await page.getByLabel('Contact Email', {exact:true}).fill('initial@example.test');
  await page.getByLabel('Contact Phone', {exact:true}).fill('5551234567');
  await page
    .getByLabel("Accounting Software", { exact: true })
    .fill("QuickBooks Desktop");
  await page.getByRole("button", { name: "Save Client", exact: true }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+$/);
  const clientId = page.url().split("/").pop()!;
  await expect(
    page.getByRole("heading", { name: `Browser ${code}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await page.getByRole("button", { name: "Add Contact", exact: true }).click();
  await page.getByLabel("First Name", { exact: true }).fill("Taylor");
  await page.getByLabel("Last Name", { exact: true }).fill("Client");
  await page.getByLabel("Contact Email").fill("taylor@example.test");
  await page.getByLabel('Phone', {exact:true}).fill('5557654321');
  await page
    .getByLabel("Primary contact (replaces the current primary)")
    .check();
  await page.getByRole("button", { name: "Save Contact" }).click();
  await expect(
    page.getByRole("cell", { name: "Taylor Client", exact: true }),
  ).toBeVisible();
  await page.getByRole('row').filter({hasText:'Initial Contact'}).getByRole('button',{name:'Set as Primary',exact:true}).click();
  await page.getByRole('row').filter({hasText:'Taylor Client'}).getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reactivate", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await page
    .getByRole('row').filter({hasText:'Taylor Client'}).getByRole("button", { name: "Set as Primary", exact: true })
    .click();
  await page.getByRole("link", { name: "Services", exact: true }).click();
  await page.getByLabel("Payroll", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save Services" }).click();
  await expect(page.getByRole("status")).toHaveText("Services saved.");
  await page.getByRole("link", { name: "Custom Fields", exact: true }).click();
  await page.getByLabel("Client Tier", { exact: true }).selectOption("A");
  await page.getByLabel("Complexity", { exact: true }).fill("3.5");
  await page
    .getByLabel("Priority Client", { exact: true })
    .selectOption("false");
  await page.getByRole("button", { name: "Save Custom Fields" }).click();
  await expect(page.getByRole("status")).toHaveText("Custom fields saved.");
  await page.getByRole("link", { name: "Edit Client", exact: true }).click();
  await page
    .getByLabel("Industry", { exact: true })
    .fill("Professional Services");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(`/clients/${clientId}`);
  await capture(page, {
    path: ".local/ui/build2/client-overview.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Primary contact added:", exact: false }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Service removed: Payroll.", { exact: true }),
  ).toBeVisible();
  await capture(page, {
    path: ".local/ui/build2/client-activity.png",
    fullPage: true,
    caret: "initial",
  });
  expect((await page.request.delete(`/api/clients/${clientId}`)).status()).toBe(
    405,
  );
  await page.goto(`/clients?q=${code}`);
  await page.getByLabel(`Select ${code}`, { exact: true }).check();
  await page.getByLabel("New value", { exact: true }).selectOption("Inactive");
  await page.getByLabel(/I confirm this change/).check();
  await page.getByRole("button", { name: "Apply bulk change" }).click();
  await expect(page.getByRole("status")).toHaveText("1 clients updated.");
});
test("configuration creates firm entity types, service lines and typed fields", async ({
  page,
}) => {
  const suffix = Date.now();
  await signIn(page);
  await page.goto("/clients/settings");
  await page
    .getByRole("button", { name: "Add Entity Type", exact: true })
    .click();
  await page
    .getByLabel("Name", { exact: true })
    .fill(`Family Office ${suffix}`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `Family Office ${suffix}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Service Lines", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Service Line", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill(`CFO Services ${suffix}`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `CFO Services ${suffix}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Custom Fields", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Custom Field", exact: true })
    .click();
  await page
    .getByLabel("Name", { exact: true })
    .fill(`Billing Group ${suffix}`);
  await page.getByLabel("Field Type", { exact: true }).selectOption("Dropdown");
  await page
    .getByLabel("Dropdown choices", { exact: true })
    .fill("Monthly\nQuarterly");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `Billing Group ${suffix}`, exact: true }),
  ).toBeVisible();
  await capture(page, {
    path: ".local/ui/build2/client-settings.png",
    fullPage: true,
    caret: "initial",
  });
});
test("CSV upload requires preview and confirmation, reports invalid rows, imports valid rows", async ({
  page,
}) => {
  const code = `IMPORT-${Date.now()}`;
  await signIn(page);
  await page.goto("/clients/import");
  const csv = `Client Code,Legal Name,Entity Type,Status,Office,Service Lines,Primary Contact First Name,Primary Contact Last Name,Primary Contact Email,Primary Contact Phone\n${code},Imported Browser Client ${code},LLC,Prospect,Dallas Office,Tax;Payroll,CSV,Contact,csv@example.test,5551234567\nBAD-${Date.now()},Invalid Office Client,LLC,Active,Foreign Branch,Tax,CSV,Contact,csv@example.test,5551234567`;
  await page.getByLabel("Client CSV file", { exact: true }).setInputFiles({
    name: "clients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByRole("heading", { name: "2. Map columns" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Validate & Preview" }).click();
  await expect(page.getByText("1 valid", { exact: true })).toBeVisible();
  await expect(page.getByText("1 invalid", { exact: true })).toBeVisible();
  expect(
    (await (await page.request.get(`/api/clients?q=${code}`)).json()).total,
  ).toBe(0);
  await capture(page, {
    path: ".local/ui/build2/client-import-preview.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByLabel(/I reviewed the warnings/).check();
  await page.getByRole("button", { name: "Import Valid Records" }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 clients imported. 1 invalid rows skipped.",
  );
  expect(
    (await (await page.request.get(`/api/clients?q=${code}`)).json()).total,
  ).toBe(1);
});
test("read-only user sees no editing, import or export controls; tenant guessing is rejected", async ({
  page,
}) => {
  await signIn(page, "associate@demo.setu.test");
  await page.goto("/clients");
  await expect(
    page.getByRole("link", { name: "New Client", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Import Clients", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Export CSV", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "ABC Manufacturing LLC" }).click();
  await expect(
    page.getByRole("link", { name: "Edit Client", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Contact", exact: true }),
  ).toHaveCount(0);
  const foreign = await db.client.findFirstOrThrow({
    where: { firm: { firmName: "Sample Accounting LLP" } },
  });
  expect((await page.request.get(`/api/clients/${foreign.id}`)).status()).toBe(
    404,
  );
  expect((await page.request.get("/api/clients/export")).status()).toBe(403);
  expect(
    (
      await page.request.post(`/api/clients/${foreign.id}`, {
        headers: { Origin: process.env.APP_URL! },
        data: {},
      })
    ).status(),
  ).toBe(403);
});

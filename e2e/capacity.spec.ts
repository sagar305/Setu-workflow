import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import { firmDates } from "../src/lib/engagement-constants";
test("capacity adjustment, assignment warning, navigation, drill-down and reassignment", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await db.user.findUniqueOrThrow({
    where: { email: "admin@demo.setu.test" },
    include: { firm: true },
  });
  const token = newToken(),
    session = await db.session.create({
      data: {
        firmId: admin.firmId,
        userId: admin.id,
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
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(path, {
      data,
      headers: { Origin: process.env.APP_URL! },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  try {
    const suffix = randomUUID().slice(0, 8),
      name = `Capacity ${suffix}`,
      week = firmDates(admin.firm.timezone).weekStart;
    const role = await db.role.findFirstOrThrow({
      where: { firmId: admin.firmId, roleName: "Partner", isDefault: true },
    });
    const user = await db.user.create({
      data: {
        firmId: admin.firmId,
        roleId: role.id,
        firstName: name,
        lastName: "UI",
        email: `${suffix}@capacity.test.invalid`,
        status: "Active",
        managerId: admin.id,
        weeklyCapacityHours: 40,
      },
    });
    const sample = await db.engagement.findFirstOrThrow({
      where: { firmId: admin.firmId },
    });
    const e = await post("/api/engagements", {
      engagementCode: randomUUID(),
      engagementName: name,
      clientId: sample.clientId,
      serviceLineId: sample.serviceLineId,
      engagementTypeId: sample.engagementTypeId,
      officeId: sample.officeId,
      partnerId: admin.id,
      preparerId: user.id,
      budgetHours: 100,
      dueDate: week,
    });
    await page.goto(`/team/capacity?week=${week}&q=${suffix}`);
    const row = page
      .getByRole("row")
      .filter({
        has: page.getByRole("link", { name: name + " UI", exact: true }),
      });
    await expect(row).toContainText("40.00h");
    await expect(row).toContainText("Available");
    await row.getByRole("link", { name: name + " UI", exact: true }).click();
    await page
      .getByRole("button", { name: "Adjust Capacity", exact: true })
      .click();
    await page.getByLabel("Reduction per working day (hours)").fill("8");
    await page.getByLabel("Reason", { exact: true }).fill("Training day");
    await page
      .getByRole("button", { name: "Save Adjustment", exact: true })
      .click();
    await expect(row).toContainText("32.00h");
    await page
      .getByRole("button", { name: "Assign Work", exact: true })
      .click();
    await page.getByLabel("Find Engagement", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: "Search Engagements", exact: true })
      .click();
    await page.getByLabel("Engagement", { exact: true }).selectOption(e.id);
    await expect(page.getByLabel("Assign To", { exact: true })).toHaveValue(
      user.id,
    );
    await page.getByLabel("Allocated Hours 1", { exact: true }).fill("33");
    await page
      .getByRole("button", { name: "Add to Batch", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Preview Allocations", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "33.00h against 32.00h",
    );
    await page
      .getByRole("button", { name: "Confirm Allocations", exact: true })
      .click();
    await expect(row).toContainText("Overloaded");
    await expect(row).toContainText("103.1%");
    await page.getByText("Daily breakdown", { exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: week }).last(),
    ).toContainText("33.00h");
    await page.getByRole("link", { name: "Next Week →", exact: true }).click();
    await expect(row).toContainText("40.00h");
    await expect(row).not.toContainText("Overloaded");
    await page
      .getByRole("link", { name: "← Previous Week", exact: true })
      .click();
    await expect(row).toContainText("Overloaded");
    await page
      .getByRole("link", { name: "Manage / Reassign", exact: true })
      .click();
    const allocation = page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name, exact: true }) });
    await allocation.getByLabel("Allocation actions").selectOption("reassign");
    const dialog = page.getByRole("dialog", { name: "Allocation action" });
    await dialog
      .locator('select[name="assignedUserId"]')
      .selectOption(admin.id);
    await dialog.locator('[name="reason"]').fill("Balance planned load");
    await dialog.getByRole("button", { name: "Confirm Reassignment", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto(
      `/team/capacity?week=${week}&q=${suffix}&employee=${user.id}`,
    );
    await expect(row).not.toContainText("Overloaded");
    await expect(row).toContainText("0.00h");
    expect(
      (await db.engagement.findUniqueOrThrow({ where: { id: e.id } }))
        .preparerId,
    ).toBe(user.id);
    expect(errors).toEqual([]);
  } finally {
    await db.session.delete({ where: { id: session.id } });
    await db.$disconnect();
  }
});

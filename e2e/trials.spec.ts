import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { db } from "../src/lib/db";
test("firm signs up, activates, explores, and becomes read-only at expiry", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = randomUUID(),
    email = `${suffix}@trial-ui.test.invalid`,
    password = `Trial-${suffix}`,
    firmName = `Trial Browser ${suffix.slice(0, 8)}`;
  try {
    await page.goto("/login");
    await page.getByRole("link", { name: "Start a 15-day firm trial" }).click();
    await expect(
      page.getByRole("heading", { name: "Explore at your own pace" }),
    ).toBeVisible();
    await page.getByLabel("Firm name", { exact: true }).fill(firmName);
    await page.getByLabel("Your first name").fill("Test");
    await page.getByLabel("Your last name").fill("CPA");
    await page.getByLabel("Administrator email").fill(email);
    await page.getByLabel("Firm timezone").selectOption("Asia/Kolkata");
    await page
      .getByRole("button", { name: "Email my activation link" })
      .click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { firm: true },
    });
    expect(user.firm.trialStartedAt).toBeNull();
    const files = await readdir(".local/mail");
    let activation = "";
    for (const file of files.filter((f) => f.endsWith(".txt")).reverse()) {
      const body = await readFile(`.local/mail/${file}`, "utf8");
      if (body.includes(`To: ${email}`)) {
        activation =
          body.match(/https?:\/\/\S+\/invite#token=[a-f0-9]+/)?.[0] ?? "";
        break;
      }
    }
    expect(activation).toBeTruthy();
    await page.goto(activation);
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page
      .getByRole("button", { name: "Set password", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Password saved");
    await page.getByRole("link", { name: "Back to login" }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Log in to your workspace" })
      .click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByLabel("Firm trial")).toContainText(
      "15 days remaining",
    );
    await page
      .getByRole("link", { name: "Trial details / Contact us to continue" })
      .click();
    await expect(
      page.getByRole("link", { name: "Contact Setu" }),
    ).toHaveAttribute("href", /^mailto:hello@setutechnology.com/);
    await page.getByRole("link", { name: "Set up an office" }).click();
    await expect(page.locator("main")).toContainText("Offices");
    await db.firm.update({
      where: { id: user.firmId },
      data: {
        trialStartedAt: new Date(Date.now() - 16 * 86400000),
        trialEndsAt: new Date(Date.now() - 86400000),
      },
    });
    await page.goto("/admin/firm");
    await expect(page.getByLabel("Firm trial")).toContainText(
      "trial has ended",
    );
    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
    const denied = await page.request.post("/api/admin/firm", {
      headers: { Origin: process.env.APP_URL! },
      data: {
        displayName: "Bypass",
        timezone: "UTC",
        defaultCurrency: "USD",
        standardWeeklyCapacityHours: 40,
        isTrial: false,
      },
    });
    expect(denied.status()).toBe(403);
    const report = await page.request.get("/api/reports?report=status");
    expect(report.status()).toBe(200);
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/login/);
    expect(errors).toEqual([]);
  } finally {
    await db.$disconnect();
  }
});

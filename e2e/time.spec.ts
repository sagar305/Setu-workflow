import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import { firmDates } from "../src/lib/engagement-constants";
test("My Work quick time, draft edit, submit, budget and audited correction", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await db.user.findUniqueOrThrow({
    where: { email: "admin@demo.setu.test" },
    include: { firm: true },
  });
  const token = newToken();
  const session = await db.session.create({
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
    const sample = await db.engagement.findFirstOrThrow({
      where: { firmId: admin.firmId },
    });
    const name = `Time UI ${randomUUID().slice(0, 8)}`;
    const e = await post("/api/engagements", {
      engagementName: name,
      engagementCode: randomUUID(),
      clientId: sample.clientId,
      serviceLineId: sample.serviceLineId,
      engagementTypeId: sample.engagementTypeId,
      officeId: sample.officeId,
      preparerId: admin.id,
      partnerId: admin.id,
      budgetHours: 4,
    });
    await post("/api/allocations", {
      rows: [
        {
          engagementId: e.id,
          assignedUserId: admin.id,
          allocationDate: firmDates(admin.firm.timezone).today,
          allocatedHours: 3,
          description: name,
        },
      ],
    });
    await page.goto("/my-work");
    const work = page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(work).toContainText("3.00h planned");
    await work.getByRole("button", { name: "+ Add Time", exact: true }).click();
    await expect(work.getByLabel("Hours", { exact: true })).toHaveValue("");
    await expect(work.getByLabel("Engagement", { exact: true })).toHaveValue(
      e.id,
    );
    await work.getByLabel("Hours", { exact: true }).fill("2.25");
    await work
      .getByLabel("Work Performed", { exact: true })
      .fill(name + " bank reconciliation");
    await work.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(
      work.getByRole("button", { name: "+ Add Time", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "My Time", exact: true }).click();
    let row = page
      .getByRole("row")
      .filter({ hasText: name + " bank reconciliation" });
    await expect(row).toContainText("Draft");
    await row.getByRole("button", { name: "Edit Draft", exact: true }).click();
    await page.getByLabel("Hours", { exact: true }).fill("2.50");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(row).toContainText("2.50h");
    await row.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(row).toContainText("Submitted");
    await expect(row.getByRole("button", { name: "Edit Draft" })).toHaveCount(
      0,
    );
    await page.goto(`/engagements/${e.id}?tab=hours`);
    await expect(
      page.getByRole("heading", { name: "Budget & Hours" }),
    ).toBeVisible();
    await expect(
      page.getByText("Budget used: 62.5%", { exact: true }),
    ).toBeVisible();
    const employee = page
      .getByRole("row")
      .filter({ hasText: `${admin.firstName} ${admin.lastName}` })
      .first();
    await expect(employee).toContainText("3.00h");
    await expect(employee).toContainText("2.50h");
    await expect(employee).toContainText("0.50h");
    await page.getByText("Time entry details", { exact: true }).click();
    row = page
      .getByRole("row")
      .filter({ hasText: name + " bank reconciliation" });
    await row.getByText("Correct time", { exact: true }).click();
    await row
      .getByLabel("Correction reason")
      .fill("Correct reconciliation duration");
    await row
      .getByRole("button", { name: "Return to Draft", exact: true })
      .click();
    await expect(row).toContainText("Draft (correction)");
    await expect(
      page.getByText("Budget used: 0.0%", { exact: true }),
    ).toBeVisible();
    await page.goto("/my-time");
    await page.getByText("Find another week", { exact: true }).click();
    await page.getByLabel("Work date in week").fill("2025-01-02");
    await page.getByRole("button", { name: "Show Week", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /Week 2024-12-30 – 2025-01-05/ }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await db.session.delete({ where: { id: session.id } });
    await db.$disconnect();
  }
});

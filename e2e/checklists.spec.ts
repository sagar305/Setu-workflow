import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
test("checklist draft editor, engagement actions, progress and My Work", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await db.user.findUniqueOrThrow({
    where: { email: "admin@demo.setu.test" },
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
  await page.context().addCookies([
    {
      name: "setu_session",
      value: token,
      url: process.env.APP_URL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const post = async (url: string, data: unknown) => {
    const response = await page.request.post(url, {
      data,
      headers: { Origin: process.env.APP_URL! },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  try {
    const existing = await db.engagement.findFirstOrThrow({
      where: { firmId: admin.firmId },
      include: { client: true },
    });
    const template = await post("/api/templates", {
      name: `Checklist UI ${randomUUID()}`,
      serviceLineId: existing.serviceLineId,
      engagementTypeId: existing.engagementTypeId,
      stages: [
        { name: "Preparation", isStart: true, defaultOwnerType: "Partner" },
        { name: "Complete", isCompletion: true },
      ],
    });
    await page.goto(`/templates/${template.id}`);
    await page
      .getByRole("button", { name: "Add checklist item", exact: true })
      .first()
      .click();
    const itemEditor = page.locator("details").filter({
      has: page.locator("summary", { hasText: "New checklist item" }),
    });
    await itemEditor.locator("summary").click();
    await itemEditor
      .getByLabel("Item title", { exact: true })
      .fill("Bank reconciliation");
    await page
      .getByLabel("Detailed instructions", { exact: true })
      .fill("Reconcile statement to ledger.");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await db.workflowTemplate.findUniqueOrThrow({
              where: { id: template.id },
            })
          ).revision,
      )
      .toBe(2);
    await post(`/api/templates/${template.id}/action`, {
      action: "publish",
      revision: 2,
    });
    const engagement = await post("/api/engagements", {
      engagementCode: `CHK-${Date.now()}`,
      engagementName: "Checklist UI engagement",
      clientId: existing.clientId,
      serviceLineId: existing.serviceLineId,
      engagementTypeId: existing.engagementTypeId,
      officeId: existing.officeId,
      partnerId: admin.id,
    });
    await post(`/api/workflows/${engagement.id}/apply`, {
      templateId: template.id,
    });
    await page.goto(`/engagements/${engagement.id}?tab=checklist`);
    await expect(
      page.getByRole("heading", { name: "Engagement Checklist", exact: true }),
    ).toBeVisible();
    const openItem = async () => {
      const details = page.locator("details.card").filter({
        has: page.locator("summary strong", {
          hasText: "Bank reconciliation",
        }),
      });
      if ((await details.getAttribute("open")) === null)
        await details.locator("summary").first().click();
      return details;
    };
    let row = await openItem();
    await expect(
      row.getByText("Reconcile statement to ledger.", { exact: true }).first(),
    ).toBeVisible();
    await row.getByLabel("Comment", { exact: true }).fill("Reviewed statement");
    await row.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect
      .poll(
        async () =>
          await db.checklistComment.count({
            where: { item: { engagementId: engagement.id } },
          }),
      )
      .toBe(1);
    await page.reload();
    row = await openItem();
    await expect(
      row.locator("p").filter({ hasText: "Reviewed statement" }).first(),
    ).toBeVisible();
    await row
      .getByLabel("New status", { exact: true })
      .selectOption("Completed");
    await row
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
    await page.reload();
    row = await openItem();
    await row.getByLabel("Reopening reason").fill("Review adjustment");
    await row.getByRole("button", { name: "Reopen", exact: true }).click();
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
    await page.goto("/my-work");
    await expect(
      page.getByRole("heading", { name: "My Checklist Items" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("link", { name: "Bank reconciliation", exact: true })
        .first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await db.session.delete({ where: { id: session.id } });
    await db.$disconnect();
  }
});

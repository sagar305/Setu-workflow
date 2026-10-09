import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
test("raise linked point, respond in a thread, resolve, reopen and inspect integrations", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await db.user.findUniqueOrThrow({
      where: { email: "admin@demo.setu.test" },
    }),
    token = newToken(),
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
  const post = async (url: string, data: unknown) => {
    const r = await page.request.post(url, {
      data,
      headers: { Origin: process.env.APP_URL! },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  try {
    const sample = await db.engagement.findFirstOrThrow({
        where: { firmId: admin.firmId },
      }),
      suffix = randomUUID();
    const t = await post("/api/templates", {
      name: `Point UI ${suffix}`,
      serviceLineId: sample.serviceLineId,
      engagementTypeId: sample.engagementTypeId,
      stages: [
        {
          name: "Preparation",
          isStart: true,
          defaultOwnerType: "Partner",
          checklistItems: [
            { itemTitle: "Bank reconciliation", isRequired: false },
          ],
        },
        { name: "Final", isCompletion: true },
      ],
    });
    await post(`/api/templates/${t.id}/action`, {
      action: "publish",
      revision: 1,
    });
    const e = await post("/api/engagements", {
      engagementCode: `PT-${Date.now()}`,
      engagementName: `Point UI ${suffix}`,
      clientId: sample.clientId,
      serviceLineId: sample.serviceLineId,
      engagementTypeId: sample.engagementTypeId,
      officeId: sample.officeId,
      partnerId: admin.id,
    });
    await post(`/api/workflows/${e.id}/apply`, { templateId: t.id });
    await page.goto(`/engagements/${e.id}?tab=checklist`);
    const item = page
      .locator("details.card")
      .filter({
        has: page.locator("summary strong", { hasText: "Bank reconciliation" }),
      });
    await item.locator("summary").first().click();
    await item
      .getByRole("link", { name: "+ Raise Point", exact: true })
      .click();
    await expect(
      page.getByLabel("Checklist item", { exact: true }),
    ).not.toHaveValue("");
    await page
      .getByLabel("Title *", { exact: true })
      .fill("Unexplained difference");
    await page
      .getByLabel("Description *", { exact: true })
      .fill("Please reconcile the 2450 difference.");
    await page.getByLabel("Reference amount", { exact: true }).fill("2450.00");
    await page
      .getByLabel("Blocking — prevents normal workflow movement")
      .check();
    await page
      .getByRole("button", { name: "Raise Point", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Queries / Open Points", exact: true }),
    ).toBeVisible();
    const p = await db.engagementPoint.findFirstOrThrow({
      where: { engagementId: e.id },
    });
    await page.getByRole("link", { name: p.pointNumber, exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Unexplained difference",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Response", { exact: true })
      .fill("Please inspect the deposit.");
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(
      page
        .locator("article")
        .filter({ hasText: "Please inspect the deposit." }),
    ).toBeVisible();
    const response = await db.pointResponse.findFirstOrThrow({
      where: { pointId: p.id },
    });
    await page
      .getByLabel("Reply to", { exact: true })
      .selectOption(response.id);
    await page
      .getByLabel("Response", { exact: true })
      .fill("Deposit recorded in the following month.");
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(page.locator("blockquote")).toContainText(
      "Please inspect the deposit.",
    );
    await page
      .getByLabel("Resolve Point reason", { exact: true })
      .fill("Supporting reconciliation reviewed.");
    await page
      .getByRole("button", { name: "Resolve Point", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reopen Point", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByLabel("Reopen Point reason", { exact: true })
      .fill("Additional evidence needed.");
    await page
      .getByRole("button", { name: "Reopen Point", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resolve Point", exact: true }),
    ).toBeVisible();
    await page.goto(`/engagements/${e.id}?tab=workflow`);
    await page
      .getByRole("button", { name: "Move to Next Stage", exact: true })
      .click();
    await expect(
      page.getByText(
        "1 unresolved blocking points must be resolved or explicitly overridden.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: `${p.pointNumber}: Unexplained difference`,
      }),
    ).toBeVisible();
    await page.goto(`/engagements/${e.id}?tab=overview`);
    await page.getByRole("link", { name: /Blocking Points/ }).click();
    await expect(
      page.getByRole("link", { name: p.pointNumber, exact: true }),
    ).toBeVisible();
    await page.goto(`/engagements/${e.id}?tab=checklist`);
    const linked = page
      .locator("details.card")
      .filter({
        has: page.locator("summary strong", { hasText: "Bank reconciliation" }),
      });
    await linked.locator("summary").first().click();
    await expect(
      linked.getByRole("link", {
        name: `${p.pointNumber}: Unexplained difference`,
      }),
    ).toBeVisible();
    await page.goto("/my-work");
    await expect(
      page.getByRole("heading", { name: "Points Assigned to Me", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: p.pointNumber, exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await db.session.delete({ where: { id: session.id } });
    await db.$disconnect();
  }
});

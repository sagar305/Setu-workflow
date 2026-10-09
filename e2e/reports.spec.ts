import { test, expect } from "@playwright/test";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
test("Build 10 dashboard drill-downs, six reports, export and primary V1 navigation", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await db.user.findUniqueOrThrow({
    where: { email: "admin@demo.setu.test" },
  });
  const sessions: string[] = [];
  const login = async (userId: string) => {
    const token = newToken();
    const s = await db.session.create({
      data: {
        firmId: admin.firmId,
        userId,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    sessions.push(s.id);
    await page.context().addCookies([
      {
        name: "setu_session",
        value: token,
        url: process.env.APP_URL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  };
  try {
    await login(admin.id);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Active Engagements/ }).click();
    await expect(
      page.getByRole("heading", { name: "Engagement Health", exact: true }),
    ).toBeVisible();
    const source = page.locator("table a").first();
    if (await source.count()) {
      await source.click();
      await expect(page).toHaveURL(/engagements\//);
    }
    for (const [kind, title] of [
      ["status", "Engagement Status"],
      ["budget", "Budget vs Actual"],
      ["points", "Open Points Aging"],
      ["capacity", "Team Capacity"],
      ["workflow", "Workflow Aging"],
      ["checklist", "Checklist Progress"],
    ]) {
      await page.goto("/reports?report=" + kind);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      const href = await page
        .getByRole("link", { name: "Export CSV" })
        .getAttribute("href");
      const response = await page.request.get(href!);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/csv");
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect((await response.text()).length).toBeGreaterThan(20);
    }
    for (const [path, title] of [
      ["/clients", "Clients"],
      ["/engagements", "Engagements"],
      ["/my-work", "My Work"],
      ["/team/capacity", "Team Capacity"],
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    }
    const e = await db.engagement.findFirstOrThrow({
      where: { firmId: admin.firmId },
    });
    for (const tab of [
      "workflow",
      "assignments",
      "checklist",
      "queries",
      "hours",
    ]) {
      const response = await page.goto(`/engagements/${e.id}?tab=${tab}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toContainText(e.engagementName);
      await expect(
        page
          .getByRole("navigation", { name: "Engagement details" })
          .locator("a.active"),
      ).toHaveAttribute("href", `/engagements/${e.id}?tab=${tab}`);
    }
    const employee = await db.user.findFirstOrThrow({
      where: {
        firmId: admin.firmId,
        status: "Active",
        role: { roleName: "Associate / Preparer" },
      },
    });
    await login(employee.id);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "My Day", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Engagement Health", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Reports", exact: true }),
    ).toHaveCount(0);
    expect(
      (await page.request.get("/api/reports/export?report=budget")).status(),
    ).toBe(403);
    expect(errors).toEqual([]);
  } finally {
    await db.session.deleteMany({ where: { id: { in: sessions } } });
    await db.$disconnect();
  }
});

test("filtered dashboard links preserve portfolio and active count scope", async ({
  page,
}) => {
  const admin = await db.user.findUniqueOrThrow({
    where: { email: "admin@demo.setu.test" },
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
  try {
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
    const e = await db.engagement.findFirstOrThrow({
      where: { firmId: admin.firmId, workflow: { isNot: null } },
    });
    await page.goto(
      `/dashboard?scope=all&q=${encodeURIComponent(e.engagementName)}`,
    );
    const active = await page
      .getByRole("link", { name: /Active Engagements/ })
      .getAttribute("href");
    const q = new URLSearchParams(active!.slice(1));
    expect(q.get("q")).toBe(e.engagementName);
    expect(q.get("scope")).toBe("active");
    await page.getByText("Workflow pipeline", { exact: true }).click();
    const pipeline = await page
      .locator('a[href*="pipeline="]')
      .filter({ hasText: /: \d/ })
      .first()
      .getAttribute("href");
    expect(new URLSearchParams(pipeline!.slice(1)).get("q")).toBe(
      e.engagementName,
    );
    await page
      .getByText("Checklist, points and budget summaries", { exact: true })
      .click();
    const report = await page
      .getByRole("link", { name: "View budget report" })
      .getAttribute("href");
    expect(new URL(report!, process.env.APP_URL!).searchParams.get("q")).toBe(
      e.engagementName,
    );
  } finally {
    await db.session.delete({ where: { id: session.id } });
    await db.$disconnect();
  }
});

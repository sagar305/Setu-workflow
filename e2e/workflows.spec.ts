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
  await mkdir(".local/ui/build4", { recursive: true });
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  });
  await page.screenshot({
    path: `.local/ui/build4/${name}.png`,
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
test("template builder adds and reorders stages, publishes, versions, duplicates and archives", async ({
  page,
}) => {
  test.setTimeout(120000);
  const { service } = await setup(page),
    name = "Browser Template " + Date.now();
  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "Workflow Templates", exact: true }),
  ).toBeVisible();
  await shot(page, "templates");
  await page.getByRole("link", { name: "+ New Workflow Template" }).click();
  await page.getByLabel("Template Name *", { exact: true }).fill(name);
  await page
    .getByLabel("Service Line *", { exact: true })
    .selectOption(service.id);
  await page.getByRole("button", { name: "+ Add Stage" }).click();
  await page.getByLabel("Stage 3 Name *", { exact: true }).fill("Preparation");
  await page.getByLabel("Stage 3 Default Owner").selectOption("Preparer");
  await page
    .getByRole("button", { name: "Move stage 3 up", exact: true })
    .click();
  await expect(page.getByLabel("Stage 2 Name *", { exact: true })).toHaveValue(
    "Preparation",
  );
  await shot(page, "template-builder");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page).toHaveURL(/templates\/[a-f0-9-]{36}$/);
  const templateId = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Once published, this version/)).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm Publish", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create New Version", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Template Name *", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Duplicate Template", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: name + " – Copy · V1", exact: true }),
  ).toBeVisible();
  await page.goto("/templates/" + templateId);
  await page
    .getByRole("button", { name: "Create New Version", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: name + " · V2", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Stage 2 Name *", { exact: true })
    .fill("Updated Preparation");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByLabel("Stage 2 Name *", { exact: true })).toHaveValue(
    "Updated Preparation",
  );
  await page.goto("/templates/" + templateId);
  await expect(page.getByLabel("Stage 2 Name *", { exact: true })).toHaveValue(
    "Preparation",
  );
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByText("Archived · Published versions preserve their definition."),
  ).toBeVisible();
  await page.goto(
    "/templates?q=" + encodeURIComponent(name) + "&status=Archived",
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
test("apply preview, forward, return, reassign, skip, complete and reopen preserve visible history", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await setup(page),
    name = "Browser Workflow " + Date.now();
  const t = await post(page, "/api/templates", {
    name,
    serviceLineId: f.service.id,
    engagementTypeId: f.type.id,
    stages: [
      { name: "Received", isStart: true, defaultOwnerType: "Preparer" },
      {
        name: "Preparation",
        defaultOwnerType: "Preparer",
        targetDays: 3,
        instructions: "Reconcile the accounts.",
      },
      { name: "Questions", defaultOwnerType: "Preparer", required: false },
      { name: "Review", defaultOwnerType: "Reviewer" },
      { name: "Filed", isCompletion: true, defaultOwnerType: "Manager" },
    ],
  });
  await post(page, `/api/templates/${t.id}/action`, {
    action: "publish",
    revision: 1,
  });
  const e = await post(page, "/api/engagements", {
    engagementCode: "WF-UI-" + Date.now(),
    engagementName: name,
    clientId: f.client.id,
    serviceLineId: f.service.id,
    engagementTypeId: f.type.id,
    officeId: f.client.primaryOfficeId,
    partnerId: f.admin.id,
    managerId: f.manager.id,
    reviewerId: f.reviewer.id,
    preparerId: f.preparer.id,
    associateService: true,
    dueDate: "2026-10-10",
  });
  await page.goto(`/engagements/${e.id}?tab=workflow`);
  await page
    .getByLabel("Workflow Template", { exact: true })
    .selectOption(t.id);
  await expect(page.locator(".workflow-preview")).toContainText("Preparation");
  await shot(page, "apply-preview");
  await page
    .getByRole("button", { name: "Apply Workflow", exact: true })
    .click();
  const heading = () =>
    page.getByRole("heading", { name: "Received", exact: true });
  await expect(heading()).toBeVisible();
  async function forward(stage: string) {
    await page
      .getByRole("button", { name: "Move to Next Stage", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm Move", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: stage, exact: true }),
    ).toBeVisible();
  }
  await forward("Preparation");
  await expect(
    page.getByText("Reconcile the accounts.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reassign Current Stage", exact: true })
    .click();
  await page.getByLabel("Assign To").selectOption(f.manager.id);
  await page.getByLabel("Optional Comment").fill("Manager covering absence");
  await page
    .getByRole("button", { name: "Confirm Reassign", exact: true })
    .click();
  await expect(
    page.getByText("Manager covering absence", { exact: true }),
  ).toBeVisible();
  await forward("Questions");
  await page
    .getByRole("button", { name: "Skip Optional Stage", exact: true })
    .click();
  await page.getByLabel("Reason / Comment *").fill("No outstanding questions");
  await page.getByRole("button", { name: "Confirm Skip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to Previous Stage", exact: true })
    .click();
  const workflow = await db.engagementWorkflow.findUniqueOrThrow({
    where: { engagementId: e.id },
    include: { stages: true },
  });
  await page
    .getByLabel("Return to Stage")
    .selectOption(workflow.stages.find((s) => s.name === "Preparation")!.id);
  await page
    .getByLabel("Reason / Comment *")
    .fill("Bank reconciliation does not tie");
  await page
    .getByRole("button", { name: "Confirm Return", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preparation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Bank reconciliation does not tie", { exact: true }),
  ).toBeVisible();
  await shot(page, "returned-workflow");
  await forward("Questions");
  await forward("Review");
  await forward("Filed");
  await page
    .getByRole("button", { name: "Complete Workflow", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm Completion", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Workflow Completed", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reopen Workflow", exact: true })
    .click();
  await page
    .getByLabel("Return to Stage")
    .selectOption(workflow.stages.find((s) => s.name === "Preparation")!.id);
  await page
    .getByLabel("Reason / Comment *")
    .fill("Client supplied correction");
  await page
    .getByRole("button", { name: "Confirm Reopen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preparation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Client supplied correction", { exact: true }),
  ).toBeVisible();
  await shot(page, "workflow-history");
  await page.goto(`/engagements?workflowTemplateId=${t.id}`);
  await page.getByText("Customize Columns", { exact: true }).click();
  for (const column of [
    "Current Stage",
    "Current Owner",
    "Days in Stage",
    "Last Move",
  ])
    await page.getByRole("checkbox", { name: column, exact: true }).check();
  await expect(page.locator("tbody")).toContainText("Preparation");
  await shot(page, "workflow-list");
  await signIn(page, "associate@demo.setu.test");
  await page.goto("/my-work");
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await shot(page, "my-work");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reassign Current Stage", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Move to Next Stage", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(page.url());
  await expect(page.getByRole('heading', { name: 'Preparation', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await shot(page, "workflow-mobile");
});
test("Engagement creation preselects the type default, requires confirmation, and preserves Save as Draft", async ({
  page,
}) => {
  const f = await setup(page);
  for (const draft of [true, false]) {
    await page.goto(`/engagements/new?clientId=${f.client.id}`);
    await page
      .getByLabel("Service Line", { exact: true })
      .selectOption(f.service.id);
    await page
      .getByLabel("Engagement Type", { exact: true })
      .selectOption(f.type.id);
    await expect(
      page.getByLabel("Workflow Template", { exact: true }),
    ).toHaveValue(f.type.defaultWorkflowTemplateId!);
    await page
      .getByLabel("Engagement Code", { exact: true })
      .fill("CREATE-WF-" + Date.now());
    await page
      .getByLabel("Engagement Name", { exact: true })
      .fill(draft ? "Draft workflow choice" : "Confirmed workflow choice");
    await page
      .getByLabel("Preparer", { exact: true })
      .selectOption(f.preparer.id);
    if (!draft) {
      await page
        .getByRole("button", { name: "Create Engagement", exact: true })
        .click();
      await expect(page.locator('.notice.error[role="alert"]')).toContainText(
        "Confirm the workflow preview",
      );
      await page
        .getByRole("checkbox", {
          name: "Apply this workflow when creating the Engagement",
        })
        .check();
    }
    await page
      .getByRole("button", {
        name: draft ? "Save as Draft" : "Create Engagement",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]{36}$/);
    const result = await (
      await page.request.get("/api/engagements/" + page.url().split("/").at(-1))
    ).json();
    expect(result.status).toBe(draft ? "Draft" : "InProgress");
    if (draft) expect(result.workflow).toBeNull();
    else
      expect(result.workflow.sourceWorkflowTemplateId).toBe(
        f.type.defaultWorkflowTemplateId,
      );
  }
});

test("workflow API rejects foreign records, stale transitions and forbidden actions", async ({
  page,
}) => {
  const f = await setup(page);
  const other = await signIn(page, 'admin@sample.setu.test');
  const otherService = await db.serviceLine.findFirstOrThrow({where:{firmId:other.firmId,name:'Tax'}});
  const foreign = await post(page,'/api/templates',{name:'Private sample '+Date.now(),serviceLineId:otherService.id,stages:[{name:'Private stage'}]});
  await signIn(page);
  expect((await page.request.get('/api/templates/'+foreign.id)).status()).toBe(404);
  await signIn(page, "associate@demo.setu.test");
  const r = await page.request.post("/api/templates", {
    headers: { Origin: process.env.APP_URL! },
    data: {
      name: "Forbidden",
      serviceLineId: f.service.id,
      stages: [{ name: "A" }],
    },
  });
  expect(r.status()).toBe(403);
  const engagement = await db.engagement.findFirstOrThrow({
    where: {
      firmId: f.admin.firmId,
      preparerId: f.preparer.id,
      workflow: { isNot: null },
    },
    include: { workflow: true },
  });
  const w = engagement.workflow!;
  const stale = await page.request.post(
    `/api/workflows/${engagement.id}/transition`,
    {
      headers: { Origin: process.env.APP_URL! },
      data: {
        action: "Forward",
        revision: w.revision + 10,
        currentStageId: w.currentStageId,
      },
    },
  );
  expect(stale.status()).toBe(409);
  expect(await stale.text()).toContain("Refresh");
});

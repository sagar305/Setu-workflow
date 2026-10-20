import { beforeAll, afterAll, test, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
const mail = vi.hoisted(() => ({
  sent: [] as { to: string; kind: string; token: string }[],
}));
vi.mock("../src/lib/mail", () => ({
  sendLink: vi.fn(async (to: string, kind: string, token: string) => {
    mail.sent.push({ to, kind, token });
  }),
}));
import { db } from "../src/lib/db";
import { requestTrial } from "../src/lib/signup";
import {
  consumeToken,
  login,
  principal,
  tenantMutation,
  requestReset,
} from "../src/lib/auth";
import {
  trialState,
  assertTrialWritable,
  TRIAL_DURATION_MS,
} from "../src/lib/trial";
import { provisionFirm } from "../src/lib/provision";
import { saveOffice, saveFirm, inviteUser } from "../src/lib/admin";
const secret = `Trial-${randomUUID()}`;
const payload = () => ({
  firmName: `Trial ${randomUUID()}`,
  firstName: "CPA",
  lastName: "Admin",
  email: `${randomUUID()}@trial.test.invalid`,
  timezone: "Asia/Kolkata",
});
const tokenFor = (email: string, kind = "invite") =>
  mail.sent.filter((m) => m.to === email && m.kind === kind).at(-1)!.token;
async function signup() {
  const input = payload();
  await requestTrial(input, randomUUID());
  return {
    input,
    user: await db.user.findUniqueOrThrow({
      where: { email: input.email },
      include: { firm: true, role: true },
    }),
  };
}
async function activate() {
  const result = await signup();
  await consumeToken("invite", {
    token: tokenFor(result.input.email),
    password: secret,
    confirmPassword: secret,
  });
  return {
    ...result,
    session: await login(
      { email: result.input.email, password: secret },
      randomUUID(),
    ),
  };
}
beforeAll(() => {
  process.env.DEV_MAIL = "true";
});
afterAll(() => db.$disconnect());
test("signup isolates firms, assigns only a server-selected admin role and waits for email activation", async () => {
  const x = payload();
  const response = await requestTrial(
    {
      ...x,
      isTrial: false,
      trialEndsAt: "2099-01-01",
      status: "Active",
      roleId: randomUUID(),
    },
    randomUUID(),
  );
  expect(response).not.toHaveProperty("token");
  const u = await db.user.findUniqueOrThrow({
    where: { email: x.email },
    include: { firm: true, role: { include: { permissions: true } } },
  });
  expect(u.status).toBe("Invited");
  expect(u.passwordHash).toBeNull();
  expect(u.firm.isTrial).toBe(true);
  expect(u.firm.trialStartedAt).toBeNull();
  expect(u.firm.trialEndsAt).toBeNull();
  expect(
    u.role.permissions.some((p) => p.permissionKey === "firm.manage"),
  ).toBe(true);
  const other = await signup();
  expect(other.user.firmId).not.toBe(u.firmId);
  expect(await db.client.count({ where: { firmId: u.firmId } })).toBe(0);
  expect(
    await db.serviceLine.count({ where: { firmId: u.firmId } }),
  ).toBeGreaterThan(0);
  await expect(
    login({ email: x.email, password: secret }, randomUUID()),
  ).rejects.toMatchObject({ status: 401 });
  const invitation = await db.invitation.findFirstOrThrow({
    where: { userId: u.id },
  });
  expect(invitation.tokenHash).not.toBe(tokenFor(x.email));
  await consumeToken("invite", {
    token: tokenFor(x.email),
    password: secret,
    confirmPassword: secret,
  });
  const firm = await db.firm.findUniqueOrThrow({ where: { id: u.firmId } });
  expect(firm.trialEndsAt!.getTime() - firm.trialStartedAt!.getTime()).toBe(
    TRIAL_DURATION_MS,
  );
  await expect(
    consumeToken("invite", {
      token: tokenFor(x.email),
      password: secret,
      confirmPassword: secret,
    }),
  ).rejects.toThrow();
  expect(
    (await db.firm.findUniqueOrThrow({ where: { id: u.firmId } })).trialEndsAt,
  ).toEqual(firm.trialEndsAt);
});
test("resend invalidates prior activation and cannot overwrite an existing firm or restart its trial", async () => {
  const x = await signup(),
    old = tokenFor(x.input.email);
  await requestTrial(
    { ...x.input, firmName: "Replacement", firstName: "Attacker" },
    randomUUID(),
  );
  expect(tokenFor(x.input.email)).not.toBe(old);
  await expect(
    consumeToken("invite", {
      token: old,
      password: secret,
      confirmPassword: secret,
    }),
  ).rejects.toThrow();
  await consumeToken("invite", {
    token: tokenFor(x.input.email),
    password: secret,
    confirmPassword: secret,
  });
  const before = await db.firm.findUniqueOrThrow({
    where: { id: x.user.firmId },
  });
  const deliveries = mail.sent.length;
  await requestTrial(x.input, randomUUID());
  expect(mail.sent).toHaveLength(deliveries);
  expect(
    await db.firm.findUniqueOrThrow({ where: { id: x.user.firmId } }),
  ).toMatchObject({
    firmName: x.input.firmName,
    trialEndsAt: before.trialEndsAt,
  });
  await expect(requestTrial(x.input, randomUUID())).rejects.toMatchObject({
    status: 429,
  });
});
test("expired trials retain login and reads but deny all shared tenant mutations and pending team activation", async () => {
  const x = await activate();
  const actor = await principal(x.session);
  const invited = `${randomUUID()}@trial.test.invalid`;
  await inviteUser(x.session, {
    firstName: "Team",
    lastName: "Member",
    email: invited,
    roleId: actor.roleId,
    primaryOfficeId: null,
    managerId: null,
    weeklyCapacityHours: 40,
  });
  await saveOffice(x.session, undefined, {
    officeName: "Main",
    city: "Austin",
    state: "TX",
    country: "US",
    timezone: null,
    active: true,
  });
  await db.firm.update({
    where: { id: x.user.firmId },
    data: {
      trialStartedAt: new Date(Date.now() - 16 * 86400000),
      trialEndsAt: new Date(Date.now() - 86400000),
    },
  });
  expect(trialState((await principal(x.session)).firm).expired).toBe(true);
  const called = vi.fn();
  await expect(
    tenantMutation(x.session, "firm.manage", called),
  ).rejects.toMatchObject({ status: 403 });
  expect(called).not.toHaveBeenCalled();
  await expect(
    saveOffice(x.session, undefined, {
      officeName: "Denied",
      city: "Austin",
      state: "TX",
      country: "US",
      timezone: null,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    consumeToken("invite", {
      token: tokenFor(invited),
      password: secret,
      confirmPassword: secret,
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(await db.office.count({ where: { firmId: x.user.firmId } })).toBe(1);
  expect(
    await login({ email: x.input.email, password: secret }, randomUUID()),
  ).toBeTruthy();
});
test("password reset and firm settings cannot change trial dates or upgrade access", async () => {
  const x = await activate(),
    before = (await principal(x.session)).firm;
  await saveFirm(x.session, {
    displayName: "Renamed",
    timezone: "America/Chicago",
    defaultCurrency: "USD",
    standardWeeklyCapacityHours: 40,
    isTrial: false,
    trialEndsAt: "2099-01-01",
  });
  await requestReset(x.input.email, randomUUID());
  await consumeToken("reset", {
    token: tokenFor(x.input.email, "reset"),
    password: secret,
    confirmPassword: secret,
  });
  expect(
    await db.firm.findUniqueOrThrow({ where: { id: before.id } }),
  ).toMatchObject({
    isTrial: true,
    trialStartedAt: before.trialStartedAt,
    trialEndsAt: before.trialEndsAt,
  });
});
test("existing provisioned firms keep ongoing access; trial boundary is exact and independent of timezone", async () => {
  const f = await provisionFirm({
    firmName: "Existing firm",
    adminEmail: `${randomUUID()}@trial.test.invalid`,
    adminPassword: secret,
    timezone: "UTC",
  });
  expect(trialState(f.firm)).toMatchObject({ isTrial: false, readOnly: false });
  const start = new Date("2026-10-20T10:00:00Z"),
    end = new Date(start.getTime() + TRIAL_DURATION_MS),
    firm = { isTrial: true, trialStartedAt: start, trialEndsAt: end };
  expect(trialState(firm, start).daysRemaining).toBe(15);
  expect(trialState(firm, new Date(end.getTime() - 1)).readOnly).toBe(false);
  expect(trialState(firm, end)).toMatchObject({
    expired: true,
    daysRemaining: 0,
    readOnly: true,
  });
  expect(() => assertTrialWritable(firm, end)).toThrow();
  expect(
    trialState({ isTrial: true, trialStartedAt: null, trialEndsAt: null })
      .readOnly,
  ).toBe(true);
});
test("expired activation link cannot start a trial; invalid signup input creates no firm", async () => {
  const x = await signup();
  await db.invitation.updateMany({
    where: { userId: x.user.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await expect(
    consumeToken("invite", {
      token: tokenFor(x.input.email),
      password: secret,
      confirmPassword: secret,
    }),
  ).rejects.toThrow();
  expect(
    (await db.firm.findUniqueOrThrow({ where: { id: x.user.firmId } }))
      .trialStartedAt,
  ).toBeNull();
  await expect(
    requestTrial({ ...payload(), timezone: "invalid-zone" }, randomUUID()),
  ).rejects.toThrow();
});

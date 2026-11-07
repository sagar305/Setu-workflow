import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
const mail = vi.hoisted(() => ({
  sent: [] as { to: string; kind: string; token: string }[],
  emails: [] as { to: string; subject: string; text: string }[],
}));
vi.mock("../src/lib/mail", () => ({
  appUrl: () => "http://127.0.0.1:3000",
  sendLink: vi.fn(async (to: string, kind: string, token: string) => {
    mail.sent.push({ to, kind, token });
  }),
  sendEmail: vi.fn(async (to: string, subject: string, text: string) => {
    mail.emails.push({ to, subject, text });
  }),
}));
import { db } from "../src/lib/db";
import { consumeToken, login, principal } from "../src/lib/auth";
import { requestTrial } from "../src/lib/signup";
import { inviteUser } from "../src/lib/admin";
import {
  activity,
  cancelKey,
  dashboard,
  extendTrial,
  firmDetail,
  grantDays,
  isPlatformRoute,
  issueKey,
  listFirms,
  listKeys,
  listRedemptions,
  remindAll,
  revealKey,
  sendDueReminders,
  setFirmStatus,
} from "../src/lib/platform";
import {
  acceptInvite,
  inviteStaff,
  platformPrincipal,
  setStaffActive,
  staffLogin,
  staffSetupTwoFactor,
  staffVerifyCode,
} from "../src/lib/platform-auth";
import { base32Decode, totpCode, totpStep } from "../src/lib/totp";
import { redeemLicenseKey } from "../src/lib/subscription";

const SECRET = `console-${randomUUID()}`;
const password = `Plat-${randomUUID()}`;
const tokenFor = (email: string) => mail.sent.filter((m) => m.to === email && m.kind === "invite").at(-1)!.token;
let staff: Awaited<ReturnType<typeof platformPrincipal>>;
const code = (secret: string, offset = 0) => totpCode(base32Decode(secret), totpStep(new Date()) + offset);
const tokenOf = (link: string) => link.split("#token=")[1];

/** Invite → set password → first sign-in links the authenticator. Returns the session and TOTP secret. */
async function newStaff(name = "Setu Staff") {
  const email = `${randomUUID()}@setu.staff.invalid`;
  const { link } = await inviteStaff(null, { email, name }, { email: false });
  await acceptInvite({ token: tokenOf(link), password, confirmPassword: password }, null);
  const first = await staffLogin({ routeSecret: SECRET, email, password }, null, isPlatformRoute);
  if (first.step !== "setup") throw new Error("expected setup");
  const { session } = await staffSetupTwoFactor({ token: first.token, code: code(first.secret) }, "203.0.113.9");
  return { email, secret: first.secret, session };
}

async function firm(extra = 0) {
  const email = `${randomUUID()}@plat.test.invalid`;
  await requestTrial({ firmName: `Plat ${randomUUID()}`, firstName: "Owner", lastName: "One", email, timezone: "Asia/Kolkata" }, randomUUID());
  await consumeToken("invite", { token: tokenFor(email), password, confirmPassword: password });
  const session = await login({ email, password }, randomUUID());
  const owner = await principal(session);
  for (let i = 0; i < extra; i++) {
    const address = `${randomUUID()}@plat.test.invalid`;
    await inviteUser(session, { firstName: "T", lastName: "M", email: address, roleId: owner.roleId, weeklyCapacityHours: 40, primaryOfficeId: null, managerId: null });
    await consumeToken("invite", { token: tokenFor(address), password, confirmPassword: password });
  }
  return { session, owner, email };
}
const ref = () => `PAY-${randomUUID()}`;

beforeAll(async () => {
  process.env.DEV_MAIL = "true";
  process.env.PLATFORM_ROUTE_SECRET = SECRET;
  staff = await platformPrincipal((await newStaff()).session);
});
afterAll(() => db.$disconnect());

test("the console only answers on its secret route; staff need a password and an authenticator code", async () => {
  expect(isPlatformRoute(SECRET)).toBe(true);
  expect(isPlatformRoute("console")).toBe(false);
  expect(isPlatformRoute(undefined)).toBe(false);
  const { email, secret, session } = await newStaff("Second");
  expect(await platformPrincipal(session)).toMatchObject({ email });
  await expect(staffLogin({ routeSecret: "wrong-secret-value", email, password }, null, isPlatformRoute)).rejects.toMatchObject({ status: 404 });
  // Second sign-in asks for a code; a code can't be reused.
  const step = await staffLogin({ routeSecret: SECRET, email, password }, null, isPlatformRoute);
  expect(step.step).toBe("code");
  await expect(staffVerifyCode({ token: step.token, code: code(secret) }, null)).rejects.toThrow(/already used|didn't match/);
  const again = await staffLogin({ routeSecret: SECRET, email, password }, null, isPlatformRoute);
  await expect(staffVerifyCode({ token: again.token, code: code(secret, 1) }, null)).resolves.toHaveProperty("session");
  // A tenant session is not a console session.
  const { session: tenant } = await firm();
  await expect(platformPrincipal(tenant)).rejects.toMatchObject({ status: 401 });
  // Off entirely without the variable.
  delete process.env.PLATFORM_ROUTE_SECRET;
  expect(isPlatformRoute(SECRET)).toBe(false);
  await expect(platformPrincipal(session)).rejects.toMatchObject({ status: 404 });
  process.env.PLATFORM_ROUTE_SECRET = SECRET;
});

test("five wrong passwords lock a console account for 15 minutes", async () => {
  const { email } = await newStaff("Locky");
  for (let i = 0; i < 5; i++)
    await expect(staffLogin({ routeSecret: SECRET, email, password: "wrong-password-1" }, null, isPlatformRoute)).rejects.toMatchObject({ status: 401 });
  await expect(staffLogin({ routeSecret: SECRET, email, password }, null, isPlatformRoute)).rejects.toMatchObject({ status: 429 });
});

test("disabling a team member signs them out; you can't disable yourself", async () => {
  const other = await newStaff("Temp");
  const otherAdmin = await platformPrincipal(other.session);
  await expect(setStaffActive(staff, staff.id, false)).rejects.toThrow("yourself");
  await setStaffActive(staff, otherAdmin.id, false);
  await expect(platformPrincipal(other.session)).rejects.toMatchObject({ status: 401 });
});

test("lists every firm with its plan state and searches by owner email", async () => {
  const { owner, email } = await firm();
  const { rows, summary } = await listFirms({ q: email });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: owner.firmId, plan: "trial", owner: { email } });
  expect(summary.total).toBe(1);
  expect((await listFirms({ filter: "trial" })).rows.some((r) => r.id === owner.firmId)).toBe(true);
  expect((await listFirms({ filter: "paid" })).rows.some((r) => r.id === owner.firmId)).toBe(false);
});

test("a key issued against a payment can be applied now; one payment never gives two keys", async () => {
  const { owner } = await firm();
  const orderRef = ref();
  const result = await issueKey(staff, { kind: "plan", billing: "yearly", seats: 5, orderRef, amount: "9999", currency: "INR", firmId: owner.firmId, applyNow: true });
  expect(result.key).toMatch(/^SETUWF-/);
  const detail = await firmDetail(owner.firmId);
  expect(detail.state).toMatchObject({ licensed: true, seats: 5 });
  expect(detail.issues[0]).toMatchObject({ orderRef, redeemed: true, amount: "9999" });
  await expect(issueKey(staff, { kind: "plan", seats: 3, orderRef })).rejects.toMatchObject({ status: 409 });
  // The same key can't then be redeemed by the customer as well.
  const owner2 = await firm();
  await expect(redeemLicenseKey(owner2.session, { key: result.key })).rejects.toThrow("already been used");
});

test("additional users are added to a running plan, by key or directly", async () => {
  const { session, owner } = await firm();
  await expect(issueKey(staff, { kind: "addon", seats: 2, orderRef: ref(), firmId: owner.firmId, applyNow: true })).rejects.toThrow("running");
  await issueKey(staff, { kind: "plan", billing: "monthly", seats: 3, orderRef: ref(), firmId: owner.firmId, applyNow: true });
  const before = (await firmDetail(owner.firmId)).state.licenseEndsAt;
  await issueKey(staff, { kind: "addon", seats: 2, orderRef: ref(), firmId: owner.firmId, applyNow: true });
  expect((await firmDetail(owner.firmId)).state).toMatchObject({ seats: 5, licenseEndsAt: before });
  // Sent as a key, the account owner redeems it in the app.
  const { key } = await issueKey(staff, { kind: "addon", seats: 1, orderRef: ref() });
  await expect(redeemLicenseKey(session, { key })).resolves.toMatchObject({ seats: 6 });
});

test("unused keys can be shown again and cancelled; used keys cannot be cancelled", async () => {
  const { session } = await firm();
  const orderRef = ref();
  const { key } = await issueKey(staff, { kind: "plan", seats: 3, orderRef, note: "refund test" });
  const issue = (await listKeys(orderRef))[0];
  expect(issue).toMatchObject({ status: "unused", note: "refund test" });
  expect((await revealKey(staff, issue.id)).key).toBe(key);
  await cancelKey(staff, issue.id);
  expect((await listKeys(orderRef))[0].status).toBe("cancelled");
  await expect(redeemLicenseKey(session, { key })).rejects.toThrow("cancelled");
  const used = await issueKey(staff, { kind: "plan", seats: 3, orderRef: ref() });
  await redeemLicenseKey(session, { key: used.key });
  const usedIssue = (await listKeys()).find((k) => k.status === "redeemed" && k.redeemedBy)!;
  await expect(cancelKey(staff, usedIssue.id)).rejects.toMatchObject({ status: 409 });
});

test("staff can extend a trial and suspend or reactivate a firm", async () => {
  const { owner, session, email } = await firm();
  const end = (await firmDetail(owner.firmId)).state.endsAt!;
  await extendTrial(staff, owner.firmId, { days: 7 });
  expect(new Date((await firmDetail(owner.firmId)).state.endsAt!).getTime() - new Date(end).getTime()).toBe(7 * 86400_000);
  await setFirmStatus(staff, owner.firmId, { status: "Suspended", reason: "unpaid" });
  await expect(principal(session)).rejects.toMatchObject({ status: 401 });
  await expect(login({ email, password }, randomUUID())).rejects.toMatchObject({ status: 401 });
  expect((await listFirms({ q: email })).rows[0].plan).toBe("suspended");
  await setFirmStatus(staff, owner.firmId, { status: "Active" });
  expect(await principal(await login({ email, password }, randomUUID()))).toBeTruthy();
  expect(await db.platformAuditLog.count({ where: { firmId: owner.firmId } })).toBe(3);
});

test("free days go to the plan or the trial, with a reason", async () => {
  const { owner } = await firm();
  const end = (await firmDetail(owner.firmId)).state.endsAt!;
  await expect(grantDays(staff, owner.firmId, { days: 3, reason: "" })).rejects.toThrow();
  await grantDays(staff, owner.firmId, { days: 3, reason: "demo" });
  expect(new Date((await firmDetail(owner.firmId)).state.endsAt!).getTime() - new Date(end).getTime()).toBe(3 * 86400_000);
  await issueKey(staff, { kind: "plan", billing: "monthly", seats: 3, orderRef: ref(), firmId: owner.firmId, applyNow: true });
  const planEnd = (await firmDetail(owner.firmId)).state.licenseEndsAt!;
  await grantDays(staff, owner.firmId, { days: 10, reason: "goodwill" });
  expect(new Date((await firmDetail(owner.firmId)).state.licenseEndsAt!).getTime() - new Date(planEnd).getTime()).toBe(10 * 86400_000);
});

test("plan reminders: automatic at 14/7/1 days once each, and 'remind them now' skips anyone reminded today", async () => {
  const { owner, email } = await firm();
  await issueKey(staff, { kind: "plan", billing: "monthly", seats: 3, orderRef: ref(), firmId: owner.firmId, applyNow: true });
  // Make the plan end in exactly 7 days.
  await db.firm.update({ where: { id: owner.firmId }, data: { licenseExpiresAt: new Date(Date.now() + 7 * 86400_000 - 60_000) } });
  const before = mail.emails.filter((m) => m.to === email).length;
  await sendDueReminders();
  await sendDueReminders();
  const sent = mail.emails.filter((m) => m.to === email);
  expect(sent.length - before).toBe(1);
  expect(sent.at(-1)!.subject).toContain("7 days");
  const result = await remindAll(staff, { days: 14 });
  expect(result.skipped).toBeGreaterThanOrEqual(1);
  expect((await firmDetail(owner.firmId)).reminders).toHaveLength(1);
});

test("dashboard, redeemed-keys list and activity feed", async () => {
  const { owner } = await firm();
  await issueKey(staff, { kind: "plan", billing: "yearly", seats: 4, orderRef: ref(), firmId: owner.firmId, applyNow: true });
  const d = await dashboard();
  expect(d.paying).toBeGreaterThanOrEqual(1);
  expect(d.paidByPlan.some((p) => p.name === "Yearly · 4 users")).toBe(true);
  expect((await listRedemptions()).some((r) => r.firm?.id === owner.firmId && r.source === "Applied by Setu")).toBe(true);
  const feed = await activity({ what: "key." });
  expect(feed.length).toBeGreaterThan(0);
  expect(feed.every((e) => e.action.startsWith("key."))).toBe(true);
  expect((await activity({ what: "admin." })).some((e) => e.action === "admin.two_factor_set_up" && e.ip === "203.0.113.9")).toBe(true);
});

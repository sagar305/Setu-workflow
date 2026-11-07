import { afterAll, beforeAll, expect, test, vi } from "vitest";
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
import { consumeToken, login, principal, tenantMutation } from "../src/lib/auth";
import { requestTrial } from "../src/lib/signup";
import { editUser, inviteUser, saveOffice } from "../src/lib/admin";
import { issueLicenseKey } from "../src/lib/license-key";
import { accessState } from "../src/lib/trial";
import { licenseSecret, readSubscription, redeemLicenseKey, setSeat } from "../src/lib/subscription";

const password = `Sub-${randomUUID()}`;
const DAY = 86400_000;
const key = (days = 30, seats = 3) =>
  issueLicenseKey(`test-${randomUUID()}`, days, seats, licenseSecret()!);
const tokenFor = (email: string) =>
  mail.sent.filter((m) => m.to === email && m.kind === "invite").at(-1)!.token;

/** A trial firm with an activated super admin and `extra` activated Firm Admin colleagues. */
async function firm(extra = 0) {
  const email = `${randomUUID()}@sub.test.invalid`;
  await requestTrial(
    { firmName: `Sub ${randomUUID()}`, firstName: "Super", lastName: "Admin", email, timezone: "Asia/Kolkata" },
    randomUUID(),
  );
  await consumeToken("invite", { token: tokenFor(email), password, confirmPassword: password });
  const session = await login({ email, password }, randomUUID());
  const admin = await principal(session);
  const colleagues = [];
  for (let i = 0; i < extra; i++) colleagues.push(await colleague(session, admin.roleId));
  return { session, admin, colleagues };
}
async function colleague(session: string, roleId: string) {
  const email = `${randomUUID()}@sub.test.invalid`;
  const { id } = await inviteUser(session, {
    firstName: "Team",
    lastName: "Member",
    email,
    roleId,
    weeklyCapacityHours: 40,
    primaryOfficeId: null,
    managerId: null,
  });
  await consumeToken("invite", { token: tokenFor(email), password, confirmPassword: password });
  return { id, email, session: await login({ email, password }, randomUUID()) };
}
const office = (session: string) =>
  saveOffice(session, undefined, { officeName: `HQ ${randomUUID()}`, city: "Pune", state: "", country: "India", timezone: "" });

beforeAll(() => {
  process.env.DEV_MAIL = "true";
});
afterAll(() => db.$disconnect());

test("the signup administrator is the firm's only super admin", async () => {
  const { admin, colleagues } = await firm(1);
  expect(admin.isSuperAdmin).toBe(true);
  expect((await db.user.findUniqueOrThrow({ where: { id: colleagues[0].id } })).isSuperAdmin).toBe(false);
});

test("only the super admin redeems; keys add days after the trial and are single-use", async () => {
  const { session, admin, colleagues } = await firm(1);
  const k = key(30);
  await expect(redeemLicenseKey(colleagues[0].session, { key: k })).rejects.toMatchObject({ status: 403 });
  const result = await redeemLicenseKey(session, { key: k });
  expect(result).toMatchObject({ daysAdded: 30, seats: 3 });
  const f = await db.firm.findUniqueOrThrow({ where: { id: admin.firmId } });
  // Trial still had ~15 days; the 30 paid days come after it.
  expect(f.licenseExpiresAt!.getTime() - f.trialEndsAt!.getTime()).toBe(30 * DAY);
  expect(accessState(f).plan).toBe("licensed");
  await expect(redeemLicenseKey(session, { key: k })).rejects.toMatchObject({ status: 409 });
  // A second firm cannot reuse it either.
  const other = await firm();
  await expect(redeemLicenseKey(other.session, { key: k })).rejects.toThrow("already been used");
  // Another key stacks onto the running subscription.
  await redeemLicenseKey(session, { key: key(365) });
  const later = await db.firm.findUniqueOrThrow({ where: { id: admin.firmId } });
  expect(later.licenseExpiresAt!.getTime() - f.licenseExpiresAt!.getTime()).toBe(365 * DAY);
  expect(await db.auditLog.count({ where: { firmId: admin.firmId, action: "firm.license_redeemed" } })).toBe(2);
});

test("rejects invalid, revoked and foreign-product keys without consuming anything", async () => {
  const { session } = await firm();
  await expect(redeemLicenseKey(session, { key: "SETUWF-ABC" })).rejects.toMatchObject({ status: 400 });
  const qrMenuStyle = issueLicenseKey("x", 30, 3, "some-other-secret");
  await expect(redeemLicenseKey(session, { key: qrMenuStyle })).rejects.toMatchObject({ status: 400 });
  const k = key();
  const { readLicenseKey } = await import("../src/lib/license-key");
  const license = readLicenseKey(k, licenseSecret()!)!;
  await db.licenseRedemption.create({ data: { keyId: license.keyId, days: 30, seats: 3, revoked: true } });
  await expect(redeemLicenseKey(session, { key: k })).rejects.toThrow("cancelled");
});

test("a licensed plan limits seats: invites, re-activation and seat grants need a free seat", async () => {
  const { session, admin, colleagues } = await firm(2); // 3 seat holders
  await redeemLicenseKey(session, { key: key(30, 3) });
  await expect(
    inviteUser(session, { firstName: "Four", lastName: "Th", email: `${randomUUID()}@sub.test.invalid`, roleId: admin.roleId, weeklyCapacityHours: 40, primaryOfficeId: null, managerId: null }),
  ).rejects.toThrow("All 3 users");
  // Removing a seat signs that person out and blocks login with a clear reason.
  await setSeat(session, colleagues[0].id, { hasSeat: false });
  await expect(principal(colleagues[0].session)).rejects.toMatchObject({ status: 401 });
  await expect(login({ email: colleagues[0].email, password }, randomUUID())).rejects.toThrow("not given you access");
  // The freed seat can go to someone new.
  const fourth = await colleague(session, admin.roleId);
  await expect(setSeat(session, colleagues[0].id, { hasSeat: true })).rejects.toMatchObject({ status: 409 });
  await setSeat(session, fourth.id, { hasSeat: false });
  await setSeat(session, colleagues[0].id, { hasSeat: true });
  expect(await principal(await login({ email: colleagues[0].email, password }, randomUUID()))).toBeTruthy();
  // Only the super admin manages seats, and they always keep their own.
  await expect(setSeat(colleagues[1].session, fourth.id, { hasSeat: true })).rejects.toMatchObject({ status: 403 });
  await expect(setSeat(session, admin.id, { hasSeat: false })).rejects.toThrow("always keeps");
  // Re-activating an inactive seat holder needs a free seat.
  const edit = (status: string) => ({ firstName: "Team", lastName: "Member", roleId: admin.roleId, weeklyCapacityHours: 40, status, primaryOfficeId: null, managerId: null });
  await editUser(session, colleagues[1].id, edit("Inactive"));
  await setSeat(session, fourth.id, { hasSeat: true });
  await expect(editUser(session, colleagues[1].id, edit("Active"))).rejects.toThrow("All 3 users");
  const view = await readSubscription(session);
  expect(view.state).toMatchObject({ licensed: true, seats: 3, seatsInUse: 3, overSeats: false });
  expect(view.canManage).toBe(true);
});

test("too many seat holders make the workspace read-only until the super admin removes access", async () => {
  const { session, colleagues } = await firm(4); // 5 seat holders during the trial
  await redeemLicenseKey(session, { key: key(30, 3) });
  await expect(office(session)).rejects.toMatchObject({ status: 403 });
  expect((await readSubscription(session)).state).toMatchObject({ overSeats: true, readOnly: true });
  await setSeat(session, colleagues[0].id, { hasSeat: false });
  await setSeat(session, colleagues[1].id, { hasSeat: false });
  await expect(office(session)).resolves.toMatchObject({ message: "Office saved." });
});

test("a smaller key cannot cut a running plan's seats", async () => {
  const { session } = await firm();
  await redeemLicenseKey(session, { key: key(30, 8) });
  await expect(redeemLicenseKey(session, { key: key(30, 3) })).rejects.toThrow("covers 8");
  await expect(redeemLicenseKey(session, { key: key(30, 10) })).resolves.toMatchObject({ seats: 10 });
});

test("a lapsed subscription is read-only, and redeeming a key from today restores it", async () => {
  const { session, admin } = await firm();
  await redeemLicenseKey(session, { key: key(30) });
  const ended = new Date(Date.now() - DAY);
  await db.firm.update({ where: { id: admin.firmId }, data: { licenseExpiresAt: ended, trialStartedAt: new Date(Date.now() - 20 * DAY), trialEndsAt: new Date(Date.now() - 5 * DAY) } });
  await expect(office(session)).rejects.toThrow("subscription has ended");
  await expect(tenantMutation(session, "offices.manage", async () => 1)).rejects.toMatchObject({ status: 403 });
  const before = Date.now();
  await redeemLicenseKey(session, { key: key(30) });
  const f = await db.firm.findUniqueOrThrow({ where: { id: admin.firmId } });
  expect(f.licenseExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY);
  await expect(office(session)).resolves.toMatchObject({ message: "Office saved." });
});

test("other administrators cannot demote or deactivate the super admin", async () => {
  const { admin, colleagues } = await firm(1);
  const roles = await db.role.findMany({ where: { firmId: admin.firmId } });
  const partner = roles.find((r) => r.roleName === "Partner")!;
  const edit = { firstName: "Super", lastName: "Admin", weeklyCapacityHours: 40, primaryOfficeId: null, managerId: null };
  await expect(editUser(colleagues[0].session, admin.id, { ...edit, roleId: partner.id, status: "Active" })).rejects.toThrow("super admin");
  await expect(editUser(colleagues[0].session, admin.id, { ...edit, roleId: admin.roleId, status: "Inactive" })).rejects.toThrow("super admin");
  await expect(editUser(colleagues[0].session, admin.id, { ...edit, roleId: admin.roleId, status: "Active" })).resolves.toBeTruthy();
});

test("firms without a license keep their existing access and are not seat-limited", async () => {
  const { session, admin, colleagues } = await firm(4);
  await setSeat(session, colleagues[0].id, { hasSeat: false });
  // During a trial seats are not enforced: removing one signs them out, but they can sign back in.
  const again = await login({ email: colleagues[0].email, password }, randomUUID());
  expect(await principal(again)).toBeTruthy();
  expect(accessState({ ...admin.firm, licenseExpiresAt: null, licensedSeats: null })).toMatchObject({ plan: "trial", readOnly: false });
  expect(accessState({ isTrial: false, trialStartedAt: null, trialEndsAt: null })).toMatchObject({ plan: "ongoing", readOnly: false });
});

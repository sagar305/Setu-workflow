// ---------------------------------------------------------------------------
// Owner console sign-in for Setu staff, modelled on Setu Retail's admin:
// email + password, then a 6-digit code from an authenticator app. The first
// sign-in after an invite links the app (QR code). Five wrong attempts lock
// the account for 15 minutes. Invites are one-time links to set a password.
// ---------------------------------------------------------------------------
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "./db";
import { limited } from "./auth";
import { hashPassword, newToken, tokenHash, verifyPassword } from "./crypto";
import { AppError, invariant } from "./errors";
import { appUrl, sendEmail } from "./mail";
import { decryptTotpSecret, encryptTotpSecret, newTotpSecret, otpauthUrl, verifyTotp } from "./totp";
import { password as passwordRule } from "./validation";

const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60_000;
const INVITE_HOURS = 48;
const SESSION_HOURS = 8;

export const platformCookie =
  process.env.NODE_ENV === "production" ? "__Host-setu_platform" : "setu_platform";

export function platformRouteSecret(): string | null {
  const secret = process.env.PLATFORM_ROUTE_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}
export function assertPlatformEnabled() {
  if (!platformRouteSecret()) throw new AppError("Not found.", 404);
}
function totpKey() {
  const key = process.env.PLATFORM_SECRET_KEY || platformRouteSecret();
  if (!key) throw new AppError("Not found.", 404);
  return key;
}

export type Staff = Awaited<ReturnType<typeof platformPrincipal>> & { ip?: string | null };

export async function staffLog(
  adminId: string | null,
  action: string,
  options: { firmId?: string | null; ip?: string | null; metadata?: object } = {},
) {
  await db.platformAuditLog.create({
    data: {
      adminId,
      action,
      firmId: options.firmId ?? null,
      ip: options.ip ?? null,
      metadata: (options.metadata ?? {}) as object,
    },
  });
}

async function issueToken(adminId: string, purpose: "invite" | "setup" | "mfa", minutes: number, totpSecretEnc?: string) {
  const token = newToken();
  if (purpose === "invite")
    await db.platformToken.updateMany({ where: { adminId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await db.platformToken.create({
    data: {
      adminId,
      purpose,
      tokenHash: tokenHash(token),
      totpSecretEnc: totpSecretEnc ?? null,
      expiresAt: new Date(Date.now() + minutes * 60_000),
    },
  });
  return token;
}

/** Marks a token used and returns it, or throws when it is unknown, used or expired. */
async function takeToken(token: unknown, purpose: "invite" | "setup" | "mfa", consume = true) {
  invariant(typeof token === "string" && /^[a-f0-9]{64}$/.test(token), purpose === "invite" ? "This link has expired or was already used. Ask another admin for a new one." : "That took too long. Sign in again.", 401);
  const row = await db.platformToken.findUnique({ where: { tokenHash: tokenHash(token) }, include: { admin: true } });
  invariant(
    row && row.purpose === purpose && !row.usedAt && row.expiresAt > new Date() && row.admin.active,
    purpose === "invite" ? "This link has expired or was already used. Ask another admin for a new one." : "That took too long. Sign in again.",
    401,
  );
  if (consume) {
    const claimed = await db.platformToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    invariant(claimed.count === 1, "That took too long. Sign in again.", 401);
  }
  return row;
}

function assertNotLocked(admin: { lockedUntil: Date | null }) {
  if (admin.lockedUntil && admin.lockedUntil > new Date())
    throw new AppError("Too many wrong attempts. Try again in 15 minutes.", 429);
}

async function failed(admin: { id: string; failedLogins: number }, what: "password" | "code", ip: string | null) {
  const n = admin.failedLogins + 1;
  const locked = n >= MAX_FAILED;
  await db.platformAdmin.update({
    where: { id: admin.id },
    data: locked ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) } : { failedLogins: n },
  });
  await staffLog(admin.id, "admin.sign_in_failed", { ip, metadata: { what, attempt: n, locked } });
}

async function startSession(adminId: string, ip: string | null) {
  const token = newToken();
  await db.$transaction([
    db.platformSession.create({
      data: { adminId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
    }),
    db.platformAdmin.update({ where: { id: adminId }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } }),
  ]);
  await staffLog(adminId, "admin.signed_in", { ip });
  return { session: token, maxAge: SESSION_HOURS * 3600 };
}

const loginInput = z.object({
  routeSecret: z.string().max(200),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

/** Step 1. Returns the next step: link an authenticator app, or enter a code. */
export async function staffLogin(input: unknown, ip: string | null, isRoute: (s: string) => boolean) {
  assertPlatformEnabled();
  const data = loginInput.parse(input);
  // The API path is guessable; the secret route is what has to be known.
  invariant(isRoute(data.routeSecret), "Not found.", 404);
  await limited("platform-login-client", ip ?? "shared", 30);
  const admin = await db.platformAdmin.findUnique({ where: { email: data.email } });
  if (admin) assertNotLocked(admin);
  const ok = await verifyPassword(data.password, admin?.passwordHash ?? null);
  if (!admin || !ok || !admin.active) {
    if (admin && !ok) await failed(admin, "password", ip);
    throw new AppError("Email or password is wrong.", 401);
  }
  if (!admin.totpSecretEnc) {
    const secret = newTotpSecret();
    const token = await issueToken(admin.id, "setup", 10, encryptTotpSecret(secret, totpKey()));
    const url = otpauthUrl(secret, admin.email);
    return { step: "setup" as const, token, secret, qr: await QRCode.toString(url, { type: "svg", margin: 1 }) };
  }
  return { step: "code" as const, token: await issueToken(admin.id, "mfa", 5) };
}

const codeInput = z.object({ token: z.string(), code: z.string().max(12) });

/** Step 2 on first sign-in: the code proves the app has the secret, which is then saved. */
export async function staffSetupTwoFactor(input: unknown, ip: string | null) {
  assertPlatformEnabled();
  const { token, code } = codeInput.parse(input);
  const row = await takeToken(token, "setup", false);
  assertNotLocked(row.admin);
  invariant(!row.admin.totpSecretEnc, "Two-step sign-in is already set up. Sign in again.", 409);
  const secret = row.totpSecretEnc ? decryptTotpSecret(row.totpSecretEnc, totpKey()) : null;
  invariant(secret, "That took too long. Sign in again.", 401);
  const step = verifyTotp(secret, code, new Date(), null);
  if (step === null) {
    await failed(row.admin, "code", ip);
    throw new AppError("That code didn't match. Check the time on your phone and try the newest code.", 401);
  }
  await takeToken(token, "setup");
  await db.platformAdmin.update({
    where: { id: row.adminId },
    data: { totpSecretEnc: encryptTotpSecret(secret, totpKey()), totpLastStep: step },
  });
  await staffLog(row.adminId, "admin.two_factor_set_up", { ip });
  return startSession(row.adminId, ip);
}

/** Step 2: a fresh authenticator code. Each code works once. */
export async function staffVerifyCode(input: unknown, ip: string | null) {
  assertPlatformEnabled();
  const { token, code } = codeInput.parse(input);
  const row = await takeToken(token, "mfa", false);
  const admin = row.admin;
  assertNotLocked(admin);
  invariant(admin.totpSecretEnc, "That took too long. Sign in again.", 401);
  const secret = decryptTotpSecret(admin.totpSecretEnc, totpKey());
  const step = secret ? verifyTotp(secret, code, new Date(), admin.totpLastStep) : null;
  if (step === null) {
    await failed(admin, "code", ip);
    throw new AppError("That code didn't match. Try the newest code in your authenticator app.", 401);
  }
  const claimed = await db.platformAdmin.updateMany({
    where: { id: admin.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  invariant(claimed.count === 1, "That code was already used. Wait for the next one.", 401);
  await takeToken(token, "mfa");
  return startSession(admin.id, ip);
}

export async function platformPrincipal(token: string | undefined) {
  assertPlatformEnabled();
  invariant(token && /^[a-f0-9]{64}$/.test(token), "Please sign in.", 401);
  const session = await db.platformSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { admin: true },
  });
  invariant(session && session.expiresAt > new Date() && session.admin.active, "Please sign in.", 401);
  const { passwordHash: _p, totpSecretEnc: _t, ...admin } = session.admin;
  void _p;
  void _t;
  return admin;
}

export async function platformLogout(token: string | undefined, ip: string | null) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const session = await db.platformSession.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!session) return;
  await db.platformSession.delete({ where: { id: session.id } });
  await staffLog(session.adminId, "admin.signed_out", { ip });
}

// ----- Team -----------------------------------------------------------------

function consoleLink(token: string) {
  return `${appUrl()}/console/${platformRouteSecret()}/accept#token=${token}`;
}

/** Creates (or re-invites) a console user and returns their one-time link. */
export async function inviteStaff(by: Staff | null, input: unknown, options: { email?: boolean } = {}) {
  assertPlatformEnabled();
  const data = z
    .object({ name: z.string().trim().min(1, "Enter a name.").max(100), email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254) })
    .parse(input);
  const existing = await db.platformAdmin.findUnique({ where: { email: data.email } });
  invariant(!existing || !existing.passwordHash, "This person is already on the team. Use Reset to send them a new link.", 409);
  const admin =
    existing ??
    (await db.platformAdmin.create({ data: { email: data.email, name: data.name, invitedById: by?.id ?? null } }));
  const link = consoleLink(await issueToken(admin.id, "invite", INVITE_HOURS * 60));
  await staffLog(by?.id ?? null, "admin.invited", { ip: by?.ip, metadata: { email: data.email, name: data.name } });
  if (options.email !== false)
    await sendEmail(
      data.email,
      "You're invited to the Setu Workflow console",
      `${by ? by.name : "Setu"} invited you to the Setu Workflow owner console.\n\nSet your password: ${link}\n\nThe link works once and expires in ${INVITE_HOURS} hours. At your first sign-in you'll link an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or similar).`,
    );
  return { link, message: `Invite sent to ${data.email}.` };
}

/** New password link; clears the authenticator so it is linked again, and signs them out. */
export async function resetStaff(by: Staff | null, adminId: string, options: { email?: boolean } = {}) {
  assertPlatformEnabled();
  const admin = await db.platformAdmin.findUnique({ where: { id: z.string().uuid().parse(adminId) } });
  invariant(admin, "Team member not found.", 404);
  invariant(!by || by.id !== admin.id, "Ask another team member to reset your sign-in.");
  await db.$transaction([
    db.platformAdmin.update({
      where: { id: admin.id },
      data: { passwordHash: null, totpSecretEnc: null, totpLastStep: null, failedLogins: 0, lockedUntil: null, active: true },
    }),
    db.platformSession.deleteMany({ where: { adminId: admin.id } }),
  ]);
  const link = consoleLink(await issueToken(admin.id, "invite", INVITE_HOURS * 60));
  await staffLog(by?.id ?? null, "admin.reset", { ip: by?.ip, metadata: { email: admin.email } });
  if (options.email !== false)
    await sendEmail(
      admin.email,
      "Reset your Setu Workflow console sign-in",
      `Set a new password for the Setu Workflow owner console: ${link}\n\nThe link works once and expires in ${INVITE_HOURS} hours. You'll link your authenticator app again at your next sign-in.`,
    );
  return { link, message: `Reset link sent to ${admin.email}.` };
}

export async function setStaffActive(by: Staff, adminId: string, active: boolean) {
  const admin = await db.platformAdmin.findUnique({ where: { id: z.string().uuid().parse(adminId) } });
  invariant(admin, "Team member not found.", 404);
  invariant(by.id !== admin.id, "You can't disable yourself.");
  if (!active) {
    const others = await db.platformAdmin.count({ where: { active: true, passwordHash: { not: null }, id: { not: admin.id } } });
    invariant(others > 0, "Keep at least one active team member.");
  }
  await db.$transaction([
    db.platformAdmin.update({ where: { id: admin.id }, data: { active } }),
    ...(active ? [] : [db.platformSession.deleteMany({ where: { adminId: admin.id } })]),
  ]);
  await staffLog(by.id, active ? "admin.enabled" : "admin.disabled", { ip: by.ip, metadata: { email: admin.email } });
  return { message: active ? `${admin.name} can sign in again.` : `${admin.name} is disabled and signed out.` };
}

export async function inviteDetails(token: unknown) {
  assertPlatformEnabled();
  const row = await takeToken(token, "invite", false);
  return { name: row.admin.name, email: row.admin.email };
}

export async function acceptInvite(input: unknown, ip: string | null) {
  assertPlatformEnabled();
  const data = z
    .object({ token: z.string(), password: passwordRule, confirmPassword: z.string() })
    .refine((v) => v.password === v.confirmPassword, { message: "Passwords must match.", path: ["confirmPassword"] })
    .parse(input);
  const row = await takeToken(data.token, "invite");
  await db.platformAdmin.update({ where: { id: row.adminId }, data: { passwordHash: await hashPassword(data.password) } });
  await staffLog(row.adminId, "admin.password_set", { ip });
  return { message: "Password saved. Sign in to link your authenticator app." };
}

export async function listTeam() {
  const team = await db.platformAdmin.findMany({ orderBy: { createdAt: "asc" } });
  return team.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    status: !a.active ? "Disabled" : !a.passwordHash ? "Invited" : !a.totpSecretEnc ? "No authenticator yet" : "Active",
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
  }));
}

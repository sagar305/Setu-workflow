import { assertTrialWritable, TRIAL_DURATION_MS } from "./trial";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { newToken, tokenHash, hashPassword, verifyPassword } from "./crypto";
import { invariant, AppError } from "./errors";
import { email, loginInput, tokenInput } from "./validation";
import { sendLink } from "./mail";
import type { PermissionKey } from "./permissions";

export type Database = Prisma.TransactionClient;
const identityInclude = {
  firm: true,
  primaryOffice: true,
  role: { include: { permissions: true } },
} as const;
export async function principal(token: string | undefined, tx: Database = db) {
  invariant(token && /^[a-f0-9]{64}$/.test(token), "Please log in.", 401);
  const session = await tx.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { include: identityInclude } },
  });
  invariant(session && session.expiresAt > new Date(), "Please log in.", 401);
  const user = session.user;
  invariant(
    user.status === "Active" &&
      user.firm.status === "Active" &&
      user.role.active,
    "Please log in.",
    401,
  );
  return user;
}
export type Principal = Awaited<ReturnType<typeof principal>>;
export function hasPermission(user: Principal, key: PermissionKey) {
  return user.role.permissions.some((p) => p.permissionKey === key);
}
export function requirePermission(user: Principal, key: PermissionKey) {
  invariant(
    hasPermission(user, key),
    "You do not have access to this action.",
    403,
  );
}
export async function audit(
  tx: Database,
  firmId: string,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Prisma.InputJsonValue = {},
) {
  await tx.auditLog.create({
    data: { firmId, actorUserId, action, entityType, entityId, metadata },
  });
}
export async function lockFirm(tx: Database, firmId: string) {
  await tx.$queryRaw`SELECT id FROM firms WHERE id = ${firmId}::uuid FOR UPDATE`;
}
// Shared mutation boundary for all tenant modules. Rechecks identity after acquiring the firm lock.
export async function tenantMutation<T>(
  token: string | undefined,
  permission: PermissionKey,
  work: (tx: Database, actor: Principal) => Promise<T>,
) {
  const initial = await principal(token);
  return db.$transaction(
    async (tx) => {
      await lockFirm(tx, initial.firmId);
      const actor = await principal(token, tx);
      requirePermission(actor, permission);
      assertTrialWritable(actor.firm);
      return work(tx, actor);
    },
    { timeout: 60000, maxWait: 10000 },
  );
}
export async function limited(
  scope: string,
  value: string,
  limit: number,
  seconds = 900,
) {
  const key = tokenHash(`${scope}:${value}`);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, expires_at) VALUES (${key}, 1, NOW() + ${seconds} * INTERVAL '1 second')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at < NOW() THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at < NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE rate_limits.expires_at END
    RETURNING count`;
  invariant(
    rows[0].count <= limit,
    "Too many attempts. Please try again later.",
    429,
  );
}
export async function login(input: unknown, clientKey: string) {
  const data = loginInput.parse(input);
  await limited("login-email", data.email, 10);
  await limited("login-client", clientKey, 100);
  const found = await db.user.findUnique({ where: { email: data.email } });
  const valid = await verifyPassword(
    data.password,
    found?.passwordHash ?? null,
  );
  invariant(found && valid, "Email or password is incorrect.", 401);
  return db.$transaction(async (tx) => {
    await lockFirm(tx, found.firmId);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: found.id },
      include: identityInclude,
    });
    invariant(
      user.passwordHash === found.passwordHash &&
        user.status === "Active" &&
        user.firm.status === "Active" &&
        user.role.active,
      "Email or password is incorrect.",
      401,
    );
    const token = newToken();
    await tx.session.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 8 * 3600_000),
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await audit(tx, user.firmId, user.id, "auth.login", "User", user.id);
    return token;
  });
}
export async function logout(token?: string) {
  if (!token) return;
  await db.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    if (!session) return;
    await tx.session.deleteMany({ where: { id: session.id } });
    await audit(
      tx,
      session.firmId,
      session.userId,
      "auth.logout",
      "User",
      session.userId,
    );
  });
}
export async function requestReset(input: unknown, clientKey: string) {
  const address = email.parse(input);
  await limited("reset-client", clientKey, 50);
  await limited("reset-email", address, 5);
  const user = await db.user.findUnique({
    where: { email: address },
    include: identityInclude,
  });
  if (
    !user ||
    user.status !== "Active" ||
    user.firm.status !== "Active" ||
    !user.role.active
  )
    return;
  const token = newToken();
  await db.$transaction(async (tx) => {
    await lockFirm(tx, user.firmId);
    await tx.passwordReset.updateMany({
      where: { firmId: user.firmId, userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordReset.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    await audit(tx, user.firmId, null, "auth.reset_requested", "User", user.id);
  });
  try {
    await sendLink(address, "reset", token, user.firm.displayName);
  } catch {
    console.error("Password reset delivery failed; check mail configuration.");
  }
}
export async function invitationDetails(token: string) {
  invariant(
    /^[a-f0-9]{64}$/.test(token),
    "This invitation is invalid or expired.",
  );
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { include: identityInclude } },
  });
  invariant(
    invitation &&
      !invitation.usedAt &&
      invitation.expiresAt > new Date() &&
      invitation.user.status === "Invited" &&
      invitation.user.firm.status === "Active" &&
      invitation.user.role.active,
    "This invitation is invalid or expired.",
  );
  return { firmName: invitation.user.firm.displayName };
}
export async function consumeToken(kind: "invite" | "reset", input: unknown) {
  const data = tokenInput.parse(input);
  const hash = tokenHash(data.token);
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    const record =
      kind === "invite"
        ? await tx.invitation.findUnique({ where: { tokenHash: hash } })
        : await tx.passwordReset.findUnique({ where: { tokenHash: hash } });
    invariant(record, "This link is invalid or expired.");
    await lockFirm(tx, record.firmId);
    const user = await tx.user.findUniqueOrThrow({
      where: { firmId_id: { firmId: record.firmId, id: record.userId } },
      include: identityInclude,
    });
    invariant(
      user.firm.status === "Active" &&
        user.role.active &&
        user.status === (kind === "invite" ? "Invited" : "Active"),
      "This link is invalid or expired.",
    );
    const where = {
      id: record.id,
      firmId: record.firmId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    };
    const result =
      kind === "invite"
        ? await tx.invitation.updateMany({
            where,
            data: { usedAt: new Date() },
          })
        : await tx.passwordReset.updateMany({
            where,
            data: { usedAt: new Date() },
          });
    invariant(result.count === 1, "This link is invalid or expired.");
    if (kind === "invite" && user.firm.isTrial) {
      if (!user.firm.trialStartedAt) {
        invariant(
          user.role.isDefault &&
            user.role.permissions.some(
              (p) => p.permissionKey === "firm.manage",
            ),
          "The firm administrator must activate the trial first.",
          403,
        );
        const startedAt = new Date();
        await tx.firm.update({
          where: { id: user.firmId },
          data: {
            trialStartedAt: startedAt,
            trialEndsAt: new Date(startedAt.getTime() + TRIAL_DURATION_MS),
          },
        });
        await audit(
          tx,
          user.firmId,
          user.id,
          "firm.trial_started",
          "Firm",
          user.firmId,
        );
      } else assertTrialWritable(user.firm);
    }
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, status: "Active" },
    });
    await tx.session.deleteMany({
      where: { firmId: user.firmId, userId: user.id },
    });
    await tx.passwordReset.updateMany({
      where: { firmId: user.firmId, userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await audit(
      tx,
      user.firmId,
      user.id,
      kind === "invite" ? "user.activated" : "auth.password_reset",
      "User",
      user.id,
    );
  });
}
export function publicError(error: unknown) {
  if (error instanceof AppError)
    return { error: error.message, status: error.status };
  return null;
}

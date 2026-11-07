import { z } from "zod";
import { db } from "./db";
import {
  audit,
  hasPermission,
  limited,
  lockFirm,
  principal,
  seatHolders,
  type Database,
  type Principal,
} from "./auth";
import { invariant } from "./errors";
import { readLicenseKey, type License } from "./license-key";
import { accessState } from "./trial";
import { id } from "./validation";

const DAY_MS = 86400_000;
const DEV_SECRET = "dev-only-workflow-license-secret";

/**
 * Shared with setutechnology.com, which sells the keys this app redeems. Null
 * in production while unset, which turns redemption off. Development and tests
 * fall back to a fixed secret so keys can be issued locally.
 */
export function licenseSecret(): string | null {
  const secret = process.env.WORKFLOW_LICENSE_SECRET;
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

const redeemInput = z.object({
  key: z.string().trim().min(1, "Paste your license key.").max(200, "That is not a license key."),
});
const seatInput = z.object({ hasSeat: z.boolean() });

/** Who may see the subscription page: the account owner, and firm administrators read-only. */
export function canViewSubscription(user: Principal) {
  return user.isAccountOwner || hasPermission(user, "firm.manage");
}

export async function seatsInUse(tx: Database, firmId: string) {
  return tx.user.count({ where: { firmId, ...seatHolders } });
}

/**
 * Throws when the firm's plan has no free seat. Only a running license limits
 * seats; trials and older firms are unlimited.
 */
export async function assertSeatAvailable(tx: Database, actor: Principal) {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: actor.firmId } });
  const state = accessState(firm);
  if (!state.licensed || state.seats === null) return;
  const used = await seatsInUse(tx, actor.firmId);
  invariant(
    used < state.seats,
    `All ${state.seats} users on your plan are in use. Remove access from someone in Admin → Subscription, or contact Setu sales to add more users.`,
    409,
  );
}

export async function readSubscription(token: string | undefined) {
  const user = await principal(token);
  invariant(canViewSubscription(user), "You do not have access to this action.", 403);
  const [users, redemptions] = await Promise.all([
    db.user.findMany({
      where: { firmId: user.firmId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        hasSeat: true,
        isAccountOwner: true,
        role: { select: { roleName: true } },
      },
      orderBy: [{ isAccountOwner: "desc" }, { firstName: "asc" }, { id: "asc" }],
    }),
    db.licenseRedemption.findMany({
      where: { firmId: user.firmId, revoked: false },
      select: { id: true, days: true, seats: true, newExpiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const accountOwner = users.find((u) => u.isAccountOwner);
  return {
    state: accessState(user.firm),
    canManage: user.isAccountOwner,
    keysEnabled: licenseSecret() !== null,
    accountOwner: accountOwner
      ? { name: `${accountOwner.firstName} ${accountOwner.lastName}`, email: accountOwner.email }
      : null,
    users,
    redemptions,
  };
}

/**
 * Runs a account-owner change under the firm lock. Unlike tenantMutation it does
 * not require a writable workspace: renewing a lapsed plan and removing seats
 * from an over-full one are exactly how a read-only workspace recovers.
 */
async function ownerChange<T>(
  token: string | undefined,
  work: (tx: Database, actor: Principal) => Promise<T>,
) {
  const initial = await principal(token);
  invariant(initial.isAccountOwner, "Only your firm's account owner can change the subscription.", 403);
  return db.$transaction(
    async (tx) => {
      await lockFirm(tx, initial.firmId);
      const actor = await principal(token, tx);
      invariant(actor.isAccountOwner, "Only your firm's account owner can change the subscription.", 403);
      return work(tx, actor);
    },
    { timeout: 30000, maxWait: 10000 },
  );
}

/**
 * Applies a license to a firm. Shared by the account owner redeeming a key and
 * the Setu owner console applying a payment directly. The caller holds the
 * firm lock.
 *
 * - A plan (days >= 1) adds days after whatever is still running (plan or
 *   trial), or from today once access has ended, and sets the plan's users. A
 *   plan with fewer users than a running one is refused, so a renewal can't
 *   silently cut seats.
 * - A top-up (days = 0) adds users to a running plan and leaves its end date.
 *
 * keyId is unique across redemptions, so one key or payment applies once.
 */
export async function applyLicense(
  tx: Database,
  firmId: string,
  license: License,
  by: { userId: string | null; source: string; actorLabel?: string },
) {
  const existing = await tx.licenseRedemption.findUnique({ where: { keyId: license.keyId } });
  invariant(
    !existing?.revoked,
    "This license key was cancelled after a refund and can no longer be used.",
    409,
  );
  invariant(!existing, "This license key has already been used.", 409);

  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId } });
  const state = accessState(firm);
  const topUp = license.days === 0;
  let newEnd: Date;
  let seats: number;
  if (topUp) {
    invariant(
      state.licensed && firm.licenseExpiresAt && state.seats !== null,
      "Additional users can only be added to a plan that is running. Activate a plan first.",
      409,
    );
    newEnd = firm.licenseExpiresAt;
    seats = state.seats + license.seats;
  } else {
    invariant(
      !state.licensed || state.seats === null || license.seats >= state.seats,
      `This key covers ${license.seats} users, but your current plan covers ${state.seats}. Contact Setu sales to renew for ${state.seats} users.`,
      409,
    );
    const running = [Date.now()];
    if (firm.licenseExpiresAt) running.push(firm.licenseExpiresAt.getTime());
    if (firm.isTrial && firm.trialEndsAt) running.push(firm.trialEndsAt.getTime());
    newEnd = new Date(Math.max(...running) + license.days * DAY_MS);
    seats = license.seats;
  }

  await tx.licenseRedemption.create({
    data: {
      keyId: license.keyId,
      firmId,
      userId: by.userId,
      days: license.days,
      seats: license.seats,
      previousExpiresAt: firm.licenseExpiresAt,
      newExpiresAt: newEnd,
    },
  });
  await tx.firm.update({ where: { id: firmId }, data: { licenseExpiresAt: newEnd, licensedSeats: seats } });
  await audit(tx, firmId, by.userId, topUp ? "firm.users_added" : "firm.license_redeemed", "Firm", firmId, {
    source: by.source,
    ...(by.actorLabel ? { by: by.actorLabel } : {}),
    days: license.days,
    seats: license.seats,
    planSeats: seats,
    previousSeats: firm.licensedSeats,
    previousEnd: firm.licenseExpiresAt?.toISOString() ?? null,
    newEnd: newEnd.toISOString(),
  });
  const used = await seatsInUse(tx, firmId);
  const over = used - seats;
  return {
    daysAdded: license.days,
    seats,
    licenseEndsAt: newEnd.toISOString(),
    message:
      (topUp
        ? `${license.seats} more user${license.seats === 1 ? "" : "s"} added: your plan now covers ${seats}.`
        : `License key redeemed: ${license.days} days for ${seats} users added.`) +
      (over > 0 ? ` ${used} people currently have access — remove access from ${over} to keep editing.` : ""),
  };
}

/** Redeems a key bought on setutechnology.com or issued by Setu sales. */
export async function redeemLicenseKey(token: string | undefined, input: unknown) {
  const { key } = redeemInput.parse(input);
  const secret = licenseSecret();
  invariant(secret, "License keys are not enabled on this server yet. Please contact Setu.", 503);
  const initial = await principal(token);
  invariant(initial.isAccountOwner, "Only your firm's account owner can redeem a license key.", 403);
  await limited("license-redeem", initial.firmId, 10, 3600);
  const license = readLicenseKey(key, secret);
  invariant(license, "That license key is not valid. Check it was copied in full.", 400);
  return ownerChange(token, (tx, actor) =>
    applyLicense(tx, actor.firmId, license, { userId: actor.id, source: "key" }),
  );
}

/** Gives a colleague a seat, or takes it away (which also signs them out). */
export async function setSeat(token: string | undefined, userId: string, input: unknown) {
  id.parse(userId);
  const { hasSeat } = seatInput.parse(input);
  return ownerChange(token, async (tx, actor) => {
    const target = await tx.user.findFirst({ where: { firmId: actor.firmId, id: userId } });
    invariant(target, "User not found.", 404);
    invariant(hasSeat || !target.isAccountOwner, "The account owner always keeps their seat.");
    if (target.hasSeat === hasSeat) return { message: "No change." };
    if (hasSeat && target.status !== "Inactive") await assertSeatAvailable(tx, actor);
    await tx.user.update({
      where: { firmId_id: { firmId: actor.firmId, id: userId } },
      data: { hasSeat },
    });
    if (!hasSeat) await tx.session.deleteMany({ where: { firmId: actor.firmId, userId } });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      hasSeat ? "user.seat_assigned" : "user.seat_removed",
      "User",
      userId,
    );
    return {
      message: hasSeat
        ? `${target.firstName} ${target.lastName} now has access.`
        : `${target.firstName} ${target.lastName} no longer has access.`,
    };
  });
}

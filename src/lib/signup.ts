import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { limited, lockFirm } from "./auth";
import { newToken, tokenHash } from "./crypto";
import { email, timezone } from "./validation";
import { provisionFirm } from "./provision";
import { sendLink } from "./mail";
import { invariant } from "./errors";

export const signupInput = z.object({
  firmName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email,
  timezone,
});
const response = {
  message:
    "Check your email for an activation link. If you already have an account, log in or reset your password. To resend an unused activation link, submit this form again. Your 15 days begin when you activate.",
};
export async function requestTrial(input: unknown, clientKey: string) {
  const data = signupInput.parse(input);
  await limited("trial-client", clientKey, 20, 3600);
  await limited("trial-email", data.email, 3, 3600);
  invariant(
    (process.env.NODE_ENV !== "production" &&
      process.env.DEV_MAIL === "true") ||
      !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
    "Trial email delivery is unavailable. Please try again later.",
    503,
  );
  const raw = newToken();
  let destination: { displayName: string } | null = null;
  const existing = await db.user.findUnique({
    where: { email: data.email },
    include: { firm: true },
  });
  if (existing) {
    // Resend only to the original address; never change an existing firm's identity or restart its clock.
    destination = await db.$transaction(async (tx) => {
      await lockFirm(tx, existing.firmId);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: { firm: true, role: true },
      });
      if (
        user.status !== "Invited" ||
        !user.firm.isTrial ||
        user.firm.trialStartedAt ||
        user.firm.status !== "Active" ||
        !user.role.isDefault ||
        !user.role.active
      )
        return null;
      await tx.invitation.updateMany({
        where: { userId: user.id, firmId: user.firmId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.invitation.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          tokenHash: tokenHash(raw),
          expiresAt: new Date(Date.now() + 48 * 3600_000),
        },
      });
      return user.firm;
    });
  } else {
    try {
      const created = await provisionFirm({
        firmName: data.firmName,
        adminEmail: data.email,
        adminPassword: newToken(),
        timezone: data.timezone,
        trial: {
          firstName: data.firstName,
          lastName: data.lastName,
          invitationHash: tokenHash(raw),
        },
      });
      destination = created.firm;
    } catch (e) {
      // Concurrent submissions cannot create two firms for the same administrator.
      if (!(
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
      ))
        throw e;
    }
  }
  if (destination) {
    try {
      await sendLink(data.email, "invite", raw, destination.displayName);
    } catch {
      console.error(
        "Trial activation email delivery failed; check Resend configuration. The signup form can resend it.",
      );
    }
  }
  return response;
}


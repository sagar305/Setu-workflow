import { db } from "./db";
import { DEFAULT_ROLES, PERMISSIONS } from "./permissions";
import { hashPassword } from "./crypto";
import { email, password, timezone } from "./validation";
import { z } from "zod";
import { seedClientCatalogs } from "./clients";
import { seedEngagementCatalogs } from "./engagements";
// Internal provisioner. Public onboarding must validate input and enforce email activation in signup.ts.
export async function provisionFirm(input: {
  firmName: string;
  adminEmail: string;
  adminPassword: string;
  timezone: string;
  trial?: { firstName: string; lastName: string; invitationHash: string };
}) {
  const address = email.parse(input.adminEmail);
  password.parse(input.adminPassword);
  timezone.parse(input.timezone);
  z.string().min(1).max(100).parse(input.firmName);
  const passwordHash = await hashPassword(input.adminPassword);
  return db.$transaction(
    async (tx) => {
      for (const [key, label] of Object.entries(PERMISSIONS))
        await tx.permission.upsert({
          where: { key },
          create: { key, label },
          update: { label },
        });
      const firm = await tx.firm.create({
        data: {
          firmName: input.firmName,
          displayName: input.firmName,
          timezone: input.timezone,
          isTrial: !!input.trial,
        },
      });
      const roles = [];
      for (const role of DEFAULT_ROLES) {
        const result = await tx.role.create({
          data: {
            firmId: firm.id,
            roleName: role.name,
            description: role.description,
            isDefault: true,
          },
        });
        await tx.rolePermission.createMany({
          data: role.permissions.map((permissionKey) => ({
            firmId: firm.id,
            roleId: result.id,
            permissionKey,
          })),
        });
        roles.push(result);
      }
      const admin = await tx.user.create({
        data: {
          firmId: firm.id,
          firstName: input.trial?.firstName ?? "Firm",
          lastName: input.trial?.lastName ?? "Admin",
          email: address,
          passwordHash: input.trial ? null : passwordHash,
          roleId: roles[0].id,
          status: input.trial ? "Invited" : "Active",
        },
      });
      if (input.trial)
        await tx.invitation.create({
          data: {
            firmId: firm.id,
            userId: admin.id,
            tokenHash: input.trial.invitationHash,
            expiresAt: new Date(Date.now() + 48 * 3600_000),
          },
        });
      await seedClientCatalogs(tx, firm.id);
      await seedEngagementCatalogs(tx, firm.id);
      await tx.auditLog.create({
        data: {
          firmId: firm.id,
          actorUserId: null,
          action: "firm.provisioned",
          entityType: "Firm",
          entityId: firm.id,
          metadata: {
            source: input.trial
              ? "public-trial-signup"
              : "internal-provisioning",
          },
        },
      });
      return { firm, admin, roles };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

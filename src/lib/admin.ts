import { Prisma } from '@prisma/client';
import { db } from './db';
import { principal, requirePermission, tenantMutation, audit, type Database, type Principal } from './auth';
import { PERMISSIONS, type PermissionKey } from './permissions';
import { userInput, userEdit, officeInput, roleInput, firmInput, id } from './validation';
import { invariant } from './errors';
import { newToken, tokenHash } from './crypto';
import { sendLink } from './mail';

export const safeUser = { id: true, firstName: true, lastName: true, email: true, jobTitle: true, status: true, roleId: true, primaryOfficeId: true, managerId: true, weeklyCapacityHours: true, lastLoginAt: true, role: { select: { roleName: true } }, primaryOffice: { select: { officeName: true } } } satisfies Prisma.UserSelect;
export type Section = 'users' | 'offices' | 'roles' | 'firm';
export const sectionPermission: Record<Section, PermissionKey> = { users: 'users.manage', offices: 'offices.manage', roles: 'roles.manage', firm: 'firm.manage' };
export async function readAdmin(token: string | undefined, section: Section, recordId?: string) {
  const user = await principal(token);
  requirePermission(user, sectionPermission[section]);
  const where = { firmId: user.firmId, ...(recordId ? { id: id.parse(recordId) } : {}) };
  switch (section) {
    case 'users': return db.user.findMany({ where, select: safeUser, orderBy: [{ firstName: 'asc' }, { id: 'asc' }] });
    case 'offices': return db.office.findMany({ where, orderBy: { officeName: 'asc' } });
    case 'roles': return db.role.findMany({ where, include: { permissions: true }, orderBy: [{ isDefault: 'desc' }, { roleName: 'asc' }] });
    case 'firm': return db.firm.findUniqueOrThrow({ where: { id: user.firmId } });
  }
}
export async function userOptions(token: string | undefined) {
  const user = await principal(token);
  requirePermission(user, 'users.manage');
  const [roles, offices, managers] = await Promise.all([
    db.role.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true, roleName: true } }),
    db.office.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true, officeName: true } }),
    db.user.findMany({ where: { firmId: user.firmId, status: 'Active' }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  return { roles, offices, managers };
}
async function mutate<T>(token: string | undefined, permission: PermissionKey, work: (tx: Database, actor: Principal) => Promise<T>) {
  return tenantMutation(token, permission, work);
}
async function references(tx: Database, actor: Principal, data: { roleId: string; primaryOfficeId: string | null; managerId: string | null }, userId?: string) {
  const role = await tx.role.findFirst({ where: { firmId: actor.firmId, id: data.roleId, active: true }, include: { permissions: true } });
  invariant(role, 'Select an active role in your firm.');
  invariant(role.permissions.every(p => actor.role.permissions.some(a => a.permissionKey === p.permissionKey)), 'You cannot assign a role with permissions beyond your own.', 403);
  if (data.primaryOfficeId) invariant(await tx.office.findFirst({ where: { firmId: actor.firmId, id: data.primaryOfficeId, active: true } }), 'Select an active office in your firm.');
  if (data.managerId) {
    invariant(data.managerId !== userId, 'A user cannot manage themselves.');
    let cursor: string | null = data.managerId;
    const visited = new Set<string>();
    while (cursor) {
      invariant(cursor !== userId && !visited.has(cursor), 'This manager assignment would create a cycle.');
      visited.add(cursor);
      const manager: { managerId: string | null } | null = await tx.user.findFirst({ where: { firmId: actor.firmId, id: cursor, status: 'Active' }, select: { managerId: true } });
      invariant(manager, 'Select an active manager in your firm.');
      cursor = manager.managerId;
    }
  }
}
export async function inviteUser(token: string | undefined, input: unknown) {
  const data = userInput.parse(input);
  const raw = newToken();
  const result = await mutate(token, 'users.manage', async (tx, actor) => {
    await references(tx, actor, data);
    // Same response for an address already registered in any firm.
    invariant(!await tx.user.findUnique({ where: { email: data.email }, select: { id: true } }), 'This email address cannot be invited.');
    const user = await tx.user.create({ data: { ...data, firmId: actor.firmId } });
    await tx.invitation.create({ data: { firmId: actor.firmId, userId: user.id, tokenHash: tokenHash(raw), expiresAt: new Date(Date.now() + 48 * 3600_000) } });
    await audit(tx, actor.firmId, actor.id, 'user.invited', 'User', user.id, { roleId: data.roleId, primaryOfficeId: data.primaryOfficeId });
    return { id: user.id, firmName: actor.firm.displayName };
  });
  try { await sendLink(data.email, 'invite', raw, result.firmName); }
  catch { return { id: result.id, message: 'User created, but email delivery failed. Fix mail configuration and resend the invitation.' }; }
  return { id: result.id, message: 'Invitation sent. In local development, inspect .local/mail.' };
}
export async function resendInvitation(token: string | undefined, userId: string) {
  id.parse(userId);
  const raw = newToken();
  const result = await mutate(token, 'users.manage', async (tx, actor) => {
    const user = await tx.user.findFirst({ where: { firmId: actor.firmId, id: userId, status: 'Invited', role: { active: true } } });
    invariant(user, 'Invited user not found.', 404);
    await tx.invitation.updateMany({ where: { firmId: actor.firmId, userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.invitation.create({ data: { firmId: actor.firmId, userId, tokenHash: tokenHash(raw), expiresAt: new Date(Date.now() + 48 * 3600_000) } });
    await audit(tx, actor.firmId, actor.id, 'user.invitation_resent', 'User', userId);
    return { email: user.email, firmName: actor.firm.displayName };
  });
  try { await sendLink(result.email, 'invite', raw, result.firmName); }
  catch { return { message: 'Email delivery failed. Check configuration and resend.' }; }
  return { message: 'Invitation resent.' };
}
export async function editUser(token: string | undefined, userId: string, input: unknown) {
  id.parse(userId);
  const data = userEdit.parse(input);
  return mutate(token, 'users.manage', async (tx, actor) => {
    const before = await tx.user.findFirst({ where: { firmId: actor.firmId, id: userId } });
    invariant(before, 'User not found.', 404);
    const priorRole = await tx.role.findUniqueOrThrow({ where: { id: before.roleId }, include: { permissions: true } });
    invariant(priorRole.permissions.every(p => actor.role.permissions.some(a => a.permissionKey === p.permissionKey)), 'You cannot edit a user with permissions beyond your own.', 403);
    invariant(data.status !== 'Invited' || !before.passwordHash, 'An activated user cannot return to invited status.');
    invariant(data.status !== 'Active' || before.passwordHash, 'This user must accept an invitation first.');
    await references(tx, actor, data, userId);
    invariant(actor.id !== userId || (data.status === 'Active' && data.roleId === before.roleId), 'You cannot deactivate yourself or change your own role.');
    // A fixed default administrator role is protected against lockout. Authorization still uses permissions.
    const administrativeRole = await tx.role.findFirstOrThrow({ where: { firmId: actor.firmId, isDefault: true, permissions: { some: { permissionKey: 'firm.manage' } } } });
    if (before.roleId === administrativeRole.id && before.status === 'Active' && (data.roleId !== before.roleId || data.status !== 'Active')) {
      const count = await tx.user.count({ where: { firmId: actor.firmId, roleId: administrativeRole.id, status: 'Active' } });
      invariant(count > 1, 'Keep at least one active Firm Admin.');
    }
    await tx.user.update({ where: { firmId_id: { firmId: actor.firmId, id: userId } }, data });
    if (data.status !== 'Active' || data.roleId !== before.roleId) await tx.session.deleteMany({ where: { firmId: actor.firmId, userId } });
    if (data.status === 'Inactive') {
      await tx.invitation.updateMany({ where: { firmId: actor.firmId, userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordReset.updateMany({ where: { firmId: actor.firmId, userId, usedAt: null }, data: { usedAt: new Date() } });
    }
    const previous = Object.fromEntries(Object.keys(data).map(key => [key, before[key as keyof typeof data]]));
    await audit(tx, actor.firmId, actor.id, 'user.updated', 'User', userId, { before: previous, after: data });
    return { message: 'User updated.' };
  });
}
export async function saveOffice(token: string | undefined, recordId: string | undefined, input: unknown) {
  const data = officeInput.parse(input);
  if (recordId) id.parse(recordId);
  return mutate(token, 'offices.manage', async (tx, actor) => {
    const before = recordId ? await tx.office.findFirst({ where: { firmId: actor.firmId, id: recordId } }) : null;
    invariant(!recordId || before, 'Office not found.', 404);
    const result = recordId ? await tx.office.update({ where: { firmId_id: { firmId: actor.firmId, id: recordId } }, data }) : await tx.office.create({ data: { ...data, firmId: actor.firmId } });
    await audit(tx, actor.firmId, actor.id, recordId ? 'office.updated' : 'office.created', 'Office', result.id, { before: before ? JSON.parse(JSON.stringify(before)) : null, after: data });
    return { message: 'Office saved.' };
  });
}
export async function saveRole(token: string | undefined, recordId: string | undefined, input: unknown) {
  const data = roleInput.parse(input);
  invariant(data.permissions.every(p => Object.hasOwn(PERMISSIONS, p)), 'Unknown permission.');
  if (recordId) id.parse(recordId);
  return mutate(token, 'roles.manage', async (tx, actor) => {
    const before = recordId ? await tx.role.findFirst({ where: { firmId: actor.firmId, id: recordId }, include: { permissions: true } }) : null;
    invariant(!recordId || before, 'Role not found.', 404);
    invariant(!before?.isDefault, 'Default roles cannot be changed. Create a custom role.');
    // Role managers cannot grant permissions they do not possess or edit more privileged roles.
    const permitted = new Set(actor.role.permissions.map(p => p.permissionKey));
    invariant(data.permissions.every(p => permitted.has(p)) && (!before || before.permissions.every(p => permitted.has(p.permissionKey))), 'You cannot grant or alter permissions beyond your own.', 403);
    invariant(recordId !== actor.roleId, 'You cannot edit your own role.');
    if (!data.active && recordId) invariant(await tx.user.count({ where: { firmId: actor.firmId, roleId: recordId, status: { in: ['Active', 'Invited'] } } }) === 0, 'Reassign active and invited users before deactivating this role.');
    const { permissions, ...fields } = data;
    const role = recordId ? await tx.role.update({ where: { firmId_id: { firmId: actor.firmId, id: recordId } }, data: fields }) : await tx.role.create({ data: { ...fields, firmId: actor.firmId } });
    await tx.rolePermission.deleteMany({ where: { firmId: actor.firmId, roleId: role.id } });
    await tx.rolePermission.createMany({ data: [...new Set(permissions)].map(permissionKey => ({ firmId: actor.firmId, roleId: role.id, permissionKey })) });
    await audit(tx, actor.firmId, actor.id, recordId ? 'role.updated' : 'role.created', 'Role', role.id, { before: before ? { roleName: before.roleName, active: before.active, permissions: before.permissions.map(p => p.permissionKey) } : null, after: data });
    return { message: 'Role saved.' };
  });
}
export async function saveFirm(token: string | undefined, input: unknown) {
  const data = firmInput.parse(input);
  return mutate(token, 'firm.manage', async (tx, actor) => {
    await tx.firm.update({ where: { id: actor.firmId }, data });
    await audit(tx, actor.firmId, actor.id, 'firm.updated', 'Firm', actor.firmId, { before: { displayName: actor.firm.displayName, timezone: actor.firm.timezone, defaultCurrency: actor.firm.defaultCurrency, standardWeeklyCapacityHours: actor.firm.standardWeeklyCapacityHours }, after: data });
    return { message: 'Firm settings saved.' };
  });
}

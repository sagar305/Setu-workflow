import { beforeAll, afterAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { provisionFirm } from '../src/lib/provision';
import { login, logout, principal, consumeToken, requestReset, invitationDetails, limited } from '../src/lib/auth';
import { inviteUser, editUser, readAdmin, saveOffice, saveRole, saveFirm } from '../src/lib/admin';
import { newToken, tokenHash, hashPassword } from '../src/lib/crypto';
const secret = 'Test-only-' + randomUUID();
let a: Awaited<ReturnType<typeof provisionFirm>>;
let b: Awaited<ReturnType<typeof provisionFirm>>;
let ta: string, tb: string, regular: string;
let officeA: string, officeB: string;
const suffix = randomUUID();
async function mint(userId: string, firmId: string) { const token = newToken(); await db.session.create({ data: { firmId, userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 3600_000) } }); return token; }
beforeAll(async () => {
  a = await provisionFirm({ firmName: `Test A ${suffix}`, adminEmail: `a-${suffix}@test.invalid`, adminPassword: secret, timezone: 'America/Chicago' });
  b = await provisionFirm({ firmName: `Test B ${suffix}`, adminEmail: `b-${suffix}@test.invalid`, adminPassword: secret, timezone: 'America/New_York' });
  ta = await mint(a.admin.id, a.firm.id); tb = await mint(b.admin.id, b.firm.id);
  const member = await db.user.create({ data: { firmId: a.firm.id, roleId: a.roles[4].id, firstName: 'Normal', lastName: 'Member', email: `member-${suffix}@test.invalid`, passwordHash: await hashPassword(secret), status: 'Active' } });
  regular = await mint(member.id, a.firm.id);
  officeA = (await db.office.create({ data: { firmId: a.firm.id, officeName: 'A office', city: 'Dallas', state: 'TX', country: 'US' } })).id;
  officeB = (await db.office.create({ data: { firmId: b.firm.id, officeName: 'B office', city: 'NYC', state: 'NY', country: 'US' } })).id;
});
afterAll(async () => { await db.$disconnect(); });
test('anonymous and invalid sessions cannot access admin reads or mutations', async () => {
  await expect(readAdmin(undefined, 'users')).rejects.toMatchObject({ status: 401 });
  await expect(saveFirm(undefined, { displayName: 'x', timezone: 'UTC', defaultCurrency: 'USD', standardWeeklyCapacityHours: 40 })).rejects.toMatchObject({ status: 401 });
  await expect(principal(newToken())).rejects.toMatchObject({ status: 401 });
});
test('ordinary users cannot access admin functions', async () => {
  for (const section of ['users','offices','roles','firm'] as const) await expect(readAdmin(regular, section)).rejects.toMatchObject({ status: 403 });
  await expect(saveOffice(regular, undefined, { officeName: 'No', city: 'No', state: '', country: 'US', timezone: null })).rejects.toMatchObject({ status: 403 });
});
test('case-insensitive email login, hashed session, and logout revocation', async () => {
  const token = await login({ email: a.admin.email.toUpperCase(), password: secret }, suffix);
  expect((await principal(token)).id).toBe(a.admin.id);
  expect(await db.session.findUnique({ where: { tokenHash: token } })).toBeNull();
  await logout(token);
  await expect(principal(token)).rejects.toMatchObject({ status: 401 });
});
test('inactive users cannot log in and their existing sessions are rejected', async () => {
  const user = await db.user.create({ data: { firmId: a.firm.id, roleId: a.roles[4].id, firstName: 'Inactive', lastName: 'User', email: `inactive-${suffix}@test.invalid`, passwordHash: await hashPassword(secret), status: 'Inactive' } });
  await expect(login({ email: user.email, password: secret }, suffix)).rejects.toThrow('Email or password is incorrect.');
  await expect(principal(await mint(user.id, a.firm.id))).rejects.toMatchObject({ status: 401 });
});
test('Firm A cannot retrieve Firm B users, offices or roles by guessed IDs', async () => {
  expect(await readAdmin(ta, 'users', b.admin.id)).toEqual([]);
  expect(await readAdmin(ta, 'offices', officeB)).toEqual([]);
  expect(await readAdmin(ta, 'roles', b.roles[0].id)).toEqual([]);
  const users = await readAdmin(ta, 'users');
  expect(JSON.stringify(users)).not.toContain(b.admin.email);
  expect(JSON.stringify(users)).not.toContain('passwordHash');
  expect(JSON.stringify(users)).not.toContain('tokenHash');
});
function edited(roleId: string, primaryOfficeId: string | null = officeA, managerId: string | null = null) { return { firstName: 'Changed', lastName: 'User', roleId, primaryOfficeId, managerId, weeklyCapacityHours: 35, jobTitle: 'Staff', status: 'Active' }; }
test('Firm A administrator cannot modify Firm B user, office or role', async () => {
  await expect(editUser(ta, b.admin.id, edited(a.roles[0].id))).rejects.toMatchObject({ status: 404 });
  await expect(saveOffice(ta, officeB, { officeName: 'Stolen', city: 'X', state: '', country: 'US', timezone: null, active: true })).rejects.toMatchObject({ status: 404 });
  await expect(saveRole(ta, b.roles[0].id, { roleName: 'Stolen', description: '', permissions: [], active: true })).rejects.toMatchObject({ status: 404 });
  expect((await db.user.findUniqueOrThrow({ where: { id: b.admin.id } })).firstName).toBe('Firm');
});
test('cross-firm role, office, and manager assignments are rejected', async () => {
  const common = { firstName: 'Invalid', lastName: 'Reference', email: `cross-${suffix}@test.invalid`, roleId: a.roles[4].id, primaryOfficeId: officeA, managerId: null, weeklyCapacityHours: 40 };
  await expect(inviteUser(ta, { ...common, roleId: b.roles[4].id })).rejects.toThrow('active role');
  await expect(inviteUser(ta, { ...common, primaryOfficeId: officeB })).rejects.toThrow('active office');
  await expect(inviteUser(ta, { ...common, managerId: b.admin.id })).rejects.toThrow('active manager');
});
test('database foreign keys also reject cross-firm references', async () => {
  await expect(db.user.update({ where: { id: a.admin.id }, data: { primaryOfficeId: officeB } })).rejects.toMatchObject({ code: 'P2003' });
  await expect(db.user.update({ where: { id: a.admin.id }, data: { roleId: b.roles[0].id } })).rejects.toMatchObject({ code: 'P2003' });
  await expect(db.user.update({ where: { id: a.admin.id }, data: { managerId: b.admin.id } })).rejects.toMatchObject({ code: 'P2003' });
});
test('custom roles stay tenant-specific; default roles are immutable', async () => {
  await saveRole(ta, undefined, { roleName: 'Tax Supervisor', description: 'Custom', permissions: ['visibility.team'], active: true });
  const role = await db.role.findFirstOrThrow({ where: { firmId: a.firm.id, roleName: 'Tax Supervisor' } });
  expect(await readAdmin(tb, 'roles', role.id)).toEqual([]);
  await saveRole(ta, role.id, { roleName: 'Tax Supervisor', description: '', permissions: ['visibility.assigned'], active: false });
  expect((await db.role.findUniqueOrThrow({ where: { id: role.id } })).active).toBe(false);
  await expect(saveRole(ta, a.roles[0].id, { roleName: 'Admin', description: '', permissions: [], active: true })).rejects.toThrow('Default roles');
});
test('limited user administrators cannot grant a more privileged role', async () => {
  await saveRole(ta, undefined, { roleName: 'Limited administrator', description: '', permissions: ['users.manage'], active: true });
  const role = await db.role.findFirstOrThrow({ where: { firmId: a.firm.id, roleName: 'Limited administrator' } });
  const user = await db.user.create({ data: { firmId: a.firm.id, roleId: role.id, firstName: 'Limited', lastName: 'Admin', email: `limited-${suffix}@test.invalid`, status: 'Active', passwordHash: await hashPassword(secret) } });
  const token = await mint(user.id, a.firm.id);
  await expect(inviteUser(token, { ...edited(a.roles[0].id), email: `escalate-${suffix}@test.invalid` })).rejects.toMatchObject({ status: 403 });
  await expect(editUser(token, a.admin.id, edited(role.id))).rejects.toMatchObject({ status: 403 });
});
test('invitation is hashed, expires, activates once and cannot be reused', async () => {
  const result = await inviteUser(ta, { firstName: 'Invite', lastName: 'Test', email: `invite-${suffix}@test.invalid`, roleId: a.roles[4].id, primaryOfficeId: officeA, managerId: a.admin.id, weeklyCapacityHours: 40 });
  const expired = newToken();
  await db.invitation.create({ data: { firmId: a.firm.id, userId: result.id, tokenHash: tokenHash(expired), expiresAt: new Date(Date.now() - 1000) } });
  await expect(consumeToken('invite', { token: expired, password: secret, confirmPassword: secret })).rejects.toThrow('invalid or expired');
  const valid = newToken();
  await db.invitation.create({ data: { firmId: a.firm.id, userId: result.id, tokenHash: tokenHash(valid), expiresAt: new Date(Date.now() + 60000) } });
  expect((await invitationDetails(valid)).firmName).toBe(a.firm.displayName);
  const outcomes = await Promise.allSettled([consumeToken('invite', { token: valid, password: secret, confirmPassword: secret }), consumeToken('invite', { token: valid, password: secret, confirmPassword: secret })]);
  expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((await db.user.findUniqueOrThrow({ where: { id: result.id } })).status).toBe('Active');
  await expect(invitationDetails(valid)).rejects.toThrow('invalid or expired');
});
test('password reset expires, is single-use, and revokes existing sessions', async () => {
  await requestReset(a.admin.email, suffix);
  const expired = newToken();
  await db.passwordReset.create({ data: { firmId: a.firm.id, userId: a.admin.id, tokenHash: tokenHash(expired), expiresAt: new Date(Date.now() - 1000) } });
  await expect(consumeToken('reset', { token: expired, password: secret, confirmPassword: secret })).rejects.toThrow('invalid or expired');
  const valid = newToken();
  await db.passwordReset.create({ data: { firmId: a.firm.id, userId: a.admin.id, tokenHash: tokenHash(valid), expiresAt: new Date(Date.now() + 60000) } });
  await consumeToken('reset', { token: valid, password: secret, confirmPassword: secret });
  await expect(consumeToken('reset', { token: valid, password: secret, confirmPassword: secret })).rejects.toThrow('invalid or expired');
  await expect(principal(ta)).rejects.toMatchObject({ status: 401 });
  ta = await mint(a.admin.id, a.firm.id);
});
test('unknown and known password reset emails return the same result', async () => {
  expect(await requestReset(`unknown-${suffix}@test.invalid`, suffix)).toBeUndefined();
  expect(await requestReset(a.admin.email, suffix)).toBeUndefined();
});
test('firm suspension and expired sessions immediately block access', async () => {
  await db.firm.update({ where: { id: b.firm.id }, data: { status: 'Suspended' } });
  await expect(principal(tb)).rejects.toMatchObject({ status: 401 });
  await expect(login({ email: b.admin.email, password: secret }, suffix)).rejects.toThrow('Email or password');
  await db.firm.update({ where: { id: b.firm.id }, data: { status: 'Active' } });
  const token = await mint(b.admin.id, b.firm.id);
  await db.session.update({ where: { tokenHash: tokenHash(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expect(principal(token)).rejects.toMatchObject({ status: 401 });
});
test('admin edits create audit records without secret values', async () => {
  await saveFirm(ta, { displayName: 'Updated Firm A', timezone: 'UTC', defaultCurrency: 'USD', standardWeeklyCapacityHours: 37.5 });
  const logs = await db.auditLog.findMany({ where: { firmId: a.firm.id } });
  for (const action of ['firm.provisioned', 'user.invited', 'user.activated', 'role.created', 'auth.password_reset', 'firm.updated']) expect(logs.some(l => l.action === action)).toBe(true);
  expect(JSON.stringify(logs)).not.toContain(secret);
  expect(JSON.stringify(logs)).not.toContain('passwordHash');
});
test('rate limit is shared in PostgreSQL and cannot be bypassed by concurrent calls', async () => {
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => limited('test', suffix, 5)));
  expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(5);
});

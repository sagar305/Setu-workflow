import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { db } from '../src/lib/db';
import { provisionFirm } from '../src/lib/provision';
// Creates a real firm and its first Firm Admin. Safe for production; prints a one-time password.
// Usage: pnpm firm:provision --firm "Acme CPA" --email admin@acme.com --timezone America/Chicago
const { values } = parseArgs({ options: { firm: { type: 'string' }, email: { type: 'string' }, timezone: { type: 'string' } } });
if (!values.firm || !values.email || !values.timezone) {
  console.error('Usage: pnpm firm:provision --firm "Firm name" --email admin@example.com --timezone America/Chicago');
  process.exit(1);
}
async function main() {
  const adminEmail = values.email!.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email: adminEmail } })) throw new Error(`A user with ${adminEmail} already exists.`);
  const adminPassword = randomBytes(18).toString('base64url');
  const { firm, admin } = await provisionFirm({ firmName: values.firm!.trim(), adminEmail, adminPassword, timezone: values.timezone! });
  console.log(`Provisioned ${firm.firmName} (${firm.id}).`);
  console.log(`Admin: ${admin.email}`);
  console.log(`Temporary password (shown once): ${adminPassword}`);
  console.log('Sign in, then use "Forgot password" to set a password only you know.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());

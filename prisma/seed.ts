import { seedDemoAllocations } from "./seed-allocations";
import 'dotenv/config';
import { db } from '../src/lib/db';
import { provisionFirm } from '../src/lib/provision';
import { hashPassword } from '../src/lib/crypto';
import { seedDemoClients } from './seed-clients';
import { seedDemoEngagements } from './seed-engagements';
import { seedDemoWorkflows } from './seed-workflows';
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  const secret = process.env.SEED_PASSWORD;
  if (!secret || secret.length < 12) throw new Error('Set a development-only SEED_PASSWORD of at least 12 characters.');
  const hash = await hashPassword(secret);
  for (const [index, name] of ['Demo CPA Firm', 'Sample Accounting LLP'].entries()) {
    const domain = index === 0 ? 'demo.setu.test' : 'sample.setu.test';
    if (await db.user.findUnique({ where: { email: `admin@${domain}` } })) { console.log(`${name} already seeded; skipped.`); continue; }
    const { firm, admin, roles } = await provisionFirm({ firmName: name, adminEmail: `admin@${domain}`, adminPassword: secret, timezone: index === 0 ? 'America/Chicago' : 'America/New_York' });
    const officeNames = index === 0 ? ['Dallas', 'Houston'] : ['New York', 'Boston'];
    const offices = [];
    for (const [i, city] of officeNames.entries()) offices.push(await db.office.create({ data: { firmId: firm.id, officeName: `${city} Office`, city, state: index === 0 ? 'TX' : i === 0 ? 'NY' : 'MA', country: 'United States', timezone: firm.timezone } }));
    await db.user.update({ where: { id: admin.id }, data: { firstName: index === 0 ? 'Alex' : 'Jordan', lastName: index === 0 ? 'Morgan' : 'Lee', primaryOfficeId: offices[0].id, jobTitle: 'Firm Administrator' } });
    let managerId = admin.id;
    for (const [i, alias] of ['partner', 'manager', 'senior', 'associate'].entries()) {
      const user = await db.user.create({ data: { firmId: firm.id, roleId: roles[i + 1].id, firstName: ['Priya', 'Daniel', 'Maya', 'James'][i], lastName: ['Shah', 'Brooks', 'Chen', 'Wilson'][i], email: `${alias}@${domain}`, passwordHash: hash, status: 'Active', managerId, primaryOfficeId: offices[i % 2].id, jobTitle: roles[i + 1].roleName } });
      if (alias === 'manager') managerId = user.id;
    }
    console.log(`Seeded ${name}: five users, two offices, five default roles.`);
  }
  await seedDemoClients();
  await seedDemoEngagements();
  await seedDemoWorkflows();
  await seedDemoAllocations();
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

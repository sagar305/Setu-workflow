import { seedDemoCapacity } from "./seed-capacity";
import { seedDemoAllocations } from "./seed-allocations";
import { seedDemoChecklists } from "./seed-checklists";
import { seedDemoPoints } from "./seed-points";
import { db } from "../src/lib/db";
import { provisionFirm } from "../src/lib/provision";
import { hashPassword } from "../src/lib/crypto";
import { seedDemoClients } from "./seed-clients";
import { seedDemoEngagements } from "./seed-engagements";
import { seedDemoWorkflows } from "./seed-workflows";
import { DEMO_FIRMS, DEMO_ROLES } from "../src/lib/demo";

/**
 * Two demo firms, five users each, and sample clients, engagements, workflows,
 * allocations, checklists, points and capacity. Every account uses `secret`.
 * Callers guard where this may run: `prisma/seed.ts` (local databases only)
 * and `src/lib/demo-reset.ts` (a dedicated demo deployment).
 */
export async function seedDemoData(secret: string) {
  if (secret.length < 12) throw new Error("The demo password must be at least 12 characters.");
  const hash = await hashPassword(secret);
  for (const [index, { name, domain }] of DEMO_FIRMS.entries()) {
    if (await db.user.findUnique({ where: { email: `admin@${domain}` } })) { console.log(`${name} already seeded; skipped.`); continue; }
    const { firm, admin, roles } = await provisionFirm({ firmName: name, adminEmail: `admin@${domain}`, adminPassword: secret, timezone: index === 0 ? 'America/Chicago' : 'America/New_York' });
    const officeNames = index === 0 ? ['Dallas', 'Houston'] : ['New York', 'Boston'];
    const offices = [];
    for (const [i, city] of officeNames.entries()) offices.push(await db.office.create({ data: { firmId: firm.id, officeName: `${city} Office`, city, state: index === 0 ? 'TX' : i === 0 ? 'NY' : 'MA', country: 'United States', timezone: firm.timezone } }));
    await db.user.update({ where: { id: admin.id }, data: { firstName: index === 0 ? 'Alex' : 'Jordan', lastName: index === 0 ? 'Morgan' : 'Lee', primaryOfficeId: offices[0].id, jobTitle: 'Firm Administrator' } });
    let managerId = admin.id;
    for (const [i, alias] of DEMO_ROLES.slice(1).entries()) {
      const user = await db.user.create({ data: { firmId: firm.id, roleId: roles[i + 1].id, firstName: ['Priya', 'Daniel', 'Maya', 'James'][i], lastName: ['Shah', 'Brooks', 'Chen', 'Wilson'][i], email: `${alias}@${domain}`, passwordHash: hash, status: 'Active', managerId, primaryOfficeId: offices[i % 2].id, jobTitle: roles[i + 1].roleName } });
      if (alias === 'manager') managerId = user.id;
    }
    console.log(`Seeded ${name}: five users, two offices, five default roles.`);
  }
  await seedDemoClients();
  await seedDemoEngagements();
  await seedDemoWorkflows();
  await seedDemoAllocations();
  await seedDemoChecklists();
  await seedDemoPoints();
  await seedDemoCapacity();
}

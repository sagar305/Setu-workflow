import 'dotenv/config';
import { db } from '../src/lib/db';
import { resetDemo } from '../src/lib/demo-reset';
// Manual demo reset against DATABASE_URL (normally the scheduled job calls /api/cron/demo-reset).
// Needs DEMO_MODE=true and DEMO_PASSWORD, and refuses any database not marked as a demo.
resetDemo()
  .then(result => console.log(result))
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => db.$disconnect());

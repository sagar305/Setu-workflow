import 'dotenv/config';
import { assertLocalSeeding } from './seed-guard';
import { db } from '../src/lib/db';
import { seedDemoData } from './seed-demo';
async function main() {
  assertLocalSeeding();
  const secret = process.env.SEED_PASSWORD;
  if (!secret || secret.length < 12) throw new Error('Set a development-only SEED_PASSWORD of at least 12 characters.');
  await seedDemoData(secret);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
// Runs before `next build` on Vercel. Preview deployments share the production database unless
// Neon preview branching is enabled, so unmerged migrations must never be applied from them.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' && process.env.MIGRATE_PREVIEWS !== 'true') {
  console.log(`Skipping migrations for ${process.env.VERCEL_ENV} deployment.`);
  process.exit(0);
}
// Migrations take advisory locks, which need a direct (unpooled) connection.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  // Names only, never values: shows whether the database integration used a prefix or another environment.
  const found = Object.keys(process.env).filter(key => /DATABASE|POSTGRES|^PG/.test(key)).sort();
  console.error(`DATABASE_URL is not set for this ${process.env.VERCEL_ENV ?? 'local'} build. Database-related variables present: ${found.join(', ') || 'none'}.`);
  console.error('In Vercel, connect the Neon database to this environment (Storage → database → Projects) with no custom prefix, then redeploy.');
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: url };
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'inherit', env });
if (result.status !== 0) process.exit(result.status ?? 1);
// Optional demo data for trial deployments; the seed skips firms and records that already exist.
if (process.env.SEED_DEMO_DATA === 'true') {
  const seed = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], { stdio: 'inherit', env });
  process.exit(seed.status ?? 1);
}

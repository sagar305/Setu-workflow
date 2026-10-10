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
if (!url) throw new Error('Set DATABASE_URL_UNPOOLED or DATABASE_URL before running migrations.');
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
process.exit(result.status ?? 1);

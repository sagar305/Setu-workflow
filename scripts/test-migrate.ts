import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
if (!process.env.TEST_DATABASE_URL) url.pathname = '/setu_test';
if (!url.pathname.endsWith('_test')) throw new Error('Test database name must end in _test.');
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url.toString() } });
process.exit(result.status ?? 1);

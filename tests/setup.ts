import { config } from 'dotenv';
config({ quiet: true });
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
if (!process.env.TEST_DATABASE_URL) url.pathname = '/setu_test';
if (!url.pathname.endsWith('_test')) throw new Error('Tests require a dedicated database ending in _test.');
process.env.DATABASE_URL = url.toString();
process.env.DEV_MAIL = 'true';

import { defineConfig } from '@playwright/test';
import 'dotenv/config';
export default defineConfig({ testDir: './e2e', workers: 1, timeout: 60000, use: { baseURL: process.env.APP_URL ?? 'http://127.0.0.1:3000', channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' } });

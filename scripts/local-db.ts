import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Local database is development-only.');
  await mkdir('.local', { recursive: true });
  if (!existsSync('.env')) {
    const secret = randomBytes(24).toString('hex');
    const seed = randomBytes(18).toString('base64url');
    await writeFile('.env', `DATABASE_URL=postgresql://setu:${secret}@127.0.0.1:55432/setu?schema=public\nAPP_URL=http://127.0.0.1:3000\nSEED_PASSWORD=${seed}\nDEV_MAIL=true\n`, { mode: 0o600 });
    process.env.DATABASE_URL = `postgresql://setu:${secret}@127.0.0.1:55432/setu?schema=public`;
    console.log('Generated local configuration in .env. Development login password is SEED_PASSWORD in that file.');
  }
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/setu') throw new Error('Local runner requires 127.0.0.1 and database setu.');
  const pg = new EmbeddedPostgres({ databaseDir: '.local/postgres', user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), port: Number(url.port), persistent: true, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8','--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: (message) => console.error(message) });
  if (!existsSync('.local/postgres/PG_VERSION')) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const databases = await client.query('SELECT datname FROM pg_database');
  for (const name of ['setu', 'setu_test']) if (!databases.rows.some((row: { datname: string }) => row.datname === name)) await client.query(`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
  await client.end();
  console.log('PostgreSQL ready on 127.0.0.1:' + url.port + ' (setu and setu_test). Keep this terminal running.');
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 60_000);
}
main().catch(error => { console.error(error); process.exit(1); });

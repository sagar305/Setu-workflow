/** One-time, local-only repair for clusters initialized using a Windows code page.
 * Keeps an untouched renamed source database and a private JSON backup. No DROP is used.
 * Stop the application before running. */
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const order = [
  "firms",
  "permissions",
  "offices",
  "roles",
  "role_permissions",
  "users",
  "sessions",
  "invitations",
  "password_resets",
  "audit_logs",
  "rate_limits",
  "entity_types",
  "service_lines",
  "clients",
  "client_addresses",
  "client_contacts",
  "client_service_lines",
  "client_custom_field_definitions",
  "client_custom_field_values",
  "client_import_jobs",
  "engagement_types",
  "engagements",
  "engagement_assignment_history",
  "engagement_status_history",
  "engagement_custom_field_definitions",
  "engagement_custom_field_values",
  "engagement_import_jobs",
];
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    process.env.NODE_ENV === "production" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/setu"
  )
    throw new Error("Only the local setu databases may be repaired.");
  const pg = new EmbeddedPostgres({
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: Number(url.port),
    persistent: true,
  });
  const control = pg.getPgClient("postgres", "127.0.0.1");
  await control.connect();
  await mkdir(".local/backups", { recursive: true });
  try {
    for (const name of ["setu", "setu_test"]) {
      const source = pg.getPgClient(name, "127.0.0.1");
      await source.connect();
      const encoding = (await source.query("SHOW server_encoding")).rows[0]
        .server_encoding;
      if (encoding === "UTF8") {
        await source.end();
        console.log(`${name}: already UTF8.`);
        continue;
      }
      const tables = (
        await source.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'",
        )
      ).rows.map((r: { tablename: string }) => r.tablename);
      if (tables.some((t: string) => !order.includes(t)))
        throw new Error("Unknown tables found; manual migration required.");
      const snapshot: Record<string, Record<string, unknown>[]> = {};
      await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      for (const table of order.filter((t) => tables.includes(t)))
        snapshot[table] = (
          await source.query(`SELECT row_to_json(t) AS row FROM "${table}" t`)
        ).rows.map((r: { row: Record<string, unknown> }) => r.row);
      await source.query("COMMIT");
      await source.end();
      const stamp = Date.now();
      const target = `${name}_utf8_${stamp}`,
        backup = `${name}_backup_${stamp}`;
      await writeFile(
        `.local/backups/${backup}.json`,
        JSON.stringify(snapshot),
        { mode: 0o600 },
      );
      await control.query(
        `CREATE DATABASE "${target}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
      );
      const targetUrl = new URL(url);
      targetUrl.pathname = `/${target}`;
      const migrated = spawnSync(
        process.execPath,
        ["node_modules/prisma/build/index.js", "migrate", "deploy"],
        {
          stdio: "inherit",
          env: { ...process.env, DATABASE_URL: targetUrl.toString() },
        },
      );
      if (migrated.status !== 0)
        throw new Error("Target migration failed; source is untouched.");
      const destination = pg.getPgClient(target, "127.0.0.1");
      await destination.connect();
      await destination.query("BEGIN");
      try {
        for (const table of order) {
          const records = snapshot[table] ?? [];
          for (let i = 0; i < records.length; i += 500) {
            const batch = records
              .slice(i, i + 500)
              .map((r) => (table === "users" ? { ...r, manager_id: null } : r));
            await destination.query(
              `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}",$1::json) ON CONFLICT DO NOTHING`,
              [JSON.stringify(batch)],
            );
          }
        }
        for (const user of snapshot.users ?? [])
          if (user.manager_id)
            await destination.query(
              "UPDATE users SET manager_id=$1 WHERE id=$2",
              [user.manager_id, user.id],
            );
        for (const table of order) {
          const count = Number(
            (
              await destination.query(
                `SELECT COUNT(*) AS count FROM "${table}"`,
              )
            ).rows[0].count,
          );
          if (count !== (snapshot[table]?.length ?? 0))
            throw new Error(
              `Row count mismatch for ${table}. Source is untouched.`,
            );
        }
        await destination.query("COMMIT");
      } catch (error) {
        await destination.query("ROLLBACK");
        throw error;
      } finally {
        await destination.end();
      }
      // Only these two local databases are touched, after complete restoration and count checks.
      await control.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [name],
      );
      await control.query(`ALTER DATABASE "${name}" RENAME TO "${backup}"`);
      try {
        await control.query(`ALTER DATABASE "${target}" RENAME TO "${name}"`);
      } catch (error) {
        await control.query(`ALTER DATABASE "${backup}" RENAME TO "${name}"`);
        throw error;
      }
      console.log(
        `${name}: converted to UTF8. Original retained as ${backup}; JSON backup saved privately.`,
      );
    }
  } finally {
    await control.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Conversion failed");
  process.exitCode = 1;
});

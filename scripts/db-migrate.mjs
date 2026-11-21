import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
if (!process.env.DATABASE_URL) {
  console.error(
    "Set DATABASE_URL to a database-owner connection, or apply the numbered SQL migrations in Supabase SQL editor.",
  );
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  await client.query(
    "select pg_advisory_lock(hashtext('exclunich_migrations'))",
  );
  await client.query(
    `create table if not exists public.exclunich_schema_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now());alter table public.exclunich_schema_migrations enable row level security;revoke all on public.exclunich_schema_migrations from public;`,
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = await client.query(
      "select checksum from public.exclunich_schema_migrations where name=$1",
      [name],
    );
    if (prior.rows.length) {
      if (prior.rows[0].checksum !== checksum)
        throw new Error(
          `Applied migration ${name} changed. Restore its original contents.`,
        );
      continue;
    }
    const baseline =
      name === "202611200001_absentia.sql" &&
      (await client.query("select to_regclass('public.students') as installed"))
        .rows[0].installed;
    await client.query("begin");
    try {
      if (!baseline)
        await client.query(
          sql.replace(/^\s*begin;\s*$/im, "").replace(/^\s*commit;\s*$/im, ""),
        );
      await client.query(
        "insert into public.exclunich_schema_migrations(name,checksum) values($1,$2)",
        [name, checksum],
      );
      await client.query("commit");
      console.log(
        `${baseline ? "Recorded existing foundation" : "Applied"}: ${name}`,
      );
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log(
    "Exclunich database is up to date. Existing student data is preserved.",
  );
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Applied migration")
      ? error.message
      : "Migration failed. Check owner privileges and database connectivity. Credentials are not logged.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}

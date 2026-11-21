import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required. Use an isolated, migrated test database.",
  );
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});
try {
  await client.connect();
  await client.query(
    await readFile(new URL("./db-security-test.sql", import.meta.url), "utf8"),
  );
  await client.query(
    await readFile(new URL("./db-sharing-test.sql", import.meta.url), "utf8"),
  );
  await client.query(
    await readFile(new URL("./db-term-test.sql", import.meta.url), "utf8"),
  );
  console.log(
    "PASS: database authentication, tenant isolation, attendance, recovery, rate limiting and RLS. Fixtures rolled back.",
  );
} catch (error) {
  console.error(
    "Database security tests failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}

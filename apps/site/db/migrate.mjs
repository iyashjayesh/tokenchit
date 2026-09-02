#!/usr/bin/env node
/**
 * Apply every migration that has not run yet, in filename order.
 *
 * Hand-rolled rather than a framework: there are three tables, and a migration tool would be
 * a larger dependency to audit than the thing it manages. Each file runs inside a
 * transaction alongside the bookkeeping insert, so a failure leaves nothing half-applied.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

const connectionString =
  process.env.DATABASE_URL ?? "postgres://tokencard:tokencard@localhost:5432/tokencard";

const client = new pg.Client({ connectionString });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const { rows } = await client.query("SELECT name FROM _migrations");
const applied = new Set(rows.map((r) => r.name));

const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
let ran = 0;

for (const name of files) {
  if (applied.has(name)) continue;

  const sql = await readFile(join(DIR, name), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
    console.log(`applied ${name}`);
    ran += 1;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`failed  ${name}`);
    throw err;
  }
}

console.log(ran === 0 ? "already up to date" : `${ran} migration(s) applied`);
await client.end();

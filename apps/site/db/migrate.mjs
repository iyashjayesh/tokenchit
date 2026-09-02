#!/usr/bin/env node
/**
 * Apply every migration that has not run yet, in filename order.
 *
 * Hand-rolled rather than a framework: there are three tables, and a migration tool would be
 * a larger dependency to audit than the thing it manages. Each file runs inside a
 * transaction alongside the bookkeeping insert, so a failure leaves nothing half-applied.
 */
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Load .env.local the way Next does, so `npm run db:migrate` and the running site read the
 * same connection string. Done here rather than with `--env-file` because that flag errors
 * when the file is absent, and a fresh clone has no .env.local until someone writes one.
 */
function loadEnvLocal() {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    // Existing environment wins, so CI and one-off overrides are not clobbered.
    if (process.env[key] === undefined) {
      process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy apps/site/.env.example to .env.local and fill it in.");
  process.exit(1);
}

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

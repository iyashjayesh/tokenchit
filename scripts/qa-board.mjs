#!/usr/bin/env node
/**
 * QA for the two board behaviours that cannot be exercised with real data.
 *
 *   node scripts/qa-board.mjs            # run both checks, then clean up
 *   node scripts/qa-board.mjs --keep     # leave the rows behind to inspect by hand
 *
 * Why a script rather than clicking around: the review threshold sits above any day a real
 * corpus produces, and verified-first ordering needs a second competitor on a board that
 * currently has one row. Both need data that has to be made up on purpose.
 *
 * It talks to a local dev server over HTTP — the same path the CLI takes — so what it proves
 * is that the real route flags and orders correctly, not that a function returns the right
 * value in isolation. Cleanup goes straight to Postgres, because there is deliberately no
 * delete endpoint.
 *
 * Everything it creates is under handles prefixed `qa-`, and it removes them at the end.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.QA_API ?? "http://localhost:3000";
const KEEP = process.argv.includes("--keep");

const REVIEW_TOKENS_PER_DAY = 1_000_000_000;

let pass = 0;
let fail = 0;

const ok = (msg) => {
  pass++;
  console.log(`  \u001b[32m✓\u001b[0m ${msg}`);
};
const bad = (msg, detail) => {
  fail++;
  console.log(`  \u001b[31m✗\u001b[0m ${msg}`);
  if (detail !== undefined) console.log(`      ${String(detail).slice(0, 300)}`);
};

/** Next.js only loads .env.local for itself; this script has to read it the same way. */
async function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await readFile(join(ROOT, "apps/site", file), "utf8");
      const line = text.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
      if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch {
      /* next candidate */
    }
  }
  return null;
}

/**
 * A submission that passes every hard limit.
 *
 * `perDay` is the knob: below the review threshold it should publish and rank, above it the
 * row should be stored and withheld. Cost is derived from tokens at a rate inside the
 * plausibility band, because a made-up cost is exactly what the ratio check exists to catch.
 */
function payload(handle, { days, perDay }) {
  const RATE = 6.7e-7; // USD per token — mid-band, nowhere near either bound
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    rows.push({
      day: d.toISOString().slice(0, 10),
      agent: "claude-code",
      tokens: perDay,
      equivCostUsd: Number((perDay * RATE).toFixed(4)),
    });
  }
  rows.reverse();

  const tokens = rows.reduce((a, r) => a + r.tokens, 0);
  // Summed from the rows rather than computed independently: the server checks that the
  // headline agrees with the series, and two separate calculations is how they drift.
  const cost = Number(rows.reduce((a, r) => a + r.equivCostUsd, 0).toFixed(2));

  return {
    handle,
    tokens,
    equivCostUsd: cost,
    pricedShare: 1,
    streakDays: days,
    activeDays: days,
    firstDay: rows[0].day,
    lastDay: rows[rows.length - 1].day,
    agents: [{ agent: "claude-code", tokens }],
    models: [{ model: "claude-opus-5", tokens, equivCostUsd: cost, priced: true }],
    days: rows,
    clientVersion: "qa",
  };
}

async function publish(body) {
  const res = await fetch(`${API}/api/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** GET /api/submissions returns { window, rows }. */
async function board(window = "all") {
  const res = await fetch(`${API}/api/submissions?window=${window}`);
  const body = await res.json().catch(() => null);
  return body?.rows ?? [];
}

async function main() {
  console.log(`\n  QA against ${API}\n`);

  try {
    await fetch(`${API}/api/submissions?window=all`);
  } catch {
    console.error(`  Cannot reach ${API}. Start it with: npm run dev\n`);
    process.exit(1);
  }

  // ── 1. a day over the threshold is kept, and withheld ────────────────────────────────
  console.log("  [1] a day above the review threshold");

  const overHandle = "qa-over-threshold";
  const over = await publish(payload(overHandle, { days: 2, perDay: REVIEW_TOKENS_PER_DAY + 1 }));

  if (over.status === 201) ok("accepted rather than rejected (201)");
  else bad(`expected 201, got ${over.status}`, JSON.stringify(over.body));

  if (typeof over.body?.review === "string" && over.body.review) {
    ok(`review reason returned: ${over.body.review}`);
  } else {
    bad("no review reason on the response — the row would be withheld silently", JSON.stringify(over.body));
  }

  const listedOver = (await board("all")).some((r) => r.handle === overHandle);
  if (!listedOver) ok("held row does not appear on the board");
  else bad("held row is on the board — the flag is not being applied");

  // ── 2. a big-but-plausible unverified row cannot outrank a verified one ───────────────
  console.log("\n  [2] verified outranks unverified");

  const richHandle = "qa-unverified-rich";
  // Every day stays under the review threshold, so this row is published normally. Its total
  // is far above any real row, which is the whole point: tokens alone would put it first.
  const rich = await publish(payload(richHandle, { days: 30, perDay: 900_000_000 }));
  if (rich.status === 201) ok(`published ${(rich.body?.tokens / 1e9).toFixed(1)}B tokens, unverified`);
  else bad(`expected 201, got ${rich.status}`, JSON.stringify(rich.body));

  if (!rich.body?.review) ok("not held for review — every day is under the threshold");
  else bad(`unexpectedly held: ${rich.body.review}`);

  const rows = await board("all");
  const richRow = rows.find((r) => r.handle === richHandle);
  const verified = rows.filter((r) => r.tier === "verified");

  if (!richRow) {
    bad("the unverified row is missing from the board entirely");
  } else if (verified.length === 0) {
    console.log(
      "      \u001b[33m!\u001b[0m no verified row on this board, so ordering proves nothing.",
    );
    console.log("        Run `tokenchit login && tokenchit publish` first, then re-run.");
  } else {
    const lastVerified = Math.max(...verified.map((r) => rows.indexOf(r)));
    const richIndex = rows.indexOf(richRow);
    if (richIndex > lastVerified) {
      ok(
        `ranked #${richIndex + 1}, below every verified row, despite the most tokens on the board`,
      );
    } else {
      bad(`ranked #${richIndex + 1}, above a verified row — ordering is still tokens-only`);
    }
  }

  // ── cleanup ──────────────────────────────────────────────────────────────────────────
  console.log("");
  if (KEEP) {
    console.log(`  --keep: leaving ${overHandle} and ${richHandle} in place.`);
    console.log("  Remove them later by re-running without --keep.\n");
  } else {
    const url = await databaseUrl();
    if (!url) {
      console.log("  \u001b[33m!\u001b[0m No DATABASE_URL found — nothing was deleted.");
      console.log("    Remove the test rows with:");
      console.log(`    DELETE FROM users WHERE handle LIKE 'qa-%';\n`);
    } else {
      const { default: pg } = await import("pg");
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      // user_days and submissions are FK'd to users; deleting the user takes the rest.
      const res = await client.query("DELETE FROM users WHERE handle LIKE 'qa-%' RETURNING handle");
      await client.end();
      console.log(`  cleaned up: ${res.rows.map((r) => r.handle).join(", ") || "nothing to remove"}`);
    }
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n  qa script failed:", err.message, "\n");
  process.exit(1);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { dayKey, densify } from "../lib/spark.ts";

test("a date key is built the same way from a string and from a Date", () => {
  // node-pg returns a `date` column as a JS Date at local midnight, not a string. The first
  // version assumed strings and did String(value).slice(0, 10), which turns a Date into
  // "Thu Sep 03" — a key matching nothing, so every day looked idle and every sparkline on
  // the board rendered empty.
  assert.equal(dayKey("2026-09-03"), "2026-09-03");
  assert.equal(dayKey("2026-09-03T00:00:00.000Z"), "2026-09-03");
  assert.equal(dayKey(new Date(2026, 8, 3)), "2026-09-03");
  assert.equal(dayKey(new Date(2026, 0, 7)), "2026-01-07", "single digits pad");
});

test("a Date from the driver lands on the right day of the series", () => {
  const today = new Date(2026, 8, 30);
  const spark = densify([new Date(2026, 8, 30), new Date(2026, 8, 28)], [500, 100], 30, today);

  assert.equal(spark.at(-1), 500, "today is the last bar");
  assert.equal(spark.at(-3), 100, "two days ago is two bars back");
  assert.equal(spark.at(-2), 0, "the day between them stays a gap");
  assert.equal(
    spark.reduce((a, b) => a + b, 0),
    600,
    "nothing is invented and nothing is lost",
  );
});

test("idle days are kept rather than collapsed", () => {
  // Without the zeros a fortnight off looks like the bars moving closer together, which
  // reads as steady work.
  const today = new Date(2026, 8, 30);
  const spark = densify([new Date(2026, 8, 30), new Date(2026, 8, 1)], [1, 1], 30, today);

  assert.equal(spark.length, 30);
  assert.equal(spark.filter((v) => v === 0).length, 28, "the gap survives as gaps");
});

test("no rows at all is a flat series, not a crash", () => {
  assert.deepEqual(densify(null, null, 30), new Array(30).fill(0));
});

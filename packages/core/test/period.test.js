import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregate,
  buildPeriodReport,
  completedPeriod,
  previousPeriod,
} from "../dist/index.js";

/** An event on a specific local date. */
const day = (y, m, d, tokens = 1000) => ({
  agent: "claude-code",
  ts: new Date(y, m - 1, d, 14, 0, 0),
  model: "claude-opus-5",
  input: tokens,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
});

/* ---------------------------------------------------------------------------
   Boundaries. These are the cases where a reporting tool quietly starts lying.
   --------------------------------------------------------------------------- */

test("the completed week excludes the week in progress", () => {
  // 2026-05-20 is a Wednesday; the week in progress began Monday 2026-05-18.
  const b = completedPeriod("week", new Date(2026, 4, 20, 9, 0, 0));

  assert.equal(b.from, "2026-05-11", "the last Monday-to-Sunday that actually finished");
  assert.equal(b.to, "2026-05-17");
  assert.equal(b.days, 7);
});

test("a week reported on a Monday is the one that ended yesterday", () => {
  const b = completedPeriod("week", new Date(2026, 4, 18, 0, 30, 0));
  assert.equal(b.from, "2026-05-11");
  assert.equal(b.to, "2026-05-17");
});

test("a week reported on a Sunday still excludes that Sunday", () => {
  // Sunday is the last day of its own week, and that week is not over until midnight.
  const b = completedPeriod("week", new Date(2026, 4, 17, 23, 0, 0));
  assert.equal(b.to, "2026-05-10", "today's week is still running");
});

test("the completed month is the previous calendar month", () => {
  const b = completedPeriod("month", new Date(2026, 4, 20));
  assert.equal(b.from, "2026-04-01");
  assert.equal(b.to, "2026-04-30");
  assert.equal(b.days, 30);
});

test("February is measured, not assumed — leap and common years both", () => {
  const leap = completedPeriod("month", new Date(2028, 2, 5)); // March 2028 -> Feb 2028
  assert.equal(leap.to, "2028-02-29");
  assert.equal(leap.days, 29);

  const common = completedPeriod("month", new Date(2026, 2, 5)); // March 2026 -> Feb 2026
  assert.equal(common.to, "2026-02-28");
  assert.equal(common.days, 28);
});

test("January rolls back into the previous year", () => {
  const b = completedPeriod("month", new Date(2026, 0, 9));
  assert.equal(b.from, "2025-12-01");
  assert.equal(b.to, "2025-12-31");
});

test("a week spanning a DST shift is still seven calendar days", () => {
  /* Many northern-hemisphere zones shift in late March and late October. Stepping by
     86_400_000ms would drop or repeat a date; stepping local days at noon does not. */
  for (const d of [new Date(2026, 2, 31), new Date(2026, 9, 28)]) {
    const b = completedPeriod("week", d);
    assert.equal(b.days, 7);
    assert.equal(previousPeriod("week", b).days, 7);
  }
});

test("the previous month of March is February, not thirty days earlier", () => {
  const march = { from: "2026-03-01", to: "2026-03-31", days: 31 };
  const prev = previousPeriod("month", march);

  assert.equal(prev.from, "2026-02-01");
  assert.equal(prev.to, "2026-02-28");
});

/* ---------------------------------------------------------------------------
   Comparability. A percentage is a claim; these decide when it has been earned.
   --------------------------------------------------------------------------- */

const NOW = new Date(2026, 4, 20); // Wed 2026-05-20 -> completed week 05-11..05-17

test("a real baseline yields both an absolute and a percentage change", async () => {
  const stats = await aggregate([day(2026, 5, 12, 2000), day(2026, 5, 5, 1000)], { now: NOW });
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-01-01" });

  assert.equal(r.current.tokens, 2000);
  assert.equal(r.previous.tokens, 1000);
  assert.equal(r.deltaTokens, 1000);
  assert.equal(r.deltaPct, 100);
  assert.equal(r.comparability.comparable, true);
});

test("a baseline that predates recorded history is not a baseline", async () => {
  // History begins inside the prior week, so part of it was never observed.
  const stats = await aggregate([day(2026, 5, 12, 2000), day(2026, 5, 7, 500)], { now: NOW });
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-05-06" });

  assert.equal(r.deltaPct, null, "a part-observed period must not become a growth rate");
  assert.equal(r.comparability.comparable, false);
  assert.equal(r.comparability.reason, "partial-baseline");
  assert.match(r.comparability.detail, /2026-05-06/);
  assert.equal(r.deltaTokens, 1500, "the absolute change is still real and still reported");
});

test("history starting after an empty prior period means no baseline at all", async () => {
  const stats = await aggregate([day(2026, 5, 12, 2000)], { now: NOW });
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-05-11" });

  assert.equal(r.deltaPct, null);
  assert.equal(r.comparability.reason, "no-baseline");
});

test("a prior period that predates history but still has figures says so precisely", async () => {
  /* The logs may still cover a week the ledger never banked. We have a number; we cannot
     vouch that it is the whole week. Reporting that as "no baseline" beside a visible total
     reads as a bug rather than as a limit on the evidence. */
  const stats = await aggregate([day(2026, 5, 12, 2000), day(2026, 5, 5, 900)], { now: NOW });
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-05-11" });

  assert.equal(r.previous.tokens, 900, "the figure is there");
  assert.equal(r.deltaPct, null, "and it still cannot become a growth rate");
  assert.equal(r.comparability.reason, "partial-baseline");
  assert.match(r.comparability.detail, /predates recorded history/);
});

test("a genuinely empty prior period reports no percentage, not an infinite one", async () => {
  const stats = await aggregate([day(2026, 5, 12, 2000)], { now: NOW });
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-01-01" });

  assert.equal(r.previous.tokens, 0);
  assert.equal(r.deltaPct, null, "division by zero is undefined, not 'up infinity percent'");
  assert.equal(r.deltaTokens, 2000);
  assert.equal(r.comparability.reason, "no-baseline");
});

test("a decline is reported as a decline", async () => {
  const stats = await aggregate([day(2026, 5, 12, 500), day(2026, 5, 5, 1000)], { now: NOW });
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-01-01" });

  assert.equal(r.deltaTokens, -500);
  assert.equal(r.deltaPct, -50);
});

test("empty data produces a report rather than a crash", async () => {
  const r = buildPeriodReport(await aggregate([], { now: NOW }), { kind: "month", now: NOW });

  assert.equal(r.current.tokens, 0);
  assert.equal(r.previous.tokens, 0);
  assert.equal(r.deltaPct, null);
  assert.equal(r.current.biggestDay, null);
  assert.equal(r.comparability.comparable, false);
});

test("days outside the window are excluded from both ends", async () => {
  const stats = await aggregate(
    [
      day(2026, 5, 10, 9999), // Sunday before the window
      day(2026, 5, 11, 100), // first day of the window
      day(2026, 5, 17, 100), // last day of the window
      day(2026, 5, 18, 9999), // Monday after the window
    ],
    { now: NOW },
  );
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-01-01" });

  assert.equal(r.current.tokens, 200, "inclusive on both boundary days, exclusive beyond them");
  assert.equal(r.current.activeDays, 2);
});

test("the period's own biggest day is reported", async () => {
  const stats = await aggregate([day(2026, 5, 12, 100), day(2026, 5, 14, 8000)], { now: NOW });
  const r = buildPeriodReport(stats, { kind: "week", now: NOW, historyFrom: "2026-01-01" });

  assert.equal(r.current.biggestDay.day, "2026-05-14");
  assert.equal(r.current.biggestDay.tokens, 8000);
});

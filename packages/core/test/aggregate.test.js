import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregate, buildCardSvg, formatTokens, formatUsd, segmentWidths } from "../dist/index.js";

/** Build an event on a given local day, so the tests are timezone-independent. */
const on = (y, m, d, over = {}) => ({
  agent: "claude-code",
  ts: new Date(y, m - 1, d, 12, 0, 0),
  model: "claude-opus-5",
  input: 1000,
  output: 100,
  cacheWrite: 0,
  cacheRead: 0,
  ...over,
});

test("streak counts back from today", async () => {
  const now = new Date(2026, 4, 20, 18, 0, 0);
  const stats = await aggregate([on(2026, 5, 20), on(2026, 5, 19), on(2026, 5, 18)], { now });

  assert.equal(stats.streakDays, 3);
});

test("streak survives a day that has not started yet", async () => {
  // Someone runs sync at 07:00 before opening their editor. Yesterday still counts.
  const now = new Date(2026, 4, 21, 7, 0, 0);
  const stats = await aggregate([on(2026, 5, 20), on(2026, 5, 19)], { now });

  assert.equal(stats.streakDays, 2);
});

test("streak breaks across a gap day", async () => {
  const now = new Date(2026, 4, 20, 18, 0, 0);
  const stats = await aggregate([on(2026, 5, 20), on(2026, 5, 18), on(2026, 5, 17)], { now });

  assert.equal(stats.streakDays, 1);
  assert.equal(stats.activeDays, 3);
});

test("streak is zero once two days have passed", async () => {
  const now = new Date(2026, 4, 25, 18, 0, 0);
  const stats = await aggregate([on(2026, 5, 20)], { now });

  assert.equal(stats.streakDays, 0);
});

test("days are bucketed locally, not in UTC", async () => {
  // 23:30 local on the 20th is the 21st in UTC for anyone east of Greenwich. The user's
  // calendar is the one that matters.
  const now = new Date(2026, 4, 21, 12, 0, 0);
  const late = { ...on(2026, 5, 20), ts: new Date(2026, 4, 20, 23, 30, 0) };
  const stats = await aggregate([late], { now });

  assert.deepEqual([...stats.byDay.keys()], ["2026-05-20"]);
});

test("mix is per-agent share, descending", async () => {
  const stats = await aggregate([
    on(2026, 5, 20, { agent: "claude-code", input: 700, output: 0 }),
    on(2026, 5, 20, { agent: "codex", input: 300, output: 0 }),
  ]);

  assert.deepEqual(
    stats.mix.map((m) => [m.agent, Math.round(m.pct)]),
    [
      ["claude-code", 70],
      ["codex", 30],
    ],
  );
});

test("segment widths sum to exactly the track", () => {
  for (const track of [439, 292]) {
    for (const mix of [
      [{ agent: "a", pct: 98.68 }, { agent: "b", pct: 0.91 }, { agent: "c", pct: 0.41 }],
      [{ agent: "a", pct: 58 }, { agent: "b", pct: 21 }, { agent: "c", pct: 12 }, { agent: "d", pct: 9 }],
      [{ agent: "a", pct: 100 }],
    ]) {
      const widths = segmentWidths(mix, track);
      assert.equal(
        widths.reduce((a, b) => a + b, 0),
        track,
        `${mix.length} segments across ${track}px`,
      );
    }
  }
});

test("the legend rounds percentages so they cannot overrun their slot", () => {
  const svg = buildCardSvg({
    handle: "dev",
    tokens: "4.23B",
    spend: "$2,796",
    streak: "10d",
    mix: [{ agent: "claude-code", pct: 98.677606 }],
    syncedAt: "SYNCED 0M AGO",
  });

  assert.match(svg, /claude-code 99%/);
  assert.doesNotMatch(svg, /98\.67/);
});

test("token formatting keeps three significant figures", () => {
  assert.equal(formatTokens(4_232_281_798), "4.23B");
  assert.equal(formatTokens(890_000_000), "890M");
  assert.equal(formatTokens(38_395_304), "38.4M");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatUsd(2795.216), "$2,795");
  assert.equal(formatUsd(2795.216, true), "$2,795.22");
});

test("an all-unpriced corpus reports a dash, not $0", async () => {
  const stats = await aggregate([on(2026, 5, 20, { model: "big-pickle" })]);

  assert.equal(stats.pricedShare, 0);
  assert.ok(stats.tokens > 0);
});

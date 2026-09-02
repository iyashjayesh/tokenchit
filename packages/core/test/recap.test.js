import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregate, buildRecap, buildRecapSvg, RAMP, WEEKDAYS } from "../dist/index.js";

/** An event at a given local weekday-and-hour. 2026-05-18 is a Monday. */
const at = (mondayOffset, hour, tokens = 1000) => ({
  agent: "claude-code",
  ts: new Date(2026, 4, 18 + mondayOffset, hour, 0, 0),
  model: "claude-opus-5",
  input: tokens,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
});

const NOW = new Date(2026, 4, 25, 12, 0, 0);

test("the grid is Monday-first and bucketed by local hour", async () => {
  const stats = await aggregate([at(0, 9), at(6, 23)], { now: NOW });

  assert.equal(stats.heat[0][9], 1000, "Monday 09:00");
  assert.equal(stats.heat[6][23], 1000, "Sunday 23:00");
  assert.equal(stats.byWeekday[0], 1000);
  assert.equal(stats.byHour[9], 1000);
  assert.equal(WEEKDAYS[0], "MON");
});

test("cells are ranked across distinct values, not scaled against the busiest", async () => {
  // One violently dominant cell plus a spread of smaller ones. A linear scale against the
  // max would flatten every small cell to level 0 and make the grid unreadable.
  const events = [at(0, 10, 10_000_000)];
  for (let h = 0; h < 8; h++) events.push(at(1, h, (h + 1) * 100));

  const recap = buildRecap(await aggregate(events, { now: NOW }), { year: 2026 });
  const used = new Set(recap.rows.flatMap((r) => r.levels).filter((l) => l > 0));

  assert.ok(used.size >= 3, `expected a spread of levels, saw ${[...used].join(",")}`);
  assert.equal(Math.max(...used), 4, "the dominant cell still tops the ramp");
});

test("an empty hour is always level zero", async () => {
  const recap = buildRecap(await aggregate([at(0, 10)], { now: NOW }), { year: 2026 });

  assert.equal(recap.rows[0].levels[10], 4, "the only active hour is the hottest");
  assert.equal(recap.rows[0].levels[11], 0);
  assert.equal(recap.rows[1].levels.every((l) => l === 0), true, "an empty day stays cold");
});

test("the peak window widens from the busiest hour while neighbours stay substantial", async () => {
  const events = [
    ...Array.from({ length: 5 }, () => at(0, 14, 1000)), // 5000 at 14:00
    ...Array.from({ length: 3 }, () => at(0, 15, 1000)), // 3000 at 15:00 — above a third
    at(0, 16, 100), // well below a third, so the window stops before it
    at(0, 3, 2000), // above the one-third floor but not contiguous, so it must stay out
  ];

  const recap = buildRecap(await aggregate(events, { now: NOW }), { year: 2026 });

  assert.deepEqual(recap.peak, { from: 14, to: 15 });
});

test("no activity means no peak rather than a bogus one", async () => {
  const recap = buildRecap(await aggregate([], { now: NOW }), { year: 2026 });

  assert.equal(recap.peak, null);
  assert.equal(recap.rows.length, 7);
  assert.equal(recap.rows.every((r) => r.levels.every((l) => l === 0)), true);
  assert.equal(recap.tiles.equivCost, "—", "no priced tokens means a dash, not $0");
});

test("exactly one day is marked busiest", async () => {
  const recap = buildRecap(
    await aggregate([at(0, 10, 5000), at(1, 10, 1000)], { now: NOW }),
    { year: 2026 },
  );

  assert.deepEqual(
    recap.rows.filter((r) => r.busiest).map((r) => r.day),
    ["MON"],
  );
  assert.equal(recap.rows[1].share, 20, "Tuesday is a fifth of Monday");
});

test("the recap SVG renders and stays inside its frame", async () => {
  const recap = buildRecap(await aggregate([at(0, 10), at(3, 16)], { now: NOW }), { year: 2026 });
  const svg = buildRecapSvg({ handle: "octocat", recap, theme: "light" });

  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
  assert.match(svg, /@octocat/);
  assert.match(svg, /2026/);

  // Nothing may be drawn past the 495x330 frame.
  for (const [, x] of svg.matchAll(/\sx="([\d.]+)"/g)) assert.ok(Number(x) <= 495, `x=${x}`);
  for (const [, y] of svg.matchAll(/\sy="([\d.]+)"/g)) assert.ok(Number(y) <= 330, `y=${y}`);
});

test("dark recaps swap the coldest ramp step so empty cells are not near-white", async () => {
  const recap = buildRecap(await aggregate([at(0, 10)], { now: NOW }), { year: 2026 });

  const light = buildRecapSvg({ handle: "octocat", recap, theme: "light" });
  const dark = buildRecapSvg({ handle: "octocat", recap, theme: "dark" });

  assert.ok(light.includes(RAMP[0]), "light keeps the design's coldest step");
  assert.ok(!dark.includes(RAMP[0]), "dark must not paint near-white cells");
  assert.ok(dark.includes("#1C1C18"));
});

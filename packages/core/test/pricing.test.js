import assert from "node:assert/strict";
import { test } from "node:test";

import { costOf, priceOf } from "../dist/index.js";

const event = (over = {}) => ({
  agent: "claude-code",
  ts: new Date(2026, 9, 14, 12, 0, 0),
  model: "claude-haiku-5-5",
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  ...over,
});

/** Dollars to the micro-cent, so float noise in the sums cannot fail a test. */
const usd = (n) => Math.round(n * 1e8) / 1e8;

test("the 5.5 generation is priced", () => {
  // Opus 5.5 is not Opus 5: falling back to the older row would overstate it by a quarter.
  assert.deepEqual(priceOf("claude-opus-5-5"), { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 });
  assert.equal(priceOf("claude-sonnet-5-5")?.input, 2);
  assert.equal(priceOf("claude-haiku-5-5")?.input, 0.1);
});

test("a prompt of exactly 100,000 tokens stays on Haiku 5.5's base rate", () => {
  const cost = costOf(event({ input: 100_000, output: 1_000 }));
  assert.equal(usd(cost), usd((100_000 * 0.1 + 1_000 * 0.5) / 1e6));
});

test("one token over moves the whole request, output included, to the upper tier", () => {
  const cost = costOf(event({ input: 100_001, output: 1_000 }));
  assert.equal(usd(cost), usd((100_001 * 0.5 + 1_000 * 2.5) / 1e6));
});

test("cache reads and writes count toward the prompt length", () => {
  // 1,000 uncached is nowhere near the line; the 150,000 read from cache is what crosses it.
  const cost = costOf(event({ input: 1_000, cacheRead: 150_000, cacheWrite: 2_000, output: 500 }));
  assert.equal(usd(cost), usd((1_000 * 0.5 + 150_000 * 0.05 + 2_000 * 0.625 + 500 * 2.5) / 1e6));
});

test("an aggregate event never picks a tier from its summed prompt", () => {
  // A ledger day of many short prompts: the sum crosses 100,000, no single request did.
  const day = costOf(event({ input: 400_000, output: 10_000, tsPrecision: "day" }));
  assert.equal(usd(day), usd((400_000 * 0.1 + 10_000 * 0.5) / 1e6));

  const rollout = costOf(event({ input: 400_000, output: 10_000, tsPrecision: "session" }));
  assert.equal(usd(rollout), usd(day));
});

test("a model with no tiers is priced the same at any length", () => {
  const short = costOf(event({ model: "claude-opus-5-5", input: 1_000 }));
  const long = costOf(event({ model: "claude-opus-5-5", input: 900_000 }));
  assert.equal(usd(long / short), 900);
});

test("a refresh keeps models upstream has stopped listing", () => {
  // Retired upstream, still named in transcripts on disk.
  assert.ok(priceOf("claude-opus-4-1"));
  assert.ok(priceOf("claude-3-7-sonnet-20250219"));
});

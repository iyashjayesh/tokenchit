import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregate, buildPayload, validatePayload } from "../dist/index.js";

const at = (agent, day, tokens, model = "claude-opus-5") => ({
  agent,
  ts: new Date(2026, 4, day, 12, 0, 0),
  model,
  input: tokens,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
});

const NOW = new Date(2026, 4, 25, 12, 0, 0);
const payloadOf = async (events) =>
  buildPayload(await aggregate(events, { now: NOW }), {
    handle: "octocat",
    clientVersion: "test",
  });

test("days are split by agent, carrying tokens and cost", async () => {
  const p = await payloadOf([at("claude-code", 20, 1000), at("codex", 20, 500)]);

  assert.equal(p.days.length, 2, "one row per agent per day");
  assert.deepEqual(
    p.days.map((d) => [d.day, d.agent, d.tokens]).sort(),
    [
      ["2026-05-20", "claude-code", 1000],
      ["2026-05-20", "codex", 500],
    ],
  );
  for (const d of p.days) assert.ok(d.equivCostUsd > 0, `${d.agent} has no cost`);
});

test("day rows reconcile with the headline", async () => {
  const p = await payloadOf([
    at("claude-code", 20, 1000),
    at("codex", 20, 500),
    at("opencode", 21, 250),
  ]);

  assert.equal(
    p.days.reduce((a, d) => a + d.tokens, 0),
    p.tokens,
  );
  assert.deepEqual(validatePayload(p, NOW), []);
});

test("the daily ceiling is checked per day, not per agent row", async () => {
  // Three agents at 100M each: every row is comfortably under the 2B ceiling on its own,
  // but this is what a day summing over the limit has to be caught by.
  const over = Math.floor(2_000_000_000 / 2);
  const p = await payloadOf([
    at("claude-code", 20, over),
    at("codex", 20, over),
    at("opencode", 20, over),
  ]);

  const errors = validatePayload(p, NOW);
  assert.ok(
    errors.some((e) => e.includes("daily ceiling")),
    `expected a daily-ceiling rejection, got ${JSON.stringify(errors)}`,
  );
});

test("a cost that disagrees with its day rows is rejected", async () => {
  const p = await payloadOf([at("claude-code", 20, 1000)]);
  p.equivCostUsd = p.equivCostUsd + 5;

  assert.ok(
    validatePayload(p, NOW).some((e) => e.includes("daily costs sum")),
    "an inflated headline cost must not pass",
  );
});

test("per-row rounding does not trip the cost check", async () => {
  // Many small rows are where four-decimal rounding accumulates; the tolerance exists for
  // exactly this and must not be so tight that an honest payload fails.
  const events = [];
  for (let day = 1; day <= 20; day++) {
    for (const agent of ["claude-code", "codex", "opencode"]) {
      events.push(at(agent, day, 333));
    }
  }
  const p = await payloadOf(events);

  assert.equal(p.days.length, 60);
  assert.deepEqual(validatePayload(p, NOW), []);
});

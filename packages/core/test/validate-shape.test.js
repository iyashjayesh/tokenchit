import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregate, buildPayload, LIMITS, validatePayload } from "../dist/index.js";

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
const honest = async () =>
  buildPayload(await aggregate([at("claude-code", 20, 1000), at("codex", 21, 500)], { now: NOW }), {
    handle: "octocat",
    clientVersion: "test",
  });

const reasons = (p) => validatePayload(p, NOW);
const rejects = (p, pattern, msg) => {
  const found = reasons(p);
  assert.ok(
    found.some((r) => pattern.test(r)),
    `${msg}\n  expected something matching ${pattern}\n  got: ${JSON.stringify(found)}`,
  );
};

test("a payload the CLI actually builds is accepted", async () => {
  assert.deepEqual(reasons(await honest()), []);
});

test("an empty day series is refused, whatever the headline claims", async () => {
  /*
   * This is the review-gate bypass. The guard used to require no days AND no tokens, so
   * `days: [], tokens: 1` passed — and because the route only rewrote `user_days` when days
   * were present, a flagged huge series survived an unflagged empty submission and the row
   * came back to the board carrying the very figures it had been held for.
   */
  const p = await honest();
  p.days = [];
  p.tokens = 1;
  p.equivCostUsd = 0;
  rejects(p, /no days/, "an empty series must be refused even with a non-zero headline");

  p.tokens = 0;
  rejects(p, /no days/, "and refused with a zero headline too");
});

test("the same (day, agent) pair cannot appear twice", async () => {
  // It is the primary key of user_days, so a duplicate aborts the insert inside the
  // transaction and surfaces as a 500 from a route that otherwise explains itself.
  const p = await honest();
  const first = p.days[0];
  p.days = [first, { ...first }];
  p.tokens = first.tokens * 2;
  rejects(p, /twice/, "a duplicate (day, agent) pair must be named, not passed to Postgres");
});

test("names that would break a table or an SVG are refused", async () => {
  const p = await honest();
  p.days[0].agent = "a".repeat(LIMITS.maxNameLength + 1);
  rejects(p, /characters/, "an over-long agent name must be refused");

  // Built rather than typed, so this file has no literal control character in it.
  const q = await honest();
  q.models[0].model = `gpt${String.fromCharCode(0)}5`;
  rejects(q, /control characters/, "control characters must be refused");
});

test("each distinct fault is reported once, however many checks find it", async () => {
  // A long agent name is reachable from `agents` and from every day that uses it.
  const p = await honest();
  const long = "a".repeat(LIMITS.maxNameLength + 1);
  for (const d of p.days) d.agent = long;
  p.agents = [{ agent: long, tokens: p.tokens }];

  const found = reasons(p).filter((r) => /characters/.test(r));
  assert.equal(found.length, 1, `expected one reason, got ${JSON.stringify(found)}`);
});

test("pricedShare cannot be understated to weaken the cost/token guard", async () => {
  /*
   * The ratio check divides claimed cost by `tokens * pricedShare`, so shrinking the share
   * shrinks what the claim has to justify — a trillion-token claim needs about $5,000 of
   * matching cost at a share of 1, and half a cent at 1e-6. `models[]` already holds the
   * honest answer, and nothing compared the two.
   */
  const p = await honest();
  assert.ok(
    p.models.every((m) => m.priced),
    "fixture should be fully priced",
  );

  p.pricedShare = 0.000001;
  rejects(p, /pricedShare/, "a share far below what the model table implies must be refused");
});

test("an honestly unpriced payload is still accepted", async () => {
  // The whole reason pricedShare exists: unpriced models really do contribute tokens and no
  // cost, and that is a real state rather than an attack.
  const p = await honest();
  for (const m of p.models) {
    m.priced = false;
    m.equivCostUsd = 0;
  }
  p.pricedShare = 0;
  p.equivCostUsd = 0;
  for (const d of p.days) d.equivCostUsd = 0;

  assert.deepEqual(reasons(p), [], "an all-unpriced payload is legitimate");
});

test("arrays are bounded", async () => {
  const p = await honest();
  const one = p.days[0];
  p.days = Array.from({ length: LIMITS.days + 1 }, (_, i) => ({
    ...one,
    day: `2020-01-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  rejects(p, /entries/, "an unbounded day array must be refused");
});

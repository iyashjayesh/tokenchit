import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createClaudeCode, createCodex } from "../dist/adapters/index.js";
import { aggregate } from "../dist/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const collect = async (adapter) => {
  const out = [];
  for await (const e of adapter.read()) out.push(e);
  return out;
};

test("claude: deduplicates messages replayed across session files", async () => {
  const events = await collect(createClaudeCode(join(FIXTURES, "claude")));

  // proj-b replays msg_1 verbatim (a resumed session) and repeats msg_2 as a sidechain.
  // Both must collapse; msg_9 is genuinely new. <synthetic> is dropped outright.
  assert.deepEqual(
    events.map((e) => e.model).sort(),
    ["claude-opus-5", "claude-opus-5", "claude-opus-5", "totally-made-up-model"],
  );
  assert.equal(events.length, 4);
});

test("claude: counts all four token buckets", async () => {
  const events = await collect(createClaudeCode(join(FIXTURES, "claude")));
  const first = events.find((e) => e.input === 100);

  assert.deepEqual(
    { i: first.input, o: first.output, w: first.cacheWrite, r: first.cacheRead },
    { i: 100, o: 50, w: 200, r: 400 },
  );
});

test("claude: survives a truncated final line", async () => {
  // A live session's last line is often half-flushed. Nothing should throw.
  const events = await collect(createClaudeCode(join(FIXTURES, "claude")));
  assert.ok(events.length > 0);
});

test("codex: takes the last cumulative total, never the sum", async () => {
  const events = await collect(createCodex(join(FIXTURES, "codex")));

  assert.equal(events.length, 1, "one event per session file");
  const [e] = events;

  // Last event reports 3300 cumulative. Summing the two events would give 4400.
  assert.equal(e.input + e.output + e.cacheRead + e.cacheWrite, 3300);
  // cached_input_tokens is a subset of input_tokens, so the buckets stay disjoint.
  assert.equal(e.input, 1800);
  assert.equal(e.cacheRead, 1200);
  assert.equal(e.output, 300);
  assert.equal(e.model, "gpt-5.5", "model comes from turn_context, not session_meta");
});

test("codex: ignores rate-limit heartbeats with null info", async () => {
  const events = await collect(createCodex(join(FIXTURES, "codex")));
  assert.equal(events.length, 1);
});

test("unpriced models count tokens but are excluded from cost", async () => {
  const stats = await aggregate(createClaudeCode(join(FIXTURES, "claude")).read());

  const madeUp = stats.models.find((m) => m.model === "totally-made-up-model");
  assert.equal(madeUp.priced, false);
  assert.equal(madeUp.tokens, 2000);
  assert.equal(madeUp.equivCostUsd, 0);

  assert.ok(stats.tokens > 2000, "its tokens are still in the total");
  assert.ok(stats.pricedShare > 0 && stats.pricedShare < 1);
});

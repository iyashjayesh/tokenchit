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

test("codex: reports a file's growth, never the sum of its readings", async () => {
  const events = await collect(createCodex(join(FIXTURES, "codex")));

  assert.equal(events.length, 1, "one event per session file");
  const [e] = events;

  // The counter runs 1100 -> 3300. Summing the readings would give 4400; taking the last
  // would give 3300 and, in a resumed session, would count everything the previous session
  // did all over again. The growth is 2200.
  //
  // The cost of this is the first turn of a fresh session, measured at 0.42% across a real
  // corpus — against the alternative of counting an inherited total once per resume, which
  // compounds without limit.
  assert.equal(e.input + e.output + e.cacheRead + e.cacheWrite, 2200);
  // cached_input_tokens is a subset of input_tokens, so the buckets stay disjoint.
  assert.equal(e.input, 1200);
  assert.equal(e.cacheRead, 800);
  assert.equal(e.output, 200);
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

test("a resumed codex session contributes its growth, not the total it inherited", async () => {
  // Codex reports a running total. A fresh rollout's first token_count already reflects its
  // first turn (~20-30k on real sessions), but a resumed one starts at whatever the previous
  // session reached — and taking the final reading counts all of that again. Every resume
  // compounds, which is what a chain of 42M, 2.8B, 24.6B, 42.4B codex days looks like from
  // outside: a counter accumulating, not a person working harder each day.
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const root = await mkdtemp(join(tmpdir(), "tokenchit-codex-"));
  const dir = join(root, "2026", "09", "01");
  await mkdir(dir, { recursive: true });

  const turn = (total, cached, out, ts) =>
    JSON.stringify({
      timestamp: ts,
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: total - out,
            cached_input_tokens: cached,
            output_tokens: out,
            total_tokens: total,
          },
        },
      },
    });

  // Inherits 20,000,000,000 and grows by 1,000,000 over the session.
  await writeFile(
    join(dir, "rollout-2026-09-01T10-00-00-resumed.jsonl"),
    [
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.6-sol" } }),
      turn(20_000_000_000, 19_000_000_000, 8_000_000_000, "2026-09-01T10:00:00Z"),
      turn(20_001_000_000, 19_000_400_000, 8_000_600_000, "2026-09-01T10:30:00Z"),
    ].join("\n"),
  );

  const { createCodex } = await import("../dist/adapters/codex.js");
  const events = [];
  for await (const e of createCodex(root).read()) events.push(e);

  assert.equal(events.length, 1, "one event per rollout file");
  const total = events[0].input + events[0].output + events[0].cacheRead + events[0].cacheWrite;
  assert.equal(total, 1_000_000, "only the million it grew by, not the twenty billion it began with");
});

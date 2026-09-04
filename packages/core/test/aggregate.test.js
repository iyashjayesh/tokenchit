import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregate,
  buildCardSvg,
  CARD_HOST,
  formatShare,
  reviewReason,
  REVIEW,
  validatePayload,
  formatTokens,
  formatUsd,
  handleSize,
  sanitizeHandle,
  segmentWidths,
} from "../dist/index.js";

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

test("the legend marks an agent it knows, and claims nothing about one it does not", () => {
  const known = buildCardSvg({
    handle: "dev",
    tokens: "1B",
    spend: "$1",
    streak: "1d",
    mix: [{ agent: "claude-code", pct: 100 }],
    syncedAt: "SYNCED 0M AGO",
  });
  assert.match(known, /<path[^>]*d="m4\.7144/, "claude-code should carry its own mark");

  // No OpenAI mark exists under a licence we can use, and inventing one would be worse than
  // saying nothing. Anything unrecognised gets the neutral chevron.
  const unknown = buildCardSvg({
    handle: "dev",
    tokens: "1B",
    spend: "$1",
    streak: "1d",
    mix: [{ agent: "some-new-agent", pct: 100 }],
    syncedAt: "SYNCED 0M AGO",
  });
  assert.match(unknown, /<path[^>]*d="M4 6l6 6-6 6V6z/, "an unknown agent should get the generic mark");
});

test("legend marks wear their own brand colour, not the chart's", () => {
  const card = (theme) =>
    buildCardSvg({
      handle: "dev",
      tokens: "1B",
      spend: "$1",
      streak: "1d",
      mix: [
        { agent: "claude-code", pct: 60 },
        { agent: "opencode", pct: 40 },
      ],
      syncedAt: "SYNCED 0M AGO",
      theme,
    });

  // Tinting marks to the bar segment made each one look like part of the chart rather than
  // like the thing it identifies, which is the whole reason for using real marks.
  assert.match(card("light"), /fill="#D97757"/, "claude-code should be its own orange");
  assert.match(card("dark"), /fill="#D97757"/, "and the same orange on a dark card");

  // A mark whose brand colour is black would disappear on a black card.
  assert.match(card("light"), /fill="#000000"/, "opencode is black on a light card");
  assert.match(card("dark"), /fill="#FFFFFF"/, "and inverted on a dark card");
});

test("theme=auto emits a dark rule only for marks that actually change", () => {
  const svg = buildCardSvg({
    handle: "dev",
    tokens: "1B",
    spend: "$1",
    streak: "1d",
    mix: [
      { agent: "claude-code", pct: 60 },
      { agent: "opencode", pct: 40 },
    ],
    syncedAt: "SYNCED 0M AGO",
    theme: "auto",
  });

  // opencode flips black to white and needs a rule; claude's orange reads on either ground
  // and emitting one for it would be bytes that change nothing, in a file people commit.
  assert.match(svg, /\.ic1\{fill:#FFFFFF\}/, "opencode needs a dark-mode rule");
  assert.doesNotMatch(svg, /\.ic0\{/, "claude-code should need no rule");
});

test("a legend mark keeps the vertical centre the old square had", () => {
  // The square was 6px drawn from y=157, so its centre sat at 160. The mark is 8px; drawn
  // from the same top edge it would hang 2px below the text baseline. This is the arithmetic
  // that keeps the row optically level, and it is not visible in any screenshot.
  const svg = buildCardSvg({
    handle: "dev",
    tokens: "1B",
    spend: "$1",
    streak: "1d",
    mix: [{ agent: "claude-code", pct: 100 }],
    syncedAt: "SYNCED 0M AGO",
  });

  const move = /translate\(\d+ (\d+(?:\.\d+)?)\) scale\(([\d.]+)\)/.exec(svg);
  assert.ok(move, "expected a translated, scaled legend mark");

  const top = Number(move[1]);
  const size = Number(move[2]) * 24;
  assert.ok(Math.abs(top + size / 2 - 160) < 0.05, `mark centre is ${top + size / 2}, want 160`);
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

test("token formatting promotes rather than printing 1000 of a smaller unit", () => {
  // 999,999,999 rounds to 1000M at this precision; the unit above is the right answer.
  assert.equal(formatTokens(999_999_999), "1.00B");
  assert.equal(formatTokens(999_999_999_999), "1.00T");
  assert.equal(formatTokens(999_400_000), "999M", "just below the boundary stays put");
});

test("handles keep all 39 characters GitHub allows", () => {
  const long = "a-very-long-github-handle-x";
  assert.equal(sanitizeHandle(long), long, "must not be truncated to a different name");
  assert.equal(sanitizeHandle("a".repeat(50)).length, 39);
  assert.equal(sanitizeHandle("bad/chars!here"), "badcharshere");
  assert.equal(sanitizeHandle(""), "dev");
});

test("a long handle is shrunk to fit rather than cut short", () => {
  const long = "a-very-long-github-handle-here-abcdefg";
  assert.equal(long.length, 38);

  const svg = buildCardSvg({
    handle: long,
    tokens: "4.23B",
    spend: "$2,796",
    streak: "10d",
    mix: [{ agent: "claude-code", pct: 100 }],
    syncedAt: "SYNCED 0M AGO",
  });

  assert.match(svg, new RegExp(`@${long}`), "the whole handle is on the card");

  // 20px is the design size for a short handle; a 38-character one must come down.
  assert.equal(handleSize("octocat", 20, 439), 20);
  const shrunk = handleSize(long, 20, 439);
  assert.ok(shrunk < 20 && shrunk > 10, `expected a smaller readable size, got ${shrunk}`);
  assert.ok((long.length + 1) * 0.6 * shrunk <= 439, "must fit the 439px track");
});


test("a plausible-but-extreme day is held for review, not rejected", () => {
  // The hard limits reject the arithmetically impossible. Between "normal" and "impossible"
  // sits a range a heavy real user might reach and a fabricator certainly would; rejecting
  // that outright turns a false positive into a locked-out user, so it is kept and held.
  const day = (tokens, cost) => ({ day: "2026-09-01", agent: "claude-code", tokens, equivCostUsd: cost });

  assert.equal(reviewReason({ days: [day(600_000_000, 400)] }), null, "a busy real day publishes");

  const held = reviewReason({ days: [day(REVIEW.tokensPerDay + 1, 400)] });
  assert.match(held ?? "", /2026-09-01/, "an extreme day names itself in the reason");
});

test("review looks at a whole day, not one agent at a time", () => {
  // Three agents each sitting just under the bar is one day far over it. Checking rows
  // individually is exactly how a split submission would walk past the threshold.
  const third = Math.ceil(REVIEW.tokensPerDay / 3) + 1;
  const days = ["claude-code", "codex", "opencode"].map((agent) => ({
    day: "2026-09-01",
    agent,
    tokens: third,
    equivCostUsd: 1,
  }));

  assert.ok(reviewReason({ days }), "summed across agents this day is over the threshold");
  assert.equal(reviewReason({ days: [days[0]] }), null, "any one of them alone is not");
});


test("a present-but-tiny agent share is never rendered as 0%", () => {
  // codex at 0.4% and opencode at 0.2% both rounded to "0%" on the live card, which reads as
  // "this agent did nothing" beside an agent that plainly did something — the legend would
  // not list it otherwise.
  assert.equal(formatShare(0.4), "<1%");
  assert.equal(formatShare(0.2), "<1%");
  assert.equal(formatShare(0), "0%", "a genuine zero still reads as zero");
  assert.equal(formatShare(99.5), "100%");
  assert.equal(formatShare(58), "58%");

  const svg = buildCardSvg({
    handle: "dev",
    tokens: "10.4B",
    spend: "$7,005",
    streak: "25d",
    mix: [
      { agent: "claude-code", pct: 99.4 },
      { agent: "codex", pct: 0.4 },
      { agent: "opencode", pct: 0.2 },
    ],
    syncedAt: "SYNCED 0M AGO",
  });
  assert.match(svg, /codex &lt;1%/, "the card should say <1%, not 0%");
  assert.doesNotMatch(svg, /codex 0%/);
});

test("the card stamps the host from one shared constant", () => {
  // It once stamped TOKENCHIT.APP before that domain existed — a watermark on a file people
  // commit into their repositories, pointing at nothing. The domain is real now, but the
  // lesson is the constant: the card and the recap must not disagree about where to send a
  // reader, and neither may hardcode a host of its own.
  const svg = buildCardSvg({
    handle: "dev",
    tokens: "1B",
    spend: "$1",
    streak: "1d",
    mix: [{ agent: "claude-code", pct: 100 }],
    syncedAt: "SYNCED 0M AGO",
  });
  assert.match(svg, new RegExp(CARD_HOST.replace(/\./g, "\\.")));
  assert.doesNotMatch(svg, /VERCEL/, "the deployment host should not be stamped on a card");
});

test("the stats-panel reader sums a cache the way the panel does, and is quiet when it cannot", async () => {
  // Claude Code's panel reads a cumulative stats-cache.json, not the transcripts. Reading it
  // is the only way to explain the difference to someone comparing the two numbers — and a
  // missing or unrecognised file must be an absent answer rather than a failed sync, because
  // the file is Claude Code's and its shape is not promised to us.
  const { readClaudeStatsPanels } = await import("@tokenchit/core/adapters");
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const home = await mkdtemp(join(tmpdir(), "tokenchit-stats-"));
  const cfg = join(home, ".claude");
  await mkdir(join(cfg, "projects"), { recursive: true });
  await writeFile(
    join(cfg, "stats-cache.json"),
    JSON.stringify({
      modelUsage: {
        "claude-opus-5": { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 8500 },
        "claude-haiku-4-5": { inputTokens: 10, outputTokens: 5 },
      },
    }),
  );

  const [panel] = await readClaudeStatsPanels([join(cfg, "projects")]);
  assert.equal(panel?.tokens, 10015, "every numeric field across every model is summed");
  assert.equal(panel?.root, cfg, "the config directory is named, not the projects dir");

  // A directory with no cache at all says nothing rather than throwing.
  const bare = await mkdtemp(join(tmpdir(), "tokenchit-bare-"));
  assert.deepEqual(await readClaudeStatsPanels([join(bare, "projects")]), []);

  // Neither does an unparseable one.
  const broken = await mkdtemp(join(tmpdir(), "tokenchit-broken-"));
  await writeFile(join(broken, "stats-cache.json"), "{ not json");
  assert.deepEqual(await readClaudeStatsPanels([join(broken, "projects")]), []);
});

test("a genuinely heavy day publishes instead of being refused", () => {
  // The second real user to run this had a 3,374,192,877-token day and was rejected by a
  // ceiling calibrated against one other machine, whose busiest day was 607M. Volume alone is
  // never impossible — two agents in parallel, a shared box, a cache-heavy week — so it must
  // not be what refuses a submission.
  const day = (tokens, cost) => ({
    day: "2026-09-02",
    agent: "claude-code",
    tokens,
    equivCostUsd: cost,
  });

  const payload = {
    handle: "someone",
    tokens: 3_374_192_877,
    equivCostUsd: 2360.12,
    pricedShare: 1,
    streakDays: 17,
    activeDays: 50,
    firstDay: "2026-09-02",
    lastDay: "2026-09-02",
    agents: [{ agent: "claude-code", tokens: 3_374_192_877 }],
    models: [
      { model: "claude-opus-5", tokens: 3_374_192_877, equivCostUsd: 2360.12, priced: true },
    ],
    days: [day(3_374_192_877, 2360.12)],
    clientVersion: "test",
  };

  assert.deepEqual(validatePayload(payload), [], "the real user's day must not be rejected");
  assert.equal(reviewReason(payload), null, "nor held, at four times the heaviest day seen");
});

test("volume still has a sanity ceiling, well above any real day", () => {
  // Not a judgement about heavy use — a guard against corruption and overflow.
  const absurd = {
    handle: "someone",
    tokens: 500_000_000_000,
    equivCostUsd: 1000,
    pricedShare: 1,
    streakDays: 1,
    activeDays: 1,
    firstDay: "2026-09-02",
    lastDay: "2026-09-02",
    agents: [{ agent: "claude-code", tokens: 500_000_000_000 }],
    models: [{ model: "claude-opus-5", tokens: 500_000_000_000, equivCostUsd: 1000, priced: true }],
    days: [{ day: "2026-09-02", agent: "claude-code", tokens: 500_000_000_000, equivCostUsd: 1000 }],
    clientVersion: "test",
  };

  assert.ok(validatePayload(absurd).length > 0, "half a trillion tokens in a day is not work");
});

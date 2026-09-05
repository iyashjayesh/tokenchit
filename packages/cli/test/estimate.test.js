import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { formatTokens } from "@tokenchit/core";

const run = promisify(execFile);
const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

/** Local noon on a given day, as the ISO instant a transcript would carry. */
const noon = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).toISOString();
const day = (n) => `2026-08-${String(n).padStart(2, "0")}`;

const CLAUDE_VERIFIED = 600; // six days at 100
const CLAUDE_UNSEEN = 300; // one 600-token cache day, deflated by the 2x measured on the overlap
const CODEX = 2000; // one rollout, 1000 -> 3000

/**
 * A HOME with one Claude Code profile whose transcripts are shorter than its stats cache, and
 * one Codex rollout beside it.
 *
 * Six Claude days at a clean 2x calibrate the rewrite inflation; a seventh exists only in the
 * cache, standing in for a day retention has already deleted. Codex is there so the tests can
 * tell "every agent" apart from "claude-code only", which is the difference two of these bugs
 * turned on.
 */
async function fixtureHome({ codex = true, rollup = 1800, firstSession } = {}) {
  const home = await mkdtemp(join(tmpdir(), "tokenchit-est-home-"));
  const cfg = join(home, ".claude");
  await mkdir(join(cfg, "projects", "p"), { recursive: true });

  const lines = [1, 2, 3, 4, 5, 6].map((n) =>
    JSON.stringify({
      type: "assistant",
      requestId: `req_${n}`,
      timestamp: noon(2026, 8, n),
      message: {
        id: `msg_${n}`,
        role: "assistant",
        model: "claude-opus-5",
        usage: {
          input_tokens: 100,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }),
  );
  await writeFile(join(cfg, "projects", "p", "s.jsonl"), lines.join("\n") + "\n");

  await writeFile(
    join(cfg, "stats-cache.json"),
    JSON.stringify({
      /* Exactly the sum of the days below (6x200 + 600), so this fixture has no rollup
         residual and the constants above stay about day attribution alone. The case where the
         rollup outruns the daily window has its own test. */
      modelUsage: { "claude-opus-5": { inputTokens: rollup } },
      ...(firstSession ? { firstSessionDate: `${firstSession}T09:00:00.000Z` } : {}),
      dailyActivity: [1, 2, 3, 4, 5, 6, 20].map((n) => ({ date: day(n) })),
      dailyModelTokens: [
        ...[1, 2, 3, 4, 5, 6].map((n) => ({
          date: day(n),
          tokensByModel: { "claude-opus-5": 200 },
        })),
        { date: day(20), tokensByModel: { "claude-opus-5": 600 } },
      ],
    }),
  );

  if (codex) {
    const sessions = join(home, ".codex", "sessions", "2026", "08", "01");
    await mkdir(sessions, { recursive: true });
    const usage = (n) => ({
      input_tokens: n,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: n,
    });
    // Two readings, because Codex reports a running total and the adapter takes the growth.
    await writeFile(
      join(sessions, "rollout-2026-08-01T12-00-00-abc.jsonl"),
      [
        JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.5" } }),
        ...[1000, 3000].map((n) =>
          JSON.stringify({
            timestamp: noon(2026, 8, 1),
            type: "event_msg",
            payload: { type: "token_count", info: { total_token_usage: usage(n) } },
          }),
        ),
      ].join("\n") + "\n",
    );
  }

  return home;
}

/** Run `sync` against that HOME, with whatever `agents` the config should carry. */
async function sync(home, agents, configHome) {
  const cwd = await mkdtemp(join(tmpdir(), "tokenchit-est-"));
  // A fresh config home per run unless the caller wants continuity, so the ledger written by
  // one run cannot change what the next one reports. These tests are about the agents list.
  const xdg = configHome ?? (await mkdtemp(join(tmpdir(), "tokenchit-est-cfg-")));
  await writeFile(
    join(cwd, ".tokenchit.json"),
    JSON.stringify({ handle: "canary", agents, output: "c.svg", layout: "default", theme: "auto" }),
  );

  const { stdout, stderr } = await run(process.execPath, [CLI, "sync"], {
    cwd,
    env: {
      ...process.env,
      HOME: home,
      // Set on the machine this was written on, and honoured by the adapter by design, so it
      // has to be cleared or the fixture home is ignored and the test reads real logs.
      CLAUDE_CONFIG_DIR: "",
      XDG_CONFIG_HOME: xdg,
      USERPROFILE: home,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    },
    maxBuffer: 10 * 1024 * 1024,
  });
  // Both streams: the panel is stdout so `--json` stays pipeable, while notes and warnings —
  // including the line saying the ledger restored something — go to stderr.
  return stdout + stderr;
}

test("an empty agents list means every agent, not no agent", async () => {
  /*
   * `readAll` reads `only?.length ? filter : adapters`, and `DEFAULT_CONFIG` ships
   * `agents: []`, so an unedited config means "read everything". `claudeContext` read the
   * same empty list as "claude-code is not enabled" and returned null, which silently removed
   * the estimate for every user who had never hand-listed their agents — the common case. On
   * one real machine the card said 10.8B where it meant ~15.9B, with nothing on screen to say
   * which it was.
   */
  const home = await fixtureHome({ codex: false });

  const listed = await sync(home, ["claude-code"]);
  const empty = await sync(home, []);
  const want = `~${formatTokens(CLAUDE_VERIFIED + CLAUDE_UNSEEN)}`;

  assert.ok(listed.includes(want), `an explicit claude-code should headline ${want}`);
  assert.ok(empty.includes(want), `and so should the default, empty list`);
});

test("the estimate extends the total rather than replacing it", async () => {
  /*
   * The headline is labelled TOKENS and covers every agent, but the estimate it printed was
   * `ClaudeReadings.estimated` — Claude Code's own figure. Every other agent's tokens fell out
   * of the total the moment an estimate existed: 55.8M of Codex and OpenCode on the machine
   * this was found on, and most of the total on a Codex-heavy one.
   */
  const home = await fixtureHome();
  const stdout = await sync(home, []);

  const want = `~${formatTokens(CLAUDE_VERIFIED + CODEX + CLAUDE_UNSEEN)}`;
  const claudeOnly = `~${formatTokens(CLAUDE_VERIFIED + CLAUDE_UNSEEN)}`;

  assert.ok(stdout.includes(want), `the headline should be ${want}, every agent plus the unseen days`);
  assert.ok(!stdout.includes(claudeOnly), `${claudeOnly} would mean Codex was dropped from the total`);
});

test("an agents list that excludes claude-code says nothing about it", async () => {
  // The opt-out has to keep working: naming other agents is a real way to exclude this one.
  const home = await fixtureHome();
  const stdout = await sync(home, ["codex"]);

  assert.ok(!stdout.includes("~"), "no claude-code means no claude-code estimate");
  assert.ok(stdout.includes(formatTokens(CODEX)), "and the agent that was asked for is still read");
});

test("history survives the logs being deleted", async () => {
  /*
   * The whole point of the ledger, end to end.
   *
   * Six days of transcripts are read and banked. Then the transcript file is deleted, exactly
   * as `cleanupPeriodDays` would eventually do, and the same config home syncs again. Without
   * the bank the second run finds nothing and fails; with it, the total is unchanged.
   */
  const home = await fixtureHome({ codex: false });
  const xdg = await mkdtemp(join(tmpdir(), "tokenchit-est-cfg-"));

  const first = await sync(home, [], xdg);
  assert.ok(first.includes("~900"), "the first run reads the logs and banks them");
  assert.ok(!first.includes("ledger restored"), "with nothing yet lost, it stays quiet");

  await rm(join(home, ".claude", "projects", "p", "s.jsonl"));

  const second = await sync(home, [], xdg);
  assert.ok(second.includes("~900"), "the total is the same with no transcripts left");
  assert.ok(second.includes("ledger restored 6 days"), "and it says where that came from");
});

test("a run with no bank and no logs still fails honestly", async () => {
  // The ledger must not turn "nothing here" into a silent success on a fresh machine.
  const home = await mkdtemp(join(tmpdir(), "tokenchit-est-bare-"));
  await assert.rejects(() => sync(home, []), /No usage found/);
});

test("usage from before the daily window is priced, not dropped", async () => {
  /*
   * `modelUsage` is cumulative for the life of the profile; `dailyModelTokens` is a rotating
   * window. Once the window starts rotating the rollup outruns it, and that difference is real
   * usage from before the window — which the day loop can never reach, because there is no day
   * left to walk. On one real machine that was 1.11B records the headline simply omitted, and
   * the gap grows every night as more days rotate out.
   *
   * Here the rollup carries 1200 more than its days list. Deflated by the 2x calibrated on the
   * overlap, that is 600 of real work, on top of the 300 from the deleted day.
   */
  const home = await fixtureHome({ codex: false, rollup: 3000 });
  const out = await sync(home, []);

  const want = `~${formatTokens(CLAUDE_VERIFIED + CLAUDE_UNSEEN + 600)}`;
  assert.ok(out.includes(want), `the headline should reach ${want}, got:\n${out}`);
  assert.ok(
    out.includes(formatTokens(600)),
    "and the readings block should name the part with no day attached",
  );
});

test("the readings block dates the history from the install, not the window", async () => {
  /*
   * The transcripts begin where retention last stopped and the daily window begins where it
   * rotated, so neither can say when the profile was installed. `firstSessionDate` can, it is
   * in every cache, and nothing read it — so a card covering five months implied five months
   * of coverage it did not have.
   */
  const home = await fixtureHome({ codex: false, rollup: 3000, firstSession: "2026-06-02" });
  const out = await sync(home, []);

  assert.ok(out.includes("2026-06-02"), `the install date should appear, got:\n${out}`);
});

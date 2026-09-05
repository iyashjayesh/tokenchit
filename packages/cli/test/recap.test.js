import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

/** Local noon on a given day, as the ISO instant a transcript would carry. */
const noon = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).toISOString();

test("recap agrees with sync once retention has taken a day", async () => {
  /*
   * `recap` read `aggregate(readAll(...))` directly while `sync` and `publish` went through
   * `scan`, which merges the logs with the ledger. So the moment retention deleted a day the two
   * commands answered differently about the same machine — and the recap, whose entire subject
   * is a year of history, was the one that under-reported.
   *
   * The assertion is agreement rather than a fixed number: what matters is that one machine has
   * one answer, whichever command asks.
   */
  const home = await mkdtemp(join(tmpdir(), "tokenchit-recap-home-"));
  const cfg = join(home, ".claude");
  const transcript = join(cfg, "projects", "p", "s.jsonl");
  await mkdir(dirname(transcript), { recursive: true });
  await writeFile(
    transcript,
    JSON.stringify({
      type: "assistant",
      requestId: "r1",
      timestamp: noon(2026, 3, 15),
      message: {
        id: "m1",
        role: "assistant",
        model: "claude-opus-5",
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }) + "\n",
  );

  // One config home across every run, so the ledger banked by the first survives into the rest.
  const xdg = await mkdtemp(join(tmpdir(), "tokenchit-recap-cfg-"));
  const cwd = await mkdtemp(join(tmpdir(), "tokenchit-recap-"));
  await writeFile(
    join(cwd, ".tokenchit.json"),
    JSON.stringify({ handle: "qa", agents: [], output: "c.svg", layout: "default", theme: "auto" }),
  );

  const cmd = async (...args) => {
    const { stdout } = await run(process.execPath, [CLI, ...args], {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: "",
        XDG_CONFIG_HOME: xdg,
        USERPROFILE: home,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    const body = stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1);
    const parsed = JSON.parse(body);
    return parsed.tokens ?? parsed.tiles.totalTokens;
  };

  const before = { sync: await cmd("sync", "--json"), recap: await cmd("recap", "--json", "--year", "2026") };
  assert.equal(before.sync, 1500, "the transcript is read while it exists");

  // Retention takes the file. The ledger banked it on the runs above.
  await rm(transcript);

  const after = { sync: await cmd("sync", "--json"), recap: await cmd("recap", "--json", "--year", "2026") };
  assert.equal(after.sync, 1500, "sync restores the day from the ledger");
  assert.equal(
    after.recap,
    after.sync,
    "and recap reports the same machine — reading the logs directly, it would report nothing",
  );
});

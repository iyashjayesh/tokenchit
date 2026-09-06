import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "dist", "index.js");
const BUILD = join(HERE, "..", ".build");

const cli = async (args) => {
  const cwd = await mkdtemp(join(tmpdir(), "tokenchit-args-"));
  const home = await mkdtemp(join(tmpdir(), "tokenchit-home-"));
  try {
    return await run(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), NO_COLOR: "1" },
    });
  } catch (err) {
    return err;
  }
};

/*
 * The argument layer had no test at all, and it shipped a regression that a ten-line one would
 * have caught: an ALLOWED table maintained by hand beside the help table drifted from it, so
 * six documented flags were rejected as unknown by the published build — the CLI refused
 * `--every hourly` and then printed the page documenting `--every hourly`.
 *
 * Both directions are checked. A documented flag that is not accepted is the regression that
 * happened; an accepted flag that is not documented is the same bug walking the other way,
 * and is how the first list drifted in the first place.
 */
test("every documented flag is accepted, and every accepted flag is documented", async () => {
  const { COMMANDS, allowedFlags, flagName } = await import(join(BUILD, "help.js"));

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const allowed = allowedFlags(name);
    for (const [documented] of cmd.flags ?? []) {
      assert.ok(
        allowed.includes(flagName(documented)),
        `\`tokenchit ${name}\` documents ${flagName(documented)} but the guard rejects it`,
      );
    }
  }

  // The reverse: anything the guard accepts must be reachable from the help table, either on
  // the command itself or on one of the commands it forwards to.
  const { GLOBAL } = await import(join(BUILD, "help.js"));
  const documentedAnywhere = new Set([
    ...Object.values(COMMANDS).flatMap((c) => (c.flags ?? []).map(([f]) => flagName(f))),
    ...GLOBAL.map(flagName),
  ]);
  for (const name of Object.keys(COMMANDS)) {
    for (const f of allowedFlags(name)) {
      assert.ok(documentedAnywhere.has(f), `\`tokenchit ${name}\` accepts undocumented ${f}`);
    }
  }
});

test("the flags the help page documents actually run", async () => {
  // The unit test above compares two tables; this one spends the process to prove the tables
  // describe the shipped binary. --dry-run keeps every one of these local and silent.
  const cases = [
    ["schedule", "--every", "daily"],
    ["schedule", "--cron"],
    ["publish", "--no-browser", "--no-clipboard", "--dry-run"],
    ["sync", "--dry-run", "--layout", "compact"],
    ["recap", "--dry-run", "--year", "2026"],
  ];

  for (const args of cases) {
    const result = await cli(args);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.ok(
      !/unknown flags?:/.test(output),
      `\`tokenchit ${args.join(" ")}\` was rejected by the flag guard:\n${output}`,
    );
  }
});

test("a valued flag with no value is refused rather than silently defaulted", async () => {
  // `publish --api` used to resolve to undefined and fall through to the production default,
  // so a rehearsal aimed at a local server published a real row.
  for (const args of [
    ["publish", "--api"],
    ["sync", "--handle", "--dry-run"],
    ["sync", "--out="],
  ]) {
    const result = await cli(args);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.match(output, /needs a value/, `\`tokenchit ${args.join(" ")}\` accepted an empty value`);
  }
});

test("a flag that takes no value does not swallow the argument after it", async () => {
  // --cron was listed as valued, so the guard skipped whatever followed it and an unknown
  // flag walked straight through the check that exists to catch it.
  const result = await cli(["schedule", "--cron", "--bogus"]);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.match(output, /unknown flag: --bogus/);
});

test("every command in COMMANDS is dispatched and appears in the help", async () => {
  // The list this replaces was hardcoded, and omitted `ledger` — which is how a fully
  // implemented, carefully documented command stayed invisible in the summary help.
  const { COMMANDS } = await import(join(BUILD, "help.js"));
  const { stdout: usage } = await cli(["help"]);

  for (const name of Object.keys(COMMANDS)) {
    assert.ok(usage.includes(name), `${name} is missing from the summary help`);
    const { stdout } = await cli(["help", name]);
    assert.ok(stdout.includes(`tokenchit ${name}`), `\`help ${name}\` printed no page`);
  }
});

test("an unknown command suggests the nearest real one", async () => {
  const { nearestCommand } = await import(join(BUILD, "help.js"));
  assert.equal(nearestCommand("ledgers"), "ledger");
  assert.equal(nearestCommand("synch"), "sync");
  assert.equal(nearestCommand("signin"), "login");
  assert.equal(nearestCommand("frobnicate"), undefined, "a wild miss should suggest nothing");
});

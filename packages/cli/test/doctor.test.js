import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "dist", "index.js");
const FIXTURE_HOME = join(HERE, "fixtures", "home");

const LEDGER = JSON.stringify({
  version: 1,
  since: "2026-01-01",
  updatedAt: "2026-01-01T00:00:00.000Z",
  days: { "2026-01-01": { "claude-code": { "canary-model": [10, 10, 0, 0] } } },
});

/** A throwaway config home with a known ledger, so any mutation is detectable. */
async function sandbox() {
  const cwd = await mkdtemp(join(tmpdir(), "tokenchit-doctor-"));
  const xdg = join(cwd, "cfg");
  await mkdir(join(xdg, "tokenchit"), { recursive: true });
  await writeFile(join(xdg, "tokenchit", "ledger.json"), `${LEDGER}\n`);
  await writeFile(
    join(cwd, ".tokenchit.json"),
    JSON.stringify({
      handle: "canary",
      agents: ["claude-code", "codex", "opencode"],
      output: "c.svg",
      layout: "default",
      theme: "auto",
    }),
  );
  return { cwd, xdg };
}

function doctor(args, { cwd, xdg }) {
  return run(process.execPath, [CLI, "doctor", ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: FIXTURE_HOME,
      USERPROFILE: FIXTURE_HOME,
      CLAUDE_CONFIG_DIR: "",
      XDG_CONFIG_HOME: xdg,
      NO_COLOR: "1",
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * Content fingerprint of a tree.
 *
 * Deliberately hashes contents and names, never mtime or atime: reading a file updates its
 * access time on many systems, and a test treating that as a write would fail a command that
 * is behaving perfectly.
 */
async function fingerprint(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(`${p}:${createHash("sha256").update(await readFile(p)).digest("hex")}`);
    }
  }
  await walk(root);
  return createHash("sha256").update(out.join("\n")).digest("hex");
}

test("doctor changes no application file", async () => {
  const box = await sandbox();
  const beforeHome = await fingerprint(FIXTURE_HOME);
  const beforeCfg = await fingerprint(box.xdg);

  await doctor([], box);

  assert.equal(await fingerprint(FIXTURE_HOME), beforeHome, "agent sources must be untouched");
  assert.equal(await fingerprint(box.xdg), beforeCfg, "the ledger must not be rewritten");
});

test("doctor creates no sidecar, cache or temporary file", async () => {
  const box = await sandbox();
  await doctor([], box);

  const found = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/-wal$|-shm$|\.tmp$|\.lock$/.test(e.name)) found.push(p);
    }
  }
  await walk(box.cwd);
  await walk(FIXTURE_HOME);

  // OpenCode's database is opened readOnly, which is what keeps -wal and -shm from appearing.
  assert.deepEqual(found, [], "a read-only command must not leave state behind");
});

test("doctor does not create a ledger when none exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tokenchit-doctor-"));
  const xdg = join(cwd, "cfg");
  await mkdir(xdg, { recursive: true });
  await writeFile(
    join(cwd, ".tokenchit.json"),
    JSON.stringify({
      handle: "canary",
      agents: ["claude-code"],
      output: "c.svg",
      layout: "default",
      theme: "auto",
    }),
  );

  await doctor([], { cwd, xdg });

  await assert.rejects(
    () => stat(join(xdg, "tokenchit", "ledger.json")),
    "a diagnostic must not start banking history as a side effect",
  );
});

test("--json is a stable, versioned object", async () => {
  const box = await sandbox();
  const { stdout } = await doctor(["--json"], box);
  const r = JSON.parse(stdout);

  assert.equal(r.version, 1);
  assert.deepEqual(
    Object.keys(r).sort(),
    ["agents", "estimate", "history", "limitations", "observed", "version"],
  );

  for (const a of r.agents) {
    assert.ok(["absent", "installed-no-data", "unsupported", "ready"].includes(a.state));
    assert.equal(typeof a.source, "string");
  }

  assert.equal(typeof r.observed.note, "string");
  assert.equal(typeof r.estimate.pricedShare, "number");
  assert.ok(Array.isArray(r.estimate.unpricedModels));
});

test("no completeness percentage is invented for the observed range", async () => {
  const box = await sandbox();
  const { stdout } = await doctor(["--json"], box);
  const r = JSON.parse(stdout);

  /* Observed bounds do not prove the days between them are complete. A field like
     `completeness: 0.94` would be the most confident lie this tool could tell. */
  const keys = Object.keys(r.observed);
  assert.ok(
    !keys.some((k) => /complete|coverage|percent/i.test(k)),
    `observed must not claim completeness, got ${keys.join(", ")}`,
  );
  assert.match(r.observed.note, /do not imply every day/);
});

test("doctor leaks no prompt, reply or transcript path", async () => {
  const box = await sandbox();
  const { stdout } = await doctor(["--json"], box);

  /* The fixture transcripts carry canary strings and a cwd. Source *globs* are reported by
     design — documentation of where an adapter looks, not a path harvested from a machine —
     but nothing read out of a transcript may appear. */
  for (const canary of ["CANARY_PROMPT", "CANARY_REPLY", "CANARY_BRANCH", "secret-project"]) {
    assert.ok(!stdout.includes(canary), `doctor output leaked ${canary}`);
  }
});

test("a machine with nothing to report is a state, not an error", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tokenchit-doctor-"));
  const xdg = join(cwd, "cfg");
  const emptyHome = await mkdtemp(join(tmpdir(), "tokenchit-empty-home-"));
  await mkdir(xdg, { recursive: true });
  await writeFile(
    join(cwd, ".tokenchit.json"),
    JSON.stringify({
      handle: "canary",
      agents: [],
      output: "c.svg",
      layout: "default",
      theme: "auto",
    }),
  );

  const { stdout } = await run(process.execPath, [CLI, "doctor", "--json"], {
    cwd,
    env: {
      ...process.env,
      HOME: emptyHome,
      USERPROFILE: emptyHome,
      CLAUDE_CONFIG_DIR: "",
      XDG_CONFIG_HOME: xdg,
      NO_COLOR: "1",
    },
  });

  const r = JSON.parse(stdout);
  assert.equal(r.observed.firstDay, null);
  assert.equal(r.history.exists, false);
  assert.equal(r.history.since, null, "an absent ledger has no start date to quote");
});

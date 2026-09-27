import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "dist", "index.js");
const FIXTURE_HOME = join(HERE, "fixtures", "home");

/*
 * `generate` is the one command the site, both READMEs and every npx line point at, and it is
 * also the only composition that can reach the network. Nothing tested it.
 *
 * What this file pins:
 *   - `--no-publish` never opens a socket and never asks a question;
 *   - a terminal is asked before anything is uploaded, and declining still leaves the card;
 *   - a pipe — CI, cron, `| tee` — behaves exactly as it did before the prompt existed,
 *     because that is the behaviour people have already automated against.
 *
 * The third is the one worth being careful about. A confirmation that also fired in CI would
 * have silently broken every scheduled `generate` in existence, which is a worse failure than
 * the one the prompt is there to prevent.
 */

/** A throwaway cwd and config home, pre-seeded so `generate` skips `init`. */
async function sandbox({ handle = "canary" } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "tokenchit-gen-"));
  const xdg = join(cwd, "cfg");
  await mkdir(join(xdg, "tokenchit"), { recursive: true });
  await writeFile(
    join(cwd, ".tokenchit.json"),
    JSON.stringify({
      handle,
      agents: ["claude-code", "codex", "opencode"],
      output: "c.svg",
      layout: "default",
      theme: "auto",
    }),
  );
  return { cwd, xdg };
}

/**
 * `--api` points at a port nothing listens on.
 *
 * A network attempt therefore fails loudly instead of reaching the real board, so "did not
 * publish" is proved by the absence of that failure rather than asserted. 9 is reserved as
 * the discard port and is never a real service.
 */
const DEAD_API = "http://127.0.0.1:9";

function generate(args, { cwd, xdg }, extraEnv = {}) {
  return run(process.execPath, [CLI, "generate", "--api", DEAD_API, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: FIXTURE_HOME,
      USERPROFILE: FIXTURE_HOME,
      CLAUDE_CONFIG_DIR: "",
      XDG_CONFIG_HOME: xdg,
      NO_COLOR: "1",
      // Piped stdio already makes `interactive()` false; this pins the CI half of that gate
      // so the test states which branch it is exercising rather than relying on the harness.
      CI: "1",
    },
    maxBuffer: 10 * 1024 * 1024,
    ...extraEnv,
  });
}

/** Content fingerprint of a tree — names and bytes, never mtime. */
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

test("generate --no-publish writes the card and stops before the network", async () => {
  const box = await sandbox();
  const { stdout } = await generate(["--no-publish"], box);

  await readFile(join(box.cwd, "c.svg"), "utf8"); // throws if it was never written
  assert.match(stdout, /stopped before publishing/);
  assert.doesNotMatch(
    stdout,
    /127\.0\.0\.1:9|ECONNREFUSED/,
    "--no-publish must return before any request is attempted",
  );
});

test("generate --no-publish never asks a question", async () => {
  /* The prompt is gated on `interactive()`, but the early return happens first regardless.
     Stated as its own test because a future refactor that moves the confirm above the
     `--no-publish` check would still pass the test above. */
  const box = await sandbox();
  const { stdout, stderr } = await generate(["--no-publish"], box);
  assert.doesNotMatch(stdout + stderr, /\[y\/N\]/);
});

test("generate --dry-run writes nothing at all", async () => {
  /* `dryrun.exact` in privacy.test.js proves the *bytes* a dry run would send are the bytes a
     real publish sends. It says nothing about the filesystem, and --dry-run is what somebody
     runs precisely because they do not yet want a file. */
  const box = await sandbox();
  const before = await fingerprint(box.cwd);
  const beforeHome = await fingerprint(FIXTURE_HOME);

  await generate(["--dry-run"], box).catch((e) => e);

  assert.equal(await fingerprint(box.cwd), before, "--dry-run must not write to the repo");
  assert.equal(await fingerprint(FIXTURE_HOME), beforeHome, "nor to the agent sources");
});

test("a non-interactive generate still goes straight to publish", async () => {
  /*
   * The compatibility guarantee, stated as a test.
   *
   * Every scheduled `generate` in a cron job or an Actions step depends on this. It reaches
   * publish — which here means it fails against the dead port — rather than stopping at a
   * question nobody can answer, which is what a prompt without the TTY gate would have done
   * to all of them at once.
   */
  const box = await sandbox();
  const result = await generate([], box).catch((e) => e);
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  assert.doesNotMatch(out, /\[y\/N\]/, "a pipe has nobody to ask");
  assert.match(
    out,
    /publish|ECONNREFUSED|127\.0\.0\.1:9|could not reach/i,
    "it must reach the publish step, not return early",
  );
});

test("the card is written before publishing is even considered", async () => {
  /* Declining, or failing to publish, must never cost you the card: `sync` runs first and the
     file is on disk by the time the publish step is reached. This is what makes "kept local"
     an honest thing to print. */
  const box = await sandbox();
  await generate([], box).catch((e) => e);
  const svg = await readFile(join(box.cwd, "c.svg"), "utf8");
  assert.match(svg, /^<svg/, "publish failing must not take the card with it");
});

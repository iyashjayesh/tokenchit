import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "dist", "index.js");
const SRC = join(HERE, "..", "src");
// init refuses to write a config when it finds no agents, so it needs a HOME that has one.
const FIXTURE_HOME = join(HERE, "fixtures", "home");

async function sandbox() {
  const home = await mkdtemp(join(tmpdir(), "tokenstats-home-"));
  const cwd = await mkdtemp(join(tmpdir(), "tokenstats-cwd-"));
  return { home, cwd };
}

const cli = (args, { home, cwd }, extra = {}) =>
  run(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), NO_COLOR: "1", ...extra },
  });

test("credentials live outside the repo, never in the committed config", async () => {
  const box = await sandbox();

  // init writes the file that gets committed. It must never gain a credential field.
  await cli(["init", "--handle", "octocat"], { ...box, home: FIXTURE_HOME });
  const config = JSON.parse(await readFile(join(box.cwd, ".tokenstats.json"), "utf8"));

  assert.deepEqual(
    Object.keys(config).sort(),
    ["agents", "handle", "layout", "output", "theme"],
    "config gained a field — make sure it is not a credential",
  );
  for (const key of ["token", "apiKey", "secret", "githubToken", "password"]) {
    assert.ok(!(key in config), `${key} must not be written to a committed file`);
  }
});

test("the auth file is owner-only and lives under the config directory", async () => {
  const box = await sandbox();
  const { writeAuth, authFile } = await import(join(HERE, "..", "dist", "auth.js"));

  process.env["XDG_CONFIG_HOME"] = join(box.home, ".config");
  const path = await writeAuth({
    token: "tc_test",
    handle: "octocat",
    api: "http://localhost",
    createdAt: new Date().toISOString(),
  });

  assert.equal(path, authFile());
  assert.ok(path.includes(join(".config", "tokenstats")), `unexpected location: ${path}`);

  // 0600. A world-readable credential on a shared machine is the same as no credential.
  const mode = (await stat(path)).mode & 0o777;
  assert.equal(mode.toString(8), "600");
});

test("whoami exits non-zero when signed out, so scripts can branch on it", async () => {
  const box = await sandbox();
  await assert.rejects(() => cli(["whoami"], box), (err) => err.code === 1);
});

test("no client secret is anywhere in the shipped source", async () => {
  // Device flow uses none, so any secret-shaped constant here is a mistake rather than a
  // requirement. The client ID is public and expected.
  const files = await walk(SRC);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.ok(
      !/client_secret/i.test(text),
      `${file} mentions client_secret — device flow does not use one`,
    );
    // A GitHub OAuth client secret is 40 hex characters.
    const hex40 = text.match(/\b[0-9a-f]{40}\b/g);
    assert.equal(hex40, null, `${file} contains a 40-char hex string that looks like a secret`);
  }
});

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "dist", "index.js");
const FIXTURE_HOME = join(HERE, "fixtures", "home");
const SRC = join(HERE, "..", "src");
const CORE_SRC = join(HERE, "..", "..", "core", "src");

/**
 * These four tests are the ones the site prints as `privacy.spec.ts` output, under the
 * heading "Not a policy page. Output from npm test on the current commit." They exist so
 * that claim is true. If one is renamed here, rename it on the page too.
 */

/** Run the CLI in a sandbox whose HOME contains only the fixture transcripts. */
async function cli(args, extraEnv = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "tokencard-test-"));
  await writeFile(
    join(cwd, ".tokencard.json"),
    JSON.stringify({ handle: "canary", agents: ["claude-code"], output: "c.svg", layout: "default", theme: "auto" }),
  );

  return run(process.execPath, [CLI, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: FIXTURE_HOME,
      USERPROFILE: FIXTURE_HOME,
      NO_COLOR: "1",
      ...extraEnv,
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

/** Everything before the trailing human-readable summary is the payload itself. */
const payloadFrom = (stdout) => stdout.slice(0, stdout.lastIndexOf("}") + 1);

test("payload.noContent", async () => {
  const { stdout } = await cli(["publish", "--dry-run"]);
  const body = payloadFrom(stdout);

  // The fixture transcript carries a prompt, an assistant reply and a branch name, all
  // marked with a canary. None of them describe usage, so none may survive into a payload.
  for (const canary of ["CANARY_PROMPT_a7f3", "CANARY_REPLY_a7f3", "CANARY_BRANCH_a7f3"]) {
    assert.ok(!body.includes(canary), `${canary} leaked into the payload`);
  }

  // And the usage really was read, so the absence above is not just an empty payload.
  const parsed = JSON.parse(body);
  assert.equal(parsed.tokens, 1595, "120+60+400+900 + 10+5+0+100");
});

test("paths.absent", async () => {
  const { stdout } = await cli(["publish", "--dry-run"]);
  const body = payloadFrom(stdout);

  // We never collect paths, which is a stronger guarantee than hashing them. The fixture's
  // cwd is a path we would have had every opportunity to include.
  for (const fragment of ["/Users/", "secret-project", "auth.ts", ".jsonl", FIXTURE_HOME]) {
    assert.ok(!body.includes(fragment), `"${fragment}" appeared in the payload`);
  }
  assert.ok(!/[A-Za-z]:\\/.test(body), "a Windows path appeared in the payload");

  const parsed = JSON.parse(body);
  assert.deepEqual(
    Object.keys(parsed).sort(),
    [
      "activeDays", "agents", "clientVersion", "days", "equivCostUsd", "firstDay",
      "handle", "lastDay", "models", "pricedShare", "streakDays", "tokens",
    ],
    "payload gained a field — confirm it cannot carry content before updating this list",
  );
});

test("dryrun.exact", async () => {
  const { stdout } = await cli(["publish", "--dry-run"]);
  const printed = payloadFrom(stdout);

  // Record what a real publish actually puts on the wire, and compare the bytes.
  let received = null;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received = Buffer.concat(chunks).toString("utf8");
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, tier: "cli" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await cli(["publish", "--api", `http://127.0.0.1:${port}`]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.ok(received !== null, "the server received nothing");
  assert.equal(received, printed, "--dry-run printed something other than what was sent");
});

test("net.isolated", async () => {
  // Anything that could open a socket. Matched as call and import shapes rather than as the
  // substring "http", because the SVG builder legitimately contains an xmlns URL.
  const forbidden = [
    /\bfetch\s*\(/,
    /from\s+["']node:(http|https|net|tls|dgram|dns)["']/,
    /require\(\s*["']node:(http|https|net|tls|dgram|dns)["']\s*\)/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
  ];

  const ALLOWED = join(SRC, "net.ts");
  const offenders = [];

  for (const root of [SRC, CORE_SRC]) {
    for (const file of await walk(root)) {
      if (file === ALLOWED) continue;
      const text = await readFile(file, "utf8");
      // Strip comments first, so prose about the network is not mistaken for the network.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const pattern of forbidden) {
        if (pattern.test(code)) offenders.push(`${file.replace(HERE, ".")}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(offenders, [], "network access outside packages/cli/src/net.ts");

  // The allowlisted module must actually be the one doing it, or this test passes vacuously
  // because nothing anywhere makes a request.
  assert.match(await readFile(ALLOWED, "utf8"), /\bfetch\s*\(/);
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

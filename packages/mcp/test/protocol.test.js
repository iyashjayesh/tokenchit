import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..", "dist", "index.js");
/* The CLI's fixture home, reused rather than duplicated: two copies of the same transcripts
   drift, and a figure that differs between the CLI and this server is the bug most worth
   catching. */
const FIXTURE_HOME = join(HERE, "..", "..", "cli", "test", "fixtures", "home");

/**
 * Send some frames, close stdin, and collect what came back.
 *
 * Closing stdin immediately is deliberate and is itself the regression test for the
 * shutdown race: the server must finish answering everything it accepted before exiting.
 */
async function talk(frames) {
  const xdg = await mkdtemp(join(tmpdir(), "tokenchit-mcp-test-"));

  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      HOME: FIXTURE_HOME,
      USERPROFILE: FIXTURE_HOME,
      // This machine sets CLAUDE_CONFIG_DIR and the adapter honours it, so it has to be
      // cleared or the fixture is ignored and the test reads real logs.
      CLAUDE_CONFIG_DIR: "",
      XDG_CONFIG_HOME: xdg,
      NO_COLOR: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let out = "";
  let err = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (err += c));

  for (const f of frames) child.stdin.write(`${JSON.stringify(f)}\n`);
  child.stdin.end();

  const code = await new Promise((resolve) => child.on("close", resolve));
  const messages = out
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  return { messages, err, code, raw: out };
}

const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
const call = (id, name, args = {}) => rpc(id, "tools/call", { name, arguments: args });
const find = (messages, id) => messages.find((m) => m.id === id);
const payload = (message) => JSON.parse(message.result.content[0].text);

test("initialize advertises tools and a protocol version", async () => {
  const { messages } = await talk([rpc(1, "initialize", { protocolVersion: "2025-06-18" })]);
  const res = find(messages, 1).result;

  assert.equal(typeof res.protocolVersion, "string");
  assert.deepEqual(Object.keys(res.capabilities), ["tools"]);
  assert.equal(res.serverInfo.name, "tokenchit");
  // The instructions carry the two caveats a model would otherwise get wrong unprompted.
  assert.match(res.instructions, /network request/i);
  assert.match(res.instructions, /list API rates/i);
});

test("tools/list names every tool with a schema", async () => {
  const { messages } = await talk([rpc(1, "tools/list")]);
  const { tools } = find(messages, 1).result;

  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["detect_agents", "get_daily_usage", "get_recap", "get_usage"],
  );
  for (const t of tools) {
    assert.equal(t.inputSchema.type, "object", `${t.name} has an object schema`);
    assert.ok(t.description.length > 20, `${t.name} is described`);
  }
});

test("a tool call still answers when stdin closes behind it", async () => {
  // The shutdown race: the server used to exit on stdin end while a read was in flight, so
  // this reply was silently dropped. Two calls, so a partial drain would also show up.
  const { messages, code } = await talk([call(1, "detect_agents"), call(2, "get_usage")]);

  assert.ok(find(messages, 1), "detect_agents answered");
  assert.ok(find(messages, 2), "get_usage answered");
  assert.equal(code, 0);
});

test("detect_agents reads the fixture and names what it cannot support", async () => {
  const { messages } = await talk([call(1, "detect_agents")]);
  const out = payload(find(messages, 1));

  assert.deepEqual(out.agents.map((a) => a.agent).sort(), ["claude-code", "codex", "opencode"]);
  for (const a of out.agents) assert.ok(a.source, `${a.agent} says where it reads from`);
  assert.deepEqual(out.unsupported.map((u) => u.agent), ["copilot-cli", "gemini-cli"]);
  for (const u of out.unsupported) assert.ok(u.reason, `${u.agent} says why`);
});

test("get_usage returns figures with both caveats attached", async () => {
  const { messages } = await talk([call(1, "get_usage")]);
  const out = payload(find(messages, 1));

  assert.equal(typeof out.tokens, "number");
  assert.ok(out.tokens > 0, "the fixture has usage");
  assert.equal(typeof out.tokensHuman, "string");
  /* The caveats are asserted because they are the whole reason the figures are safe to hand
     to a model: without them `equivCostUsd` gets reported to a user as money they spent. */
  assert.match(out.equivCostNote, /subscription/i);
  assert.match(out.accuracyNote, /Stats panel/i);
  assert.ok("pricedShareOfTokens" in out, "cost coverage is stated");
  /* `yearToDate`, not `year`: beside last30Days/last7Days the old name read as a trailing
     twelve months, and aggregate() builds the bucket from 1 January. */
  for (const w of ["all", "yearToDate", "last30Days", "last7Days"]) {
    assert.ok(w in out.windows, `windows.${w}`);
  }
  assert.ok(!("year" in out.windows), "the ambiguous `year` key is gone");
});

test("get_usage honours the agents filter", async () => {
  const { messages } = await talk([call(1, "get_usage", { agents: ["claude-code"] })]);
  const out = payload(find(messages, 1));

  assert.deepEqual(Object.keys(out.byAgent), ["claude-code"]);
});

test("an unknown agent in the filter does not silently read everything", async () => {
  const [all, bogus] = await Promise.all([
    talk([call(1, "get_usage")]),
    talk([call(1, "get_usage", { agents: ["not-an-agent"] })]),
  ]);

  /* An unrecognised filter falls back to every agent rather than to none — returning zero
     would read as "you have no usage", which is a wrong answer rather than a rejected one. */
  assert.equal(payload(find(bogus.messages, 1)).tokens, payload(find(all.messages, 1)).tokens);
});

test("get_daily_usage clamps the range and reports what it returned", async () => {
  const { messages } = await talk([call(1, "get_daily_usage", { days: 7 })]);
  const out = payload(find(messages, 1));

  assert.equal(out.requestedDays, 7);
  assert.equal(out.lifetimeByWeekdayMondayFirst.length, 7);
  assert.equal(out.lifetimeByHourLocal.length, 24);
});

test("get_recap returns tiles and a per-agent split", async () => {
  const { messages } = await talk([call(1, "get_recap")]);
  const out = payload(find(messages, 1));

  assert.equal(typeof out.year, "number");
  assert.ok("totalTokens" in out.tiles);
  assert.ok(Array.isArray(out.agents));
  assert.ok(Array.isArray(out.activityByWeekday));
});

test("an unknown tool is a JSON-RPC error, a failing tool is not", async () => {
  const { messages } = await talk([call(1, "no_such_tool")]);
  const msg = find(messages, 1);

  assert.equal(msg.error.code, -32601);
  assert.match(msg.error.message, /unknown tool/);
});

test("malformed input is reported without killing the server", async () => {
  const xdg = await mkdtemp(join(tmpdir(), "tokenchit-mcp-test-"));
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, HOME: FIXTURE_HOME, CLAUDE_CONFIG_DIR: "", XDG_CONFIG_HOME: xdg },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => (out += c));

  child.stdin.write("this is not json\n");
  child.stdin.write(`${JSON.stringify(rpc(2, "tools/list"))}\n`);
  child.stdin.end();

  await new Promise((resolve) => child.on("close", resolve));
  const messages = out.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  assert.equal(messages[0].error.code, -32700);
  // The frame after the bad one is still served: one unparseable line must not end the session.
  assert.ok(find(messages, 2).result.tools.length > 0);
});

test("a notification is not answered", async () => {
  const { messages } = await talk([
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", method: "notifications/something/unheard/of" },
    rpc(9, "tools/list"),
  ]);

  // Exactly one reply, for the one request that carried an id.
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 9);
});

test("stdout carries protocol frames and nothing else", async () => {
  /* The rule that makes stdio transport work at all. A stray console.log anywhere under
     these calls corrupts the stream, and it corrupts it for the client rather than here,
     so it has to be caught by a test. */
  const { raw, err } = await talk([
    rpc(1, "initialize", {}),
    call(2, "get_usage"),
    call(3, "get_recap"),
    call(4, "detect_agents"),
  ]);

  for (const line of raw.split("\n").filter((l) => l.trim())) {
    assert.doesNotThrow(() => JSON.parse(line), `stdout line is JSON: ${line.slice(0, 80)}`);
    assert.equal(JSON.parse(line).jsonrpc, "2.0");
  }
  // The SQLite experimental warning is filtered, so a clean run says nothing at all.
  assert.equal(err.trim(), "", `stderr should be quiet, got: ${err.slice(0, 200)}`);
});

test("a frame split across reads is still parsed", async () => {
  const xdg = await mkdtemp(join(tmpdir(), "tokenchit-mcp-test-"));
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, HOME: FIXTURE_HOME, CLAUDE_CONFIG_DIR: "", XDG_CONFIG_HOME: xdg },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => (out += c));

  // Deliberately mid-object, in three writes. Parsing per chunk passes every hand test and
  // then fails on the first payload big enough for the kernel to split.
  const frame = JSON.stringify(rpc(1, "tools/list"));
  child.stdin.write(frame.slice(0, 12));
  await new Promise((r) => setTimeout(r, 30));
  child.stdin.write(frame.slice(12, 25));
  await new Promise((r) => setTimeout(r, 30));
  child.stdin.write(`${frame.slice(25)}\n`);
  child.stdin.end();

  await new Promise((resolve) => child.on("close", resolve));
  const messages = out.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  assert.equal(messages.length, 1);
  assert.ok(messages[0].result.tools.length > 0);
});

/* ---------------------------------------------------------------------------
   Regressions. Each of these is a bug that shipped past the tests above, so
   each one names the wrong behaviour rather than just asserting the right one.
   --------------------------------------------------------------------------- */

test("get_recap scopes every figure to the year, not just the streak", async () => {
  // `buildRecap` uses `year` for the longestStreak tile and nothing else; the rest of the
  // figures come from the stats it is handed. Without threading `year` into `aggregate`,
  // asking for 2021 returned this year's totals under a 2021 heading.
  const [now, old] = await Promise.all([
    talk([call(1, "get_recap")]),
    talk([call(1, "get_recap", { year: 2021 })]),
  ]);

  const current = payload(find(now.messages, 1));
  const past = payload(find(old.messages, 1));

  assert.ok(current.tokens > 0, "the fixture has usage in the current year");
  assert.equal(past.year, 2021);
  assert.equal(past.tokens, 0, "2021 has no usage in the fixture");
  assert.equal(past.activeDays, 0);
  assert.notEqual(past.tokens, current.tokens, "a past year must not echo the current one");
});

test("get_recap ignores a year the logs cannot cover", async () => {
  // The schema states 2020-2100 and nothing enforced it, so `year: 2030` returned all-time
  // data stamped 2030. A future year is treated as "not asked" rather than as an error.
  const { messages } = await talk([call(1, "get_recap", { year: 2030 })]);
  const out = payload(find(messages, 1));

  assert.equal(out.year, new Date().getFullYear());
});

test("get_daily_usage returns calendar days, not the last N active days", async () => {
  // `stats.byDay` is sparse, so slicing it returned the last N *active* days — on this
  // fixture, two days a month apart returned as "the last 3 days".
  const { messages } = await talk([call(1, "get_daily_usage", { days: 3 })]);
  const out = payload(find(messages, 1));

  assert.equal(out.returnedDays, 3, "three days requested, three returned");
  assert.equal(out.days.length, 3);

  const dates = out.days.map((d) => d.day);
  assert.deepEqual(dates, [...dates].sort(), "ascending");
  for (let i = 1; i < dates.length; i += 1) {
    const gap = Date.parse(`${dates[i]}T12:00:00Z`) - Date.parse(`${dates[i - 1]}T12:00:00Z`);
    assert.equal(gap, 86_400_000, `${dates[i - 1]} -> ${dates[i]} is one day`);
  }
});

test("a valid-JSON non-object does not kill the server", async () => {
  // `null` has no `id`, so dispatching it threw, and the catch threw the same TypeError
  // re-reading `req.id` — the rejection went unhandled and took the process with it. One
  // frame ended the session. The test above only covered unparseable bytes.
  const xdg = await mkdtemp(join(tmpdir(), "tokenchit-mcp-test-"));
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, HOME: FIXTURE_HOME, CLAUDE_CONFIG_DIR: "", XDG_CONFIG_HOME: xdg },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => (out += c));

  for (const frame of ["null", "42", '"a string"', "[1,2]"]) child.stdin.write(`${frame}\n`);
  child.stdin.write(`${JSON.stringify(rpc(7, "tools/list"))}\n`);
  child.stdin.end();

  const code = await new Promise((resolve) => child.on("close", resolve));
  const messages = out.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  assert.equal(code, 0, "the server exited cleanly rather than crashing");
  for (const m of messages.filter((m) => m.error)) assert.equal(m.error.code, -32600);
  assert.ok(find(messages, 7).result.tools.length > 0, "the frame behind them was still served");
});

test("a reply larger than the pipe buffer is not truncated", async () => {
  /* stdout is a pipe under stdio transport and Node's pipe writes are async, so
     `process.exit` dropped anything still buffered past ~64KB. Ten years of days clears
     that comfortably; the shutdown test above only ever sent tiny payloads. */
  const { messages, raw } = await talk([call(1, "get_daily_usage", { days: 3650 })]);

  assert.ok(raw.length > 65_536, `payload must exceed the pipe buffer, got ${raw.length}`);
  const out = payload(find(messages, 1));
  assert.equal(out.returnedDays, 3650, "every day survived the write");
});

test("initialize reports the package version", async () => {
  // A literal here silently drifted from package.json on the next release, in the one field
  // a client logs and a bug report quotes.
  const { readFile } = await import("node:fs/promises");
  const pkg = JSON.parse(await readFile(join(HERE, "..", "package.json"), "utf8"));
  const { messages } = await talk([rpc(1, "initialize", {})]);

  assert.equal(find(messages, 1).result.serverInfo.version, pkg.version);
});

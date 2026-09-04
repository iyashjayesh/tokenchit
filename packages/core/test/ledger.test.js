import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  bank,
  emptyLedger,
  ledgerSummary,
  readLedger,
  recordAndReplay,
  writeLedger,
} from "../dist/adapters/index.js";

/** An event on a local day, so the tests do not depend on a timezone. */
const on = (d, over = {}) => ({
  agent: "claude-code",
  ts: new Date(2026, 7, d, 9, 30, 0),
  model: "claude-opus-5",
  input: 100,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  ...over,
});

const drain = async (it) => {
  const out = [];
  for await (const e of it) out.push(e);
  return out;
};
const stream = async function* (events) {
  for (const e of events) yield e;
};
const total = (events) =>
  events.reduce((a, e) => a + e.input + e.output + e.cacheWrite + e.cacheRead, 0);

test("a day survives its transcripts being deleted", async () => {
  const led = emptyLedger();

  // Monday and Tuesday are read and banked.
  await drain(recordAndReplay(stream([on(3), on(4)]), led));
  assert.equal(ledgerSummary(led).days, 2);

  // Cleanup takes Monday. The logs now only offer Tuesday.
  const after = await drain(recordAndReplay(stream([on(4)]), led));

  assert.equal(total(after), 200, "both days are still counted");
  assert.equal(after.length, 2, "one live event, one topped up from the bank");
  assert.equal(after[1].ts.getHours(), 12, "a recovered day lands at local noon");
});

test("a day that is only half gone is topped up, not taken at its smaller value", async () => {
  /*
   * The case an earlier draft got wrong. Retention does not remove a day at once — it removes
   * the session files that make it up. A day read at 1000 last week and 400 today is present,
   * so a "replay only what is missing" rule would take the 400 and quietly lose 600.
   */
  const led = emptyLedger();
  await drain(recordAndReplay(stream([on(3, { input: 1000 })]), led));

  const after = await drain(recordAndReplay(stream([on(3, { input: 400 })]), led));

  assert.equal(total(after), 1000, "the fullest reading of that day still stands");
  assert.equal(after.length, 2, "the live 400 plus a 600 top-up");
  assert.equal(after[1].input, 600);
});

test("a day that grows is banked at its new value, not its old one", async () => {
  // The normal case: today is read again later and has more in it. Nothing is topped up.
  const led = emptyLedger();
  await drain(recordAndReplay(stream([on(3, { input: 400 })]), led));

  const after = await drain(recordAndReplay(stream([on(3, { input: 1000 })]), led));

  assert.equal(total(after), 1000, "no phantom top-up on top of a fuller reading");
  assert.equal(after.length, 1);
  assert.equal(ledgerSummary(led).tokens, 1000);
});

test("the bank is kept per model, so an unused model is not resurrected as a duplicate", async () => {
  const led = emptyLedger();
  await drain(
    recordAndReplay(
      stream([on(3, { model: "claude-opus-5", input: 500 }), on(3, { model: "claude-sonnet-5", input: 200 })]),
      led,
    ),
  );

  // The same day, read again, with only one of the two models still in the logs.
  const after = await drain(recordAndReplay(stream([on(3, { model: "claude-opus-5", input: 500 })]), led));

  assert.equal(total(after), 700, "the model that vanished is restored, the one that stayed is not doubled");
  assert.deepEqual(
    after.map((e) => [e.model, e.input]),
    [
      ["claude-opus-5", 500],
      ["claude-sonnet-5", 200],
    ],
  );
});

test("a scoped run is not topped up with agents it was not asked to read", async () => {
  // `sync --agents codex` must not have Claude Code days appear in its total, or the card
  // would disagree with the config that produced it.
  const led = emptyLedger();
  await drain(
    recordAndReplay(stream([on(3), on(3, { agent: "codex", model: "gpt-5.5", input: 50 })]), led),
  );

  const after = await drain(recordAndReplay(stream([]), led, ["codex"]));

  assert.equal(total(after), 50, "only the codex day comes back");
  assert.equal(after.every((e) => e.agent === "codex"), true);
});

test("what a run recovered is reported, so sync can say so", async () => {
  const led = emptyLedger();
  await drain(recordAndReplay(stream([on(3), on(4), on(5)]), led));

  const out = { days: 0, tokens: 0 };
  await drain(recordAndReplay(stream([on(5)]), led, undefined, out));

  assert.deepEqual(out, { days: 2, tokens: 200 });
});

test("a fresh run recovers nothing and says so", async () => {
  const led = emptyLedger();
  const out = { days: 0, tokens: 0 };
  await drain(recordAndReplay(stream([on(3)]), led, undefined, out));

  assert.deepEqual(out, { days: 0, tokens: 0 }, "nothing to recover on the first run");
});

test("banking takes a day's total, never its largest single call", async () => {
  // Max-wins is right between readings of the same day and wrong between events within one:
  // a day of ten 100-token calls is 1000, not 100.
  const led = emptyLedger();
  await drain(recordAndReplay(stream([on(3, { input: 100 }), on(3, { input: 100 })]), led));

  assert.equal(ledgerSummary(led).tokens, 200);
});

test("a corrupt or foreign ledger reads as empty rather than throwing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tokenchit-ledger-"));

  const broken = join(dir, "broken.json");
  await writeFile(broken, "{ not json");
  assert.deepEqual((await readLedger(broken)).days, {});

  const future = join(dir, "future.json");
  await writeFile(future, JSON.stringify({ version: 99, days: { "2026-08-03": {} } }));
  assert.deepEqual((await readLedger(future)).days, {}, "an unrecognised version is not guessed at");

  assert.deepEqual((await readLedger(join(dir, "absent.json"))).days, {}, "and neither is a missing file");
});

test("a written ledger reads back as itself", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tokenchit-ledger-"));
  const path = join(dir, "ledger.json");

  const led = emptyLedger();
  bank(led, "2026-08-03", "claude-code", "claude-opus-5", [1, 2, 3, 4]);
  await writeLedger(led, path);

  const back = await readLedger(path);
  assert.deepEqual(back.days, led.days);
  assert.equal(back.since, led.since, "the install date survives a round trip");

  // Written whole, through a rename, so a reader never sees a half-file.
  assert.match(await readFile(path, "utf8"), /^\{.*\}\n$/s);
});

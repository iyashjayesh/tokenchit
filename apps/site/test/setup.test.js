import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { PRIMARY_COMMAND, PUBLISH_COMMAND } from "../lib/cli.ts";
import { CARD_FILE, EMBED_LOCAL, EMBED_NESTED, PATHS, STEPS } from "../lib/setup.ts";

/**
 * The site told visitors that "publishing to the board is a separate step you have to ask
 * for", two screens above a button that copied the one command which published by default.
 *
 * Nothing could catch that, because both halves were prose. There is no DOM testing on this
 * site — no jsdom, no testing-library, and `--experimental-strip-types` does not transform
 * JSX — so the fix is the same one `agents.test.js` uses for the agent list: the claims that
 * can go stale are exported values, and these assert them against the CLI they describe.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..", "..");

test("the command the site leads with cannot publish", () => {
  /* The single most important line in this file. Every npx string on the site — hero, header,
     closing CTA, board empty state, four tool pages, the 404 and the OG image — is this one
     constant, so this is the whole site's guarantee in one assertion. */
  assert.match(PRIMARY_COMMAND, /\s--no-publish\b/, "the primary command must not publish");
  assert.ok(!PUBLISH_COMMAND.includes("--no-publish"), "the publish command must publish");
});

test("no page hard-codes an npx command of its own", async () => {
  /*
   * The regression this exists for: the constant is correct and one page spells it out anyway.
   * That is exactly how the rename from tokenstats left literals behind, and a bare `generate`
   * written by hand is a publish nobody asked for.
   */
  const offenders = [];
  for (const dir of ["app", "components"]) {
    for await (const file of walk(join(SITE, dir))) {
      if (!/\.tsx?$/.test(file)) continue;
      const text = await readFile(file, "utf8");
      // A literal npx invocation, as opposed to an interpolation of PRIMARY_COMMAND.
      const hit = /npx\s+(-y\s+)?@?[\w@/.-]*tokenchit/.exec(text);
      if (hit) offenders.push(`${file.slice(REPO.length + 1)}: ${hit[0]}`);
    }
  }
  assert.deepEqual(offenders, [], "use PRIMARY_COMMAND / PUBLISH_COMMAND, not a literal");
});

test("the local embed snippet is the line the CLI actually prints", async () => {
  /*
   * Compared against the source of the `embed` row in `sync`, not against a copy of it. A
   * reader who copies this from the site and a reader who copies it from their terminal have
   * to end up with the same string, or one of them files a bug about the other.
   */
  const sync = await readFile(join(REPO, "packages", "cli", "src", "commands", "sync.ts"), "utf8");
  const printed = /!\[tokenchit — @\$\{handle\} AI coding agent usage\]\(\.\/\$\{asUrlPath\(rel\)\}\)/;
  assert.match(sync, printed, "sync no longer prints the embed line this page reproduces");

  assert.match(EMBED_LOCAL, /^!\[tokenchit — @.+ AI coding agent usage\]\(\.\/.+\)$/);
  assert.ok(EMBED_LOCAL.endsWith(`(./${CARD_FILE})`));
});

test("the nested embed differs from the local one only in the path", () => {
  /* The pair is the point. If they ever become identical the section is telling people that
     a README one directory down needs no change, which is the mistake it exists to prevent. */
  assert.notEqual(EMBED_LOCAL, EMBED_NESTED);
  assert.equal(EMBED_NESTED, EMBED_LOCAL.replace(`(./${CARD_FILE})`, `(../${CARD_FILE})`));
});

test("every step that shows a command shows a real one", () => {
  for (const step of STEPS) {
    if (!step.command) continue;
    assert.ok(
      /^(npx|git|tokenchit)\b/.test(step.command),
      `step "${step.verb}" shows something that is not a command: ${step.command}`,
    );
  }
  assert.equal(STEPS[0].command, PRIMARY_COMMAND, "the first step must be the primary command");
});

test("each path shows the command it describes", () => {
  const local = PATHS.find((p) => p.key === "local");
  const hosted = PATHS.find((p) => p.key === "hosted");
  assert.equal(local?.command, PRIMARY_COMMAND);
  assert.equal(hosted?.command, PUBLISH_COMMAND);
});

test("both paths state a cost, not only a benefit", () => {
  /* A comparison where one side has no drawbacks is an advertisement with two columns. The
     hosted card's costs are the ones a reader cannot discover for themselves until after
     they have published, which is the wrong time to learn them. */
  for (const path of PATHS) {
    assert.ok(path.costs.length > 0, `${path.key} lists no trade-off`);
    assert.ok(path.gets.length > 0, `${path.key} lists no benefit`);
  }
});

test("the homepage sections are numbered 01..N with no gaps or repeats", async () => {
  /*
   * The numbering is hand-written in five separate components, and inserting a section at the
   * top means renumbering every one of them. Nothing checked that, so two sections could
   * quietly share a number — which on a page whose headings are its only navigation is a
   * wayfinding bug, not a typo.
   */
  const page = await readFile(join(SITE, "app", "page.tsx"), "utf8");
  const order = [...page.matchAll(/<(\w+)[\s/>]/g)]
    .map((m) => m[1])
    .filter((name) => /^[A-Z]/.test(name));

  const numbers = [];
  for (const name of order) {
    const file = join(SITE, "components", `${kebab(name)}.tsx`);
    const text = await readFile(file, "utf8").catch(() => null);
    if (text === null) continue;
    const n = /<SectionHeading\s+n=\{(\d+)\}/.exec(text);
    if (n) numbers.push(Number(n[1]));
  }

  assert.ok(numbers.length >= 5, "found too few numbered sections to be reading the right page");
  assert.deepEqual(
    numbers,
    numbers.map((_, i) => i + 1),
    `section numbers must run 1..${numbers.length} in page order, got ${numbers.join(",")}`,
  );
});

test("the header CTA points at an anchor that exists", async () => {
  /* The button used to copy a command; it now links to a section. A link to an id nothing
     renders fails silently — the page simply does not move, which reads as a dead button. */
  const header = await readFile(join(SITE, "components", "site-header.tsx"), "utf8");
  const href = /href="\/#([\w-]+)"/.exec(header);
  assert.ok(href, "the header CTA no longer links to a homepage anchor");

  const setup = await readFile(join(SITE, "components", "setup.tsx"), "utf8");
  assert.ok(
    setup.includes(`id="${href[1]}"`),
    `nothing on the homepage renders id="${href[1]}"`,
  );
});

test("section ids on the homepage are unique", async () => {
  const ids = [];
  for await (const file of walk(join(SITE, "components"))) {
    if (!file.endsWith(".tsx")) continue;
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(/<section\s+id="([\w-]+)"/g)) ids.push(m[1]);
  }
  assert.deepEqual([...new Set(ids)], ids, `duplicate section id: ${ids.join(",")}`);
});

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** `CardSection` → `card-section`, the file-naming convention this directory uses. */
const kebab = (name) => name.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase();

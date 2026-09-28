import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { PRIMARY_COMMAND, PUBLISH_COMMAND } from "../lib/cli.ts";
import {
  CARD_FILE,
  EMBED_HOSTED,
  EMBED_LOCAL,
  EMBED_NESTED,
  FREE_LINE,
  NETWORK_LINE,
  PATHS,
  PUBLISH_NOTE,
  STEPS,
} from "../lib/setup.ts";

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

test("both embed forms are offered, local and hosted", () => {
  /* One of each, next to each other. The section led with the local pair alone, which is the
     path the page recommends but not the only one it documents — somebody who has just read
     path B and gone off to publish came back to three snippets, none of them theirs. */
  assert.ok(EMBED_HOSTED.includes("/api/card/"), "the hosted snippet must use the card endpoint");
  assert.ok(EMBED_HOSTED.includes("/u/"), "a hosted card links back to the profile");
  assert.ok(!EMBED_LOCAL.includes("http"), "the local snippet must not reach for a host");

  const setup = readFileSync(join(SITE, "components", "setup.tsx"), "utf8");
  for (const name of ["EMBED_LOCAL", "EMBED_NESTED", "EMBED_HOSTED"]) {
    assert.ok(setup.includes(name), `the setup section does not show ${name}`);
  }
});

test("every surface that shows a command shows the same claims about it", async () => {
  /*
   * The drift this catches, which had already happened: the hero, the tool page header, the
   * tool page CTA and the closing CTA each wrote their own sentence about what the command
   * sends, and one of them promised publishing was "a separate step you have to ask for"
   * beside a command that published by default.
   *
   * Checked by import rather than by matching the text, because a surface that copied the
   * sentence into its own JSX would satisfy a text match on the day it was copied and fail
   * nobody on the day the constant changed.
   */
  const surfaces = [
    [join(SITE, "components", "hero.tsx"), ["FREE_LINE", "NETWORK_LINE"]],
    [join(SITE, "app", "tool", "[agent]", "page.tsx"), ["FREE_LINE", "NETWORK_LINE", "PUBLISH_NOTE"]],
    [join(SITE, "components", "closing-cta.tsx"), ["PUBLISH_NOTE"]],
  ];

  for (const [file, names] of surfaces) {
    const text = await readFile(file, "utf8");
    assert.match(text, /from "@\/lib\/setup"/, `${file} does not import the shared copy`);
    for (const name of names) {
      assert.ok(text.includes(`{${name}}`), `${file} does not render ${name}`);
    }
  }
});

test("no page claims that generate cannot publish", async () => {
  /*
   * The overclaim this exists to stop, which shipped and had to be walked back.
   *
   * `generate --no-publish` is guaranteed local, and the site is right to say so. But the
   * copy generalised from the flag to the command: "publishing is a different command you
   * run when you have decided to, and never a side effect of one you have already run", and
   * on the tool pages "`publish` ... is the only one that does".
   *
   * Both are true at a terminal and false everywhere else. `generate` ends by calling
   * `publish`; the confirmation is gated on `interactive()`, so a pipe, a cron job or a CI
   * step uploads without asking. A reader who took the site at its word and put bare
   * `generate` in a workflow published their usage believing it could not.
   *
   * Phrases, not semantics — a regex cannot read. These are the exact shapes that were
   * wrong, so reintroducing any of them fails here.
   */
  const FORBIDDEN = [
    /never a side effect/i,
    /\bis the only command that uploads\b/i,
    /and it is the only one that does/i,
    /publishing is a (?:different|separate) command\b/i,
  ];

  const offenders = [];
  for (const dir of ["app", "components", "lib"]) {
    for await (const file of walk(join(SITE, dir))) {
      if (!/\.tsx?$/.test(file)) continue;
      const text = await readFile(file, "utf8");
      /* Block comments are where the old wording is quoted to explain the fix, which is the
         one place it should still appear. */
      const prose = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const pattern of FORBIDDEN) {
        const hit = pattern.exec(prose);
        if (hit) offenders.push(`${file.slice(REPO.length + 1)}: "${hit[0]}"`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "scope the guarantee to --no-publish; bare generate publishes in CI",
  );
});

test("the claims name the flag, not just the command", () => {
  /* The positive half of the test above. Saying less is not the fix — a reader still has to
     learn that the flag is what makes the run local, or they will drop it. */
  assert.match(NETWORK_LINE, /--no-publish/, "the guarantee must attach to the flag");
  assert.match(
    NETWORK_LINE,
    /script|CI/i,
    "the exception is the part a reader needs before writing a workflow",
  );
  assert.match(PUBLISH_NOTE, /script|CI/i);
});

test("the shared claims say what the CLI does", () => {
  /* Cheap, and it is the sentence a reader trusts most. `--no-publish` returns before any
     networking module is loaded, which `packages/cli/test/generate.test.js` proves. */
  assert.match(FREE_LINE, /Node\.js 22\+/);
  assert.match(NETWORK_LINE, /sends nothing/);
  assert.ok(
    /never prompts/.test(NETWORK_LINE),
    "the payload's exclusions are the point of the sentence",
  );
  /* Was /separate command/, which pinned the overclaim itself: it passed for the whole time
     the site was telling people bare `generate` could not publish. What the line has to do is
     scope the promise to the command it sits beside. */
  assert.match(PUBLISH_NOTE, /cannot publish/i);
});

test("nothing is pinned over the page any more", async () => {
  /*
   * A pill fixed to the bottom-right corner advertised the L shortcut on every page. It sat
   * on top of the board's footnote at 1280px and a table row at 390px, and on a touch device
   * it collapsed to a button duplicating a nav link — for a shortcut a phone cannot press.
   *
   * The shortcut still works; only the thing covering the page is gone.
   */
  const modal = await readFile(join(SITE, "components", "leaderboard-modal.tsx"), "utf8");
  assert.ok(!modal.includes("styles.pill"), "the fixed pill is back");
  assert.match(modal, /addEventListener\("keydown"/, "the shortcut itself must survive");

  const modalCss = await readFile(join(SITE, "components", "leaderboard-modal.module.css"), "utf8");
  assert.ok(!/position:\s*fixed/.test(modalCss), "the modal must pin nothing to the viewport");

  const footer = await readFile(join(SITE, "components", "site-footer.tsx"), "utf8");
  assert.match(footer, /press <kbd[^>]*>L<\/kbd>/, "a shortcut nothing names is a shortcut nobody has");
});

test("the board page offers a way onto the board", async () => {
  /* It asked people to publish and gave them nowhere to go. Every other surface carries the
     command; this one named it inside a sentence about other people. */
  const board = await readFile(join(SITE, "app", "board", "page.tsx"), "utf8");
  assert.match(board, /href="\/#start"/, "the board does not link to the setup section");

  const setup = await readFile(join(SITE, "components", "setup.tsx"), "utf8");
  assert.ok(setup.includes('id="start"'), 'nothing renders id="start"');
});

test("the board's filters collapse but always say what is selected", async () => {
  /*
   * Nine chips over four wrapped lines filled two thirds of a 390px screen before the first
   * developer appeared — on the page whose whole job is to show that people are on it.
   *
   * The disclosure is only acceptable because the collapsed summary names the active window
   * and agent, and because a non-default filter renders it open rather than leaving a short
   * list looking like an empty board.
   */
  const board = await readFile(join(SITE, "app", "board", "page.tsx"), "utf8");
  assert.match(board, /<details[^>]*open=\{filtered\}/, "the filters are not a disclosure");
  assert.match(board, /\{windowLabel\} · \{agentLabel\}/, "the summary does not name the selection");
  assert.match(
    board,
    /const filtered = window !== "year" \|\| agent !== null;/,
    "an active filter must open the disclosure",
  );
  /* Search stays out in the open: it is the control people arrive wanting. */
  const searchAt = board.indexOf('role="search"');
  /* The element, not the prose: a comment above the form explains why this is a <details>,
     and matching on the bare tag found that sentence instead. */
  const detailsAt = board.indexOf("<details className=");
  assert.ok(searchAt > 0 && searchAt < detailsAt, "search must not be inside the disclosure");
});

test("the two board marks are explained beside the rows that carry them", async () => {
  /* They were defined in the notes under the table — past the rows, the pager and four
     paragraphs — so a reader met the tick about forty rows before the sentence defining it. */
  const board = await readFile(join(SITE, "app", "board", "page.tsx"), "utf8");
  const legendAt = board.indexOf("styles.legend");
  const tableAt = board.indexOf("styles.tableWrap");
  assert.ok(legendAt > 0, "the board has no mark legend");
  assert.ok(legendAt < tableAt, "the legend must come before the table, not after it");
  assert.match(board, /GitHub sign-in proves the handle/);
  assert.match(board, /self-reported, handle unproved/);
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

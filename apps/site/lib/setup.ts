import { CLI_BIN, PRIMARY_COMMAND, PUBLISH_COMMAND } from "./cli.ts";
import { SITE_URL } from "./site.ts";

/*
 * The copy for the setup section, as data rather than JSX.
 *
 * The site has no DOM testing of any kind — no jsdom, no testing-library, and
 * `--experimental-strip-types` does not transform JSX — so a claim written inside a component
 * is a claim nothing can check. Everything here that could go stale (a command, a path, a
 * Markdown snippet) is therefore a value a test can import and assert against the CLI it
 * describes. This is the same arrangement `lib/agents.ts` uses, for the same reason.
 */

/**
 * Not a real handle. The embed snippets on this page were once built from the featured board
 * member's handle, which put a stranger's card on a first-time visitor's clipboard.
 */
export const PLACEHOLDER_HANDLE = "your-handle";

/** What `sync` writes when nothing overrides it, and what the Action defaults to. */
export const CARD_FILE = "tokenchit.svg";

/**
 * Byte-for-byte the line `sync` prints after writing the card — see the `embed` row in
 * `packages/cli/src/commands/sync.ts`. A test pins the shape, because a reader who copies
 * this from the site and a reader who copies it from their terminal must get the same thing.
 */
export const EMBED_LOCAL = `![tokenchit — @${PLACEHOLDER_HANDLE} AI coding agent usage](./${CARD_FILE})`;

/**
 * The same card, embedded from a README one directory down.
 *
 * A Markdown image resolves against the file it sits in, not against the repository root, so
 * the path the CLI prints is correct only for a README beside the card. This is the single
 * most common way a working card turns into a broken image, and neither README said so.
 */
export const EMBED_NESTED = `![tokenchit — @${PLACEHOLDER_HANDLE} AI coding agent usage](../${CARD_FILE})`;

/** The hosted equivalent: an image that links back to the profile it came from. */
export const EMBED_HOSTED =
  `[![tokenchit — @${PLACEHOLDER_HANDLE} AI coding agent usage]` +
  `(${SITE_URL}/api/card/${PLACEHOLDER_HANDLE}.svg)](${SITE_URL}/u/${PLACEHOLDER_HANDLE})`;

/*
 * The three sentences every surface that shows a command has to get right.
 *
 * The hero, the tool page header, the tool page CTA and the closing CTA each wrote their own
 * version of these, and they had already drifted: one said publishing was "a separate step
 * you have to ask for" while the command beside it published by default. The command itself
 * has been a shared constant since the tokenstats rename taught that lesson; the claims
 * around it had not caught up.
 *
 * Shared as strings rather than as a component because the four surfaces are styled quite
 * differently — the hero has a typing cursor and a hard shadow, the tool pages do not — and
 * what drifts is the wording, not the markup.
 */

/** The price, the requirement and the account question, in the order people ask them. */
export const FREE_LINE = "Free and MIT · Node.js 22+ · Local stats need no account.";

/**
 * The network boundary, stated beside the command rather than ten screens below it.
 *
 * Scoped to *this* command, because that is the only thing the site can promise. The first
 * half is checkable — the `--no-publish` path imports no networking module and the payload's
 * fields are pinned by `packages/cli/test/privacy.test.js` — but the previous wording went on
 * to say publishing was "a separate command", which is true at a terminal and false in a
 * pipe. Bare `generate` ends by calling `publish`; the confirmation that makes it a choice is
 * gated on `interactive()`, and a script has nobody to ask.
 *
 * So the guarantee attaches to the flag, not to the command name.
 */
export const NETWORK_LINE =
  "This command sends nothing: --no-publish returns before any networking code loads. Bare " +
  "generate ends by publishing — at a terminal it asks first, in a script or CI it does not. " +
  "Publishing sends daily totals by agent and model, plus your handle, and never prompts, " +
  "replies or file paths.";

/**
 * The short form, for a CTA that has already said what the command does.
 *
 * Position-neutral: it renders above the command row in the closing CTA and above it again on
 * the tool pages, so it says "the command shown" rather than pointing up or down at it.
 */
export const PUBLISH_NOTE =
  "The command shown cannot publish. Bare generate can, and in a script or CI it does so " +
  "without asking, so keep the flag for a guaranteed local run.";

export type Step = {
  verb: string;
  title: string;
  body: string;
  /** Shown in a terminal strip under the step, when the step is a command. */
  command?: string;
};

export const STEPS: Step[] = [
  {
    verb: "run",
    title: "One command, nothing uploaded",
    body:
      "Detects which agents you have, writes .tokenchit.json, and renders the card from the " +
      "transcripts already on your disk. No account and no sign-in — this command has no " +
      "networking code in it at all.",
    command: PRIMARY_COMMAND,
  },
  {
    verb: "inspect",
    title: "Open the file before you trust it",
    body:
      `${CARD_FILE} is a plain SVG in your working directory. Every figure on it came from ` +
      "your own logs, and if an agent you use is missing, doctor says which one and why.",
    command: `${CLI_BIN} doctor`,
  },
  {
    verb: "commit",
    title: "It is a file in your repo",
    body:
      "GitHub serves a committed SVG directly rather than through its image proxy, so the " +
      "card renders even for readers your network never reaches.",
    command: `git add ${CARD_FILE} && git commit -m "chore: update tokenchit"`,
  },
  {
    verb: "paste",
    title: "Embed it relative to the README",
    body:
      "A Markdown image resolves against the file it sits in. Beside the card that is ./, " +
      "from a README one directory down it is ../ — the path the CLI prints is the first " +
      "form, and pasting it into the second is how a working card becomes a broken image.",
  },
  {
    verb: "refresh",
    title: "Re-run it, or let a hook do it",
    body:
      "The card is a snapshot, so it ages. A pre-commit hook re-renders and stages it every " +
      "time you commit. The GitHub Action can also refresh a card, but only a published one: " +
      "a runner has no access to your ~/.claude or ~/.codex.",
    command: `${CLI_BIN} hook install`,
  },
];

export type Path = {
  key: "local" | "hosted";
  label: string;
  title: string;
  command: string;
  /** The claim that decides it, in one line. */
  summary: string;
  gets: string[];
  costs: string[];
};

/*
 * Two paths, stated as a choice rather than a funnel.
 *
 * The page used to present publishing as the destination and local use as a flag you could
 * pass, while separately promising that publishing was "a separate step you have to ask for".
 * Both halves of that were doing damage: the promise was false, and the framing buried the
 * mode most people actually want. The trade-offs below are the real ones, including the two
 * that argue against the hosted card.
 */
export const PATHS: Path[] = [
  {
    key: "local",
    label: "path a",
    title: "Keep it local",
    command: PRIMARY_COMMAND,
    summary: "The card is a file you own, in a repo you control.",
    gets: [
      "Works offline, and keeps working if this site does not.",
      "Nothing is sent, so there is nothing to take back later.",
      "No account, no handle to claim, no key on disk.",
    ],
    costs: [
      "It is a snapshot: it shows the day you last ran it until you run it again.",
      "No profile page, no board row, and no link back from the card.",
    ],
  },
  {
    key: "hosted",
    label: "path b",
    title: "Share a live card",
    command: PUBLISH_COMMAND,
    summary: "A hosted card that updates itself, and a row on the board.",
    gets: [
      "Refreshes without a commit, and links back to your profile.",
      "A ✓ github mark, once the device flow proves the handle is yours.",
      "The Action can pull the current card into any repo you like.",
    ],
    costs: [
      "Daily totals by agent and model, plus your handle, leave your machine.",
      "The card depends on this service and caches for four hours.",
      "Reversible, but not retroactive — unpublish deletes the lot.",
    ],
  },
];

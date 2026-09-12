import type { BoardAgent } from "./board";

/**
 * What the site says about each agent, on its own page.
 *
 * Paired with `packages/core/src/adapters/*` — `source` here must match the glob that
 * adapter actually reads, and `caveat` must match what the CLI prints. It is duplicated
 * rather than imported because `@tokenchit/core/adapters` pulls in `node:fs` and
 * `node:sqlite`, and importing it for three strings would drag both into this route's
 * bundle for no gain. If an adapter's source path changes, change it here too.
 */
export type AgentPage = {
  key: BoardAgent;
  /** As written on the card and in prose. */
  label: string;
  /** Title case, for the page heading and title tag. */
  name: string;
  /** Where the adapter reads. Verbatim from the adapter. */
  source: string;
  /** One line: what the log actually is. */
  what: string;
  /**
   * The thing someone will otherwise be surprised by. Every agent has one, and a page that
   * only listed the good news would be the kind of page this project is arguing against.
   */
  caveat: { heading: string; body: string };
};

export const AGENT_PAGES: AgentPage[] = [
  {
    key: "claude-code",
    label: "claude code",
    name: "Claude Code",
    source: "~/.claude*/projects/**/*.jsonl",
    what:
      "Claude Code writes a JSONL transcript per session. Every profile directory is read, " +
      "not just the default one, so a machine with more than one config still reports a " +
      "single total.",
    caveat: {
      heading: "Your total will be lower than the Stats panel's",
      body:
        "Claude Code rewrites an assistant message in the transcript as it streams, and each " +
        "rewrite leaves a usage record carrying the same growing figures — so one API call " +
        "can appear several times. The Stats panel sums them as written; tokenchit collapses " +
        "them to one row per call. On the machines measured the panel ran between 1.15x and " +
        "2.18x higher, and the factor moved day to day, so there is no constant to divide " +
        "out. `sync` prints both figures and the gap rather than picking one for you.",
    },
  },
  {
    key: "codex",
    label: "codex",
    name: "Codex",
    source: "~/.codex/sessions/**/rollout-*.jsonl",
    what:
      "Codex writes one rollout file per session, under a dated directory tree. Token counts " +
      "come from the same usage records the API returned.",
    caveat: {
      heading: "There is no cumulative cache to fall back on",
      body:
        "Unlike Claude Code, Codex keeps no running total outside the transcripts. That makes " +
        "the figure straightforward while the files are there, and unrecoverable once they " +
        "are gone: a number derived from logs cannot include logs that no longer exist. " +
        "tokenchit banks each day it sees in a local ledger so a later rotation does not " +
        "erase history it has already read.",
    },
  },
  {
    key: "opencode",
    label: "opencode",
    name: "OpenCode",
    source: "~/.local/share/opencode/opencode.db",
    what:
      "OpenCode records usage in a SQLite database rather than flat files. Reading it uses " +
      "Node's built-in `node:sqlite`, which is why the CLI needs Node 22 or newer.",
    caveat: {
      heading: "Tokens are counted; some of the cost is not",
      body:
        "OpenCode routes to whatever model you point it at, including self-hosted and bundled " +
        "ones with no public per-token price. Those are counted in the token total and left " +
        "out of the equivalent-cost figure, because inventing a rate for them would make the " +
        "cost look complete when it is not. The card reports the share of tokens that are " +
        "priced so you can see how much of the figure is covered.",
    },
  },
];

export const agentPage = (key: string): AgentPage | undefined =>
  AGENT_PAGES.find((a) => a.key === key);

/**
 * Agents that are detected and deliberately not supported.
 *
 * Named on every agent page rather than omitted: "tokenchit does not see Copilot" and
 * "Copilot does not record what tokenchit would need" are different claims, and only one of
 * them is a bug worth filing.
 */
export const UNSUPPORTED = [
  {
    name: "Copilot CLI",
    reason: "records only a live context gauge, so there is no per-call token count to read.",
  },
  {
    name: "Gemini CLI",
    reason: "writes transcripts that carry no token counts at all.",
  },
] as const;

/**
 * Split prose on backticks so `like this` can render as a `<code>` element.
 *
 * The content above is plain strings, which is what makes it readable in the file and
 * greppable against the adapters. Without this the backticks reached the page as literal
 * characters — visible in the prerendered HTML, which is how it was caught.
 *
 * Odd indices are the code spans, because splitting on a delimiter always yields
 * text/delim/text; an unclosed backtick therefore renders as text rather than swallowing the
 * rest of the sentence.
 */
export function codeSpans(text: string): { code: boolean; value: string }[] {
  return text
    .split("`")
    .map((value, i) => ({ code: i % 2 === 1, value }))
    .filter((part) => part.value.length > 0);
}

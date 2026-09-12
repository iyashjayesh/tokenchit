import { createRequire } from "node:module";

import { DEFAULT_API } from "./api.js";
import { banner } from "./banner.js";
import { bold, cyan, dim, grey, pad, wordmark } from "./ui.js";

export type Command = {
  summary: string;
  /** `[flag, explanation]`, rendered as an aligned block under the command. */
  flags?: Array<[string, string]>;
  /** Shown only by `tokenchit help <command>`, where there is room to explain. */
  detail?: string;
};

/*
 * One table drives both the summary help and the per-command help, so a flag cannot be
 * documented in one and missing from the other. The API host is interpolated rather than
 * retyped — it was typed out once and drifted to a hostname that 404s.
 */
export const COMMANDS: Record<string, Command> = {
  generate: {
    summary: "the whole flow: detect, render the card, join the board",
    flags: [
      ["--no-publish", "stop after writing the card"],
      ["--handle <name>", "GitHub handle (default: guessed from origin remote)"],
      ["--out <path>", "where to write the card (default: tokenchit.svg)"],
      ["--theme auto|light|dark", ""],
    ],
    detail:
      "One command for the three steps most people want in order. It runs `init` only when\n" +
      "there is no .tokenchit.json — re-running it would overwrite a committed file somebody\n" +
      "may have edited — then `sync`, then `publish`.\n\n" +
      "It is a composition, not a fourth implementation: each step is the command it is named\n" +
      "after, so running them separately does exactly the same work.",
  },
  init: {
    summary: "detect agents, write .tokenchit.json",
    flags: [["--handle <name>", "GitHub handle (default: guessed from origin remote)"]],
    detail:
      "Looks for Claude Code, Codex and OpenCode logs and records which of them to read.\n" +
      "The file it writes is meant to be committed; it never contains a credential.",
  },
  sync: {
    summary: "read your logs, show your stats, write the card",
    flags: [
      ["--out <path>", "where to write it (default: tokenchit.svg)"],
      ["--layout default|compact", ""],
      ["--theme auto|light|dark", ""],
      ["--json", "print the aggregate instead of writing an SVG"],
      ["--dry-run", "report what would be written, write nothing"],
      ["--handle <name>", "override the handle on the card"],
    ],
    detail:
      "Reads only local files and makes no network request, so it is safe to run before you\n" +
      "have decided whether to publish anything. The card it writes is a plain SVG: commit it\n" +
      "and GitHub serves it directly, without going through the camo proxy.",
  },
  publish: {
    summary: "put your row on the public board",
    flags: [
      ["--anonymous", "publish without signing in; the row is marked unverified"],
      ["--no-clipboard", "signing in: do not copy the device code"],
      ["--no-browser", "do not open any page: the sign-in, or your profile after publishing"],
      ["--dry-run", "print the exact bytes and send nothing"],
      ["--api <url>", `default ${DEFAULT_API}`],
      ["--handle <name>", ""],
    ],
    detail:
      "The only command that uploads anything. At a terminal it signs you in first, because an\n" +
      "unverified row is rarely what anyone wants; in CI or a cron job, where nobody can read a\n" +
      "device code, it publishes unverified instead of hanging.\n\n" +
      "Daily totals and model names are sent. No prompt, no reply, no file path, no branch\n" +
      "name — `--dry-run` prints the exact bytes so you can check that yourself.",
  },
  recap: {
    summary: "year in review: heatmap, models, totals",
    flags: [
      ["--out <path>", "default: tokenchit-recap.svg"],
      ["--year <yyyy>", "the year to report on"],
      ["--week", "the last full Mon-Sun, against the week before it"],
      ["--month", "the last full calendar month, against the month before it"],
      ["--handle <name>", "override the handle on the recap"],
      ["--theme auto|light|dark", ""],
      ["--json", "print the recap model instead of writing an SVG"],
      ["--dry-run", ""],
    ],
    detail:
      "--week and --month report the most recent period that has fully ended, never the one in\n" +
      "progress: three days of this week against seven of last week is not a comparison. Both\n" +
      "print to the terminal and to --json and write no SVG — the recap card is a year card, and\n" +
      "a week rendered into it reads as a quiet year rather than a short window.\n\n" +
      "The percentage against the previous period is withheld, with the reason printed, when that\n" +
      "period began before this machine had any history. Measuring an install date and calling it\n" +
      "growth is worse than showing no number.",
  },
  doctor: {
    summary: "read-only report on sources, coverage, history and estimates",
    flags: [["--json", "print the report as a stable JSON object"]],
    detail:
      "Consolidates the explanations sync, init and ledger each give separately: which agents\n" +
      "were found and which cannot be counted, the first and last day with usage, what the\n" +
      "ledger has banked, how much of the cost estimate is priced, and the accounting limits\n" +
      "that actually apply to this machine.\n\n" +
      "It writes nothing. No scan is persisted, the ledger is not rewritten or migrated, no\n" +
      "sidecar or cache file is created, and no credential is refreshed. Remedies are printed\n" +
      "as suggestions for you to run.\n\n" +
      "Observed date bounds are not a completeness claim. A silent day and a day whose\n" +
      "transcripts were deleted look identical from here, so no percentage is invented.",
  },
  ledger: {
    summary: "show the local history bank, or rebuild it",
    flags: [
      ["--rebuild", "discard it and re-derive from the logs still on disk"],
      ["--yes", "required by --rebuild, which cannot be undone"],
    ],
    detail:
      "Agent logs are deleted. Claude Code's cleanupPeriodDays defaults to 30, so a card built\n" +
      "only from what is on disk reports usage since the last cleanup rather than usage since\n" +
      "you installed anything — and that boundary moves every night.\n\n" +
      "So every sync banks what it saw, keyed by day, agent and model, and keeps whichever\n" +
      "reading is fuller. Once a day is recorded, retention can take the transcripts and the\n" +
      "figure survives. The bank is local, is never uploaded on its own, and lives beside your\n" +
      "credentials rather than in the repo.\n\n" +
      "It cannot recover history from before it existed, and it cannot be moved between\n" +
      "machines. --rebuild exists because a max-wins bank would otherwise keep a bad reading\n" +
      "forever; it throws away every day the logs no longer cover.",
  },
  schedule: {
    summary: "print a scheduler entry to keep your row current",
    flags: [
      ["--every daily|hourly", "how often to publish (default: daily)"],
      ["--cron", "force a crontab line even on macOS"],
    ],
    detail:
      "Prints a scheduler entry and installs nothing — changing how your machine is configured\n" +
      "is yours to do, not a CLI's to do quietly. launchd on macOS, crontab elsewhere, Task\n" +
      "Scheduler on Windows; output goes to a log file so a job that breaks leaves a trace.\n\n" +
      "Scheduling has to run locally. The logs live on this machine and nowhere else, so a\n" +
      "GitHub Action cannot do this for you: there is nothing for it to read.",
  },
  login: {
    summary: "prove your GitHub handle (device flow, no password)",
    flags: [
      ["--no-clipboard", "do not copy the device code"],
      ["--no-browser", "do not open the verification page"],
      ["--force", "sign in again when already signed in"],
      ["--api <url>", `default ${DEFAULT_API}`],
    ],
    detail:
      "Device flow, because a CLI cannot keep a secret. GitHub still requires a client secret\n" +
      "for the redirect-based flow even with PKCE, so shipping that in a public package would\n" +
      "mean publishing the secret — and a localhost callback breaks over SSH and in containers\n" +
      "anyway, which is where a coding agent usually runs.\n\n" +
      "The code is copied and the page is opened with it pre-filled, but both are conveniences:\n" +
      "the URL and the code are printed first and remain correct if either quietly fails.",
  },
  hook: {
    summary: "keep the committed card current on every commit",
    flags: [],
    detail:
      "`tokenchit hook install` writes a pre-commit hook that runs `sync` and stages the card,\n" +
      "so the SVG in your repo describes the work in the commit it travels with.\n\n" +
      "The card is a committed file, which is the whole point of it — but keeping one current\n" +
      "meant remembering to run `sync` and `git add` by hand, and `schedule` does not help:\n" +
      "a cron entry runs `publish`, which refreshes your board row and never touches the SVG.\n\n" +
      "It stages a file into a commit you are already making. It never creates one — a tool\n" +
      "that reads your logs should not be authoring your history.\n\n" +
      "`tokenchit hook uninstall` removes it, and refuses to touch a pre-commit hook it did\n" +
      "not write.",
  },
  unpublish: {
    summary: "remove your row from the board, and your data with it",
    flags: [
      ["--yes", "skip the confirmation prompt"],
      ["--export <path>", "save everything to a JSON file first"],
      ["--api <url>", `default ${DEFAULT_API}`],
    ],
    detail:
      "Deletes the account, every submission and every daily figure the board holds, and\n" +
      "signs this machine out. The profile page, the hosted card and the OG image go with it.\n\n" +
      "The card in your repo is a file you committed. It stays where it is — removing it is a\n" +
      "`git rm`, not something a CLI should do to your repository.\n\n" +
      "--export writes everything to JSON before deleting, which is worth doing: history that\n" +
      "retention has already taken from your logs cannot be rebuilt afterwards.\n\n" +
      "A row published with --anonymous cannot be withdrawn this way. Nothing on the machine\n" +
      "proves it was yours, which is the trade --anonymous makes.",
  },
  logout: { summary: "forget this machine" },
  whoami: { summary: "who this machine is signed in as" },
};

export const GROUPS: Array<[string, string[]]> = [
  ["start here", ["generate"]],
  ["or step by step", ["init", "sync", "publish"]],
  ["more", ["recap", "doctor", "ledger", "hook", "schedule"]],
  ["account", ["login", "logout", "whoami", "unpublish"]],
];

export function usage(): string {
  const names = Object.keys(COMMANDS);
  const w = Math.max(...names.map((n) => n.length)) + 10;

  // The banner where there is a person and room for it; the inline wordmark otherwise.
  const art = banner("receipts for your robots", `v${cliVersion()}`);
  const out: string[] =
    art.length > 0
      ? [...art, ""]
      : ["", `  ${wordmark()}  ${grey("receipts for your robots")}`, ""];

  out.push(
    `  ${bold("npx @tokenchit/cli@latest generate")}`,
    `  ${grey("finds your agents, writes the card, puts you on the board")}`,
    "",
  );

  for (const [group, members] of GROUPS) {
    out.push(`${grey(group)}`);
    for (const name of members) {
      const cmd = COMMANDS[name]!;
      out.push(`  ${pad(bold(name), w)}${cmd.summary}`);
    }
    out.push("");
  }

  out.push(
    `${grey("flags")}`,
    `  ${pad("--help, -h", w)}this text, or ${bold("tokenchit help <command>")} for one command`,
    `  ${pad("--version, -v", w)}print the version`,
    `  ${pad("--color <when>", w)}always, never or auto ${grey("(default: auto)")}`,
    `  ${pad("NO_COLOR=1", w)}disable colour and animation; FORCE_COLOR=1 forces it on`,
    "",
    dim("sync and recap read only local files and make no network request."),
    dim("publish is the only command that uploads anything."),
    "",
  );
  return out.join("\n");
}

/**
 * Edit distance, capped: past a few edits the answer is "no", and the caller only ever asks
 * whether a typo is close enough to suggest.
 */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The command someone probably meant, or nothing.
 *
 * `git` has suggested the nearest command for over a decade and it is the expected courtesy;
 * the typos that actually happen here are near misses — `ledgers`, `synch`, `signin` — so a
 * threshold of three edits catches them without guessing wildly at unrelated words.
 */
export function nearestCommand(name: string): string | undefined {
  const typed = name.toLowerCase();
  let best: string | undefined;
  let bestScore = 4;

  for (const candidate of Object.keys(COMMANDS)) {
    // Ties are common at this scale — `signin` is three edits from both `init` and `login` —
    // and declaration order is a meaningless way to break one. A shared first letter is the
    // signal a reader would use, so it wins the tie.
    const score = distance(typed, candidate) * 2 + (candidate[0] === typed[0] ? 0 : 1);
    if (score < bestScore * 2) {
      best = candidate;
      bestScore = Math.ceil(score / 2);
    }
  }
  return best;
}

/** Whether `name` is a real command, so callers can tell a topic from a typo. */
export const isCommand = (name: string): boolean => Object.hasOwn(COMMANDS, name);

export function commandHelp(name: string): string {
  const cmd = COMMANDS[name];
  if (!cmd) return usage();

  const out = ["", `${bold(`tokenchit ${name}`)} — ${cmd.summary}`, ""];
  if (cmd.flags?.length) {
    const w = Math.max(...cmd.flags.map(([f]) => f.length)) + 4;
    for (const [f, help] of cmd.flags) {
      out.push(help ? `  ${pad(cyan(f), w)}${grey(help)}` : `  ${cyan(f)}`);
    }
    out.push("");
  }
  if (cmd.detail) out.push(...cmd.detail.split("\n").map((l) => (l ? `  ${l}` : "")), "");
  return out.join("\n");
}

/** The version reported to the server, so a bad submission can be traced to a release. */
export const cliVersion = (): string =>
  (createRequire(import.meta.url)("../package.json") as { version: string }).version;
/*
 * The flag guard reads this table rather than a second one beside it.
 *
 * There used to be an ALLOWED map maintained by hand next to the guard, and it drifted: six
 * flags this table documents were rejected as unknown by the shipped build, so the CLI would
 * refuse `--every hourly` and then print the help page that documents `--every hourly`.
 * `login --force` — the documented way out of a stale session — could not be typed at all.
 *
 * Deriving both lists from the help text makes that class of bug structurally impossible: a
 * flag is accepted because it is documented, and there is no second place to forget.
 */

/** `--out <path>` and `--theme auto|light` are named `--out` and `--theme`. */
export const flagName = (documented: string): string => documented.split(" ")[0]!;

/** A documented flag carries a value iff the help text shows one after the name. */
export const flagTakesValue = (documented: string): boolean => documented.includes(" ");

/**
 * `generate` forwards its argv to the commands it composes, so it accepts their flags too.
 * It is a composition rather than a fourth implementation, and the flag surface follows.
 */
const FORWARDS: Record<string, readonly string[]> = {
  generate: ["init", "sync", "publish"],
};

const documentedFlags = (name: string): string[] =>
  (COMMANDS[name]?.flags ?? []).map(([f]) => f);

/** Accepted everywhere, so they are not repeated on every command's page. */
export const GLOBAL: readonly string[] = ["--color <when>", "--no-color"];

const reachableFlags = (name: string): string[] => [
  ...documentedFlags(name),
  ...(FORWARDS[name] ?? []).flatMap(documentedFlags),
  ...GLOBAL,
];

/** Every flag `name` accepts, including those it only accepts by forwarding. */
export const allowedFlags = (name: string): string[] => [
  ...new Set(reachableFlags(name).map(flagName)),
];

/** Of those, the ones that consume the following argument. */
export const valuedFlags = (name: string): string[] => [
  ...new Set(reachableFlags(name).filter(flagTakesValue).map(flagName)),
];

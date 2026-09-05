#!/usr/bin/env node
import { createRequire } from "node:module";

import { DEFAULT_API } from "./api.js";
import { unknownFlags } from "./args.js";
import { banner } from "./banner.js";
import { generate } from "./commands/generate.js";
import { init } from "./commands/init.js";
import { login, logout, whoami } from "./commands/login.js";
import { publish } from "./commands/publish.js";
import { recap } from "./commands/recap.js";
import { ledger } from "./commands/ledger.js";
import { schedule } from "./commands/schedule.js";
import { sync } from "./commands/sync.js";
import { bold, cyan, dim, fail, grey, muteSqliteWarning, pad, say, wordmark } from "./ui.js";

type Command = {
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
const COMMANDS: Record<string, Command> = {
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
      ["--no-browser", "signing in: do not open the verification page"],
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
      ["--year <yyyy>", "label the recap with a different year"],
      ["--theme auto|light|dark", ""],
      ["--json", "print the recap model instead of writing an SVG"],
      ["--dry-run", ""],
    ],
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
    summary: "print a cron or launchd entry to keep your row current",
    flags: [
      ["--every daily|hourly", "how often to publish (default: daily)"],
      ["--cron", "force a crontab line even on macOS"],
    ],
    detail:
      "Prints a scheduler entry and installs nothing — changing how your machine is configured\n" +
      "is yours to do, not a CLI's to do quietly.\n\n" +
      "Scheduling has to run locally. The logs live on this machine and nowhere else, so a\n" +
      "GitHub Action cannot do this for you: there is nothing for it to read.",
  },
  login: {
    summary: "prove your GitHub handle (device flow, no password)",
    flags: [
      ["--no-clipboard", "do not copy the device code"],
      ["--no-browser", "do not open the verification page"],
      ["--force", "sign in again when already signed in"],
    ],
    detail:
      "Device flow, because a CLI cannot keep a secret. GitHub still requires a client secret\n" +
      "for the redirect-based flow even with PKCE, so shipping that in a public package would\n" +
      "mean publishing the secret — and a localhost callback breaks over SSH and in containers\n" +
      "anyway, which is where a coding agent usually runs.\n\n" +
      "The code is copied and the page is opened with it pre-filled, but both are conveniences:\n" +
      "the URL and the code are printed first and remain correct if either quietly fails.",
  },
  logout: { summary: "forget this machine" },
  whoami: { summary: "who this machine is signed in as" },
};

const GROUPS: Array<[string, string[]]> = [
  ["start here", ["generate"]],
  ["or step by step", ["init", "sync", "publish"]],
  ["more", ["recap", "schedule"]],
  ["account", ["login", "logout", "whoami"]],
];

function usage(): string {
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
    `  ${pad("NO_COLOR=1", w)}disable colour and animation`,
    "",
    dim("sync and recap read only local files and make no network request."),
    dim("publish is the only command that uploads anything."),
    "",
  );
  return out.join("\n");
}

function commandHelp(name: string): string {
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
const cliVersion = (): string =>
  (createRequire(import.meta.url)("../package.json") as { version: string }).version;

async function main(): Promise<number> {
  muteSqliteWarning();

  const [command, ...argv] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    // `help sync` and `sync --help` reach the same page from either direction.
    const topic = argv[0];
    say(topic ? commandHelp(topic) : usage());
    return command ? 0 : 1;
  }

  if (command === "--version" || command === "-v") {
    say(cliVersion());
    return 0;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    say(commandHelp(command));
    return 0;
  }

  /*
   * A flag this command does not read is a mistake, not a no-op.
   *
   * `oneOf` already refuses an unrecognised flag value; nothing refused an unrecognised flag
   * name, so `publish --dry-runn` published for real and exited 0. Checked centrally because
   * the hazard is uniform and a per-command check is a per-command thing to forget.
   *
   * `generate` runs init, sync and publish in turn and forwards its argv to each, so it
   * accepts the union of their flags.
   */
  const SYNC_FLAGS = ["--handle", "--layout", "--theme", "--out", "--json", "--dry-run"];
  const PUBLISH_FLAGS = ["--api", "--dry-run", "--anonymous", "--handle"];
  const VALUED = ["--handle", "--layout", "--theme", "--out", "--api", "--year", "--cron"];

  const ALLOWED: Record<string, readonly string[]> = {
    generate: [...new Set([...SYNC_FLAGS, ...PUBLISH_FLAGS, "--no-publish"])],
    init: ["--handle"],
    sync: SYNC_FLAGS,
    recap: ["--handle", "--theme", "--out", "--json", "--dry-run", "--year"],
    publish: PUBLISH_FLAGS,
    schedule: ["--cron"],
    ledger: ["--rebuild", "--yes"],
    login: ["--api"],
    logout: [],
    whoami: [],
  };

  const stray = unknownFlags(argv, ALLOWED[command] ?? [], VALUED);
  if (stray.length > 0) {
    fail(`unknown ${stray.length === 1 ? "flag" : "flags"}: ${stray.join(", ")}`);
    say(commandHelp(command));
    return 1;
  }

  switch (command) {
    case "generate":
      return generate(argv, cliVersion());
    case "init":
      return init(argv);
    case "sync":
      return sync(argv);
    case "recap":
      return recap(argv);
    case "publish":
      return publish(argv, cliVersion());
    case "schedule":
      return schedule(argv);
    case "ledger":
      return ledger(argv);
    case "login":
      return login(argv);
    case "logout":
      return logout();
    case "whoami":
      return whoami();
    default:
      fail(`unknown command: ${command}`);
      say(usage());
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });

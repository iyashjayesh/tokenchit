#!/usr/bin/env node
import { unknownFlags } from "./args.js";
import { generate } from "./commands/generate.js";
import { hook } from "./commands/hook.js";
import { init } from "./commands/init.js";
import { login, logout, whoami } from "./commands/login.js";
import { publish } from "./commands/publish.js";
import { doctor } from "./commands/doctor.js";
import { recap } from "./commands/recap.js";
import { ledger } from "./commands/ledger.js";
import { schedule } from "./commands/schedule.js";
import { sync } from "./commands/sync.js";
import { unpublish } from "./commands/unpublish.js";
import {
  allowedFlags,
  cliVersion,
  commandHelp,
  isCommand,
  nearestCommand,
  usage,
  valuedFlags,
} from "./help.js";
import { bold, dim, fail, muteSqliteWarning, say } from "./ui.js";

/** "did you mean" for a name that missed, printed before the usage screen scrolls it away. */
function suggest(typed: string): void {
  const near = nearestCommand(typed);
  if (near) say(dim(`  did you mean ${bold(`tokenchit ${near}`)}?`));
}

/**
 * The Node this needs, checked before anything can fail obscurely.
 *
 * `engines` is declared in package.json, but npm only enforces it when `engine-strict` is
 * set, which it is not by default — so `npx @tokenchit/cli@latest generate` on Node 20 printed
 * an EBADENGINE warning that scrolled past and then failed inside the lazy
 * `await import("node:sqlite")` in the OpenCode adapter, with a message about a missing module
 * that has no visible connection to the user's actual problem.
 */
const MIN_NODE = 22;

function checkNode(): boolean {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(major) && major < MIN_NODE) {
    fail(`tokenchit needs Node ${MIN_NODE} or newer — this is Node ${process.versions.node}`);
    say(dim(`  nodejs.org/download, or: nvm install ${MIN_NODE}`));
    return false;
  }
  return true;
}

async function main(): Promise<number> {
  if (!checkNode()) return 1;
  muteSqliteWarning();

  const [command, ...argv] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    // `help sync` and `sync --help` reach the same page from either direction.
    const topic = argv[0];
    if (topic !== undefined && !isCommand(topic)) {
      // Printing the whole usage screen and exiting 0 answered a question about a thing that
      // does not exist by pretending it had been asked about something else.
      fail(`no help topic: ${topic}`);
      suggest(topic);
      say(usage());
      return 1;
    }
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
  const stray = unknownFlags(argv, allowedFlags(command), valuedFlags(command));
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
    case "doctor":
      return doctor(argv);
    case "publish":
      return publish(argv, cliVersion());
    case "schedule":
      return schedule(argv);
    case "hook":
      return hook(argv);
    case "ledger":
      return ledger(argv);
    case "login":
      return login(argv);
    case "logout":
      return logout();
    case "whoami":
      return whoami();
    case "unpublish":
      return unpublish(argv);
    default:
      fail(`unknown command: ${command}`);
      suggest(command);
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

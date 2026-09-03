#!/usr/bin/env node
import { createRequire } from "node:module";

import { init } from "./commands/init.js";
import { login, logout, whoami } from "./commands/login.js";
import { publish } from "./commands/publish.js";
import { recap } from "./commands/recap.js";
import { sync } from "./commands/sync.js";
import { bold, dim, fail, muteSqliteWarning, say } from "./ui.js";

const USAGE = `
${bold("tokenchit")} — turn your local AI coding agent logs into a stat card

  ${bold("tokenchit init")}              detect agents, write .tokenchit.json
    --handle <name>            GitHub handle (default: guessed from origin remote)

  ${bold("tokenchit sync")}              render the card into your repo
    --out <path>               where to write it (default: tokenchit.svg)
    --layout default|compact
    --theme auto|light|dark
    --json                     print the aggregate instead of writing an SVG
    --dry-run                  report what would be written, write nothing

  ${bold("tokenchit login")}             prove your GitHub handle (device flow, no password)
  ${bold("tokenchit logout")}            forget this machine
  ${bold("tokenchit whoami")}            who this machine is signed in as

  ${bold("tokenchit publish")}           the only command that uploads anything
    --dry-run                  print the exact bytes and send nothing
    --api <url>                default https://tokenchit-site.vercel.app
    --handle <name>

  ${bold("tokenchit recap")}             year in review: heatmap, models, totals
    --out <path>               default: tokenchit-recap.svg
    --year <yyyy>              label the recap with a different year
    --theme auto|light|dark
    --json                     print the recap model instead of writing an SVG
    --dry-run

${dim("Reads only local files. Makes no network requests.")}
`;

/** The version reported to the server, so a bad submission can be traced to a release. */
const cliVersion = (): string =>
  (createRequire(import.meta.url)("../package.json") as { version: string }).version;

async function main(): Promise<number> {
  muteSqliteWarning();

  const [command, ...argv] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    say(USAGE);
    return command ? 0 : 1;
  }

  if (command === "--version" || command === "-v") {
    say(cliVersion());
    return 0;
  }

  switch (command) {
    case "init":
      return init(argv);
    case "sync":
      return sync(argv);
    case "recap":
      return recap(argv);
    case "publish":
      return publish(argv, cliVersion());
    case "login":
      return login(argv);
    case "logout":
      return logout();
    case "whoami":
      return whoami();
    default:
      fail(`unknown command: ${command}`);
      say(USAGE);
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

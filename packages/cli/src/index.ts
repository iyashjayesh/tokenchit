#!/usr/bin/env node
import { createRequire } from "node:module";

import { init } from "./commands/init.js";
import { sync } from "./commands/sync.js";
import { bold, dim, fail, muteSqliteWarning, say } from "./ui.js";

const USAGE = `
${bold("tokencard")} — turn your local AI coding agent logs into a stat card

  ${bold("tokencard init")}              detect agents, write .tokencard.json
    --handle <name>            GitHub handle (default: guessed from origin remote)

  ${bold("tokencard sync")}              render the card into your repo
    --out <path>               where to write it (default: tokencard.svg)
    --layout default|compact
    --theme auto|light|dark
    --json                     print the aggregate instead of writing an SVG
    --dry-run                  report what would be written, write nothing

${dim("Reads only local files. Makes no network requests.")}
`;

async function main(): Promise<number> {
  muteSqliteWarning();

  const [command, ...argv] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    say(USAGE);
    return command ? 0 : 1;
  }

  if (command === "--version" || command === "-v") {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    say(pkg.version);
    return 0;
  }

  switch (command) {
    case "init":
      return init(argv);
    case "sync":
      return sync(argv);
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

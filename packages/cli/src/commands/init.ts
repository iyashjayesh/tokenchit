import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { type AgentId } from "@tokenstats/core";
import { adapters, unsupported } from "@tokenstats/core/adapters";

import { flag } from "../args.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig, writeConfig, type Config } from "../config.js";
import { bold, dim, green, say, warn, yellow } from "../ui.js";

const run = promisify(execFile);

/**
 * Guess the handle from the repo's origin remote, so the common case needs no flag.
 * Only `github.com` remotes are read, and only the owner segment — never the URL itself,
 * which may carry a token in an https remote.
 */
async function guessHandle(): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["remote", "get-url", "origin"], { timeout: 2000 });
    const match = /github\.com[:/]([^/]+)\//.exec(stdout.trim());
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function init(argv: string[]): Promise<number> {
  const handleFlag = flag(argv, "--handle");

  say();
  say(bold("Scanning for local agent logs"));
  say();

  const found: AgentId[] = [];

  for (const adapter of adapters) {
    const state = await adapter.detect();
    const label = adapter.name.padEnd(13);

    if (state === "ready") {
      found.push(adapter.id);
      say(`  ${green("●")} ${label} ${dim(adapter.source)}`);
    } else if (state === "installed-no-data") {
      say(`  ${yellow("○")} ${label} ${dim("installed, but no usage recorded yet")}`);
    } else {
      say(`  ${dim("○")} ${dim(`${label} not installed`)}`);
    }
  }

  // Reported rather than omitted: someone with Copilot installed should learn why it
  // contributes nothing, instead of assuming detection is broken.
  for (const probe of unsupported) {
    if (!(await probe.installed())) continue;
    say(`  ${yellow("○")} ${probe.name.padEnd(13)} ${dim(`unsupported — ${probe.reason}`)}`);
  }

  say();

  if (found.length === 0) {
    warn("No agent logs found. Nothing to build a card from yet.");
    say(dim("  Run an agent session, then try again."));
    return 1;
  }

  const existing = await readConfig();
  const handle = handleFlag ?? existing?.handle ?? (await guessHandle()) ?? "";

  const config: Config = {
    ...DEFAULT_CONFIG,
    ...existing,
    handle,
    agents: found,
  };

  await writeConfig(config);
  say(`${green("✓")} wrote ${bold(CONFIG_FILE)} ${dim(`(${found.length} agents)`)}`);

  if (!handle) {
    say();
    warn(`No handle set. Add one to ${CONFIG_FILE}, or run: tokenstats init --handle <you>`);
  }

  say();
  say(`  Next: ${bold("tokenstats sync")}`);
  say();

  return 0;
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { sanitizeHandle, type AgentId } from "@tokenchit/core";
import { adapters, unsupported } from "@tokenchit/core/adapters";

import { flag } from "../args.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig, writeConfig, type Config } from "../config.js";
import { ask } from "../prompt.js";
import { bold, dim, green, say, under, warn, yellow } from "../ui.js";

/**
 * Say so when sanitisation changed the handle, rather than quietly using a different name.
 *
 * `sanitizeHandle` strips everything outside `[A-Za-z0-9_-]`, so `my.name` becomes `myname` —
 * which may well be somebody else's real GitHub account. Nothing reported that, so the card
 * carried an identity the user never typed.
 */
export function warnIfCoerced(raw: string): string {
  if (!raw) return "";
  const clean = sanitizeHandle(raw);
  if (clean !== raw) warn(`handle "${raw}" is not a valid GitHub handle — using "${clean}"`);
  return clean;
}

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

/**
 * `chained` is set when `generate` is driving: the step heading has already said what this
 * is, and the rows belong inside that step's gutter rather than under a second header.
 */
export async function init(argv: string[], chained = false): Promise<number> {
  const handleFlag = flag(argv, "--handle");

  const row = (text: string) => (chained ? under(text) : `  ${text}`);

  if (!chained) {
    say();
    say(bold("Scanning for local agent logs"));
  }
  say();

  const found: AgentId[] = [];

  for (const adapter of adapters) {
    const state = await adapter.detect();
    const label = adapter.name.padEnd(13);

    if (state === "ready") {
      found.push(adapter.id);
      say(row(`${green("●")} ${label} ${dim(adapter.source)}`));
    } else if (state === "installed-no-data") {
      say(row(`${yellow("○")} ${label} ${dim("installed, but no usage recorded yet")}`));
    } else {
      say(row(`${dim("○")} ${dim(`${label} not installed`)}`));
    }
  }

  // Reported rather than omitted: someone with Copilot installed should learn why it
  // contributes nothing, instead of assuming detection is broken.
  for (const probe of unsupported) {
    if (!(await probe.installed())) continue;
    say(row(`${yellow("○")} ${probe.name.padEnd(13)} ${dim(`unsupported — ${probe.reason}`)}`));
  }

  say();

  if (found.length === 0) {
    warn("No agent logs found. Nothing to build a card from yet.");
    say(dim("  Run an agent session, then try again."));
    return 1;
  }

  const existing = await readConfig();

  /*
   * Ask, rather than write a card belonging to nobody.
   *
   * The guess is the *owner* of the origin remote, which for a fork or a work repo is the
   * organisation — `github.com/acme-corp/service` yields `acme-corp` — and it used to be
   * written into the committed config with no confirmation, so the user ended up committing a
   * card branded with their employer. Offering it as an editable default is the fix: the
   * common case is still one keypress, and the wrong case is now visible before it is written.
   */
  const guessed = await guessHandle();
  let handle = handleFlag ?? existing?.handle ?? "";

  if (!handle) {
    handle = (await ask("GitHub handle", guessed ?? "")) ?? guessed ?? "";
  }

  handle = warnIfCoerced(handle);

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
    // Names the command the reader is actually running, which the old wording did not when
    // `generate` was driving.
    warn(
      `No handle set. Add one to ${CONFIG_FILE}, or re-run with --handle <you>`,
    );
  }

  if (!chained) {
    say();
    say(`  Next: ${bold("tokenchit sync")}`);
  }
  say();

  return 0;
}

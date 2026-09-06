import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { bold, dim, fail, green, say, warn } from "../ui.js";

const run = promisify(execFile);

/** The marker that says this file is ours, so uninstall never deletes somebody else's hook. */
const MARK = "# installed by tokenchit";

/**
 * Keep the committed card current, at the moment the repo is already being changed.
 *
 * The card is a committed file — the stated differentiator — and until this existed there was
 * no supported way to keep it fresh. `sync` printed the `git add` line for the user to copy,
 * which is right as a default; the gap was that no alternative existed either. `schedule` does
 * not fill it: a cron entry runs `publish`, which never touches the SVG, so a scheduled setup
 * refreshed the *board row* while the artifact in the repo went stale.
 *
 * A git hook is the right shape here in a way cron is not. It fires when the repo is already
 * being modified, the card lands in the same commit as the work it describes, and nothing runs
 * on a machine nobody is sitting at.
 *
 * What this deliberately does not do is create commits. A tool that reads your logs should not
 * be authoring history — `sync --commit` would be the wrong feature, and the reasoning already
 * written into sync.ts has that judgement right. The hook stages a file into a commit the user
 * is already making, which is a different thing.
 */
export async function hook(argv: string[]): Promise<number> {
  const sub = argv.find((a) => !a.startsWith("-"));

  if (sub !== "install" && sub !== "uninstall") {
    fail("usage: tokenchit hook install | tokenchit hook uninstall");
    return 1;
  }

  const dir = await hooksDir();
  if (!dir) {
    fail("not a git repository — a hook needs somewhere to live");
    return 1;
  }

  const path = join(dir, "pre-commit");
  const existing = await readFile(path, "utf8").catch(() => null);

  if (sub === "uninstall") {
    if (existing === null) {
      say("No pre-commit hook here.");
      return 0;
    }
    if (!existing.includes(MARK)) {
      // Somebody else's hook. Refusing is the only safe answer: this cannot tell whether the
      // file is precious, and deleting one that is would be unrecoverable from here.
      fail(`${path} was not installed by tokenchit — leaving it alone`);
      return 1;
    }
    await rm(path);
    say(`${green("✓")} removed ${bold(path)}`);
    return 0;
  }

  if (existing !== null && !existing.includes(MARK)) {
    fail(`${path} already exists and was not installed by tokenchit`);
    say(dim("  Add these two lines to it yourself:"));
    say(dim(`    npx -y @tokenchit/cli@latest sync --out ${cardPath()} >/dev/null 2>&1 || exit 0`));
    say(dim(`    [ -f ${cardPath()} ] && git add ${cardPath()}`));
    return 1;
  }

  const body = script();

  // Printed before it is written, because installing something into someone's git workflow is
  // a thing they should be able to read first rather than discover later.
  say();
  say(`  ${dim("about to write")} ${bold(path)}${dim(":")}`);
  say();
  for (const line of body.trimEnd().split("\n")) say(`    ${dim(line)}`);
  say();

  await mkdir(dir, { recursive: true });
  await writeFile(path, body, "utf8");
  await chmod(path, 0o755);

  say(`${green("✓")} installed ${bold(path)}`);
  say(dim("  Your card refreshes and stages itself on every commit."));
  say(dim("  Remove it with: tokenchit hook uninstall"));
  say();
  return 0;
}

/** Where this repo keeps its hooks — `core.hooksPath` moves them, and plenty of setups do. */
async function hooksDir(): Promise<string | null> {
  try {
    const { stdout: top } = await run("git", ["rev-parse", "--show-toplevel"], { timeout: 2000 });
    const root = top.trim();

    const custom = await run("git", ["config", "--get", "core.hooksPath"], { timeout: 2000 })
      .then((r) => r.stdout.trim())
      .catch(() => "");

    if (custom) return custom.startsWith("/") ? custom : join(root, custom);

    const { stdout: gitDir } = await run("git", ["rev-parse", "--git-dir"], {
      cwd: root,
      timeout: 2000,
    });
    const g = gitDir.trim();
    return join(g.startsWith("/") ? g : join(root, g), "hooks");
  } catch {
    return null;
  }
}

/** Where the card lives. Read from the config so a customised `--out` keeps working. */
function cardPath(): string {
  return process.env["TOKENCHIT_CARD"] ?? "tokenchit.svg";
}

function script(): string {
  const card = cardPath();
  return `#!/bin/sh
${MARK} — remove with: tokenchit hook uninstall
#
# Refreshes the stat card and stages it, so the committed SVG describes the work in the
# commit it travels with. Reads local logs only; makes no network request.

# Never block a commit over a stat card. A failure here — no agents yet, a locked database,
# no network for npx — must not stand between someone and their work.
if command -v tokenchit >/dev/null 2>&1; then
  tokenchit sync --out "${card}" >/dev/null 2>&1 || exit 0
else
  npx -y @tokenchit/cli@latest sync --out "${card}" >/dev/null 2>&1 || exit 0
fi

[ -f "${card}" ] && git add "${card}"
exit 0
`;
}

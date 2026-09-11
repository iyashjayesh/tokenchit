import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  buildCardSvg,
  formatTokens,
  PRICES_GENERATED,
  toCardOptions,
  type Layout,
  type Theme,
} from "@tokenchit/core";

import { flag, has, oneOf } from "../args.js";
import { readAuth } from "../auth.js";
import { warnIfCoerced } from "./init.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig } from "../config.js";
import { claudeContext, estimatedTotal } from "../claude-context.js";
import { scan } from "../scan.js";
import { renderStats } from "../stats-view.js";
import { asUrlPath, bold, dim, green, grey, note, say, spin, under, warn, yellow } from "../ui.js";

const LAYOUTS = ["default", "compact"] as const satisfies readonly Layout[];
const THEMES = ["auto", "light", "dark"] as const satisfies readonly Theme[];

/**
 * `chained` is set when `generate` is driving. The closing hints assume the reader is done
 * and choosing what to do next; inside the flow the next thing is about to happen on its
 * own, and telling someone to run the command already running is noise.
 */
export async function sync(argv: string[], chained = false): Promise<number> {
  const config = (await readConfig()) ?? DEFAULT_CONFIG;

  /*
   * Read once, here, because the card, the avatar gate and the published row all have to name
   * the same person.
   *
   * This used to resolve `flag ?? config.handle` while `publish` resolved
   * `flag ?? auth.handle ?? config.handle`, so a signed-in user in an organisation repo — where
   * the guessed handle is the org — got a card reading `@acme-corp` with no avatar (the gate
   * below requires the two to match) and a board row reading their real handle.
   */
  const signedIn = await readAuth().catch(() => null);

  // Checked before sanitising: `sanitizeHandle` falls back to "dev" on empty input, which
  // is the right default for the site's preview but would silently publish the wrong name
  // from someone's repo.
  const rawHandle = flag(argv, "--handle") ?? signedIn?.handle ?? config.handle;
  const handle = warnIfCoerced(rawHandle);
  const layout = oneOf(flag(argv, "--layout"), LAYOUTS, "layout") ?? config.layout;
  const theme = oneOf(flag(argv, "--theme"), THEMES, "theme") ?? config.theme;
  const out = flag(argv, "--out") ?? config.output;
  const json = has(argv, "--json");
  const dryRun = has(argv, "--dry-run");

  // Thousands of transcripts take a few seconds to walk. Silence over that long reads as a
  // hang, and the spinner writes to stderr so `--json` stays pipeable.
  const reading = spin("reading local agent logs…");
  /* Named and counted, because a scan that reports nothing looks the same as one that has
     hung. On a large corpus this walks thousands of files over several seconds. */
  const { stats, recovered } = await scan(config.agents, {
    // A dry run promises to write nothing, and the ledger is a file like any other.
    write: !dryRun,
    onProgress: ({ agent, events }) =>
      reading.update(
        events === 0
          ? `reading ${agent}…`
          : `reading ${agent}… ${events.toLocaleString()} events`,
      ),
  });
  reading.stop();

  if (stats.tokens === 0) {
    warn("No usage found. Run `tokenchit init` to see which agents were detected.");
    return 1;
  }

  if (json) {
    /*
     * The estimate is read here too, so the machine-readable answer matches the card.
     *
     * `--json` used to report only the verified figure while the terminal panel, the SVG and
     * the published row all showed the estimate — four consumers of one command's data, two
     * different answers, and the one meant for scripts was the odd one out. Both are carried
     * rather than one replaced: they mean different things and the difference is the point.
     */
    const claudeForJson = await claudeContext(stats, config.agents);

    // Maps do not survive JSON.stringify, and the day series is the interesting part for
    // anyone piping this into their own chart.
    say(
      JSON.stringify(
        {
          handle,
          tokens: stats.tokens,
          estimatedTokens: estimatedTotal(stats, claudeForJson),
          equivCostUsd: Number(stats.equivCostUsd.toFixed(2)),
          pricedShare: Number(stats.pricedShare.toFixed(4)),
          streakDays: stats.streakDays,
          activeDays: stats.activeDays,
          firstDay: stats.firstDay,
          lastDay: stats.lastDay,
          mix: stats.mix.map((m) => ({ agent: m.agent, pct: Number(m.pct.toFixed(2)) })),
          models: stats.models,
          byDay: Object.fromEntries(stats.byDay),
          windows: stats.windows,
          pricesGenerated: PRICES_GENERATED,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  /* Read here rather than inside the renderer: it touches the filesystem, and a function
     that turns a Stats into strings should not also be deciding what to open. */
  const claude = await claudeContext(stats, config.agents);

  /* The card carries the same headline the panel does, tilde and all. A card that disagreed
     with the terminal that wrote it, or with the profile it links to, is the bug this project
     has already fixed twice — which is why both read the one helper rather than each doing
     the arithmetic. */
  const estimated = estimatedTotal(stats, claude);

  /* Read off disk, banked by `login`, never fetched here: this command promises to make no
     network request and a test enforces it. Absent until somebody signs in, which is the same
     gate the board uses — an unproved handle gets no face. Only used when the card is being
     written for the handle it belongs to, so a `--handle` override cannot put one person's
     face on another's card. */
  const avatar =
    signedIn?.avatar && signedIn.handle.toLowerCase() === handle.toLowerCase()
      ? signedIn.avatar
      : undefined;

  const svg = buildCardSvg(
    toCardOptions(stats, {
      handle,
      layout,
      theme,
      ...(estimated != null ? { tokens: `~${formatTokens(estimated)}` } : {}),
      ...(avatar ? { avatar } : {}),
    }),
  );
  const target = resolve(process.cwd(), out);

  for (const line of renderStats(stats, handle, !chained, claude)) {
    say(chained && line !== "" ? under(line.replace(/^ {2}/, "")) : line);
  }
  say();

  /* Said once, and only when it did something. On a fresh install the bank is empty and this
     is silent; it starts speaking the first time retention takes a day it had already seen,
     which is the moment someone would otherwise notice their total quietly shrinking. */
  if (recovered.days > 0) {
    note(
      `ledger restored ${recovered.days} ${recovered.days === 1 ? "day" : "days"} ` +
        `the logs no longer hold (${formatTokens(recovered.tokens)})` +
        // Named here because this line is the moment somebody wonders where the extra days
        // came from, and the command that answers that was otherwise undiscoverable.
        dim(" — tokenchit ledger"),
    );
    say();
  }

  // Never let the dollar figure imply more precision than it has. An unpriced model is not
  // a free one, and a card that quietly drops a third of someone's usage from the cost is
  // worse than one that admits the gap.
  if (stats.pricedShare < 0.999) {
    const missing = stats.models.filter((m) => !m.priced).map((m) => m.model);
    warn(
      `Cost covers ${(stats.pricedShare * 100).toFixed(1)}% of tokens — ` +
        `no public price for: ${missing.join(", ")}`,
    );
  }

  if (!rawHandle) {
    warn(`No handle set — the card says "${handle}". Add one to ${CONFIG_FILE}, or pass --handle <you>.`);
  }

  if (dryRun) {
    say(dim(`  would write ${relative(process.cwd(), target)} (${svg.length} bytes)`));
    return 0;
  }

  /*
   * Wrapped, because the bare errno is unhelpful in the one place it surfaces.
   *
   * `sync --out /proc/nope/x.svg` reported `ENOENT: no such file or directory, mkdir '/proc'`
   * — a path the user never typed (the recursive mkdir's first failure point), with no mention
   * of `--out`, no mention of what they asked for, and no next step. A read-only checkout read
   * the same way.
   */
  try {
    // `--out docs/card.svg` is a reasonable thing to ask for before docs/ exists.
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, svg, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const why =
      code === "EACCES" || code === "EPERM"
        ? "no permission to write there"
        : code === "ENOENT"
          ? "that directory does not exist and could not be created"
          : ((err as Error).message ?? String(err));
    throw new Error(`could not write --out ${target}: ${why}`);
  }
  const rel = relative(process.cwd(), target);
  say(`${green("✓")} wrote ${bold(rel)} ${dim(`(${svg.length} bytes)`)}`);

  say();
  say(`  ${grey("embed")}     ![tokenchit — @${handle} AI coding agent usage](./${asUrlPath(rel)})`);
  // Committing on the user's behalf is not ours to decide — a tool that reads your logs
  // should not also decide what lands in your history on its first run.
  say(`  ${grey("commit")}    git add ${rel} && git commit -m "chore: update tokenchit"`);
  if (!chained) {
    say(`  ${grey("share")}     ${bold("tokenchit publish")} ${dim("— put this on the board")}`);
    // Offered where the manual step is being shown, which is the moment it becomes relevant.
    say(`  ${grey("automate")}  ${bold("tokenchit hook install")} ${dim("— stage the card on every commit")}`);
  }
  say();

  return 0;
}

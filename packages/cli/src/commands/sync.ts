import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  aggregate,
  buildCardSvg,
  PRICES_GENERATED,
  sanitizeHandle,
  toCardOptions,
  type Layout,
  type Theme,
} from "@tokenchit/core";
import { readAll } from "@tokenchit/core/adapters";

import { flag, has, oneOf } from "../args.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig } from "../config.js";
import { renderStats } from "../stats-view.js";
import { bold, dim, green, grey, say, spin, under, warn } from "../ui.js";

const LAYOUTS = ["default", "compact"] as const satisfies readonly Layout[];
const THEMES = ["auto", "light", "dark"] as const satisfies readonly Theme[];

/**
 * `chained` is set when `generate` is driving. The closing hints assume the reader is done
 * and choosing what to do next; inside the flow the next thing is about to happen on its
 * own, and telling someone to run the command already running is noise.
 */
export async function sync(argv: string[], chained = false): Promise<number> {
  const config = (await readConfig()) ?? DEFAULT_CONFIG;

  // Checked before sanitising: `sanitizeHandle` falls back to "dev" on empty input, which
  // is the right default for the site's preview but would silently publish the wrong name
  // from someone's repo.
  const rawHandle = flag(argv, "--handle") ?? config.handle;
  const handle = sanitizeHandle(rawHandle);
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
  const stats = await aggregate(
    readAll(config.agents, ({ agent, events }) =>
      reading.update(
        events === 0
          ? `reading ${agent}…`
          : `reading ${agent}… ${events.toLocaleString()} events`,
      ),
    ),
  );
  reading.stop();

  if (stats.tokens === 0) {
    warn("No usage found. Run `tokenchit init` to see which agents were detected.");
    return 1;
  }

  if (json) {
    // Maps do not survive JSON.stringify, and the day series is the interesting part for
    // anyone piping this into their own chart.
    say(
      JSON.stringify(
        {
          handle,
          tokens: stats.tokens,
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

  const svg = buildCardSvg(toCardOptions(stats, { handle, layout, theme }));
  const target = resolve(process.cwd(), out);

  for (const line of renderStats(stats, handle, !chained)) {
    say(chained && line !== "" ? under(line.replace(/^ {2}/, "")) : line);
  }
  say();

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

  // `--out docs/card.svg` is a reasonable thing to ask for before docs/ exists.
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, svg, "utf8");
  const rel = relative(process.cwd(), target);
  say(`${green("✓")} wrote ${bold(rel)} ${dim(`(${svg.length} bytes)`)}`);

  say();
  say(`  ${grey("embed")}     ![tokenchit](./${rel})`);
  // Committing on the user's behalf is not ours to decide — a tool that reads your logs
  // should not also decide what lands in your history on its first run.
  say(`  ${grey("commit")}    git add ${rel} && git commit -m "chore: update tokenchit"`);
  if (!chained) {
    say(`  ${grey("share")}     ${bold("tokenchit publish")} ${dim("— put this on the board")}`);
  }
  say();

  return 0;
}

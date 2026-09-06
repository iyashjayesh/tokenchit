import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  buildRecap,
  buildRecapSvg,
  formatTokens,
  sanitizeHandle,
  type Theme,
} from "@tokenchit/core";

import { flag, has, oneOf } from "../args.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig } from "../config.js";
import { scan } from "../scan.js";
import { bold, dim, green, note, say, spin, warn } from "../ui.js";

const THEMES = ["auto", "light", "dark"] as const satisfies readonly Theme[];

/** The ramp as blocks, so the terminal shows the same shape the SVG does. */
const BLOCKS = [" ", "░", "▒", "▓", "█"] as const;

export async function recap(argv: string[]): Promise<number> {
  const config = (await readConfig()) ?? DEFAULT_CONFIG;

  const rawHandle = flag(argv, "--handle") ?? config.handle;
  const handle = sanitizeHandle(rawHandle);
  const theme = oneOf(flag(argv, "--theme"), THEMES, "theme") ?? config.theme;
  const out = flag(argv, "--out") ?? "tokenchit-recap.svg";
  const json = has(argv, "--json");
  const dryRun = has(argv, "--dry-run");
  const yearFlag = flag(argv, "--year");
  /* Always a real year, never "all time under this year's heading". A recap that totals every
     year and stamps the current one on it is wrong for anybody with more than one year of
     history, and the flag is read as scoping by everyone who types it. */
  const year = yearFlag ? Number(yearFlag) : new Date().getFullYear();

  if (yearFlag && !Number.isInteger(year)) {
    throw new Error(`--year must be a whole number (got "${yearFlag}")`);
  }
  // `--year=-5` used to render a card headed "· -5". Bounded at the low end by the year the
  // first of these agents existed, and at the high end by the machine's own clock.
  if (year < 2020 || year > new Date().getFullYear()) {
    throw new Error(`--year must be between 2020 and ${new Date().getFullYear()} (got ${year})`);
  }

  /*
   * Through `scan`, like `sync` and `publish`, rather than straight from the logs.
   *
   * This read `aggregate(readAll(...))` directly, so it saw only what is still on disk while
   * every other command sees the logs merged with the ledger. Once retention deletes a day the
   * two answers diverge and stay diverged, and the recap — the one view whose whole subject is
   * a year of history — was the command least able to afford it. `scan` is the single place
   * that turns "what is on this machine" into a Stats precisely so this cannot happen; this was
   * the last caller that had not been moved onto it.
   */
  const reading = spin("reading local agent logs…");
  const { stats, recovered } = await scan(config.agents, {
    // A dry run promises to write nothing, and the ledger is a file like any other.
    write: !dryRun,
    // Scoped at the aggregation so every tile, the grid and the model table describe the year
    // in the heading — the flag used to reach the streak and nothing else.
    year,
    onProgress: ({ agent, events }) =>
      reading.update(
        events === 0 ? `reading ${agent}…` : `reading ${agent}… ${events.toLocaleString()} events`,
      ),
  });
  reading.stop();

  if (stats.tokens === 0) {
    // Distinguished, because "no usage in 2025" and "no agents on this machine" are different
    // problems and the second suggestion is useless for the first.
    warn(
      yearFlag
        ? `No usage found in ${year}. Try \`tokenchit recap\` for the current year.`
        : "No usage found. Run `tokenchit init` to see which agents were detected.",
    );
    return 1;
  }

  const r = buildRecap(stats, { year });

  /* Said out loud here as in `sync`: a recap that silently includes days the transcripts no
     longer hold invites the reader to check it against their logs and find it wrong. */
  if (recovered.days > 0 && !json) {
    note(
      `ledger restored ${recovered.days} ${recovered.days === 1 ? "day" : "days"} ` +
        `the logs no longer hold (${formatTokens(recovered.tokens)})`,
    );
  }

  if (json) {
    say(JSON.stringify(r, null, 2));
    return 0;
  }

  say();
  say(`  ${bold(`@${handle}`)} ${dim("·")} ${bold(String(r.year))}`);
  say();
  say(
    `  ${bold(r.tiles.totalTokens)} tokens  ${dim("·")}  ` +
      `${bold(r.tiles.equivCost)} equiv. API cost  ${dim("·")}  ` +
      `${bold(r.tiles.topModel)}  ${dim("·")}  ` +
      `${bold(r.tiles.longestStreak)} streak`,
  );
  say();

  // Hour ruler. Each label is written into the column it marks rather than joined, so a
  // two-character label occupies its own column and the next one instead of shunting the
  // rest of the ruler out of step with the grid.
  const ruler = Array(24).fill(" ");
  for (let h = 0; h < 24; h += 6) {
    const label = String(h).padStart(2, "0");
    ruler[h] = label[0] as string;
    if (h + 1 < 24) ruler[h + 1] = label[1] as string;
  }
  say(`  ${dim(`     ${ruler.join("")}`)}`);

  for (const row of r.rows) {
    const grid = row.levels.map((l) => BLOCKS[l]).join("");
    const label = row.busiest ? bold(row.day) : dim(row.day);
    const share = `${String(row.share).padStart(3)}%`;
    say(`  ${label}  ${grid}  ${dim(share)}`);
  }

  if (r.peak) {
    say();
    say(dim(`  peak ${pad(r.peak.from)}:00-${pad(r.peak.to + 1)}:00  ·  ${r.activeDays} active days`));
  }

  say();
  /* Width from the longest name rather than a hardcoded 22, which real model ids exceed —
     `claude-haiku-4-5-20251001` is 25 — shunting the token and cost columns right and
     visibly breaking the table mid-list. `stats-view.ts` already did it this way. */
  const nameW = Math.max(...r.models.map((m) => m.model.length));
  for (const m of r.models) {
    say(
      `  ${m.model.padEnd(nameW)} ${m.tokens.padStart(8)} ${m.cost.padStart(12)}` +
        (m.priced ? "" : dim("  no public price")),
    );
  }
  say();

  if (!rawHandle) {
    warn(`No handle set — the recap says "${handle}". Add one to ${CONFIG_FILE}.`);
  }

  const svg = buildRecapSvg({ handle, recap: r, theme });
  const target = resolve(process.cwd(), out);
  const rel = relative(process.cwd(), target);

  if (dryRun) {
    say(dim(`  would write ${rel} (${svg.length} bytes)`));
    return 0;
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, svg, "utf8");
  say(`${green("✓")} wrote ${bold(rel)} ${dim(`(${svg.length} bytes)`)}`);
  say();
  say(`  ![tokenchit — @${handle} ${r.year} AI coding agent recap](./${rel})`);
  say();

  return 0;
}

const pad = (h: number) => String(h).padStart(2, "0");

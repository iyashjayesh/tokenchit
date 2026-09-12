import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  buildPeriodReport,
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
  /*
   * `--week` and `--month` report the most recent *completed* calendar period against the one
   * before it, and are terminal-and-JSON only: they deliberately write no SVG.
   *
   * The recap SVG is a year card — its heatmap is a weekday-by-hour grid and its tiles are
   * annual. Rendering seven days into that frame would produce a mostly-empty card that looks
   * like a quiet year rather than a short window, so the period view stays textual until a
   * card designed for it exists. `--year` and the default are untouched.
   */
  const periodFlag = has(argv, "--week") ? "week" : has(argv, "--month") ? "month" : null;
  const yearFlag = flag(argv, "--year");

  if (periodFlag && yearFlag) {
    throw new Error("--year scopes a whole year; --week and --month report a completed period. Pick one.");
  }
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
  const { stats, recovered, ledger } = await scan(config.agents, {
    // A dry run promises to write nothing, and the ledger is a file like any other.
    write: !dryRun,
    /* Scoped at the aggregation so every tile, the grid and the model table describe the year
       in the heading — the flag used to reach the streak and nothing else.

       Left unscoped for `--week`/`--month`: a completed week in early January reaches back
       into December, and a year filter would silently truncate the comparison baseline to
       zero and then report it as a collapse in usage. */
    year: periodFlag ? undefined : year,
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

  if (periodFlag) return reportPeriod(stats, periodFlag, handle, json, ledger.since);

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
    /* Coverage stated beside the window rather than buried. The peak reads observed clock
       times only, so on a mostly-recovered history it describes a minority of the tokens and
       the reader has to be told which minority. */
    const coverage =
      r.peakCoverage < 0.999
        ? `  ${dim(`(from ${Math.round(r.peakCoverage * 100)}% of tokens with an observed clock)`)}`
        : "";
    say(
      dim(`  peak ${pad(r.peak.from)}:00-${pad(r.peak.to + 1)}:00  ·  ${r.activeDays} active days`) +
        coverage,
    );
  } else if (r.tokens > 0) {
    say();
    say(dim("  peak hours unavailable — every day here came back from the ledger, which"));
    say(dim("  records a date and not a clock"));
  }

  // A bar per calendar month. Empty months are printed, because a gap is itself a fact.
  if (r.months.some((m) => m.tokens > 0)) {
    say();
    for (const m of r.months) {
      const bar = "█".repeat(Math.round((m.share / 100) * 24)).padEnd(24, " ");
      say(`  ${dim(m.label)}  ${m.tokens > 0 ? bar : dim(bar)}  ${m.tokens > 0 ? m.display : dim("—")}`);
    }
  }

  if (r.biggestDay) {
    say();
    say(`  ${dim("biggest day")}  ${bold(r.biggestDay.day)} ${dim("·")} ${bold(r.biggestDay.display)} ${dim("tokens")}`);
  }

  if (r.badges.length > 0) {
    say();
    for (const b of r.badges) say(`  ${bold(b.label)}  ${dim(b.detail)}`);
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

/**
 * Print a completed-period report.
 *
 * Terminal and JSON only — see the note on `periodFlag`. The comparability line is not
 * decoration: when the previous period predates this machine's history, a percentage would be
 * measuring the installation date, so the number is withheld and the reason is printed in its
 * place rather than left as a dash for the reader to interpret.
 */
function reportPeriod(
  stats: Parameters<typeof buildPeriodReport>[0],
  kind: "week" | "month",
  handle: string,
  json: boolean,
  historyFrom: string | null,
): number {
  const r = buildPeriodReport(stats, { kind, historyFrom });

  if (json) {
    say(JSON.stringify(r, null, 2));
    return 0;
  }

  const { from, to } = r.current.bounds;
  say();
  say(`  ${bold(`@${handle}`)} ${dim("·")} ${bold(kind === "week" ? "last full week" : "last full month")} ${dim(`${from} – ${to}`)}`);
  say();
  say(
    `  ${bold(r.current.display)} tokens  ${dim("·")}  ` +
      `${bold(String(r.current.activeDays))} active ${r.current.activeDays === 1 ? "day" : "days"}`,
  );

  const sign = r.deltaTokens >= 0 ? "+" : "−";
  const magnitude = formatTokens(Math.abs(r.deltaTokens));
  const prev = r.previous.bounds;

  say();
  if (r.deltaPct !== null) {
    const pctSign = r.deltaPct >= 0 ? "+" : "−";
    say(
      `  ${dim("vs")} ${dim(`${prev.from} – ${prev.to}`)}  ` +
        `${bold(`${sign}${magnitude}`)} ${dim("tokens")}  ${dim("·")}  ` +
        `${bold(`${pctSign}${Math.abs(r.deltaPct).toFixed(1)}%`)}`,
    );
  } else {
    say(`  ${dim("vs")} ${dim(`${prev.from} – ${prev.to}`)}  ${bold(`${sign}${magnitude}`)} ${dim("tokens")}`);
    // The reason, always. A withheld percentage with no explanation reads as a bug.
    if (!r.comparability.comparable) {
      say(`  ${dim(`no percentage: ${r.comparability.detail}`)}`);
    }
  }

  if (r.current.biggestDay) {
    say();
    say(`  ${dim("biggest day")}  ${bold(r.current.biggestDay.day)} ${dim("·")} ${bold(r.current.biggestDay.display)} ${dim("tokens")}`);
  }

  say();
  return 0;
}

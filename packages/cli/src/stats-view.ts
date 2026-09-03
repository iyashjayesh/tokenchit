/**
 * The terminal rendering of a Stats.
 *
 * This is the command's real output, so it goes to stdout; only progress and warnings go to
 * stderr. It is deliberately the same set of figures the card and the profile page show —
 * someone who runs `sync`, embeds the card and then opens their profile should not find
 * three different numbers.
 *
 * Everything degrades: with NO_COLOR or a pipe the bars and sparklines are still meaningful
 * ASCII-ish glyphs, and nothing here depends on knowing the terminal width beyond a clamp.
 */
import { formatTokens, formatUsd, type Stats } from "@tokenchit/core";

import { bar, bold, cyan, dim, grey, magenta, pad, padStart, sparkline, width } from "./ui.js";

/** Wide enough for the four headline figures, narrow enough for a split pane. */
const MIN = 64;
const MAX = 84;

const term = () => Math.max(MIN, Math.min(MAX, (process.stdout.columns ?? 80) - 4));

/** `10.2B` over `tokens`, four to a row, sized to whichever is wider. */
function headline(stats: Stats): string[] {
  const cells: Array<[string, string]> = [
    [formatTokens(stats.tokens), "tokens"],
    [stats.equivCostUsd > 0 ? formatUsd(stats.equivCostUsd) : "—", "equiv. cost"],
    [`${stats.streakDays}d`, "streak"],
    [String(stats.activeDays), "active days"],
  ];

  const w = cells.map(([v, l]) => Math.max(width(v), width(l)) + 3);
  return [
    "  " + cells.map(([v], i) => pad(bold(v), w[i]!)).join(""),
    "  " + cells.map(([, l], i) => pad(grey(l), w[i]!)).join(""),
  ];
}

/**
 * The last 30 local days as a sparkline.
 *
 * Days with no activity are included as gaps rather than skipped — a fortnight off should
 * look like a fortnight off, not like the bars simply moving closer together.
 */
function recent(stats: Stats): string[] {
  const days = 30;
  const today = new Date();
  const series: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    series.push(stats.byDay.get(key) ?? 0);
  }

  const week = stats.windows.d7.tokens;
  const trailer = week > 0 ? grey(`  ${formatTokens(week)} in 7d`) : "";
  return ["  " + grey("30d") + "  " + cyan(sparkline(series)) + trailer];
}

function agents(stats: Stats): string[] {
  if (stats.mix.length === 0) return [];
  const nameW = Math.max(...stats.mix.map((m) => m.agent.length));
  const cells = Math.max(12, Math.min(28, term() - nameW - 24));

  const out = ["", "  " + grey("agents")];
  for (const m of stats.mix) {
    const tokens = stats.byAgent.get(m.agent) ?? 0;
    out.push(
      "    " +
        pad(m.agent, nameW + 2) +
        pad(magenta(bar(m.pct / 100, cells)), cells + 1) +
        padStart(`${m.pct.toFixed(1)}%`, 6) +
        grey(padStart(formatTokens(tokens), 10)),
    );
  }
  return out;
}

/**
 * The priced models, biggest first.
 *
 * An unpriced model still appears, with a dash where the cost would be. Dropping it would
 * make the token column and the cost column describe different sets of work without saying
 * so — the same reason the card carries an accuracy warning.
 */
function models(stats: Stats, limit = 5): string[] {
  if (stats.models.length === 0) return [];
  const top = stats.models.slice(0, limit);
  const nameW = Math.max(...top.map((m) => m.model.length));

  const out = ["", "  " + grey("models")];
  for (const m of top) {
    out.push(
      "    " +
        pad(m.model, nameW + 2) +
        padStart(formatTokens(m.tokens), 8) +
        grey(padStart(m.priced ? formatUsd(m.equivCostUsd, true) : "—", 12)),
    );
  }
  if (stats.models.length > limit) {
    out.push("    " + grey(`+${stats.models.length - limit} more`));
  }
  return out;
}

/** The full panel, as lines. Returned rather than printed so callers control placement. */
export function renderStats(stats: Stats, handle: string): string[] {
  const w = term();
  const title = ` @${handle} `;
  const rule = "─".repeat(Math.max(0, w - width(title) - 3));

  const range =
    stats.firstDay && stats.lastDay ? grey(`  ${stats.firstDay} → ${stats.lastDay}`) : "";

  const lines = [
    "",
    `  ${dim("╭─")}${bold(title)}${dim(rule)}`,
    "",
    ...headline(stats),
    "",
    ...recent(stats),
    ...agents(stats),
    ...models(stats),
    "",
    `  ${dim("╰" + "─".repeat(Math.max(0, w - 2)))}`,
    range,
  ];

  // Padding is how the columns line up; it has no business surviving to the end of a line,
  // where it only shows up as trailing whitespace in a copied terminal buffer.
  return lines.map((l) => l.replace(/\s+$/, ""));
}

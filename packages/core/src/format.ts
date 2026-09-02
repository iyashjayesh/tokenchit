import type { CardOptions } from "./card-svg.js";
import type { Stats } from "./aggregate.js";

/**
 * "4.24B", "890M", "12.5K" — three significant figures, because the card gives this number
 * about 90px and a developer comparing cards cares about the magnitude, not the units digit.
 */
export function formatTokens(n: number): string {
  if (n < 1_000) return String(n);
  for (const [limit, suffix] of [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    if (n >= limit) {
      const v = n / limit;
      return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)}${suffix}`;
    }
  }
  return String(n);
}

/** "$1,284" for the card; `cents` gives "$1,284.60" for the recap. */
export function formatUsd(n: number, cents = false): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

/** "63d" — the card has room for a number and a unit, nothing more. */
export const formatStreak = (days: number): string => `${days}d`;

/**
 * Turn aggregated stats into the card builder's inputs.
 *
 * The dollar figure becomes an em dash rather than "$0" when nothing could be priced. A card
 * reading $0 says "this developer spent nothing"; a dash says "this number is not available",
 * which is the truth for someone running entirely on bundled models.
 */
export function toCardOptions(
  stats: Stats,
  opts: { handle: string; syncedAt?: Date } & Partial<Omit<CardOptions, "handle">>,
): CardOptions {
  const { handle, syncedAt = new Date(), ...rest } = opts;

  return {
    handle,
    tokens: formatTokens(stats.tokens),
    spend: stats.pricedShare > 0 ? formatUsd(stats.equivCostUsd) : "—",
    streak: formatStreak(stats.streakDays),
    mix: stats.mix.map((m) => ({ agent: m.agent, pct: m.pct })),
    syncedAt,
    ...rest,
  };
}

import type { Stats } from "./aggregate.js";
import { formatTokens, formatUsd } from "./format.js";

/** The design's five-step ramp, coldest first. */
export const RAMP = ["#F5F4EE", "#E7F5BE", "#C6FF3D", "#FFD23D", "#FF5C3D"] as const;

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export type RecapRow = {
  day: string;
  /** 24 ramp colours, one per hour. */
  cells: string[];
  /** 24 ramp levels 0-4 — the same data, for a terminal or a test. */
  levels: number[];
  tokens: number;
  /** This day against the busiest day, 0-100. */
  share: number;
  busiest: boolean;
};

export type Recap = {
  year: number;
  tiles: {
    totalTokens: string;
    equivCost: string;
    topModel: string;
    longestStreak: string;
  };
  rows: RecapRow[];
  /** Inclusive hour range holding the busiest stretch, or null when there is no data. */
  peak: { from: number; to: number } | null;
  agents: { agent: string; pct: number; tokens: string; cost: string }[];
  models: { model: string; tokens: string; cost: string; priced: boolean }[];
  activeDays: number;
  tokens: number;
};

/**
 * Colour each cell by the rank of its value, not by its magnitude.
 *
 * Token counts are violently skewed — a single long session can hold more tokens than a
 * whole quiet week — so scaling linearly against the busiest cell paints one square hot and
 * leaves everything else indistinguishable. Ranking across the distinct values is what
 * GitHub's contribution graph does, it is what people already know how to read, and it
 * guarantees a legible spread whether someone burns 40M tokens a year or 4B.
 *
 * Spreading across *distinct* values rather than quartile thresholds is what makes the
 * busiest cell always reach the top of the ramp and the quietest active cell always sit at
 * the bottom. Threshold bucketing put a lone active hour at the palest step, which reads as
 * "barely used" for what is in fact the only thing that happened.
 */
export function quantise(cells: number[], scale: number[]): number[] {
  return cells.map((n) => {
    if (n <= 0) return 0;
    const i = scale.indexOf(n);
    if (scale.length <= 1) return 4; // one intensity, and it is the busiest
    return 1 + Math.round((3 * i) / (scale.length - 1));
  });
}

/** The distinct non-zero cell values, ascending — the ranks the ramp is spread across. */
export function scaleOf(values: number[]): number[] {
  return [...new Set(values.filter((n) => n > 0))].sort((a, b) => a - b);
}

/**
 * Turn aggregated stats into the year-in-review model.
 *
 * Day totals come from the raw counts, never the quantised level. Quantising first collapses
 * several days onto the same figure, which reads as a rendering bug rather than a fact.
 */
export function buildRecap(stats: Stats, opts: { year?: number; now?: Date } = {}): Recap {
  const year = opts.year ?? (opts.now ?? new Date()).getFullYear();

  const maxDay = Math.max(0, ...stats.byWeekday);
  // One scale across the whole grid, so a cell's colour means the same thing on a Sunday as
  // it does on a Tuesday.
  const scale = scaleOf(stats.heat.flat());

  const rows: RecapRow[] = WEEKDAYS.map((day, i) => {
    const hours = stats.heat[i] ?? Array(24).fill(0);
    const levels = quantise(hours, scale);
    const tokens = stats.byWeekday[i] ?? 0;

    return {
      day,
      cells: levels.map((l) => RAMP[l] ?? RAMP[0]),
      levels,
      tokens,
      share: maxDay > 0 ? Math.round((tokens / maxDay) * 100) : 0,
      busiest: tokens > 0 && tokens === maxDay,
    };
  });

  const topModel = [...stats.byModel.keys()][0] ?? "—";

  return {
    year,
    tiles: {
      totalTokens: formatTokens(stats.tokens),
      equivCost: stats.pricedShare > 0 ? formatUsd(stats.equivCostUsd, true) : "—",
      topModel,
      longestStreak: `${stats.streakDays}d`,
    },
    rows,
    peak: peakWindow(stats.byHour),
    agents: stats.mix.map((m) => {
      const tokens = stats.byAgent.get(m.agent) ?? 0;
      return {
        agent: m.agent,
        pct: m.pct,
        tokens: formatTokens(tokens),
        // Per-agent cost is not tracked separately; the models table carries the breakdown.
        cost: "—",
      };
    }),
    models: stats.models.map((m) => ({
      model: m.model,
      tokens: formatTokens(m.tokens),
      cost: m.priced ? formatUsd(m.equivCostUsd, true) : "—",
      priced: m.priced,
    })),
    activeDays: stats.activeDays,
    tokens: stats.tokens,
  };
}

/**
 * The contiguous run of hours holding the bulk of the work.
 *
 * Widened from the busiest hour outward while each neighbour still clears a third of the
 * peak, which tracks how a working day actually tails off. A fixed window would be wrong
 * for anyone who does not keep office hours.
 */
function peakWindow(byHour: number[]): { from: number; to: number } | null {
  const peak = Math.max(0, ...byHour);
  if (peak <= 0) return null;

  const centre = byHour.indexOf(peak);
  const floor = peak / 3;

  let from = centre;
  let to = centre;
  while (from > 0 && (byHour[from - 1] as number) >= floor) from -= 1;
  while (to < 23 && (byHour[to + 1] as number) >= floor) to += 1;

  return { from, to };
}

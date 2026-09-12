import type { Stats } from "./aggregate.js";
import { formatTokens, formatUsd } from "./format.js";

/** The design's five-step ramp, coldest first. */
/*
 * Five levels that are actually five levels.
 *
 * The old ramp — #F5F4EE #E7F5BE #C6FF3D #FFD23D #FF5C3D — ran lime to yellow to coral, which
 * looks like a scale and does not behave as one. Its relative luminances were 0.903, 0.860,
 * 0.839, 0.677, 0.293: the first three steps were 1.05:1, 1.02:1 and 1.22:1, a band narrower
 * than the difference between #FFFFFF and #FCFCFC. Nothing, a little and a fair amount were
 * separated almost entirely by hue, which is what a monochrome screen, a bright room or a
 * colour-vision deficiency removes — and under deuteranopia levels 2 and 3 merged as well, so
 * five encoded levels delivered about two readable ones.
 *
 * Single hue, monotonically darkening: steps of 1.33, 1.37, 2.23 and 2.37, ordered the same
 * way in greyscale as in colour. This is why GitHub's own graph is one hue and not three.
 */
export const RAMP = ["#F0EFE9", "#BEDD6E", "#8CC42B", "#568018", "#2E420C"] as const;

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const MONTH_LABELS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

/**
 * A deterministic observation about the *shape* of someone's activity.
 *
 * Deliberately not achievements. Nothing here rewards volume: no spending milestone, no
 * "you burned 10B tokens" trophy, no percentile against other users. This project's own
 * position is that the card measures usage rather than output and cannot tell work from a
 * retry loop, so a badge celebrating a bigger number would be arguing against the product.
 *
 * Every badge is computed from figures already in `Stats`, with a stated threshold and a
 * stated minimum. None of them infers a session, and the time-of-day ones read only observed
 * clocks. When the data cannot support a badge it is absent — never awarded at a lower bar.
 */
export type Badge = {
  id: BadgeId;
  label: string;
  /** One line, in the user's terms, saying what was measured. */
  detail: string;
};

export type BadgeId =
  | "night-owl"
  | "weekend-zombie"
  | "agent-explorer"
  | "no-days-off"
  | "steady-hand";

/**
 * Enough observed tokens for a time-of-day claim to mean anything.
 *
 * Below this the clock series is a handful of events and a "night owl" verdict would be
 * noise. Expressed in tokens rather than events because one Codex rollout is one event.
 */
const MIN_CLOCK_TOKENS = 100_000;
/** Enough distinct active days for a weekday or consistency claim. */
const MIN_ACTIVE_DAYS = 14;
/** Share of observed tokens after 22:00 or before 05:00 that earns Night Owl. */
const NIGHT_SHARE = 0.25;
/** Share of observed tokens on Sat/Sun that earns Weekend Zombie. A flat week is 2/7 ≈ 0.286. */
const WEEKEND_SHARE = 0.35;
/** Agents that must each clear this share of tokens to count as genuinely in use. */
const AGENT_SHARE = 0.1;
/** Streak length that earns No Days Off. */
const STREAK_DAYS = 14;

/**
 * Badges for a set of stats.
 *
 * Exported so the CLI, the JSON output, the SVG and the MCP tools all read one implementation
 * and cannot drift into disagreeing about what somebody earned.
 */
export function buildBadges(stats: Stats): Badge[] {
  const badges: Badge[] = [];
  const clock = stats.clockTokens;
  const enoughClock = clock >= MIN_CLOCK_TOKENS;
  const enoughDays = stats.activeDays >= MIN_ACTIVE_DAYS;

  if (enoughClock) {
    // 22:00-23:59 plus 00:00-04:59. Local hours, matching every other bucket here.
    let night = 0;
    for (let h = 0; h < 24; h += 1) {
      if (h >= 22 || h < 5) night += stats.clockByHour[h] ?? 0;
    }
    const share = night / clock;
    if (share >= NIGHT_SHARE) {
      badges.push({
        id: "night-owl",
        label: "Night Owl",
        detail: `${pct(share)} of observed tokens between 22:00 and 05:00`,
      });
    }
  }

  if (enoughClock && enoughDays) {
    const weekend = (stats.clockByWeekday[5] ?? 0) + (stats.clockByWeekday[6] ?? 0);
    const share = weekend / clock;
    if (share >= WEEKEND_SHARE) {
      badges.push({
        id: "weekend-zombie",
        label: "Weekend Zombie",
        detail: `${pct(share)} of observed tokens on Saturday and Sunday`,
      });
    }
  }

  /* Agent Explorer counts agents that carry real weight, not agents that appear. One stray
     event from a second agent is not exploration, and a 1%-share tail would award this to
     almost everyone who ever opened a different tool once. */
  const used = stats.mix.filter((m) => m.pct / 100 >= AGENT_SHARE).length;
  if (used >= 2) {
    badges.push({
      id: "agent-explorer",
      label: "Agent Explorer",
      detail: `${used} agents each above ${Math.round(AGENT_SHARE * 100)}% of tokens`,
    });
  }

  if (stats.streakDays >= STREAK_DAYS) {
    badges.push({
      id: "no-days-off",
      label: "No Days Off",
      detail: `${stats.streakDays}-day active streak`,
    });
  }

  /*
   * Steady Hand is the counterweight, and the only badge here that a heavier user is *less*
   * likely to earn: it describes even distribution across active days, not volume. Measured
   * as the busiest day's share of the total — a low share means the work was spread out.
   */
  if (enoughDays && stats.biggestDay && stats.tokens > 0) {
    const concentration = stats.biggestDay.tokens / stats.tokens;
    const even = 1 / stats.activeDays;
    if (concentration <= even * 2.5) {
      badges.push({
        id: "steady-hand",
        label: "Steady Hand",
        detail: `busiest day was only ${pct(concentration)} of the total across ${stats.activeDays} active days`,
      });
    }
  }

  return badges;
}

const pct = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * Every month of the named year, including the empty ones.
 *
 * Twelve rows rather than only the months with activity, because a gap is information: a
 * chart that silently omits March reads as though March did not exist, while a March at zero
 * reads as a month off. `share` is against the busiest month, so the bars are comparable.
 */
function monthsOf(stats: Stats, year: number): Recap["months"] {
  const raw = MONTH_LABELS.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: key, label, tokens: stats.byMonth.get(key) ?? 0 };
  });

  const busiest = Math.max(0, ...raw.map((m) => m.tokens));
  return raw.map((m) => ({
    ...m,
    display: formatTokens(m.tokens),
    share: busiest > 0 ? Math.round((m.tokens / busiest) * 100) : 0,
  }));
}

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
  /**
   * Inclusive hour range holding the busiest stretch, or null when nothing was observed.
   *
   * Computed from observed clock times only. A day recovered from the ledger is replayed at
   * local noon, and a "peak" derived from that reports the tool's own synthesised timestamp
   * back to the user as a fact about their day. `peakCoverage` says how much of the total the
   * window actually saw.
   */
  peak: { from: number; to: number } | null;
  /** Share of tokens, 0-1, whose clock time was observed rather than synthesised. */
  peakCoverage: number;
  /** Tokens per local month within the selected year, ascending. */
  months: { month: string; label: string; tokens: number; display: string; share: number }[];
  /** The heaviest single local day in the selected window. */
  biggestDay: { day: string; tokens: number; display: string } | null;
  /** Deterministic activity patterns. Empty when the data cannot support any. */
  badges: Badge[];
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
/**
 * The longest unbroken run of active days inside a year.
 *
 * `stats.streakDays` is the *current* run — "consecutive local days with activity, ending
 * today or yesterday", per aggregate.ts — and this tile has always been labelled
 * `longestStreak`, rendered as STREAK on the recap card and printed by `tokenchit recap`. In a
 * year in review the two are barely related: read it in January and the current run is a day
 * or two, while the year's best might have been thirty in June. The field name was right and
 * the value was wrong.
 *
 * Counted over the calendar year the recap is about, not over all of history, for the same
 * reason: a run that ended in a previous year is not this year's achievement.
 */
function longestRun(byDay: Map<string, number>, year: number): number {
  const days = [...byDay.entries()]
    .filter(([day, tokens]) => tokens > 0 && day.startsWith(`${year}-`))
    .map(([day]) => day)
    .sort();

  let best = 0;
  let run = 0;
  let previous: number | null = null;

  for (const day of days) {
    // Parsed as UTC noon: the keys are local YYYY-MM-DD, and midnight in a zone that shifts
    // for daylight saving can land a day either side of itself.
    const at = Date.parse(`${day}T12:00:00Z`);
    run = previous !== null && at - previous === 86_400_000 ? run + 1 : 1;
    if (run > best) best = run;
    previous = at;
  }

  return best;
}

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
      longestStreak: `${longestRun(stats.byDay, year)}d`,
    },
    rows,
    /* Observed clocks only. This is a change from reading `byHour`: that series includes
       ledger replays pinned to local noon, so a heavily-recovered history used to produce a
       confident "peak 12:00-12:00" that was an artefact of this tool's own replay and not
       an observation of the user. */
    peak: peakWindow(stats.clockByHour),
    peakCoverage: stats.tokens > 0 ? stats.clockTokens / stats.tokens : 0,
    months: monthsOf(stats, year),
    biggestDay: stats.biggestDay
      ? {
          day: stats.biggestDay.day,
          tokens: stats.biggestDay.tokens,
          display: formatTokens(stats.biggestDay.tokens),
        }
      : null,
    badges: buildBadges(stats),
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

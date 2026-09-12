import { localDay, type Stats } from "./aggregate.js";
import { formatTokens } from "./format.js";

/**
 * Completed-calendar-period reporting, with a comparison against the period before.
 *
 * "Completed" is the load-bearing word. A week that is still running is not comparable to a
 * finished one — reporting Tuesday's three days against last week's seven and calling the
 * difference a decline is the easiest way for a usage tool to lie. So the window is always
 * the most recent period that has *fully elapsed*, and today is deliberately outside it.
 *
 * Weeks are Monday-to-Sunday, matching the heatmap and `byWeekday` everywhere else here.
 * Months are calendar months in local time.
 */
export type PeriodKind = "week" | "month";

export type PeriodBounds = {
  /** Inclusive local `YYYY-MM-DD`. */
  from: string;
  /** Inclusive local `YYYY-MM-DD`. */
  to: string;
  /** Calendar days spanned. 7 for a week; 28-31 for a month. */
  days: number;
};

export type PeriodTotals = {
  bounds: PeriodBounds;
  tokens: number;
  display: string;
  activeDays: number;
  /** Heaviest day inside the period, or null when it was silent. */
  biggestDay: { day: string; tokens: number; display: string } | null;
};

/**
 * Why a percentage is not being shown, when it is not.
 *
 * Stated rather than implied: a "—" where a number should be is exactly the kind of gap a
 * reader fills in with an assumption.
 */
export type ComparabilityNote =
  | { comparable: true }
  | { comparable: false; reason: "no-baseline"; detail: string }
  | { comparable: false; reason: "partial-baseline"; detail: string };

export type PeriodReport = {
  kind: PeriodKind;
  current: PeriodTotals;
  previous: PeriodTotals;
  /** Signed absolute difference in tokens. Always meaningful. */
  deltaTokens: number;
  /**
   * Signed percentage change, or null when the baseline cannot support one.
   *
   * Null is not zero. A prior period that predates this machine's history is not a baseline —
   * it is an absence being read as a low number, which turns "I installed the tool last
   * Wednesday" into "usage tripled".
   */
  deltaPct: number | null;
  comparability: ComparabilityNote;
};

const DAY_MS = 86_400_000;

/** A local `YYYY-MM-DD` as a local-noon Date, which is DST-proof for day arithmetic. */
function noon(day: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Step whole local days.
 *
 * Via `setDate` on a local-noon Date rather than millisecond addition: on a DST transition a
 * day is 23 or 25 hours long, and `+= 86_400_000` silently skips or repeats a date twice a
 * year. Noon keeps the result inside the intended day under either shift.
 */
function addDays(day: string, n: number): string {
  const d = noon(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** Monday-first weekday index for a local day string. */
const weekdayOf = (day: string): number => (noon(day).getDay() + 6) % 7;

const spanDays = (from: string, to: string): number =>
  Math.round((noon(to).getTime() - noon(from).getTime()) / DAY_MS) + 1;

/**
 * The most recent period that has fully elapsed as of `now`.
 *
 * For a week: the Monday-to-Sunday block before the one containing today. For a month: the
 * calendar month before the one `now` sits in. The period containing `now` is excluded
 * precisely because it is unfinished.
 */
export function completedPeriod(kind: PeriodKind, now: Date): PeriodBounds {
  const today = localDay(now);

  if (kind === "week") {
    const thisMonday = addDays(today, -weekdayOf(today));
    const from = addDays(thisMonday, -7);
    return { from, to: addDays(from, 6), days: 7 };
  }

  const firstOfThis = `${today.slice(0, 7)}-01`;
  const to = addDays(firstOfThis, -1);
  const from = `${to.slice(0, 7)}-01`;
  // Derived by stepping, so February and leap years need no special case.
  return { from, to, days: spanDays(from, to) };
}

/** The period immediately before the given one, of the same kind. */
export function previousPeriod(kind: PeriodKind, bounds: PeriodBounds): PeriodBounds {
  if (kind === "week") {
    const from = addDays(bounds.from, -7);
    return { from, to: addDays(from, 6), days: 7 };
  }

  const to = addDays(bounds.from, -1);
  const from = `${to.slice(0, 7)}-01`;
  return { from, to, days: spanDays(from, to) };
}

function totalsFor(stats: Stats, bounds: PeriodBounds): PeriodTotals {
  let tokens = 0;
  let activeDays = 0;
  let biggest: { day: string; tokens: number } | null = null;

  // String comparison is valid for zero-padded ISO dates, and avoids re-parsing every key.
  for (const [day, n] of stats.byDay) {
    if (day < bounds.from || day > bounds.to) continue;
    tokens += n;
    if (n > 0) activeDays += 1;
    if (!biggest || n > biggest.tokens) biggest = { day, tokens: n };
  }

  return {
    bounds,
    tokens,
    display: formatTokens(tokens),
    activeDays,
    biggestDay: biggest ? { ...biggest, display: formatTokens(biggest.tokens) } : null,
  };
}

/**
 * Build a completed-period report.
 *
 * `historyFrom` is the first day this machine can speak for — the ledger's `since`, or the
 * earliest observed day. It decides whether the baseline is a measurement or just the edge of
 * what was ever recorded.
 */
export function buildPeriodReport(
  stats: Stats,
  opts: { kind: PeriodKind; now?: Date; historyFrom?: string | null },
): PeriodReport {
  const now = opts.now ?? new Date();
  const bounds = completedPeriod(opts.kind, now);
  const prevBounds = previousPeriod(opts.kind, bounds);

  const current = totalsFor(stats, bounds);
  const previous = totalsFor(stats, prevBounds);

  const comparability = assess(previous, prevBounds, opts.historyFrom ?? stats.firstDay);
  const deltaPct =
    comparability.comparable && previous.tokens > 0
      ? ((current.tokens - previous.tokens) / previous.tokens) * 100
      : null;

  return {
    kind: opts.kind,
    current,
    previous,
    deltaTokens: current.tokens - previous.tokens,
    deltaPct,
    comparability,
  };
}

/**
 * Decide whether the prior period is a baseline or an absence.
 *
 * Four distinct cases, deliberately not collapsed into one "no data" branch:
 *
 * - History starts *after* the prior period ended: there is no baseline at all.
 * - History starts *inside* it: part was never observed, so a percentage would be measuring
 *   the installation date and calling it growth.
 * - The prior period is fully covered but genuinely empty: a real zero. A percentage against
 *   zero is undefined rather than infinite, so the absolute change carries the story.
 * - Otherwise it is a real baseline.
 */
function assess(
  previous: PeriodTotals,
  bounds: PeriodBounds,
  historyFrom: string | null,
): ComparabilityNote {
  if (!historyFrom) {
    return { comparable: false, reason: "no-baseline", detail: "no history recorded yet" };
  }

  if (historyFrom > bounds.to) {
    /*
     * The period ended before this machine began keeping history.
     *
     * Two quite different situations reach here, and the wording has to match which one it
     * is. If the logs happen to still cover that period we do have figures — they simply
     * cannot be vouched for, because retention may already have eaten part of it and the
     * ledger was not yet banking days. Calling that "no baseline" while a number is visible
     * on the same line reads as a bug in the tool rather than a limit on the evidence.
     */
    return previous.tokens > 0
      ? {
          comparable: false,
          reason: "partial-baseline",
          detail:
            `${bounds.from}–${bounds.to} predates recorded history (from ${historyFrom}), ` +
            `so its total may be missing days the logs have since dropped`,
        }
      : {
          comparable: false,
          reason: "no-baseline",
          detail: `history starts ${historyFrom}, after ${bounds.from}–${bounds.to} ended`,
        };
  }

  if (historyFrom > bounds.from) {
    return {
      comparable: false,
      reason: "partial-baseline",
      detail: `history starts ${historyFrom}, part-way through ${bounds.from}–${bounds.to}`,
    };
  }

  if (previous.tokens <= 0) {
    return {
      comparable: false,
      reason: "no-baseline",
      detail: `nothing recorded in ${bounds.from}–${bounds.to}`,
    };
  }

  return { comparable: true };
}

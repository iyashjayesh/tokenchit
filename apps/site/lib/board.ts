/**
 * Board types and window definitions.
 *
 * Deliberately free of any database import so the client component can share these with the
 * route handler — importing the pool here would drag `pg` into the browser bundle, which is
 * the same mistake that broke the first Vercel build.
 */
export type BoardRow = {
  rank: number;
  handle: string;
  tier: string;
  /**
   * The GitHub account id, or null until somebody proves the handle.
   *
   * The avatar is sourced from this rather than from the handle, and that is the whole
   * safeguard. `github.com/<handle>.png` resolves for any handle at all, verified or not, so
   * an unverified row — which anyone can create for a name they do not own — would render a
   * real person's face beside figures they never submitted. A null id has nothing to render.
   *
   * A string because it is a bigint: ids are past 2^53 and Number() would round them.
   */
  githubId: string | null;
  /**
   * ISO timestamp of the newest submission, or null if there is none.
   *
   * Feeds `staleLabel`. The ranking decays on its own as days leave the window, so this is not
   * about the position — `streakDays`, `mix` and the models all come from that one submission
   * and can be months older than the tokens beside them.
   */
  lastPublished: string | null;
  tokens: number;
  equivCostUsd: number;
  streakDays: number;
  /** Agent id to tokens, over the same window as the rest of the row. */
  mix: Record<string, number>;
  /**
   * Where this row stood a week ago, or null if it was not on the board then.
   *
   * Derived rather than recorded: user_days holds the whole daily series, so the same window
   * shifted back seven days gives the ranking as it was, without a snapshot table and without
   * waiting for history to accumulate.
   */
  previousRank: number | null;
  /**
   * Daily tokens for the last SPARK_DAYS days, oldest first, zeros included.
   *
   * Two people with the same total are indistinguishable on a leaderboard until you can see
   * the shape of it — one steady, one a single enormous week. Zeros are kept rather than
   * skipped so a gap reads as a gap instead of the bars simply moving closer together.
   */
  spark: number[];
};

/** A month is long enough to show a rhythm and short enough to fit beside a row. */
export const SPARK_DAYS = 30;

/** How far back "movement" looks. A week is long enough to mean something and short enough to
 *  still be about now. */
export const MOVEMENT_DAYS = 7;

export const WINDOWS = [
  { key: "year", label: "this year" },
  { key: "30d", label: "last 30d" },
  { key: "7d", label: "last 7d" },
  { key: "all", label: "all time" },
] as const;

export type BoardWindow = (typeof WINDOWS)[number]["key"];

export const DEFAULT_WINDOW: BoardWindow = "year";

/** How many days each window covers. `all` is a decade, which outlives the project. */
export const WINDOW_DAYS: Record<BoardWindow, number> = {
  "7d": 7,
  "30d": 30,
  year: 365,
  all: 3650,
};

export const isWindow = (value: string | null): value is BoardWindow =>
  value !== null && value in WINDOW_DAYS;

/**
 * How many rows the landing page's preview shows.
 *
 * Shared so the server's first paint and the client's window refetch cannot disagree — asking
 * for a different count in each was how the table silently grew when someone changed windows.
 */
export const LANDING_ROWS = 10;

/**
 * How old a row's newest submission has to be before the board says so.
 *
 * Two weeks, because a fortnight is long enough that a weekly publisher is never marked and
 * short enough that a genuinely abandoned row is. The number is a judgement, not a measurement
 * — it should move once there is a real distribution of publishing intervals to look at.
 */
export const STALE_AFTER_DAYS = 14;

/**
 * A compact age for a row that has gone quiet, or null for one that has not.
 *
 * Null for anything fresh, deliberately: most rows should be fresh, and printing "2h" against
 * twenty of twenty-three developers is a column of noise that teaches the reader to skip the
 * one row where it matters. Nothing shown is the healthy state.
 */
export function staleLabel(lastPublished: string | null, now: Date = new Date()): string | null {
  if (!lastPublished) return null;
  const then = new Date(lastPublished);
  if (Number.isNaN(then.getTime())) return null;

  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days < STALE_AFTER_DAYS) return null;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

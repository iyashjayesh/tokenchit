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
  tokens: number;
  equivCostUsd: number;
  streakDays: number;
  /** Agent id to tokens, over the same window as the rest of the row. */
  mix: Record<string, number>;
};

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

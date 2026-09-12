import { costOf } from "./pricing.js";
import { hasRealClock, totalTokens, type AgentId, type UsageEvent } from "./types.js";

export type Windowed = { tokens: number; equivCostUsd: number; events: number };

export type Stats = {
  tokens: number;
  /** What these tokens would cost at list API rates — priced models only. */
  equivCostUsd: number;
  /** Share of tokens whose model has a public price. Drives the CLI's accuracy warning. */
  pricedShare: number;
  /** Consecutive local days with activity, ending today or yesterday. */
  streakDays: number;
  activeDays: number;
  firstDay: string | null;
  lastDay: string | null;
  /** Local `YYYY-MM-DD` to tokens, ascending. */
  byDay: Map<string, number>;
  byModel: Map<string, number>;
  /**
   * Local day -> agent -> that agent's usage on that day.
   *
   * Exists so the board's window filters can be honest. Windowing tokens from a per-day
   * series while cost and agent mix come from lifetime totals would put a week of tokens
   * beside a year of spend in the same row.
   */
  dayAgent: Map<string, Map<AgentId, { tokens: number; equivCostUsd: number }>>;
  /** Tokens per hour of the local day, 0-23. */
  byHour: number[];
  /** Tokens per weekday, Monday first. */
  byWeekday: number[];
  /** Tokens per [weekday][hour], Monday first — the recap heatmap. */
  heat: number[][];
  byAgent: Map<AgentId, number>;
  /** Per-agent share of tokens, descending — feeds `segmentWidths()`. */
  mix: { agent: AgentId; pct: number }[];
  windows: { all: Windowed; year: Windowed; d30: Windowed; d7: Windowed };
  models: { model: string; tokens: number; equivCostUsd: number; priced: boolean }[];

  /** Local `YYYY-MM` to tokens, ascending. */
  byMonth: Map<string, number>;
  /** The single heaviest local day, or null when nothing was recorded. */
  biggestDay: { day: string; tokens: number } | null;

  /*
   * The same hour and weekday histograms, counting only events whose clock time was
   * observed rather than synthesised — see `tsPrecision` in types.ts.
   *
   * `byHour`, `byWeekday` and `heat` above deliberately keep counting everything, including
   * ledger replays landed at local noon. Dropping them would empty the heatmap for anyone
   * whose logs have rotated, and an emptier map is its own lie; the existing card has always
   * made that trade knowingly.
   *
   * A claim about *when somebody works* cannot make that trade, because noon is not an
   * observation. So the peak headline and the time-of-day badges read these instead, and
   * `clockTokens` against `tokens` says how much of the total they actually saw.
   */
  clockByHour: number[];
  clockByWeekday: number[];
  /** Tokens whose clock time was observed. Compare against `tokens` for coverage. */
  clockTokens: number;
};

/**
 * Bucket by *local* calendar day, not UTC.
 *
 * A streak is a claim about the days someone sat down and worked. Bucketing by UTC would
 * break a genuine streak for anyone west of Greenwich whose evening sessions land on the
 * next UTC day, and invent gaps in the heatmap that the user knows are wrong.
 */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

const empty = (): Windowed => ({ tokens: 0, equivCostUsd: 0, events: 0 });

export async function aggregate(
  events: AsyncIterable<UsageEvent> | Iterable<UsageEvent>,
  opts: { now?: Date; year?: number } = {},
): Promise<Stats> {
  const now = opts.now ?? new Date();

  const byDay = new Map<string, number>();
  const byModel = new Map<string, number>();
  const dayAgent = new Map<string, Map<AgentId, { tokens: number; equivCostUsd: number }>>();
  const byHour: number[] = Array(24).fill(0);
  const byWeekday: number[] = Array(7).fill(0);
  const byMonth = new Map<string, number>();
  const clockByHour: number[] = Array(24).fill(0);
  const clockByWeekday: number[] = Array(7).fill(0);
  let clockTokens = 0;
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const byAgent = new Map<AgentId, number>();
  const modelCost = new Map<string, number>();
  const pricedModels = new Set<string>();

  const windows = { all: empty(), year: empty(), d30: empty(), d7: empty() };
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const d30 = addDays(now, -30);
  const d7 = addDays(now, -7);

  let tokens = 0;
  let equivCostUsd = 0;
  let pricedTokens = 0;

  for await (const e of events) {
    const n = totalTokens(e);
    if (n <= 0) continue;

    /*
     * Scoped here rather than by the caller, so every figure agrees.
     *
     * `recap --year` used to reach only `longestRun`, which meant the heat grid, the totals,
     * the model table and activeDays all described all-time usage under a heading naming one
     * year — `--year 2019` rendered 2026's data with a 0d streak beside 52 active days that
     * were all in 2026. Filtering the events means the whole card describes the year it names.
     *
     * By local day, matching every other bucket: a session at 11pm on 31 December belongs to
     * the year the person was working, not the one UTC had reached.
     */
    if (opts.year !== undefined && !localDay(e.ts).startsWith(`${opts.year}-`)) continue;

    const cost = costOf(e);
    tokens += n;
    if (cost !== null) {
      equivCostUsd += cost;
      pricedTokens += n;
      pricedModels.add(e.model);
      modelCost.set(e.model, (modelCost.get(e.model) ?? 0) + cost);
    }

    const day = localDay(e.ts);
    byDay.set(day, (byDay.get(day) ?? 0) + n);

    let agents = dayAgent.get(day);
    if (!agents) {
      agents = new Map();
      dayAgent.set(day, agents);
    }
    const cell = agents.get(e.agent) ?? { tokens: 0, equivCostUsd: 0 };
    cell.tokens += n;
    // An unpriced model contributes tokens and no cost, exactly as it does in the headline.
    cell.equivCostUsd += cost ?? 0;
    agents.set(e.agent, cell);

    // Monday-first, because a week of work reads Mon-Sun; JS counts from Sunday.
    const wd = (e.ts.getDay() + 6) % 7;
    const hr = e.ts.getHours();
    byHour[hr] = (byHour[hr] as number) + n;
    byWeekday[wd] = (byWeekday[wd] as number) + n;
    (heat[wd] as number[])[hr] = ((heat[wd] as number[])[hr] as number) + n;

    // `day` slices from the local date string rather than re-reading the Date, so a month
    // boundary lands on the same side as every other bucket in this function.
    byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + n);

    // Observed clock times only. A replayed day carries invented hours; counting it here
    // would let "you work late" be derived from a timestamp this tool wrote itself.
    if (hasRealClock(e)) {
      clockTokens += n;
      clockByHour[hr] = (clockByHour[hr] as number) + n;
      clockByWeekday[wd] = (clockByWeekday[wd] as number) + n;
    }
    byModel.set(e.model, (byModel.get(e.model) ?? 0) + n);
    byAgent.set(e.agent, (byAgent.get(e.agent) ?? 0) + n);

    for (const [bucket, from] of [
      [windows.all, null],
      [windows.year, yearStart],
      [windows.d30, d30],
      [windows.d7, d7],
    ] as const) {
      if (from && e.ts < from) continue;
      bucket.tokens += n;
      bucket.equivCostUsd += cost ?? 0;
      bucket.events += 1;
    }
  }

  const days = [...byDay.keys()].sort();

  /* First maximum wins on a tie. An arbitrary choice, but a stable one: two days that tie
     must not swap places between runs on identical input, or the recap changes its mind
     about its own headline. Documented in the recap notes. */
  let biggestDay: { day: string; tokens: number } | null = null;
  for (const d of days) {
    const n = byDay.get(d) as number;
    if (!biggestDay || n > biggestDay.tokens) biggestDay = { day: d, tokens: n };
  }

  const mix = [...byAgent.entries()]
    .map(([agent, n]) => ({ agent, pct: tokens ? (n / tokens) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);

  return {
    tokens,
    equivCostUsd,
    pricedShare: tokens ? pricedTokens / tokens : 0,
    streakDays: streak(byDay, now),
    activeDays: days.length,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    byDay: new Map(days.map((d) => [d, byDay.get(d) as number])),
    dayAgent: new Map(days.map((d) => [d, dayAgent.get(d) as Map<AgentId, { tokens: number; equivCostUsd: number }>])),
    byModel: new Map([...byModel].sort((a, b) => b[1] - a[1])),
    byHour,
    byWeekday,
    heat,
    byAgent,
    mix,
    windows,
    byMonth: new Map([...byMonth].sort((a, b) => a[0].localeCompare(b[0]))),
    biggestDay,
    clockByHour,
    clockByWeekday,
    clockTokens,
    models: [...byModel]
      .sort((a, b) => b[1] - a[1])
      .map(([model, n]) => ({
        model,
        tokens: n,
        equivCostUsd: modelCost.get(model) ?? 0,
        priced: pricedModels.has(model),
      })),
  };
}

/**
 * Count back from today while every day has activity.
 *
 * Starting at yesterday when today is empty is deliberate: a streak should survive the
 * morning. Someone who worked for sixty days straight and runs `sync` before opening their
 * editor has not broken anything, and showing 0 there would make the number useless.
 */
function streak(byDay: Map<string, number>, now: Date): number {
  if (byDay.size === 0) return 0;

  let cursor = new Date(now);
  if (!byDay.has(localDay(cursor))) {
    cursor = addDays(cursor, -1);
    if (!byDay.has(localDay(cursor))) return 0;
  }

  let n = 0;
  while (byDay.has(localDay(cursor))) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

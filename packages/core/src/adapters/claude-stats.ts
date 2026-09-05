import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";

import { walkFiles } from "./walk.js";

/**
 * What Claude Code's own Stats panel will say.
 *
 * The panel does not read transcripts. It reads a cumulative `stats-cache.json` beside them,
 * and that file differs from the transcripts in two ways that both make it larger:
 *
 * It counts each API call once per streaming rewrite. Claude Code rewrites an assistant
 * message as it streams, so one call leaves several `usage` records carrying the same growing
 * figures, and the cache sums them as written. Measured on one machine, 51,373 usage records
 * represented 23,644 real calls, and the cache matched the naive sum of all of them to the
 * exact token on 28 of 57 days — and the deduplicated total on none.
 *
 * It also outlives the transcripts. Claude Code deletes old ones; the cache keeps their
 * totals, so it covers a longer period than any transcript parser can see.
 *
 * This is read only to explain the difference to someone comparing the two numbers. It is
 * never added to a total and never published — deflating it is impossible anyway, since the
 * inflation factor varied between 1.15x and 2.18x across days on the same corpus.
 */
export type ClaudeStatsPanel = {
  /** Lifetime tokens as the panel reports them. */
  tokens: number;
  /** Which config directory it came from, for a message that has to name one. */
  root: string;
  /**
   * The calendar days of activity the cache remembers.
   *
   * This is the honest half of the difference. The rewrite double-count inflates a number we
   * should not adopt, but deleted transcripts are real work we genuinely cannot see — and
   * unlike the inflation, the size of that blind spot can be stated exactly, as days rather
   * than as an invented token count.
   *
   * The dates themselves rather than a count of them, because a machine with several profiles
   * has to union these before it can say how long its blind spot is. Summing per-profile
   * counts charges a day twice when two accounts were both used on it, which on one real
   * machine turned 75 days of history into a reported 100.
   */
  days: string[];
  /** Per-day totals, where the cache carries them. Oldest first. */
  daily: { day: string; tokens: number }[];
  /**
   * The day this profile was first used, as the cache recorded it.
   *
   * `modelUsage` is cumulative and never rotated, so it reaches back to here regardless of
   * what retention has taken since. That makes this the honest start of "since installation"
   * — the transcripts and the daily array both begin later, and saying so from either of them
   * dates the history from the last cleanup instead of from the install.
   *
   * Null when the cache does not carry it, which is a reason to fall back to the observed
   * first day rather than to invent one.
   */
  firstDay: string | null;
};

type StatsCache = {
  firstSessionDate?: unknown;
  modelUsage?: Record<string, Record<string, unknown>>;
  dailyActivity?: { date?: unknown }[];
  dailyModelTokens?: { date?: unknown; tokensByModel?: Record<string, unknown> }[];
  /** The last day the cache was computed for. Everything after it is missing from it. */
  lastComputedDate?: unknown;
};

/**
 * The four fields that are tokens.
 *
 * modelUsage also carries costUSD, contextWindow, maxOutputTokens and webSearchRequests.
 * Summing every numeric field happened to be harmless on the machines checked, where those
 * are zero, but a context window counted as tokens is wrong in kind rather than in degree.
 */
const TOKEN_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadInputTokens",
  "cacheCreationInputTokens",
] as const;

/** Sum the per-model totals the way the panel does. */
function total(cache: StatsCache): number {
  let sum = 0;
  for (const models of Object.values(cache.modelUsage ?? {})) {
    if (!models || typeof models !== "object") continue;
    for (const field of TOKEN_FIELDS) {
      const value = (models as Record<string, unknown>)[field];
      if (typeof value === "number" && Number.isFinite(value)) sum += value;
    }
  }
  return sum;
}

/**
 * What the cache has not caught up with yet.
 *
 * `stats-cache.json` is computed to a date and no further, so a panel opened today shows the
 * cache plus today's work, while the file alone is short by exactly that. Measured against
 * two real accounts, the file read 18.17b and 10.57b while the panels showed 18.3b and 11.0b.
 *
 * Counted the way the panel counts — every usage record, no deduplication — because the point
 * is to reproduce the figure on somebody's screen, not to be right about billing. Files
 * untouched since the cache was computed cannot contain anything newer than it, so only the
 * recently modified ones are opened.
 */
async function sinceComputed(projects: string, lastComputed: string): Promise<number> {
  const after = Date.parse(`${lastComputed}T23:59:59.999Z`);
  if (Number.isNaN(after)) return 0;

  let sum = 0;
  for await (const file of walkFiles(projects, ".jsonl")) {
    const info = await stat(file).catch(() => null);
    if (!info || info.mtimeMs < after) continue;

    const lines = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (!line.includes('"usage"')) continue;

      let row: { timestamp?: unknown; message?: { usage?: Record<string, unknown> } };
      try {
        row = JSON.parse(line) as typeof row;
      } catch {
        continue;
      }

      const ts = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
      if (Number.isNaN(ts) || ts <= after) continue;

      const usage = row.message?.usage;
      if (!usage) continue;
      for (const field of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
        const value = usage[field];
        if (typeof value === "number" && Number.isFinite(value)) sum += value;
      }
    }
  }
  return sum;
}

/**
 * Read every stats cache beside the given transcript roots.
 *
 * Takes the roots rather than finding its own, so this can only ever look where the adapter
 * was already looking. A missing or unreadable cache is an absent answer, not an error: the
 * file is Claude Code's, its shape is not promised, and nothing here is worth failing a sync
 * over.
 */
export async function readClaudeStatsPanels(
  roots: string[],
): Promise<ClaudeStatsPanel[]> {
  const seen = new Set<string>();
  const panels: ClaudeStatsPanel[] = [];

  for (const root of roots) {
    // roots are `<config>/projects`; the cache sits beside that directory, not inside it.
    const dir = dirname(root);
    const path = join(dir, "stats-cache.json");
    if (seen.has(path)) continue;
    seen.add(path);

    try {
      const cache = JSON.parse(await readFile(path, "utf8")) as StatsCache;
      const lastComputed =
        typeof cache.lastComputedDate === "string" ? cache.lastComputedDate : null;
      const tokens =
        total(cache) +
        (lastComputed ? await sinceComputed(root, lastComputed).catch(() => 0) : 0);
      /* The dates themselves rather than a count of them, because a machine with several
         profiles has to union these before it can say how long its blind spot is. Summing
         per-profile counts charges a day twice when two accounts were both used on it, which
         on one real machine turned 75 days of history into a reported 100. */
      const days = [
        ...new Set(
          (cache.dailyActivity ?? [])
            .map((d) => d?.date)
            .filter((d): d is string => typeof d === "string"),
        ),
      ];

      const daily = (cache.dailyModelTokens ?? [])
        .filter((d): d is { date: string; tokensByModel?: Record<string, unknown> } =>
          typeof d?.date === "string",
        )
        .map((d) => ({
          day: d.date,
          tokens: Object.values(d.tokensByModel ?? {}).reduce<number>(
            (a, v) => a + (typeof v === "number" && Number.isFinite(v) ? v : 0),
            0,
          ),
        }))
        .sort((a, b) => a.day.localeCompare(b.day));

      /* An ISO timestamp in the cache, but only the calendar day is meaningful here — the
         rest of the codebase keys history by local `YYYY-MM-DD`. */
      const first =
        typeof cache.firstSessionDate === "string" ? cache.firstSessionDate.slice(0, 10) : "";
      const firstDay = /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : null;

      if (tokens > 0) panels.push({ tokens, root: dir, days, daily, firstDay });
    } catch {
      /* absent, unreadable, or a shape we do not recognise — all mean "cannot say" */
    }
  }

  return panels;
}

/**
 * What the days no longer on disk were probably worth.
 *
 * The panel's own figure cannot be adopted — it counts an API call once per streaming
 * rewrite, so it is records summed rather than calls billed. But the size of that inflation
 * is measurable on the days where both sources exist: divide the cache's figure for a day by
 * the deduplicated figure for the same day, and that ratio is how much this particular
 * machine's cache overstates.
 *
 * Apply the median of those ratios to the days the cache has and the transcripts do not, and
 * the result is an estimate of real work that was deleted — arrived at from this machine's
 * own overlap rather than from a constant.
 *
 * Retention does not take a day all at once, so "the transcripts do not have it" is a matter
 * of degree. A day whose transcripts are mostly gone is priced for the part that is gone
 * rather than treated as present because a fragment of it survived.
 *
 * It stays an estimate and is never published. Per-day ratios ranged 1.15x to 2.18x on one
 * corpus, so the median is a reasonable middle and not a fact; `spread` carries that range so
 * a caller can say how wide the uncertainty is rather than implying there is none.
 */
export type UnseenEstimate = {
  /** Estimated tokens from days the transcripts no longer cover. */
  tokens: number;
  /** Median cache-to-transcript ratio on the overlapping days. */
  ratio: number;
  /** Lowest and highest ratio seen, so the uncertainty can be stated. */
  spread: [number, number];
  /**
   * How many days the estimate found tokens for.
   *
   * Wholly-missing days and partly-rotated ones both count, because both contribute. It is
   * therefore a count of days the estimate draws on, not of days that vanished completely.
   */
  days: number;
  /**
   * The part of `tokens` that no day bucket could account for, already deflated.
   *
   * `modelUsage` is cumulative for the life of the profile while `dailyModelTokens` is a
   * rotating window, so the lifetime rollup outruns the sum of the days it still lists. That
   * difference is real usage from before the window starts, and walking the days can never
   * reach it — there is no day left to walk. Carried separately because it is the one part of
   * the estimate with no date attached, and a caller showing a date range should not imply it
   * falls inside one.
   */
  residual: number;
};

/**
 * A day only calibrates if we can see all of it.
 *
 * The cache is a superset of the transcripts, so a real overlap day has a ratio of at least
 * one. Below that means the cache lagged, was written mid-day, or that a profile with no
 * cache of its own contributed transcripts to the day; far above means the transcripts for
 * that day are already partly rotated, so the day is measuring the very loss being estimated
 * rather than the inflation. Both are excluded — an uncalibratable day must not calibrate.
 *
 * Excluded from the *median*, that is. A day above the ceiling is still priced as a loss;
 * see the second pass below.
 */
const RATIO_FLOOR = 1;
const RATIO_CEILING = 5;

/** Enough overlap to have a median worth trusting. Fewer, and silence is the honest answer. */
const MIN_OVERLAP_DAYS = 5;

export function estimateUnseen(
  panels: ClaudeStatsPanel[],
  ourDaily: Map<string, number>,
): UnseenEstimate | null {
  // Summed across config directories first. Each panel covers one directory while ourDaily is
  // every directory at once, so comparing a single panel's day against it measures the other
  // directories rather than the inflation — which produced ratios from 0.00x to 414x.
  const theirDaily = new Map<string, number>();
  for (const panel of panels) {
    for (const { day, tokens } of panel.daily) {
      theirDaily.set(day, (theirDaily.get(day) ?? 0) + tokens);
    }
  }

  /*
   * Calibrate first, price second.
   *
   * These were one loop, which forced every day to be classified before there was a ratio to
   * classify it with — and a day that could not calibrate was then dropped entirely rather
   * than priced. Two passes cost one more walk over at most a few hundred days.
   */
  const ratios: number[] = [];
  for (const [day, theirs] of theirDaily) {
    if (theirs <= 0) continue;
    const ours = ourDaily.get(day) ?? 0;
    if (ours <= 0) continue;

    const ratio = theirs / ours;
    if (ratio >= RATIO_FLOOR && ratio <= RATIO_CEILING) ratios.push(ratio);
  }

  if (ratios.length < MIN_OVERLAP_DAYS) return null;

  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const ratio =
    ratios.length % 2 === 0 ? (ratios[mid - 1]! + ratios[mid]!) / 2 : ratios[mid]!;
  if (!(ratio > 0)) return null;

  let missing = 0;
  let missingDays = 0;

  for (const [day, theirs] of theirDaily) {
    if (theirs <= 0) continue;
    const ours = ourDaily.get(day) ?? 0;
    // What the cache says this day was worth, deflated to calls rather than records.
    const deflated = theirs / ratio;

    // Nothing left on disk: the whole day is gone.
    if (ours <= 0) {
      missing += deflated;
      missingDays++;
      continue;
    }

    /*
     * Above the ceiling a day is not inflated, it is eaten.
     *
     * Excluding these from the median is right — they measure the loss rather than the
     * rewrite factor — but the first version excluded them from the estimate too, on the
     * grounds that `ours > 0` meant the day was present. A day the cache prices at 326M
     * against 787k of surviving transcript is 99.8% deleted, and calling it present threw
     * away every token of it. What is missing is the deflated day less the fragment that
     * survived; a day genuinely on disk clears the ceiling and adds nothing here.
     */
    if (theirs / ours <= RATIO_CEILING) continue;

    const lost = deflated - ours;
    if (lost <= 0) continue;
    missing += lost;
    missingDays++;
  }

  /*
   * What the rollup knows and no day can say.
   *
   * `panel.tokens` comes from `modelUsage`, which is never rotated; `panel.daily` comes from
   * `dailyModelTokens`, which is. Once the window starts rotating the first outruns the
   * second, and the difference is usage from before the window — invisible to the loop above,
   * because that loop can only price days `theirDaily` still lists. Deflated by the same
   * ratio, since it is the same double-counted records.
   *
   * Then netted against what we already hold for that stretch, which is the step the first
   * version missed. The day loop subtracts `ours` from every day it prices; this had no day to
   * subtract against and so subtracted nothing, and once the ledger began replaying banked days
   * into `ourDaily` those days were counted twice — in `verified` and again here. Measured on a
   * synthetic corpus: 750 real tokens reported as 1000.
   *
   * The netting is deliberately not per profile. `unlisted` is per profile, but `ourDaily` is
   * every profile at once, so subtracting it inside the loop would charge one profile's days
   * against another's rollup. Both sides are therefore summed first and netted once.
   */
  let unlisted = 0;
  for (const panel of panels) {
    const listed = panel.daily.reduce((a, d) => a + d.tokens, 0);
    if (panel.tokens > listed) unlisted += panel.tokens - listed;
  }

  /*
   * Only the days before the window, not every day the window omits.
   *
   * `ourDaily` also holds days *after* the cache was last computed — a sync run today sees
   * transcripts the cache has not caught up with. Those are absent from `panel.tokens` too, so
   * netting them off would subtract usage the rollup never claimed and push the estimate below
   * what is already verified.
   */
  const windowStart = [...theirDaily.keys()].sort()[0];
  let oursBeforeWindow = 0;
  if (windowStart !== undefined) {
    for (const [day, tokens] of ourDaily) {
      if (day < windowStart) oursBeforeWindow += tokens;
    }
  }

  const residual = Math.max(0, unlisted / ratio - oursBeforeWindow);
  missing += residual;

  // A residual with no missing days is still an answer, so this can no longer require days.
  if (missing <= 0) return null;

  return {
    tokens: Math.round(missing),
    residual: Math.round(residual),
    ratio,
    spread: [ratios[0]!, ratios[ratios.length - 1]!],
    days: missingDays,
  };
}

/** The three readings of the same usage, for a caller that wants to show all of them. */
export type ClaudeReadings = {
  /** Deduplicated, one row per API call, from transcripts still on disk. */
  verified: number;
  /** verified plus a calibrated estimate of days the transcripts no longer cover. */
  estimated: number | null;
  /** What Claude Code's own Stats panel shows, summed across every profile. */
  panel: number;
  /**
   * How many days the panel covers, and how many the transcripts still do.
   *
   * Both distinct calendar days, so the pair is comparable. `theirs` used to be the sum of
   * each profile's day count, which charged a day once per account that worked it.
   */
  days: { ours: number; theirs: number };
  /**
   * Days the estimate is actually built from.
   *
   * Not `theirs - ours`: dailyActivity spans a wider range than dailyModelTokens, so that
   * subtraction names a number of days the estimate never priced. This is the count
   * estimateUnseen found tokens for, partly-rotated days included.
   */
  estimatedDays: number;
  /** The overlap ratio the estimate was calibrated on, and its range. */
  calibration: { ratio: number; spread: [number, number] } | null;
  /**
   * The part of `estimated` recovered from the lifetime rollup rather than from any day.
   *
   * Zero on a profile whose daily window has not rotated yet, which is why it was invisible
   * until a machine had been running long enough to lose one.
   */
  residual: number;
  /**
   * The earliest first-session date across the profiles that record one.
   *
   * What "since installation" actually means on this machine. Distinct from the first day the
   * transcripts show, which is only the first day retention has not yet reached, and from the
   * card's own first day, which spans every agent and so can predate Claude entirely.
   */
  installedOn: string | null;
};

/**
 * The same usage, read three ways.
 *
 * These were presented as a warning above someone's stats — a discrepancy to be explained
 * away, in the colour reserved for problems. They are not a problem: they are three honest
 * answers to three different questions, and the person they belong to should see all of them
 * as ordinary rows rather than as an apology for the smallest one.
 */
export function claudeReadings(
  panels: ClaudeStatsPanel[],
  ourDaily: Map<string, number>,
  verified: number,
): ClaudeReadings | null {
  if (panels.length === 0 || verified <= 0) return null;

  const panel = panels.reduce((a, p) => a + p.tokens, 0);
  // Distinct calendar days, not the sum of per-profile counts: a Tuesday worked on two
  // accounts is one Tuesday. `ourDaily` is keyed by day and so was always distinct, and
  // summing on this side made the two halves of the same displayed pair incomparable.
  const theirs = new Set(panels.flatMap((p) => p.days)).size;
  const unseen = estimateUnseen(panels, ourDaily);

  return {
    verified,
    estimated: unseen ? verified + unseen.tokens : null,
    panel,
    days: { ours: ourDaily.size, theirs },
    estimatedDays: unseen?.days ?? 0,
    calibration: unseen ? { ratio: unseen.ratio, spread: unseen.spread } : null,
    residual: unseen?.residual ?? 0,
    installedOn:
      panels
        .map((p) => p.firstDay)
        .filter((d): d is string => d !== null)
        .sort()[0] ?? null,
  };
}

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
   * How many days of activity the cache remembers.
   *
   * This is the honest half of the difference. The rewrite double-count inflates a number we
   * should not adopt, but deleted transcripts are real work we genuinely cannot see — and
   * unlike the inflation, the size of that blind spot can be stated exactly, as days rather
   * than as an invented token count.
   */
  days: number;
  /** Per-day totals, where the cache carries them. Oldest first. */
  daily: { day: string; tokens: number }[];
};

type StatsCache = {
  modelUsage?: Record<string, Record<string, unknown>>;
  dailyActivity?: { date?: unknown }[];
  dailyModelTokens?: { date?: unknown; tokensByModel?: Record<string, unknown> }[];
};

/** Sum the per-model totals the way the panel does. */
function total(cache: StatsCache): number {
  let sum = 0;
  for (const models of Object.values(cache.modelUsage ?? {})) {
    if (!models || typeof models !== "object") continue;
    for (const value of Object.values(models)) {
      if (typeof value === "number" && Number.isFinite(value)) sum += value;
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
      const tokens = total(cache);
      const days = (cache.dailyActivity ?? []).filter((d) => typeof d?.date === "string").length;

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

      if (tokens > 0) panels.push({ tokens, root: dir, days, daily });
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
  /** How many days the estimate covers. */
  days: number;
};

/**
 * A day only calibrates if we can see all of it.
 *
 * The cache is a superset of the transcripts, so a real overlap day has a ratio of at least
 * one. Below that means the cache lagged or was written mid-day; far above means the
 * transcripts for that day are already partly rotated, so the day is measuring the very loss
 * being estimated rather than the inflation. Both are excluded — an uncalibratable day must
 * not calibrate.
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

  const ratios: number[] = [];
  let missing = 0;
  let missingDays = 0;

  for (const [day, theirs] of theirDaily) {
    if (theirs <= 0) continue;
    const ours = ourDaily.get(day) ?? 0;

    if (ours <= 0) {
      missing += theirs;
      missingDays++;
      continue;
    }

    const ratio = theirs / ours;
    if (ratio >= RATIO_FLOOR && ratio <= RATIO_CEILING) ratios.push(ratio);
  }

  if (ratios.length < MIN_OVERLAP_DAYS || missingDays === 0) return null;

  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const ratio =
    ratios.length % 2 === 0 ? (ratios[mid - 1]! + ratios[mid]!) / 2 : ratios[mid]!;
  if (!(ratio > 0)) return null;

  return {
    tokens: Math.round(missing / ratio),
    ratio,
    spread: [ratios[0]!, ratios[ratios.length - 1]!],
    days: missingDays,
  };
}

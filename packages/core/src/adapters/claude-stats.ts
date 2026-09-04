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
};

type StatsCache = {
  modelUsage?: Record<string, Record<string, unknown>>;
  dailyActivity?: { date?: unknown }[];
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
      if (tokens > 0) panels.push({ tokens, root: dir, days });
    } catch {
      /* absent, unreadable, or a shape we do not recognise — all mean "cannot say" */
    }
  }

  return panels;
}

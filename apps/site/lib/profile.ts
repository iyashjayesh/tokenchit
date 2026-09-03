import "server-only";

import { pool } from "@/lib/db";
import { WINDOW_DAYS, type BoardWindow } from "@/lib/board";

export type ProfileModel = {
  model: string;
  tokens: number;
  equivCostUsd: number;
  priced: boolean;
};

export type ProfileDay = { day: string; tokens: number };

export type Profile = {
  handle: string;
  tier: string;
  /** Tokens over the selected window. */
  tokens: number;
  equivCostUsd: number;
  /** Current run of active days. Not a windowed figure — see the board query. */
  streakDays: number;
  /** Days with any activity inside the window. */
  activeDays: number;
  firstDay: string | null;
  lastDay: string | null;
  /** When the most recent submission landed, so a stale profile can say so. */
  lastPublished: string | null;
  /** Agent id to tokens, over the window. */
  mix: Record<string, number>;
  /** Lifetime model breakdown, from the most recent submission. */
  models: ProfileModel[];
  /** One entry per active day in the window, ascending. Empty days are absent. */
  days: ProfileDay[];
  /** Position on the board for this window, or null if unranked. */
  rank: number | null;
  /** How many people are on the board, so a rank reads as "3 of 40". */
  totalRanked: number;
};

/**
 * Everything one profile page needs, in three queries.
 *
 * Kept separate from the board query even though they overlap: the board wants one row per
 * person and nothing else, while a profile wants a full daily series for one person. Serving
 * both from one query would mean either over-fetching for the board or under-fetching here.
 */
export async function readProfile(
  handle: string,
  window: BoardWindow = "year",
): Promise<Profile | null> {
  const days = WINDOW_DAYS[window];

  const { rows: userRows } = await pool.query<{
    id: string;
    handle: string;
    tier: string;
  }>("SELECT id, handle::text, tier FROM users WHERE handle = $1", [handle]);

  const user = userRows[0];
  if (!user) return null;

  const [{ rows: agg }, { rows: series }, { rows: latest }, { rows: ranking }] =
    await Promise.all([
      pool.query(
        `WITH d AS (
           SELECT day, agent, tokens, cost_usd
           FROM user_days
           WHERE user_id = $1 AND day >= CURRENT_DATE - $2::int
         ),
         by_agent AS (
           SELECT agent, SUM(tokens) AS tokens FROM d GROUP BY agent
         )
         SELECT
           (SELECT COALESCE(SUM(tokens), 0)   FROM d) AS tokens,
           (SELECT COALESCE(SUM(cost_usd), 0) FROM d) AS cost,
           (SELECT COUNT(DISTINCT day)        FROM d) AS active_days,
           (SELECT MIN(day)::text             FROM d) AS first_day,
           (SELECT MAX(day)::text             FROM d) AS last_day,
           (SELECT COALESCE(jsonb_object_agg(agent, tokens), '{}'::jsonb)
              FROM by_agent) AS mix`,
        [user.id, days],
      ),
      pool.query<{ day: string; tokens: string }>(
        `SELECT day::text, SUM(tokens)::bigint AS tokens
         FROM user_days
         WHERE user_id = $1 AND day >= CURRENT_DATE - $2::int
         GROUP BY day ORDER BY day`,
        [user.id, days],
      ),
      pool.query(
        `SELECT streak_days, models, received_at::text AS received_at
         FROM submissions WHERE user_id = $1 AND NOT flagged
         ORDER BY received_at DESC LIMIT 1`,
        [user.id],
      ),
      // Rank is computed over the same window as everything else, so a profile and the board
      // never disagree about where somebody sits.
      pool.query<{ rank: string; total: string }>(
        `WITH totals AS (
           SELECT user_id, SUM(tokens) AS tokens
           FROM user_days WHERE day >= CURRENT_DATE - $2::int
           GROUP BY user_id
         ), ranked AS (
           SELECT user_id, RANK() OVER (ORDER BY tokens DESC) AS rank,
                  COUNT(*) OVER () AS total
           FROM totals
         )
         SELECT rank::text, total::text FROM ranked WHERE user_id = $1`,
        [user.id, days],
      ),
    ]);

  const a = agg[0];
  const l = latest[0];
  const r = ranking[0];

  const mixRaw = (a?.mix ?? {}) as Record<string, string | number>;
  const mix: Record<string, number> = {};
  for (const [agent, n] of Object.entries(mixRaw)) mix[agent] = Number(n);

  return {
    handle: user.handle,
    tier: user.tier,
    tokens: Number(a?.tokens ?? 0),
    equivCostUsd: Number(a?.cost ?? 0),
    streakDays: Number(l?.streak_days ?? 0),
    activeDays: Number(a?.active_days ?? 0),
    firstDay: a?.first_day ?? null,
    lastDay: a?.last_day ?? null,
    lastPublished: l?.received_at ?? null,
    mix,
    models: ((l?.models ?? []) as ProfileModel[]).map((m) => ({
      model: m.model,
      tokens: Number(m.tokens),
      equivCostUsd: Number(m.equivCostUsd),
      priced: Boolean(m.priced),
    })),
    days: series.map((s) => ({ day: s.day, tokens: Number(s.tokens) })),
    rank: r ? Number(r.rank) : null,
    totalRanked: r ? Number(r.total) : 0,
  };
}

/** Handles with any published data, for static params and the board's "all" listing. */
export async function listHandles(limit = 500): Promise<string[]> {
  const { rows } = await pool.query<{ handle: string }>(
    `SELECT DISTINCT u.handle::text FROM users u
     JOIN user_days d ON d.user_id = u.id
     ORDER BY 1 LIMIT $1`,
    [limit],
  );
  return rows.map((r) => r.handle);
}

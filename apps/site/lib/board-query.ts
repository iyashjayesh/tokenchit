import "server-only";

import { pool } from "@/lib/db";
import { densify } from "@/lib/spark";
import {
  MOVEMENT_DAYS,
  SPARK_DAYS,
  WINDOW_DAYS,
  type BoardRow,
  type BoardWindow,
} from "@/lib/board";

/**
 * Read the board for one window.
 *
 * Shared by the route handler and the server-rendered page rather than having the page fetch
 * its own API over HTTP: a self-request would be a needless round trip, and in development it
 * would have to name an origin, which means either hardcoding localhost or accidentally
 * reading production.
 *
 * Every column is summed over the same window. That is the entire reason `user_days` carries
 * an agent and a cost — a row whose tokens covered a week while its cost covered a year reads
 * as one figure and gets quoted as one.
 *
 * Streak is the exception and is deliberately not windowed: it is a current-streak count, and
 * "your streak, but only counting last week" is not something anyone means.
 */
export async function readBoard(
  window: BoardWindow,
  limit = 25,
  offset = 0,
): Promise<BoardRow[]> {
  const { rows } = await pool.query(
    `WITH eligible AS (
       /* Everyone whose latest submission is not held for review. Computed once and reused by
          both rankings, so a flagged row cannot be absent from one and present in the other —
          which would make every position below it move for no reason. */
       SELECT u.id, u.handle, u.tier, u.github_id
       FROM users u
       LEFT JOIN LATERAL (
         SELECT flagged, streak_days FROM submissions
         WHERE user_id = u.id ORDER BY received_at DESC LIMIT 1
       ) l ON true
       WHERE COALESCE(l.flagged, false) = false
     ),
     windowed AS (
       SELECT d.user_id, d.agent,
              SUM(d.tokens)   AS tokens,
              SUM(d.cost_usd) AS cost
       FROM user_days d
       WHERE d.day >= CURRENT_DATE - $1::int
       GROUP BY d.user_id, d.agent
     ),
     totals AS (
       SELECT user_id,
              SUM(tokens) AS tokens,
              SUM(cost)   AS cost,
              jsonb_object_agg(agent, tokens) AS mix
       FROM windowed
       GROUP BY user_id
     ),
     before AS (
       /* The same window, shifted back. user_days keeps the whole daily series, so the board
          as it stood a week ago is a query rather than a snapshot — no extra table, and no
          waiting for history to start accumulating. */
       SELECT d.user_id, SUM(d.tokens) AS tokens
       FROM user_days d
       WHERE d.day >= CURRENT_DATE - $1::int - $4::int
         AND d.day <  CURRENT_DATE - $4::int
       GROUP BY d.user_id
     ),
     latest AS (
       SELECT DISTINCT ON (user_id) user_id, streak_days
       FROM submissions
       ORDER BY user_id, received_at DESC
     ),
     spark_rolled AS (
       SELECT user_id, array_agg(t ORDER BY dt) AS days, array_agg(dt ORDER BY dt) AS dates
       FROM (
         SELECT user_id, day AS dt, SUM(tokens) AS t
         FROM user_days
         WHERE day > CURRENT_DATE - $5::int
         GROUP BY user_id, day
       ) x
       GROUP BY user_id
     ),
     ranked_now AS (
       SELECT e.id, e.handle, e.tier, e.github_id, t.tokens, t.cost, t.mix,
              ROW_NUMBER() OVER (ORDER BY (e.tier = 'verified') DESC, t.tokens DESC) AS rank
       FROM totals t
       JOIN eligible e ON e.id = t.user_id
     ),
     ranked_before AS (
       /* Tier is today's, because no historical tier is stored. Someone who verified this week
          therefore shows the rise that verifying earned them, which is the honest reading of
          what changed. */
       SELECT b.user_id,
              ROW_NUMBER() OVER (ORDER BY (e.tier = 'verified') DESC, b.tokens DESC) AS rank
       FROM before b
       JOIN eligible e ON e.id = b.user_id
       WHERE b.tokens > 0
     )
     SELECT r.handle, r.tier, r.github_id, r.tokens, r.cost, r.mix, r.rank,
            COALESCE(l.streak_days, 0) AS streak_days,
            rb.rank AS previous_rank,
            sp.days AS spark_days,
            sp.dates AS spark_dates
     FROM ranked_now r
     LEFT JOIN latest l  ON l.user_id = r.id
     LEFT JOIN ranked_before rb ON rb.user_id = r.id
     LEFT JOIN spark_rolled sp ON sp.user_id = r.id
     ORDER BY r.rank
     LIMIT $2 OFFSET $3`,
    [WINDOW_DAYS[window], limit, offset, MOVEMENT_DAYS, SPARK_DAYS],
  );

  return rows.map((r) => ({
    // Ranked in SQL now, because the previous ranking has to be computed over everyone
    // rather than over one page: a row's movement depends on people who are not on it.
    rank: Number(r.rank),
    handle: r.handle,
    tier: r.tier,
    /* Null for anyone who has not proved the handle, which is what gates the avatar: an
       unverified row has no id to render one from, so it cannot show a face. */
    githubId: r.github_id === null ? null : String(r.github_id),
    tokens: Number(r.tokens),
    equivCostUsd: Number(r.cost),
    streakDays: Number(r.streak_days),
    mix: Object.fromEntries(
      Object.entries(r.mix as Record<string, string>).map(([a, n]) => [a, Number(n)]),
    ),
    // null means "not ranked a week ago" — a new entrant, not a row that held position 0.
    previousRank: r.previous_rank === null ? null : Number(r.previous_rank),
    spark: densify(
      r.spark_dates as (string | Date)[] | null,
      r.spark_days as string[] | null,
      SPARK_DAYS,
    ),
  }));
}


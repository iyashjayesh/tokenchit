import "server-only";

import { pool } from "@/lib/db";
import { WINDOW_DAYS, type BoardRow, type BoardWindow } from "@/lib/board";

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
export async function readBoard(window: BoardWindow, limit = 25): Promise<BoardRow[]> {
  const { rows } = await pool.query(
    `WITH windowed AS (
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
     latest AS (
       SELECT DISTINCT ON (user_id) user_id, streak_days, flagged
       FROM submissions
       ORDER BY user_id, received_at DESC
     )
     SELECT u.handle, u.tier, t.tokens, t.cost, t.mix,
            COALESCE(l.streak_days, 0) AS streak_days
     FROM totals t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN latest l ON l.user_id = t.user_id
     WHERE COALESCE(l.flagged, false) = false
     ORDER BY t.tokens DESC
     LIMIT $2`,
    [WINDOW_DAYS[window], limit],
  );

  return rows.map((r, i) => ({
    rank: i + 1,
    handle: r.handle,
    tier: r.tier,
    tokens: Number(r.tokens),
    equivCostUsd: Number(r.cost),
    streakDays: Number(r.streak_days),
    mix: Object.fromEntries(
      Object.entries(r.mix as Record<string, string>).map(([a, n]) => [a, Number(n)]),
    ),
  }));
}

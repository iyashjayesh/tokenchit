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
export async function readBoard(
  window: BoardWindow,
  limit = 25,
  offset = 0,
): Promise<BoardRow[]> {
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
     /* Verified first, then tokens. A tier that is displayed but never affects position is
        decoration: an unverified row could outrank a signed-in one, so the badge told you
        nothing about the ranking you were reading. Signing in is the only thing that ties a
        row to a GitHub account, so it is the only thing that can carry a ranking. */
     ORDER BY (u.tier = 'verified') DESC, t.tokens DESC
     LIMIT $2 OFFSET $3`,
    [WINDOW_DAYS[window], limit, offset],
  );

  return rows.map((r, i) => ({
    // Rank is the position on the whole board, not within this page — page two starts at 26.
    rank: offset + i + 1,
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

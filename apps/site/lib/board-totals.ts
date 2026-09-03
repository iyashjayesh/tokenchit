import "server-only";

import { pool } from "@/lib/db";
import { WINDOW_DAYS, type BoardWindow } from "@/lib/board";

export type BoardTotals = {
  developers: number;
  verified: number;
  tokens: number;
  equivCostUsd: number;
};

/**
 * Headline figures for the board page, over the same window as the table beneath them.
 *
 * Computed rather than summed from the returned rows because the table is capped at 100 and
 * the headline should describe everyone, not the page you can see.
 */
export async function readBoardTotals(window: BoardWindow): Promise<BoardTotals> {
  const { rows } = await pool.query(
    `WITH windowed AS (
       SELECT d.user_id, SUM(d.tokens) AS tokens, SUM(d.cost_usd) AS cost
       FROM user_days d
       WHERE d.day >= CURRENT_DATE - $1::int
       GROUP BY d.user_id
     ),
     latest AS (
       SELECT DISTINCT ON (user_id) user_id, flagged
       FROM submissions ORDER BY user_id, received_at DESC
     )
     SELECT COUNT(*)                                        AS developers,
            COUNT(*) FILTER (WHERE u.tier = 'verified')     AS verified,
            COALESCE(SUM(w.tokens), 0)                      AS tokens,
            COALESCE(SUM(w.cost), 0)                        AS cost
     FROM windowed w
     JOIN users u ON u.id = w.user_id
     LEFT JOIN latest l ON l.user_id = w.user_id
     WHERE COALESCE(l.flagged, false) = false`,
    [WINDOW_DAYS[window]],
  );

  const r = rows[0];
  return {
    developers: Number(r?.developers ?? 0),
    verified: Number(r?.verified ?? 0),
    tokens: Number(r?.tokens ?? 0),
    equivCostUsd: Number(r?.cost ?? 0),
  };
}

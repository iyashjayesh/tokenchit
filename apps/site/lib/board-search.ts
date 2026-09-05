import "server-only";

import { sanitizeHandle } from "@tokenchit/core";

import { WINDOW_DAYS, type BoardWindow } from "@/lib/board";
import { pool } from "@/lib/db";

/**
 * What a handle search found.
 *
 * Three outcomes rather than two, because "not in this table" and "not a user" are different
 * answers and only one of them should offer an invitation. A board filtered to seven days
 * hides most of its own members, so treating an absent row as an absent person would offer to
 * invite people who signed up months ago — the reading that makes the invitation worth
 * ignoring.
 */
export type BoardSearch =
  | { state: "ranked"; handle: string; tier: string; rank: number; page: number }
  | { state: "off-window"; handle: string; tier: string }
  | { state: "unknown"; handle: string };

/**
 * Find one handle against the board, as the board itself ranks.
 *
 * The rank has to come from the same `eligible` set and the same ORDER BY that `readBoard`
 * uses, or the number quoted here would disagree with the row it points at. Held-for-review
 * users fall out of `eligible` exactly as they do there, so they read as "not in this window"
 * rather than as flagged — the board does not announce who is under review, and neither does
 * this.
 *
 * Returns null for a query that cannot name anyone, so a caller can tell "nothing was asked"
 * apart from "nobody was found".
 */
export async function findOnBoard(
  query: string,
  window: BoardWindow,
  perPage: number,
): Promise<BoardSearch | null> {
  // The same sanitiser the card route uses: a GitHub handle, or nothing.
  const handle = sanitizeHandle(query.trim().replace(/^@/, ""));
  if (!handle) return null;

  const { rows } = await pool.query<{ handle: string; tier: string; rank: string | null }>(
    `WITH target AS (
       /* citext, so @Octocat and @octocat are the same lookup and it rides the UNIQUE index. */
       SELECT id, handle::text AS handle, tier FROM users WHERE handle = $1
     ),
     eligible AS (
       SELECT u.id, u.tier
       FROM users u
       LEFT JOIN LATERAL (
         SELECT flagged FROM submissions
         WHERE user_id = u.id ORDER BY received_at DESC LIMIT 1
       ) l ON true
       WHERE COALESCE(l.flagged, false) = false
     ),
     totals AS (
       SELECT user_id, SUM(tokens) AS tokens
       FROM user_days
       WHERE day >= CURRENT_DATE - $2::int
       GROUP BY user_id
     ),
     ranked AS (
       SELECT e.id,
              ROW_NUMBER() OVER (ORDER BY (e.tier = 'verified') DESC, t.tokens DESC) AS rank
       FROM totals t
       JOIN eligible e ON e.id = t.user_id
     )
     SELECT t.handle, t.tier, r.rank::text AS rank
     FROM target t
     LEFT JOIN ranked r ON r.id = t.id`,
    [handle, WINDOW_DAYS[window]],
  );

  const found = rows[0];
  if (!found) return { state: "unknown", handle };
  if (found.rank === null) return { state: "off-window", handle: found.handle, tier: found.tier };

  const rank = Number(found.rank);
  return {
    state: "ranked",
    handle: found.handle,
    tier: found.tier,
    rank,
    // Which page of the table they are on, so the link can land on the row rather than on a
    // page that happens not to contain it.
    page: Math.floor((rank - 1) / perPage) + 1,
  };
}

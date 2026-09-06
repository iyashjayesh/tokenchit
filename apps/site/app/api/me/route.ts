import { NextResponse } from "next/server";

import { userFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Everything the board holds about the caller, and the way to remove it.
 *
 * Neither existed. A tool whose whole pitch is that you stay in control of what leaves your
 * machine had no way to take anything off the board once it was there: no delete, no export,
 * and no session for a browser to offer one through. `tokenchit logout` removed the local key
 * and left the public row standing. "You can put data on a public page but not take it off"
 * is the one hole in that story a privacy-minded reader will find, and it is the request most
 * likely to arrive angry rather than calm.
 *
 * Authenticated by the API key, like every other account route, because that is the only
 * identity this site has — holding the key is what proves the account, and it is the same
 * thing publishing proves.
 */

/** Export: every row that names this user, as JSON. */
export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const [profile, submissions, days] = await Promise.all([
    pool.query(
      "SELECT handle::text, tier, github_id::text, created_at FROM users WHERE id = $1",
      [user.id],
    ),
    pool.query(
      `SELECT received_at, tokens, equiv_cost_usd, priced_share, streak_days, active_days,
              first_day, last_day, agents, models, client_version, flagged
       FROM submissions WHERE user_id = $1 ORDER BY received_at`,
      [user.id],
    ),
    pool.query(
      "SELECT day, agent, tokens, cost_usd FROM user_days WHERE user_id = $1 ORDER BY day, agent",
      [user.id],
    ),
  ]);

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user: profile.rows[0] ?? null,
    submissions: submissions.rows,
    days: days.rows,
    // Named rather than included: the point of storing only hashes is that they cannot be
    // handed back, and saying so is more useful than omitting them silently.
    apiKeys: "not exported — only salted hashes are stored, and they are deleted with the account",
  });
}

/**
 * Deletion: the account and everything that cascades from it.
 *
 * One statement, because every foreign key already cascades — submissions, user_days and
 * api_tokens all carry `ON DELETE CASCADE`. The row, the profile page, the OG image, the card
 * endpoint and every key on every machine go together, which is what someone asking for this
 * means by it.
 *
 * Irreversible, so it requires the caller to say so explicitly: a stray DELETE from a script
 * that guessed at this URL should not be able to erase somebody's history in one request.
 */
export async function DELETE(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  if (new URL(req.url).searchParams.get("confirm") !== "delete") {
    return NextResponse.json(
      {
        error: "this deletes everything and cannot be undone — repeat with ?confirm=delete",
        handle: user.handle,
      },
      { status: 400 },
    );
  }

  await pool.query("DELETE FROM users WHERE id = $1", [user.id]);

  return NextResponse.json({ ok: true, deleted: user.handle });
}

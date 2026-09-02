import { NextResponse } from "next/server";

import { validatePayload, type Payload } from "@tokencard/core";

import { pool, transaction } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Accept a self-reported usage submission.
 *
 * Validation runs here even though the CLI already ran it. The client is the thing we cannot
 * trust; running the same bounds twice is the entire point of putting them in a shared module
 * rather than in the command.
 */
export async function POST(req: Request) {
  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.days)) {
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }

  const errors = validatePayload(payload);
  if (errors.length > 0) {
    // Every failed bound, not just the first: a client fixing them one round-trip at a time
    // is a worse experience than seeing the whole list.
    return NextResponse.json({ error: "rejected", reasons: errors }, { status: 422 });
  }

  try {
    const result = await transaction(async (client) => {
      // An unverified submission may claim a handle nobody has verified. Once a GitHub login
      // proves ownership the tier becomes 'verified', and this ON CONFLICT must never
      // downgrade it back to 'cli'.
      const { rows: userRows } = await client.query<{ id: string; tier: string }>(
        `INSERT INTO users (handle) VALUES ($1)
         ON CONFLICT (handle) DO UPDATE SET updated_at = now()
         RETURNING id, tier`,
        [payload.handle],
      );
      const user = userRows[0]!;

      const { rows: subRows } = await client.query<{ id: string; received_at: Date }>(
        `INSERT INTO submissions
           (user_id, tokens, equiv_cost_usd, priced_share, streak_days, active_days,
            first_day, last_day, agents, models, client_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, received_at`,
        [
          user.id,
          payload.tokens,
          payload.equivCostUsd,
          payload.pricedShare,
          payload.streakDays,
          payload.activeDays,
          payload.firstDay,
          payload.lastDay,
          JSON.stringify(payload.agents),
          JSON.stringify(payload.models),
          payload.clientVersion,
        ],
      );

      // Replaced wholesale rather than merged. A user who deletes local history and re-syncs
      // should see their board row shrink to match; merging would make the board a high-water
      // mark that can only ever grow.
      await client.query("DELETE FROM user_days WHERE user_id = $1", [user.id]);
      if (payload.days.length > 0) {
        await client.query(
          `INSERT INTO user_days (user_id, day, tokens)
           SELECT $1, d.day::date, d.tokens::bigint
           FROM jsonb_to_recordset($2::jsonb) AS d(day text, tokens bigint)`,
          [user.id, JSON.stringify(payload.days)],
        );
      }

      return { submissionId: subRows[0]!.id, tier: user.tier };
    });

    return NextResponse.json(
      {
        ok: true,
        handle: payload.handle,
        tier: result.tier,
        submissionId: result.submissionId,
        tokens: payload.tokens,
        days: payload.days.length,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("submission failed", err);
    return NextResponse.json({ error: "could not store submission" }, { status: 500 });
  }
}

/**
 * The board, as far as it goes in this change: enough to prove the write path end to end.
 * `window` sums the daily series rather than reading a stored aggregate, which is why
 * user_days exists.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(3650, Math.max(1, Number(url.searchParams.get("days") ?? 365)));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  try {
    const { rows } = await pool.query(
      `SELECT u.handle, u.tier, SUM(d.tokens)::bigint AS tokens
       FROM users u
       JOIN user_days d ON d.user_id = u.id
       WHERE d.day >= (CURRENT_DATE - $1::int)
       GROUP BY u.handle, u.tier
       ORDER BY tokens DESC
       LIMIT $2`,
      [days, limit],
    );

    return NextResponse.json({
      window: `${days}d`,
      rows: rows.map((r, i) => ({
        rank: i + 1,
        handle: r.handle,
        tier: r.tier,
        tokens: Number(r.tokens),
      })),
    });
  } catch (err) {
    console.error("board query failed", err);
    return NextResponse.json({ error: "could not read board" }, { status: 500 });
  }
}

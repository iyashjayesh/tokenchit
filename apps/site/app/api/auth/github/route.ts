import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { transaction } from "@/lib/db";
import { clientIp, hit, limitHeaders, LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Exchange a GitHub access token for a tokenchit API key.
 *
 * The identity check happens **here**, not in the CLI. A client that simply posted
 * `{ handle: "octocat" }` would be trivially forgeable, so the server takes the GitHub token
 * and asks GitHub itself who it belongs to. GitHub's answer is the only thing trusted.
 *
 * The GitHub token is used for exactly one request and then dropped. It is never stored,
 * never logged, and never written to the client's disk either.
 */
export async function POST(req: Request) {
  // Before the GitHub call, not after: an unlimited sign-in endpoint is a way to spend our
  // outbound rate limit with GitHub as well as our own function budget.
  const verdict = await hit(`auth:ip:${clientIp(req)}`, LIMITS.auth);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: `too many sign-in attempts — try again in ${verdict.retryAfter}s` },
      { status: 429, headers: limitHeaders(verdict) },
    );
  }

  let githubToken: string;
  try {
    const body = (await req.json()) as { githubToken?: unknown };
    if (typeof body.githubToken !== "string" || body.githubToken.length < 8) {
      return NextResponse.json({ error: "githubToken is required" }, { status: 400 });
    }
    githubToken = body.githubToken;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  let ghUser: { login: string; id: number };
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${githubToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "tokenchit",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "GitHub rejected that token" }, { status: 401 });
    }

    const json = (await res.json()) as { login?: string; id?: number };
    if (!json.login || typeof json.id !== "number") {
      return NextResponse.json({ error: "GitHub returned no identity" }, { status: 502 });
    }
    ghUser = { login: json.login, id: json.id };
  } catch {
    return NextResponse.json({ error: "could not reach GitHub" }, { status: 502 });
  }

  // Generated here, returned once, and stored only as a hash. A dump of this table must not
  // hand anyone a working credential.
  const apiKey = `tc_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  try {
    const result = await transaction(async (client) => {
      // Whoever holds the GitHub account owns the handle. An unverified `cli` row that
      // claimed it first is taken over rather than left to squat — the whole point of the
      // tier is that it is provisional.
      const { rows: existing } = await client.query<{ id: string; tier: string; github_id: string | null }>(
        "SELECT id, tier, github_id FROM users WHERE handle = $1",
        [ghUser.login],
      );

      const squatter = existing[0];
      const takenOver = Boolean(squatter && squatter.github_id === null);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (handle, github_id, tier)
         VALUES ($1, $2, 'verified')
         ON CONFLICT (handle) DO UPDATE
           SET github_id = EXCLUDED.github_id,
               tier      = 'verified',
               updated_at = now()
         RETURNING id`,
        [ghUser.login, ghUser.id],
      );
      const userId = rows[0]!.id;

      /*
       * Inherited figures are quarantined, not adopted.
       *
       * Anyone could publish to an unclaimed handle anonymously, and this INSERT sets
       * `tier = 'verified'` on whatever row is already there. So the sequence "publish
       * fabricated numbers under a stranger's handle, wait for them to sign in" ended with the
       * stranger's page carrying someone else's invention behind a ✓ — verification laundering
       * the squat instead of clearing it. `takenOver` was computed and only reported.
       *
       * Flagging the inherited submissions holds them off the board (board-query.ts filters on
       * the newest submission's `flagged`) without deleting anything: if the figures were in
       * fact this person's own anonymous publishing, their next `tokenchit publish` writes an
       * unflagged submission and the row returns on its own.
       */
      if (takenOver) {
        await client.query("UPDATE submissions SET flagged = true WHERE user_id = $1", [userId]);
      }

      await client.query(
        "INSERT INTO api_tokens (user_id, token_hash, label) VALUES ($1, $2, $3)",
        [userId, keyHash, "cli"],
      );

      /*
       * Bounded, so repeated logins cannot accumulate live keys forever.
       *
       * Each sign-in minted a key and nothing ever removed one, so a user who logs in on a new
       * machine every few months carries an ever-growing set of credentials they cannot see and
       * could not revoke. Keeping the newest few preserves the multi-machine case the `label`
       * column exists for while putting a ceiling on the blast radius; DELETE /api/auth/tokens
       * is the deliberate path for giving one up early.
       *
       * Ordered by `id` as well as `created_at`, because `created_at` defaults to `now()` and
       * `now()` is transaction time, not statement time — rows written in one transaction all
       * carry the same timestamp and `ORDER BY created_at DESC` alone then picks arbitrarily.
       * Against a real Postgres that kept the five *oldest* of eight. The key minted just above
       * shares this transaction's timestamp, so without the `id` tiebreaker a tie could evict
       * the credential this request is about to hand back. `id` is bigserial and monotonic.
       */
      await client.query(
        `DELETE FROM api_tokens WHERE user_id = $1 AND id NOT IN (
           SELECT id FROM api_tokens WHERE user_id = $1
           ORDER BY created_at DESC, id DESC LIMIT 5
         )`,
        [userId],
      );

      return { userId, takenOver };
    });

    return NextResponse.json({
      ok: true,
      handle: ghUser.login,
      tier: "verified",
      token: apiKey,
      takenOver: result.takenOver,
    });
  } catch (err) {
    // A github_id already bound to a different handle lands here: someone renamed their
    // GitHub account. Worth surfacing plainly rather than as a generic 500.
    if (err instanceof Error && err.message.includes("users_github_id_key")) {
      return NextResponse.json(
        { error: "that GitHub account is already linked to a different handle" },
        { status: 409 },
      );
    }
    console.error("sign-in failed", err);
    return NextResponse.json({ error: "could not complete sign-in" }, { status: 500 });
  }
}

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { userFromRequest } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Revoke API keys.
 *
 * There was no way to do this. Every GitHub login minted another non-expiring key with no cap
 * and nothing ever deleted one, while `tokenchit logout` only cleared the local file — so a key
 * that leaked into a CI log, a shared machine or a synced dotfile stayed valid forever and could
 * rewrite that user's board row. The `label` column's own comment describes telling two machines
 * apart "before revoking one", which was a feature that did not exist.
 *
 * Authenticated by the key being revoked, so this needs no session and no second factor: holding
 * the key is the only thing it proves, and the only thing it needs to prove to give it up.
 *
 * `?all=1` revokes every key the user has, which is what someone who has lost a machine wants.
 * The default revokes only the calling key, which is what `logout` wants.
 */
export async function DELETE(req: Request) {
  const user = await userFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const all = new URL(req.url).searchParams.get("all") === "1";

  // Re-derived rather than passed: the header is the only place the key exists, and hashing it
  // here means the plaintext never reaches a query parameter or a log line.
  const header = req.headers.get("authorization")!;
  const hash = createHash("sha256").update(header.slice(7).trim()).digest("hex");

  const { rowCount } = all
    ? await pool.query("DELETE FROM api_tokens WHERE user_id = $1", [user.id])
    : await pool.query("DELETE FROM api_tokens WHERE token_hash = $1", [hash]);

  return NextResponse.json({ ok: true, revoked: rowCount ?? 0, handle: user.handle });
}

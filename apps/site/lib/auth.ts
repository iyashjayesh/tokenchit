import { createHash } from "node:crypto";

import { pool } from "@/lib/db";

/**
 * Resolve a `Bearer` API key to a user, or null.
 *
 * Keys are compared by hash because that is all we store — see the api_tokens migration.
 * An unauthenticated request is not an error here: unverified `cli` submissions are a
 * supported tier, so the caller decides what to do with null.
 */
export async function userFromRequest(
  req: Request,
): Promise<{ id: string; handle: string; tier: string } | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const hash = createHash("sha256").update(header.slice(7).trim()).digest("hex");

  const { rows } = await pool.query<{ id: string; handle: string; tier: string }>(
    `UPDATE api_tokens SET last_used_at = now()
     WHERE token_hash = $1
     RETURNING (SELECT id::text FROM users WHERE users.id = api_tokens.user_id) AS id,
               (SELECT handle FROM users WHERE users.id = api_tokens.user_id) AS handle,
               (SELECT tier   FROM users WHERE users.id = api_tokens.user_id) AS tier`,
    [hash],
  );

  return rows[0] ?? null;
}

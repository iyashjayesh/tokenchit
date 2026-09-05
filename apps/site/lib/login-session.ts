import "server-only";

import { pool } from "@/lib/db";

/**
 * A sign-in the CLI started, readable by the browser it opened.
 *
 * The device flow puts the code in a terminal and the authorisation in a browser, and asks the
 * person to carry one to the other. This table is the carrying: the CLI parks what it was told
 * to display, and the page it opens shows the same thing with a copy button and a link.
 *
 * What is deliberately absent is the `device_code`. That is the half that exchanges for a
 * token, it stays in the process that asked for it, and a row here is readable by anyone
 * holding the id — so the two must not meet. Everything stored here is already printed in the
 * user's own terminal.
 */
export type LoginSession = {
  userCode: string;
  verifyUrl: string;
  expiresAt: string;
  /** Set once the CLI has the token. Null while the sign-in is still open. */
  handle: string | null;
  expired: boolean;
};

/** GitHub's device codes last fifteen minutes; nothing here should outlive one by much. */
const MAX_TTL_SECONDS = 20 * 60;

export async function createLoginSession(input: {
  id: string;
  userCode: string;
  verifyUrl: string;
  expiresInSeconds: number;
}): Promise<void> {
  // Clamped rather than trusted: `expires_in` arrives from the client, and a row that never
  // expires is a row that accumulates.
  const ttl = Math.min(Math.max(60, Math.floor(input.expiresInSeconds) || 0), MAX_TTL_SECONDS);

  await pool.query(
    `INSERT INTO login_sessions (id, user_code, verify_url, expires_at)
     VALUES ($1, $2, $3, now() + ($4::int * interval '1 second'))
     ON CONFLICT (id) DO NOTHING`,
    [input.id, input.userCode, input.verifyUrl, ttl],
  );

  /* Opportunistic sweep, on the same principle as the rate limiter's: a row here is worthless
     within twenty minutes, and depending on a scheduler for that would mean depending on one
     being configured. Failures are swallowed — housekeeping must never break a sign-in. */
  void pool
    .query("DELETE FROM login_sessions WHERE expires_at < now() - interval '1 hour'")
    .catch(() => {});
}

export async function readLoginSession(id: string): Promise<LoginSession | null> {
  if (!/^[0-9a-f]{64}$/.test(id)) return null;

  const { rows } = await pool.query<{
    user_code: string;
    verify_url: string;
    expires_at: Date;
    handle: string | null;
    expired: boolean;
  }>(
    `SELECT user_code, verify_url, expires_at, handle::text, (expires_at < now()) AS expired
     FROM login_sessions WHERE id = $1`,
    [id],
  );

  const r = rows[0];
  if (!r) return null;

  return {
    userCode: r.user_code,
    verifyUrl: r.verify_url,
    expiresAt: r.expires_at.toISOString(),
    handle: r.handle,
    expired: r.expired,
  };
}

/**
 * Record that the sign-in finished, so the page can say so.
 *
 * Only ever sets the handle; there is no path back to "not signed in". A session that was
 * completed once cannot be un-completed by a later caller holding the same id.
 */
export async function completeLoginSession(id: string, handle: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(id)) return;
  await pool.query(
    "UPDATE login_sessions SET handle = $2 WHERE id = $1 AND handle IS NULL",
    [id, handle],
  );
}

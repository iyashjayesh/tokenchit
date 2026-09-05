import "server-only";

import { createHash } from "node:crypto";

import { pool } from "@/lib/db";

export type Limit = { limit: number; windowSeconds: number };

/**
 * What each route allows, and why.
 *
 * Publishing is not a frequent act — a developer syncs a few times a day, not a few times a
 * minute — so these are generous for anyone real and still stop a script.
 *
 * Signed-in callers get more headroom than anonymous ones because they have proved who they
 * are and their rows carry their name. An anonymous caller can claim any unclaimed handle,
 * which is exactly the surface worth keeping narrow.
 */
export const LIMITS = {
  /** Anonymous publishing, keyed by IP. The tightest bucket in the system. */
  publishAnonIp: { limit: 10, windowSeconds: 3600 },
  /** Signed-in publishing, keyed by user. */
  publishUser: { limit: 60, windowSeconds: 3600 },
  /** Per handle, so one name cannot be rewritten endlessly from many addresses. */
  publishHandle: { limit: 30, windowSeconds: 3600 },
  /** Sign-in makes an outbound call to GitHub, so it is worth its own bucket. */
  auth: { limit: 20, windowSeconds: 3600 },
  /** Reads are cheap but not free; this only exists to blunt a flood. */
  read: { limit: 300, windowSeconds: 3600 },
} as const satisfies Record<string, Limit>;

export type Verdict = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window rolls over, for `Retry-After`. */
  retryAfter: number;
};

/**
 * Count one hit against a bucket and say whether it is allowed.
 *
 * Rejected requests still increment. That is deliberate: the counter measures attempts, so
 * hammering a closed door does not quietly earn back allowance.
 */
export async function hit(bucket: string, { limit, windowSeconds }: Limit): Promise<Verdict> {
  const { rows } = await pool.query<{ count: number; expires_in: number }>(
    `INSERT INTO rate_limits (bucket, window_start, count)
     VALUES ($1, now(), 1)
     ON CONFLICT (bucket) DO UPDATE SET
       count = CASE
         WHEN rate_limits.window_start < now() - make_interval(secs => $2::int)
         THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE
         WHEN rate_limits.window_start < now() - make_interval(secs => $2::int)
         THEN now() ELSE rate_limits.window_start END
     RETURNING count,
               CEIL(EXTRACT(EPOCH FROM
                 (window_start + make_interval(secs => $2::int)) - now()))::int AS expires_in`,
    [bucket, windowSeconds],
  );

  const row = rows[0]!;
  return {
    allowed: row.count <= limit,
    limit,
    remaining: Math.max(0, limit - row.count),
    retryAfter: Math.max(1, row.expires_in),
  };
}

/**
 * The caller's address, as far as it can be known.
 *
 * `x-forwarded-for` is only trustworthy because Vercel overwrites it at the edge; the first
 * entry is the client. Falling back to a shared "unknown" bucket is deliberate — if the
 * header is missing, everyone lands in one bucket and gets limited together, which fails
 * closed rather than handing out an unlimited lane to anyone who can strip a header.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const raw = forwarded
    ? forwarded.split(",")[0]!.trim()
    : req.headers.get("x-real-ip")?.trim() || "unknown";

  /*
   * Hashed before it becomes a row key.
   *
   * These keys are stored in `rate_limits` beside the handle being published, so a raw address
   * made the table a log of which IP publishes as whom — personal data this feature never needs
   * and no part of the product reads back. A hash counts requests exactly as well: the key only
   * ever has to be equal to itself.
   *
   * Truncated to 32 hex characters because it is a bucket label, not a credential, and the
   * shorter key keeps the index small.
   */
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Delete windows that can no longer matter.
 *
 * Run opportunistically on roughly one request in fifty rather than on a schedule, so the
 * behaviour does not depend on pg_cron being available. Failures are swallowed: housekeeping
 * must never be the reason a submission is rejected.
 */
export function sweep(): void {
  if (Math.random() > 0.02) return;
  void pool
    .query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'")
    .catch(() => {});
}

/** Headers every rate-limited response carries, allowed or not. */
export const limitHeaders = (v: Verdict): Record<string, string> => ({
  "x-ratelimit-limit": String(v.limit),
  "x-ratelimit-remaining": String(v.remaining),
  ...(v.allowed ? {} : { "retry-after": String(v.retryAfter) }),
});

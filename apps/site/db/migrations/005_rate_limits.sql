-- Fixed-window rate limiting, in Postgres.
--
-- Serverless functions share no memory, so an in-process counter would reset on every cold
-- start and count separately per instance. Postgres is already here, a submission is already
-- a write, and the extra round trip is one upsert — cheaper than adding Redis as a second
-- service to provision, monitor and keep inside a free tier.
--
-- A fixed window rather than a sliding one: sliding needs a row per request, and the burst
-- this exists to stop is "somebody found the endpoint", not a carefully paced overrun.
CREATE TABLE rate_limits (
  -- "<scope>:<subject>", e.g. "publish:ip:1.2.3.4" or "publish:handle:octocat".
  bucket       text        PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer     NOT NULL DEFAULT 0
);

-- Stale buckets are swept opportunistically rather than by a scheduled job, so the behaviour
-- is identical on any Postgres instead of depending on pg_cron being available.
CREATE INDEX rate_limits_window_start ON rate_limits (window_start);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

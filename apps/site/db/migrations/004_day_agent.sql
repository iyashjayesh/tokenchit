-- Split the daily series by agent, and carry cost alongside tokens.
--
-- The board has four window filters. Before this, only tokens could be windowed: cost and
-- agent mix were lifetime totals on the submission, so "last 7d" would have shown a week of
-- tokens beside a year of spend in the same row. Now every column windows on the same range.
--
-- Dropped rather than migrated because user_days is derived data — every submission replaces
-- it in full, so the next publish rebuilds it.
DROP TABLE IF EXISTS user_days;

CREATE TABLE user_days (
  user_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      date   NOT NULL,
  agent    text   NOT NULL,
  tokens   bigint NOT NULL CHECK (tokens >= 0),
  -- Four decimals, not two: one agent-day is often fractions of a cent, and rounding each
  -- row to cents would drift the summed total away from the headline figure.
  cost_usd numeric(12,4) NOT NULL CHECK (cost_usd >= 0),
  PRIMARY KEY (user_id, day, agent)
);

CREATE INDEX user_days_day ON user_days (day);

-- Same reasoning as 003: Supabase exposes public tables through PostgREST with the anon key,
-- and a new table starts with RLS off.
ALTER TABLE user_days ENABLE ROW LEVEL SECURITY;

-- citext so that @Octocat and @octocat are the same person. GitHub handles are
-- case-insensitive and a leaderboard that disagrees would let one person hold two rows.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id          bigserial PRIMARY KEY,
  handle      citext      NOT NULL UNIQUE,
  -- Null until somebody proves the handle is theirs. Unique so one GitHub account cannot
  -- hold two handles.
  github_id   bigint      UNIQUE,
  -- 'cli' is a real tier, not a placeholder: unverified rows appear on the board with a
  -- badge rather than being hidden (docs/research.md §5).
  tier        text        NOT NULL DEFAULT 'cli' CHECK (tier IN ('cli', 'verified')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Append-only. A disputed figure needs a trail showing exactly what was sent and when;
-- overwriting in place would destroy the only evidence.
CREATE TABLE submissions (
  id             bigserial   PRIMARY KEY,
  user_id        bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  received_at    timestamptz NOT NULL DEFAULT now(),
  tokens         bigint      NOT NULL CHECK (tokens >= 0),
  equiv_cost_usd numeric(12,2) NOT NULL CHECK (equiv_cost_usd >= 0),
  priced_share   numeric(5,4)  NOT NULL CHECK (priced_share BETWEEN 0 AND 1),
  streak_days    integer     NOT NULL CHECK (streak_days >= 0),
  active_days    integer     NOT NULL CHECK (active_days >= 0),
  first_day      date        NOT NULL,
  last_day       date        NOT NULL,
  agents         jsonb       NOT NULL,
  models         jsonb       NOT NULL,
  client_version text        NOT NULL,
  -- Set by hand when a row looks wrong. Flagged rows are hidden from the board but kept.
  flagged        boolean     NOT NULL DEFAULT false,
  CHECK (last_day >= first_day)
);

CREATE INDEX submissions_user_received ON submissions (user_id, received_at DESC);

-- The queryable truth, replaced wholesale by each accepted submission. Daily granularity is
-- what lets the board's this-year / 30d / 7d filters be a SUM over a range instead of four
-- separately stored aggregates that can disagree with each other.
CREATE TABLE user_days (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     date   NOT NULL,
  tokens  bigint NOT NULL CHECK (tokens >= 0),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX user_days_day ON user_days (day);

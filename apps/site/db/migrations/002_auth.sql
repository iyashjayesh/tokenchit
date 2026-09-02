-- API tokens minted by us after a GitHub identity is proved. The GitHub access token itself
-- is never stored: it is used once, server-side, to ask GitHub who the caller is, and then
-- discarded. Storing a long-lived GitHub token on every user's disk would be a liability in
-- exchange for an answer we already have.
CREATE TABLE api_tokens (
  id           bigserial   PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 of the token. A database leak must not hand out working credentials.
  token_hash   text        NOT NULL UNIQUE,
  -- Shown in `tokenstats whoami` so a user can tell two machines apart before revoking one.
  label        text        NOT NULL DEFAULT 'cli',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX api_tokens_user ON api_tokens (user_id);

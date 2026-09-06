-- Store the figure the card actually shows.
--
-- The CLI does real work to produce `estimatedTokens`: it reads every Claude Code
-- stats-cache.json, calibrates a per-machine inflation ratio from days that appear in both the
-- transcripts and the rollup, and adds back only the part the transcripts never held — so the
-- other agents are not dropped in the process. It sends the figure, and `validatePayload`
-- checks it is finite and not below the verified count.
--
-- Then the INSERT listed twelve columns and this was not one of them. Nothing stored it,
-- nothing selected it, nothing displayed it.
--
-- The cost of that was the exact failure the field was added to prevent, and it is visible on
-- the author's own machine: `sync` writes ~16.7B onto the committed card while the board and
-- the profile show the verified 11.8B — a 40% disagreement between two surfaces describing the
-- same person, one of which is a file in their README.
--
-- Nullable, because it is: a submission from a machine with no Claude Code rollup to calibrate
-- against has no estimate to make, and a row published before this column existed never sent
-- one. Every reader has to treat null as "no estimate" and fall back to the verified figure.
ALTER TABLE submissions ADD COLUMN estimated_tokens bigint;

-- Not below the verified count, matching the validator. An estimate that is smaller than what
-- was actually observed is not an estimate of anything.
ALTER TABLE submissions ADD CONSTRAINT submissions_estimated_not_below_verified
  CHECK (estimated_tokens IS NULL OR estimated_tokens >= tokens);

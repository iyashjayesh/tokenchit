-- Deny-all row level security.
--
-- Irrelevant on a plain Postgres box, essential on Supabase. Supabase exposes every table in
-- the `public` schema through PostgREST, reachable with the anon key — which is public by
-- design and shipped in client code. Without RLS, anyone holding that key could read
-- api_tokens.token_hash and the whole submissions history, and potentially write rows.
--
-- These tables are reached only by our own server over a direct Postgres connection, which
-- runs as the table owner and is therefore unaffected by RLS. So enabling it with *no
-- policies at all* closes the PostgREST surface completely while changing nothing about how
-- the application works. If a table here ever needs to be readable by a browser directly,
-- that is the moment to write a policy for it — deliberately, one table at a time.
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_days   ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens  ENABLE ROW LEVEL SECURITY;

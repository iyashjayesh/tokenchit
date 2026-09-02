import pg from "pg";

/**
 * One pool per process, cached across hot reloads.
 *
 * Next's dev server re-evaluates modules on every edit; without the global, each reload
 * would leak a pool and Postgres would run out of connections within a few saves.
 */
const globalForDb = globalThis as unknown as { tokenstatsPool?: pg.Pool };

export const pool: pg.Pool =
  globalForDb.tokenstatsPool ??
  new pg.Pool({
    connectionString:
      process.env["DATABASE_URL"] ?? "postgres://tokenstats:tokenstats@localhost:5432/tokenstats",
    // A leaderboard write is short; a connection held open longer than this is a bug.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.tokenstatsPool = pool;

/** Run `fn` inside a transaction, rolling back on any throw. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

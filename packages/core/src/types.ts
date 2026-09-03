/**
 * The shape every adapter normalises to. One event is one billable exchange, except for
 * Codex, which only records running totals — see `adapters/codex.ts`.
 */
export type UsageEvent = {
  agent: AgentId;
  /** When the exchange happened. Bucketed by *local* date downstream. */
  ts: Date;
  /** Provider's model id, verbatim. May be unknown to the price table. */
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

export type AgentId = "claude-code" | "codex" | "opencode";

/**
 * `installed-no-data` is a real, common state, not an error: Copilot CLI and Gemini CLI
 * both keep local databases that carry no cumulative token counts, and a user who has an
 * agent installed deserves to be told why it contributes nothing rather than left to
 * wonder whether detection failed.
 */
export type Detection = "ready" | "installed-no-data" | "absent";

export type Adapter = {
  id: AgentId;
  /** Display name, as it appears on the card and in `tokenchit init`. */
  name: string;
  /** Where this adapter reads from, shown by `init` so nothing is hidden. */
  source: string;
  detect(): Promise<Detection>;
  read(): AsyncIterable<UsageEvent>;
};

export const totalTokens = (e: UsageEvent): number =>
  e.input + e.output + e.cacheWrite + e.cacheRead;

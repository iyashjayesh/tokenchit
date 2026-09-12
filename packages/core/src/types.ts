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
  /**
   * How much of `ts` is a real observation. Absent means `exact`, so every existing producer
   * keeps its meaning and every existing consumer keeps its behaviour.
   *
   * Three quite different things were flowing through one `Date` and being counted as the
   * same kind of evidence:
   *
   * - `exact`   — the provider stamped this exchange. Claude Code and OpenCode.
   * - `session` — real, but one stamp for a whole session's growth. Codex reports a running
   *               counter, so a rollout contributes a single event dated at its last turn:
   *               the day is right, the hour is only the hour it finished.
   * - `day`     — the date is real and the clock is invented. Ledger replay stores a day and
   *               synthesises local noon to put it back.
   *
   * Totals, streaks, windows and the sparkline do not care. Anything reading the *hour* does,
   * which is what `clockTokens` in `Stats` is for: a question about when somebody works must
   * not be answered with a timestamp this tool made up.
   */
  tsPrecision?: TsPrecision;
};

export type TsPrecision = "exact" | "session" | "day";

/** Absent is `exact`: an adapter that does not say is taken at its word. */
export const precisionOf = (e: UsageEvent): TsPrecision => e.tsPrecision ?? "exact";

/**
 * Whether this event's clock time was observed rather than synthesised.
 *
 * `session` counts as real here. Codex genuinely saw that moment; it is coarse, not invented,
 * and excluding it would discard the only timing evidence a Codex-only user has.
 */
export const hasRealClock = (e: UsageEvent): boolean => precisionOf(e) !== "day";

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

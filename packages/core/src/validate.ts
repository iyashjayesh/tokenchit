import type { Payload } from "./publish.js";

/**
 * Plausibility bounds for a self-reported submission.
 *
 * These are arithmetic sanity checks, not proof. A patched client can send whatever it likes,
 * and no amount of validation here changes that — docs/research.md §5 found both competitors
 * reached the same conclusion and stopped short of cryptographic attestation, because a
 * patched client defeats that too. What these bounds buy is that a row on the board is at
 * least internally consistent and within the realm of physics.
 *
 * The same module runs on the client (fail before uploading, so the user sees why) and on the
 * server (because the client cannot be trusted to have run it).
 */

/**
 * Ceilings and ratios, recalibrated against real data.
 *
 * docs/research.md §5 recorded the bounds both competitors use — 250M tokens/day and a
 * cost/token ratio floor of 0.000001. Applied verbatim, those reject honest modern usage:
 * a real 37-day corpus had six days over the token ceiling (peak 523M) and a blended ratio
 * of 6.63e-7, below the floor.
 *
 * The cause is prompt caching. On that corpus **98.3% of all tokens were cache reads**, which
 * are the cheapest bucket by an order of magnitude, so a heavy cache-hitting workload
 * legitimately reports enormous token counts at a very low blended rate. The published bounds
 * predate that shape of usage.
 *
 * So the ratio floor is derived rather than copied: the cheapest cache-read rate in the price
 * table is gpt-5-nano at $0.005/Mtok, i.e. 5e-9 USD/token, which is the floor a 100%
 * cache-read workload on the cheapest available model would sit at. Anything below that is
 * arithmetically impossible rather than merely unusual.
 *
 * The cost ceilings are untouched. They are the meaningful economic guard, and the same real
 * corpus sits at $77.76 per active day against a $5,000 limit — three orders of margin.
 */
export const LIMITS = {
  /*
   * Volume ceilings are sanity bounds, not judgements.
   *
   * These were 2e9 tokens and $5,000 a day, set at roughly four times the busiest day in the
   * one corpus available at the time. The second real user to run this had a 3.37e9 day and
   * was refused outright — locked out by a limit calibrated against somebody else's machine.
   *
   * A large day is unusual, never impossible: two agents in parallel on a fast machine, a
   * shared box, a week of cache-heavy work. Nothing about volume alone makes a submission
   * false, so nothing about volume alone rejects one — REVIEW below holds the unusual ones
   * instead, which keeps a false positive a delay rather than a locked door.
   *
   * What remains here is the arithmetically impossible: negative figures, dates in the
   * future, a headline that disagrees with its own series, a cost-per-token outside what any
   * real model can produce, and volumes so large they indicate corruption rather than work.
   *
   * Raised twice now, both times because a real person was refused. The lesson each time was
   * the same: a number set from the machines we happen to have seen will be wrong for the
   * next machine, and being wrong here costs someone their submission. A trillion tokens in
   * one day is not a judgement about heavy use — it is the point where the figure stops
   * describing work and starts describing a corrupt file.
   */
  maxTokensPerDay: 1_000_000_000_000,
  maxCostPerDay: 500_000,
  maxCostTotal: 500_000 * 365,
  /** Arithmetic floor: the cheapest cache-read rate in the price table. */
  minCostPerToken: 5e-9,
  maxCostPerToken: 0.1,
  maxHandleLength: 39,

  /*
   * Shape ceilings, as opposed to the volume ceilings above.
   *
   * Nothing bounded these, so a payload could carry an arbitrary number of entries and
   * arbitrarily long names — and those names are rendered verbatim on the board, the profile
   * and the card, where one long one breaks the layout for everybody looking at the page.
   *
   * Generous on purpose. `days` is one row per day per agent, so a decade of five agents is
   * about 18,000; the cap sits above that and well below anything that indicates a client.
   */
  days: 40_000,
  models: 500,
  agents: 50,
  /** Long enough for any real model id; short enough not to break a table. */
  maxNameLength: 120,
} as const;

/**
 * The review band: plausible enough to accept, unusual enough not to rank unexamined.
 *
 * LIMITS above are hard rejections — arithmetically impossible or far past anything a person
 * produces. Between "normal" and "impossible" sits a range that a heavy real user might reach
 * and a fabricator certainly would, and rejecting it outright would turn a false positive into
 * a locked-out user.
 *
 * So a submission in this band is stored and returned to its owner as normal, and marked for
 * review, which keeps it off the public board until a human looks.
 *
 * Set against real days rather than as a fraction of the ceiling. The two heaviest days seen
 * across real users are 0.61e9 and 3.37e9 tokens — a 5.5x spread between two people — so this
 * sits about four times above the heavier of them, with room for a machine running several
 * agents at once. It is a number to revise as more real days are seen, not a constant.
 */
export const REVIEW = {
  tokensPerDay: 100_000_000_000,
  costPerDay: 100_000,
  /*
   * The same band, applied to the whole submission.
   *
   * Every bound here used to be per-day, and a per-day bound is defeated by division: a
   * 3.29-trillion-token fabrication spread over 365 days is 9B a day, an order of magnitude
   * under `tokensPerDay`, and it passed clean with `reviewReason` returning null. Volume is
   * only unusual relative to the time it claims to span, so the span has to be checked too.
   *
   * Set well clear of real use rather than close to it, because this file's own history is a
   * list of thresholds raised after they refused a real person. The heaviest corpus measured
   * for this project is 16.6B tokens and $7.3k over three months; a year at that rate is ~66B
   * and ~$30k, so these sit roughly 15x and 8x above the heaviest use anyone here has seen.
   * And unlike LIMITS, tripping this is a delay and not a door: the row is stored and returned
   * to its owner, it just does not rank until someone looks.
   */
  tokensTotal: 1_000_000_000_000,
  costTotal: 250_000,
} as const;

/**
 * Why a submission should be held back from the board, or null to publish it.
 *
 * Separate from validatePayload because the outcomes differ: that returns errors and the
 * submission is refused, this returns a reason and the submission is kept. A caller that
 * conflated them would either publish what it should hold or reject what it should keep.
 */
export function reviewReason(p: Payload): string | null {
  // Days arrive split by agent, so a day is only unusual once its agents are summed — three
  // agents each sitting just under the bar is one day far over it.
  const byDay = new Map<string, { tokens: number; cost: number }>();
  for (const d of p.days) {
    const acc = byDay.get(d.day) ?? { tokens: 0, cost: 0 };
    acc.tokens += d.tokens;
    acc.cost += d.equivCostUsd;
    byDay.set(d.day, acc);
  }

  for (const [day, acc] of byDay) {
    if (acc.tokens > REVIEW.tokensPerDay) {
      return `${day} reports ${acc.tokens.toLocaleString()} tokens, above the review threshold`;
    }
    if (acc.cost > REVIEW.costPerDay) {
      return `${day} reports $${acc.cost.toFixed(2)}, above the review threshold`;
    }
  }

  // The whole submission, not just its worst day — see REVIEW.tokensTotal.
  if (p.tokens > REVIEW.tokensTotal) {
    return `${p.tokens.toLocaleString()} tokens in total, above the review threshold`;
  }
  if (p.equivCostUsd > REVIEW.costTotal) {
    return `$${p.equivCostUsd.toFixed(2)} in total, above the review threshold`;
  }

  /*
   * `activeDays` and `streakDays` are self-reported, and the board ranks on windows derived
   * from them. `p.days` is the same client's own series, so a disagreement between the two is
   * the client contradicting itself — which is what a hand-edited payload looks like, and what
   * an honest one never does.
   *
   * Only checked when a series is present; a submission with no days makes no claim to check.
   */
  if (byDay.size > 0) {
    if (p.activeDays > byDay.size) {
      return `claims ${p.activeDays} active days but reports ${byDay.size}`;
    }
    if (p.streakDays > byDay.size) {
      return `claims a ${p.streakDays}-day streak but reports ${byDay.size} days`;
    }
  }

  return null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rejections name the bound that failed. A CLI that says "cost/token ratio 0.4 exceeds 0.1"
 * can be acted on; one that says "400" sends someone to read our source.
 */
export function validatePayload(p: Payload, now: Date = new Date()): string[] {
  /* A Set, because the same fault is reachable from more than one check — a too-long agent
     name is found once in `agents` and again on every day that uses it — and telling somebody
     the same thing eleven times is not eleven pieces of help. */
  const errors = new Set<string>();
  const fail = (msg: string) => errors.add(msg);

  /*
   * Types first, bounds second.
   *
   * Everything below assumes the field it reads is the type the `Payload` annotation promises,
   * and that promise is a compile-time one — this function's real input is `JSON.parse` of a
   * request body, where `handle` can be a number and a float can be NaN. The bounds then pass
   * by accident and the route hands the value to Postgres: `handle: 12345` cleared this
   * function and threw an uncaught TypeError on `.toLowerCase()` before the route's try block,
   * and `pricedShare: NaN` cleared it and hit a CHECK constraint. Both surfaced as a 500 from a
   * route that goes out of its way to return 422s with reasons.
   */
  if (typeof p.handle !== "string") {
    fail("handle must be a string");
  } else if (!p.handle || p.handle.length > LIMITS.maxHandleLength) {
    fail(`handle must be 1-${LIMITS.maxHandleLength} characters`);
  }

  /*
   * A submission has to claim something.
   *
   * Zero tokens and no days is not a state an honest client reaches — the payload is lifetime,
   * so it means the machine has never used an agent, and there is nothing to put on a board.
   * It is, however, exactly the shape that overwrites someone else's row with nothing: the
   * newest submission is what the board reads `streak_days` and `models` from, so an empty one
   * zeroed an unverified user's streak while their token history sat untouched behind it.
   * Verified against a live board: bob kept 200 tokens and dropped to a 0-day streak.
   */
  /*
   * Tightened from "no days AND no tokens" to "no days", which closes a full bypass of the
   * review gate.
   *
   * The old condition needed both halves, so `days: [], tokens: 1` passed. That was enough to
   * launder a flagged row: publish a huge payload (stored `flagged`, `user_days` replaced with
   * the huge series, row disappears from the board), then publish `days: []` with `tokens: 1`.
   * The second payload skipped every per-day check, every activeDays/streakDays consistency
   * check and the cost-ratio check — all of which are gated on there being days — so it was
   * stored `flagged = false`; and because the route only rewrites `user_days` when days are
   * present, the huge series survived untouched. `eligible` reads only the newest submission's
   * flag, so the row returned to the board carrying the figures it had been held for.
   *
   * No honest client sends this: `publish` refuses to run at all when there is no usage, and
   * the payload is lifetime. Refusing it here also restores the route's ability to replace
   * `user_days` unconditionally, which is what "replaced wholesale" was supposed to mean.
   */
  if (Array.isArray(p.days) && p.days.length === 0) {
    fail("nothing to publish — no days");
  }

  if (!Array.isArray(p.days)) fail("days must be an array");
  if (!Array.isArray(p.models)) fail("models must be an array");
  if (!Array.isArray(p.agents)) fail("agents must be an array");

  /*
   * Size and shape, which the arithmetic checks never covered.
   *
   * Agent and model names are rendered verbatim on the board's mix bars, the profile's agent
   * list and model table, and the card legend. React escapes them and `render()` XML-escapes
   * them, so this is not injection — but a 2,000-character agent name breaks the board table
   * and the SVG for every reader, not just the person who sent it. The arrays were unbounded
   * too: `days` is one row per day per agent, so a decade of three agents is ~11,000 entries
   * and anything beyond that is not a client that exists.
   */
  if (Array.isArray(p.days) && p.days.length > LIMITS.days) {
    fail(`days has ${p.days.length} entries (max ${LIMITS.days})`);
  }
  if (Array.isArray(p.models) && p.models.length > LIMITS.models) {
    fail(`models has ${p.models.length} entries (max ${LIMITS.models})`);
  }
  if (Array.isArray(p.models)) for (const m of p.models) checkName("model", m?.model);
  if (Array.isArray(p.agents)) for (const a of p.agents) checkName("agent", a?.agent);
  if (Array.isArray(p.agents) && p.agents.length > LIMITS.agents) {
    fail(`agents has ${p.agents.length} entries (max ${LIMITS.agents})`);
  }
  if (typeof p.clientVersion === "string") checkName("clientVersion", p.clientVersion);

  /** A name that has to survive being rendered in a table cell, a legend and an SVG. */
  function checkName(field: string, value: unknown): void {
    if (typeof value !== "string") {
      fail(`${field} must be a string`);
      return;
    }
    if (value.length > LIMITS.maxNameLength) {
      fail(`${field} is ${value.length} characters (max ${LIMITS.maxNameLength})`);
    }
    // Control characters would survive escaping and land in a table cell, a legend or an SVG
    // text node; nothing legitimate uses them in an agent or model id.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F]/.test(value)) fail(`${field} contains control characters`);
  }

  for (const [name, value] of [
    ["tokens", p.tokens],
    ["equivCostUsd", p.equivCostUsd],
    ["streakDays", p.streakDays],
    ["activeDays", p.activeDays],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) fail(`${name} must be a non-negative number`);
  }

  // Number.isFinite, as every other numeric field above already gets: bare `<`/`>` are both
  // false against NaN, so a NaN share passed every comparison here and failed at the database.
  if (!Number.isFinite(p.pricedShare) || p.pricedShare < 0 || p.pricedShare > 1) {
    fail("pricedShare must be a number between 0 and 1");
  }

  /*
   * `pricedShare` checked against the payload's own model table.
   *
   * The cost/token ratio is the primary guard against an inflated token count, and it divides
   * claimed cost by `tokens * pricedShare` — a denominator the sender chooses. Shrinking the
   * share shrinks what the claim has to justify: at `pricedShare: 1` a trillion-token claim
   * needs roughly $5,000 of matching cost to clear the floor; at `1e-6` it needs half a cent.
   * The guard was only ever as strong as a number the client picked.
   *
   * Nothing new has to be uploaded to check it. `models[]` already carries per-model tokens
   * and a `priced` flag, so the honest share is exactly the priced fraction of model tokens.
   * A tolerance rather than an equality: `models` is rounded and truncated to a top-N list on
   * some paths, and the point is to catch an order of magnitude, not a rounding difference.
   */
  if (Array.isArray(p.models) && p.models.length > 0 && p.tokens > 0) {
    let priced = 0;
    let all = 0;
    for (const m of p.models) {
      const t = Number(m?.tokens);
      if (!Number.isFinite(t) || t < 0) continue;
      all += t;
      if (m?.priced) priced += t;
    }

    if (all > 0) {
      const implied = priced / all;
      // Generous: a fifth either way, and only when the claim is materially lower than the
      // model table supports — overstating the priced share makes the guard stricter, not
      // weaker, so there is nothing to catch in that direction.
      if (p.pricedShare < implied - 0.2) {
        fail(
          `pricedShare ${p.pricedShare.toFixed(3)} disagrees with models ` +
            `(${implied.toFixed(3)} of model tokens are priced)`,
        );
      }
    }
  }

  // Tomorrow in UTC, so that every timezone offset is covered without needing to know the
  // submitter's. Someone in UTC+14 legitimately has a "tomorrow" by UTC reckoning.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  // Days arrive split by agent, so a day's ceiling has to be checked against the day as a
  // whole. Comparing each agent row on its own would let three agents each sit just under
  // the limit while the day together sits far above it.
  const perDay = new Map<string, number>();
  /* `(day, agent)` is the primary key of `user_days`, so a duplicate pair aborts the insert
     inside the transaction and surfaces as a generic 500 from a route that otherwise returns
     422s with reasons. Caught here, where it can be explained. */
  const seen = new Set<string>();
  let daySum = 0;
  let dayCost = 0;

  for (const d of p.days) {
    if (!DATE.test(d.day)) {
      fail(`day "${d.day}" must be YYYY-MM-DD`);
      continue;
    }
    if (d.day > cutoffDay) fail(`day ${d.day} is in the future (past ${cutoffDay})`);
    if (!Number.isFinite(d.tokens) || d.tokens < 0) fail(`day ${d.day} has negative tokens`);
    if (!Number.isFinite(d.equivCostUsd) || d.equivCostUsd < 0) {
      fail(`day ${d.day} has negative cost`);
    }
    if (!d.agent) fail(`day ${d.day} has no agent`);
    else checkName("agent", d.agent);

    const key = `${d.day}\u0000${d.agent}`;
    if (seen.has(key)) fail(`day ${d.day} lists ${d.agent} twice`);
    seen.add(key);

    perDay.set(d.day, (perDay.get(d.day) ?? 0) + d.tokens);
    daySum += d.tokens;
    dayCost += d.equivCostUsd;
  }

  for (const [day, tokens] of perDay) {
    if (tokens > LIMITS.maxTokensPerDay) {
      fail(`day ${day} reports ${tokens.toLocaleString()} tokens, over the ${LIMITS.maxTokensPerDay.toLocaleString()} daily ceiling`);
    }
  }

  /* Deliberately not checked against the daily series: it is an estimate of days that are not
     in the series, so agreement would mean it was not doing its job. It only has to be a
     number, and at least the figure it extends. */
  if (p.estimatedTokens !== undefined) {
    if (typeof p.estimatedTokens !== "number" || !Number.isFinite(p.estimatedTokens)) {
      fail("estimatedTokens must be a number");
    } else if (p.estimatedTokens < p.tokens) {
      fail(`estimatedTokens ${p.estimatedTokens} is below the verified ${p.tokens}`);
    }
  }

  // The daily series is what the board actually sums, so a headline that disagrees with it
  // would put one number on the card and a different one on the board.
  if (p.days.length > 0 && daySum !== p.tokens) {
    fail(`daily tokens sum to ${daySum} but the total says ${p.tokens}`);
  }

  // Cost is compared with a tolerance rather than exactly: rows carry four decimals and the
  // headline two, so a long series accumulates cents of rounding that are not a discrepancy.
  // The bound stays far tighter than any fabrication would be.
  if (p.days.length > 0) {
    const tolerance = 0.01 + p.days.length * 0.0001;
    if (Math.abs(dayCost - p.equivCostUsd) > tolerance) {
      fail(
        `daily costs sum to ${dayCost.toFixed(4)} but the total says ${p.equivCostUsd} ` +
          `(tolerance ${tolerance.toFixed(4)})`,
      );
    }
  }

  if (p.equivCostUsd > LIMITS.maxCostTotal) {
    fail(`equivCostUsd ${p.equivCostUsd} exceeds the ${LIMITS.maxCostTotal} ceiling`);
  }

  if (p.activeDays > 0 && p.equivCostUsd / p.activeDays > LIMITS.maxCostPerDay) {
    fail(`cost per active day exceeds the ${LIMITS.maxCostPerDay} ceiling`);
  }

  // Checked only against priced tokens: an unpriced model contributes tokens and no cost, so
  // including it would drag the ratio below the floor and reject an honest submission.
  /*
   * Fall back to the whole token count when none of it is priced.
   *
   * The guard was `pricedTokens > 0`, so `pricedShare: 0` made the ratio check unreachable —
   * a payload could claim any cost at all against any number of tokens as long as it also
   * claimed nothing was priced. A cost with no priced tokens behind it is exactly the case
   * worth checking, not the case to skip.
   */
  const pricedTokens = p.tokens * p.pricedShare;
  const costBase = pricedTokens > 0 ? pricedTokens : p.tokens;
  if (costBase > 0 && p.equivCostUsd > 0) {
    const ratio = p.equivCostUsd / costBase;
    if (ratio < LIMITS.minCostPerToken || ratio > LIMITS.maxCostPerToken) {
      fail(
        `cost/token ratio ${ratio.toExponential(2)} is outside ` +
          `${LIMITS.minCostPerToken}-${LIMITS.maxCostPerToken}`,
      );
    }
  }

  for (const [name, value] of [
    ["firstDay", p.firstDay],
    ["lastDay", p.lastDay],
  ] as const) {
    // Required, not merely well-formed when present. `value &&` skipped a missing day entirely,
    // so an absent firstDay cleared validation and hit a NOT NULL constraint as a 500.
    if (typeof value !== "string" || !value) fail(`${name} is required`);
    else if (!DATE.test(value)) fail(`${name} must be YYYY-MM-DD`);
  }
  if (p.firstDay && p.lastDay && p.lastDay < p.firstDay) fail("lastDay is before firstDay");

  return [...errors];
}

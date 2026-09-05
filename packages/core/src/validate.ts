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
  const errors: string[] = [];
  const fail = (msg: string) => errors.push(msg);

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
  if (Array.isArray(p.days) && p.days.length === 0 && !(p.tokens > 0)) {
    fail("nothing to publish — no tokens and no days");
  }

  if (!Array.isArray(p.days)) fail("days must be an array");
  if (!Array.isArray(p.models)) fail("models must be an array");
  if (!Array.isArray(p.agents)) fail("agents must be an array");

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

  // Tomorrow in UTC, so that every timezone offset is covered without needing to know the
  // submitter's. Someone in UTC+14 legitimately has a "tomorrow" by UTC reckoning.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  // Days arrive split by agent, so a day's ceiling has to be checked against the day as a
  // whole. Comparing each agent row on its own would let three agents each sit just under
  // the limit while the day together sits far above it.
  const perDay = new Map<string, number>();
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

  return errors;
}

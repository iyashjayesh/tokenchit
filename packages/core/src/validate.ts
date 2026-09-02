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
  /** ~4x the measured peak, so a heavier or multi-machine user is not rejected. */
  maxTokensPerDay: 2_000_000_000,
  maxCostPerDay: 5_000,
  maxCostTotal: 5_000 * 365,
  /** Arithmetic floor: the cheapest cache-read rate in the price table. */
  minCostPerToken: 5e-9,
  maxCostPerToken: 0.1,
  maxHandleLength: 39,
} as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rejections name the bound that failed. A CLI that says "cost/token ratio 0.4 exceeds 0.1"
 * can be acted on; one that says "400" sends someone to read our source.
 */
export function validatePayload(p: Payload, now: Date = new Date()): string[] {
  const errors: string[] = [];
  const fail = (msg: string) => errors.push(msg);

  if (!p.handle || p.handle.length > LIMITS.maxHandleLength) {
    fail(`handle must be 1-${LIMITS.maxHandleLength} characters`);
  }

  for (const [name, value] of [
    ["tokens", p.tokens],
    ["equivCostUsd", p.equivCostUsd],
    ["streakDays", p.streakDays],
    ["activeDays", p.activeDays],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) fail(`${name} must be a non-negative number`);
  }

  if (p.pricedShare < 0 || p.pricedShare > 1) fail("pricedShare must be between 0 and 1");

  // Tomorrow in UTC, so that every timezone offset is covered without needing to know the
  // submitter's. Someone in UTC+14 legitimately has a "tomorrow" by UTC reckoning.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  let daySum = 0;
  for (const d of p.days) {
    if (!DATE.test(d.day)) {
      fail(`day "${d.day}" must be YYYY-MM-DD`);
      continue;
    }
    if (d.day > cutoffDay) fail(`day ${d.day} is in the future (past ${cutoffDay})`);
    if (!Number.isFinite(d.tokens) || d.tokens < 0) fail(`day ${d.day} has negative tokens`);
    if (d.tokens > LIMITS.maxTokensPerDay) {
      fail(`day ${d.day} reports ${d.tokens} tokens, over the ${LIMITS.maxTokensPerDay} daily ceiling`);
    }
    daySum += d.tokens;
  }

  // The daily series is what the board actually sums, so a headline that disagrees with it
  // would put one number on the card and a different one on the board.
  if (p.days.length > 0 && daySum !== p.tokens) {
    fail(`daily tokens sum to ${daySum} but the total says ${p.tokens}`);
  }

  if (p.equivCostUsd > LIMITS.maxCostTotal) {
    fail(`equivCostUsd ${p.equivCostUsd} exceeds the ${LIMITS.maxCostTotal} ceiling`);
  }

  if (p.activeDays > 0 && p.equivCostUsd / p.activeDays > LIMITS.maxCostPerDay) {
    fail(`cost per active day exceeds the ${LIMITS.maxCostPerDay} ceiling`);
  }

  // Checked only against priced tokens: an unpriced model contributes tokens and no cost, so
  // including it would drag the ratio below the floor and reject an honest submission.
  const pricedTokens = p.tokens * p.pricedShare;
  if (pricedTokens > 0 && p.equivCostUsd > 0) {
    const ratio = p.equivCostUsd / pricedTokens;
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
    if (value && !DATE.test(value)) fail(`${name} must be YYYY-MM-DD`);
  }
  if (p.firstDay && p.lastDay && p.lastDay < p.firstDay) fail("lastDay is before firstDay");

  return errors;
}

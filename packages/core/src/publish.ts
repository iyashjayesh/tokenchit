import type { Stats } from "./aggregate.js";
import { sanitizeHandle } from "./card-svg.js";

/**
 * What leaves the machine, and nothing else.
 *
 * Every field is an aggregate or an identifier. There are no paths, no prompts, no
 * completions, no file contents and no project names, because none of those are ever read in
 * the first place — `UsageEvent` carries an agent, a timestamp, a model id and four token
 * counts, so there is nothing here to leak even by accident.
 *
 * Model and agent ids are identifiers rather than content: "claude-opus-5" says which meter
 * was running, not what was said.
 */
export type Payload = {
  handle: string;
  tokens: number;
  equivCostUsd: number;
  pricedShare: number;
  streakDays: number;
  activeDays: number;
  firstDay: string;
  lastDay: string;
  agents: { agent: string; tokens: number }[];
  models: { model: string; tokens: number; equivCostUsd: number; priced: boolean }[];
  days: { day: string; tokens: number }[];
  clientVersion: string;
};

/**
 * Build the payload once, for both the real upload and `--dry-run`.
 *
 * One function is what makes "the dry run shows exactly what would be sent" a fact rather
 * than an intention. Two code paths would drift the first time a field was added to one.
 */
export function buildPayload(
  stats: Stats,
  opts: { handle: string; clientVersion: string },
): Payload {
  return {
    handle: sanitizeHandle(opts.handle),
    tokens: stats.tokens,
    equivCostUsd: round(stats.equivCostUsd, 2),
    pricedShare: round(stats.pricedShare, 4),
    streakDays: stats.streakDays,
    activeDays: stats.activeDays,
    firstDay: stats.firstDay ?? "",
    lastDay: stats.lastDay ?? "",
    agents: [...stats.byAgent.entries()]
      .map(([agent, tokens]) => ({ agent, tokens }))
      .sort((a, b) => b.tokens - a.tokens),
    models: stats.models.map((m) => ({
      model: m.model,
      tokens: m.tokens,
      equivCostUsd: round(m.equivCostUsd, 2),
      priced: m.priced,
    })),
    days: [...stats.byDay.entries()].map(([day, tokens]) => ({ day, tokens })),
    clientVersion: opts.clientVersion,
  };
}

/**
 * The exact bytes. Both the POST body and the dry run go through here, so what is printed is
 * the request, not a rendering of it.
 */
export const serializePayload = (payload: Payload): string => JSON.stringify(payload, null, 2);

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

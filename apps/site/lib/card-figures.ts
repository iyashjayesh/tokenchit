import "server-only";

import { formatTokens, formatUsd, type MixEntry } from "@tokenchit/core";
import type { Profile } from "@/lib/profile";

export type CardFigures = {
  tokens: string;
  spend: string;
  streak: string;
  mix: MixEntry[];
  syncedAt: Date | string;
};

/** What an unpublished handle shows: zeroes and a line saying so, never sample data. */
export const EMPTY_FIGURES: CardFigures = {
  tokens: "0",
  spend: "—",
  streak: "0d",
  mix: [],
  syncedAt: "NOT PUBLISHED YET",
};

/**
 * The card figures for one profile.
 *
 * Shared by the embed endpoint and the profile page on purpose. They render the same card for
 * the same person and used to derive it separately, which is how the endpoint went on serving
 * sample data long after the page was reading the database.
 */
export function cardFigures(profile: Profile): CardFigures {
  const mix = Object.entries(profile.mix).sort((a, b) => b[1] - a[1]);
  const total = mix.reduce((a, [, n]) => a + n, 0);

  return {
    tokens: formatTokens(profile.tokens),
    spend: profile.equivCostUsd > 0 ? formatUsd(profile.equivCostUsd) : "—",
    streak: `${profile.streakDays}d`,
    mix: mix.map(([agent, tokens]) => ({
      agent,
      pct: total > 0 ? (tokens / total) * 100 : 0,
    })),
    syncedAt: profile.lastPublished ? new Date(profile.lastPublished) : new Date(),
  };
}

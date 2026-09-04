import "server-only";

import { DEFAULT_WINDOW, type BoardRow } from "@/lib/board";
import { cardFigures } from "@/lib/card-figures";
import { readProfile } from "@/lib/profile";
import { DEFAULT_HANDLE, OWN_STATS } from "@/lib/sample-data";
import { formatSynced } from "@tokenchit/core";

export type Featured = {
  tokens: string;
  spend: string;
  streak: string;
  mix: { agent: string; pct: number }[];
  syncedAt: string;
  /** Whose figures these are. */
  handle: string;
  /** False when the board was empty and these are the sample figures. */
  real: boolean;
};

/**
 * Somebody real to put on the front page.
 *
 * The hero preview used to be a fixed handle with invented figures underneath. Once that
 * handle was a real person's, the card stated something false about their account — and no
 * choice of fixed handle would have fixed it, because the numbers were never going to be
 * theirs.
 *
 * Featuring a published member solves both halves: the figures are true, and they are
 * attributed to the person they belong to. It also means a visitor sees somebody actually
 * using this rather than a mock-up, which is worth more than a tidier sample.
 *
 * The choice lives here rather than in the page because picking is a data decision, and
 * because React's rules of purity correctly object to a random call during render.
 */
export async function readFeatured(rows: BoardRow[]): Promise<Featured> {
  const sample: Featured = { ...OWN_STATS, handle: DEFAULT_HANDLE, real: false };
  if (rows.length === 0) return sample;

  // Rotates on each revalidation, so the front page is not one person's in perpetuity.
  const pick = rows[Math.floor(Math.random() * rows.length)]!;
  const profile = await readProfile(pick.handle, DEFAULT_WINDOW).catch(() => null);
  if (!profile) return sample;

  const figures = cardFigures(profile);
  return {
    tokens: figures.tokens,
    spend: figures.spend,
    streak: figures.streak,
    mix: figures.mix,
    syncedAt: formatSynced(
      profile.lastPublished ? new Date(profile.lastPublished) : new Date(),
    ),
    handle: profile.handle,
    real: true,
  };
}

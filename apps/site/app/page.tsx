import { SiteStateProvider } from "@/components/site-state";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { CardSection } from "@/components/card-section";
import { Leaderboard } from "@/components/leaderboard";
import { DEFAULT_WINDOW } from "@/lib/board";
import { readBoard } from "@/lib/board-query";
import { formatSynced } from "@tokenchit/core";

import { cardFigures } from "@/lib/card-figures";
import { readProfile } from "@/lib/profile";
import { DEFAULT_HANDLE, OWN_STATS } from "@/lib/sample-data";
import { Verification } from "@/components/verification";
import { Privacy } from "@/components/privacy";
import { Recap } from "@/components/recap";
import { SiteFooter } from "@/components/site-footer";

/**
 * One page, eight blocks. This stays a server component: the sections are passed to
 * SiteStateProvider as `children`, so Verification, Privacy, Recap and the footer
 * remain RSC and ship no JavaScript. Only the header, hero, card section and board
 * are client components.
 */
/**
 * Revalidated rather than rendered per request. The board is the only live part of the page
 * and the copy promises a row goes stale "within the hour", so five minutes is comfortably
 * inside what was advertised while keeping the marketing page effectively static.
 */
export const revalidate = 300;

export default async function Page() {
  // Failing to read the board should cost the reader the table, not the whole page.
  const rows = await readBoard(DEFAULT_WINDOW).catch(() => []);

  /* The preview shows the default handle's real figures. It used to show invented ones under
     whatever handle was set, which was harmless while that handle was a made-up persona and
     wrong the moment it became a real person's — the card then reads as theirs and is false.
     Sample figures remain the fallback for a database with nobody in it yet. */
  const profile = await readProfile(DEFAULT_HANDLE, DEFAULT_WINDOW).catch(() => null);
  const preview = profile
    ? (({ tokens, spend, streak, mix }) => ({
        tokens,
        spend,
        streak,
        mix,
        syncedAt: formatSynced(
          profile.lastPublished ? new Date(profile.lastPublished) : new Date(),
        ),
        real: true,
      }))(cardFigures(profile))
    : { ...OWN_STATS, real: false };

  return (
    <SiteStateProvider>
      <SiteHeader />
      <Hero preview={preview} />
      <CardSection />
      <Leaderboard initialRows={rows} initialWindow={DEFAULT_WINDOW} />
      <Verification />
      <Privacy />
      <Recap />
      <SiteFooter />
    </SiteStateProvider>
  );
}

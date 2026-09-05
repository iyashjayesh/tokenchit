import { SiteStateProvider } from "@/components/site-state";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { CardSection } from "@/components/card-section";
import { Leaderboard } from "@/components/leaderboard";
import { DEFAULT_WINDOW } from "@/lib/board";
import { LANDING_ROWS } from "@/lib/board";
import { readBoard } from "@/lib/board-query";
import { readFeatured } from "@/lib/featured";
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
  /* Ten, not the default twenty-five. This is a marketing page whose job is to show that the
     board is real and populated; the board's own page is where someone goes to read all of it.
     A long table here pushes every section below it off the first two screens. */
  const rows = await readBoard(DEFAULT_WINDOW, LANDING_ROWS).catch(() => []);

  const preview = await readFeatured(rows);

  return (
    <SiteStateProvider initialHandle={preview.handle}>
      <SiteHeader />
      <Hero preview={preview} />
      <CardSection preview={preview} />
      <Leaderboard initialRows={rows} initialWindow={DEFAULT_WINDOW} />
      <Verification />
      <Privacy />
      <Recap />
      <SiteFooter />
    </SiteStateProvider>
  );
}

import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { CardSection } from "@/components/card-section";
import { Leaderboard } from "@/components/leaderboard";
import { DEFAULT_WINDOW } from "@/lib/board";
import { LANDING_ROWS } from "@/lib/board";
import { readBoard } from "@/lib/board-query";
import { readBoardTotals } from "@/lib/board-totals";
import { readFeatured } from "@/lib/featured";
import { Verification } from "@/components/verification";
import { Privacy } from "@/components/privacy";
import { Recap } from "@/components/recap";
import { ClosingCta } from "@/components/closing-cta";
import { SiteFooter } from "@/components/site-footer";

/**
 * One page, eight blocks, all of it a server component.
 *
 * There used to be a SiteStateProvider here holding a `handle` that a hero input edited. The
 * input is gone and nothing ever called the setter again, so the state could only ever hold
 * the featured handle — while making four components client-only to read it. Passing the one
 * value as a prop returns the hero, the card section and the preview card to RSC; only the
 * board, which owns the window filter, and the copy buttons still ship JavaScript.
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
  const [rows, totals] = await Promise.all([
    readBoard(DEFAULT_WINDOW, LANDING_ROWS).catch(() => []),
    /* Read for the hero. The figures already existed and only /board showed them, so the
       landing page asked people to join something it never said the size of. */
    readBoardTotals(DEFAULT_WINDOW).catch(() => null),
  ]);

  const preview = await readFeatured(rows);

  return (
    <>
      <SiteHeader />
      {/* The landmark the rest of the site gets from PageShell, which this page does not use.
          Without it the most-visited page on the site had a header and a footer landmark and
          no main, so there was nothing for a screen reader to skip the ticker and nav to. */}
      <main id="content">
        <Hero preview={preview} totals={totals} />
        {/* The board above the reference material. Section 01 is a query-parameter table, two
            SVG variants and two copyable snippets — everything a reader wants *after* they
            have installed — and it was occupying the whole second screen, pushing the one
            section that proves other people use this onto the third. */}
        <Leaderboard
          initialRows={rows}
          initialWindow={DEFAULT_WINDOW}
          featuredHandle={preview.handle}
        />
        <CardSection preview={preview} />
        <Verification />
        <Privacy />
        <Recap />
        {/* The command appeared once, in the hero, five sections above this. */}
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}

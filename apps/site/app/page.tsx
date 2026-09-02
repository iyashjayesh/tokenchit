import { SiteStateProvider } from "@/components/site-state";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { CardSection } from "@/components/card-section";
import { Leaderboard } from "@/components/leaderboard";
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
export default function Page() {
  return (
    <SiteStateProvider>
      <SiteHeader />
      <Hero />
      <CardSection />
      <Leaderboard />
      <Verification />
      <Privacy />
      <Recap />
      <SiteFooter />
    </SiteStateProvider>
  );
}

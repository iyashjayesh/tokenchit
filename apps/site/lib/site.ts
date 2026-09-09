/**
 * The site's own public origin, used wherever the page hands someone a URL to copy.
 *
 * One constant because these strings end up in other people's READMEs: a stale one there is
 * a broken image on a repo we do not control and cannot fix. It must be paired with
 * packages/cli/src/api.ts, which is where the CLI decides who to publish to.
 *
 * The wordmark printed on the card is deliberately separate, in packages/core/src/svg.ts. It
 * is a signature at 8px rather than a link, it has to be short enough to read at that size,
 * and core cannot import from the site.
 */
export const SITE_URL = "https://tokenchit.app";

/** The name a link preview prints in bold above the title. */
export const SITE_NAME = "tokenchit";

/**
 * The Open Graph block for a page, with the fields every page shares already filled in.
 *
 * Next replaces `openGraph` wholesale rather than merging it: a page that sets its own to
 * override the title silently drops `type` and `siteName` too, and there is nothing in the
 * page to suggest it. That is what happened to every profile — Slack printed `tokenchit.app`
 * in bold where it should have printed `tokenchit`, because the only `og:site_name` on the
 * site lived in the root layout and the profile's own block had replaced it.
 *
 * The board had the same bug from the other end: it set `title` and `description` at the top
 * level and no `openGraph` at all, so it inherited the *root's* — and a shared link to the
 * board unfurled as the home page.
 *
 * Composing it here means a page states only what is different about it, and cannot forget
 * the rest.
 */
export function openGraphFor({
  title,
  description,
  path = "",
}: {
  title: string;
  description: string;
  /** Site-relative, with a leading slash. Empty for the home page. */
  path?: string;
}) {
  return {
    type: "website" as const,
    siteName: SITE_NAME,
    title,
    description,
    url: `${SITE_URL}${path}`,
  };
}

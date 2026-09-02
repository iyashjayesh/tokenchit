/**
 * The site's own public origin, used wherever the page hands someone a URL to copy.
 *
 * One constant because these strings end up in other people's READMEs: a stale one there is
 * a broken image on a repo we do not control and cannot fix. When tokenstats.dev is attached,
 * change it here and in packages/cli/src/api.ts — those two are the only places that must be
 * true rather than aspirational.
 *
 * The `TOKENSTATS.APP` wordmark printed on the card itself is deliberately not driven by this.
 * It is a signature at 8px, not a link, and a vercel.app subdomain would neither fit the
 * design nor read as a brand.
 */
export const SITE_URL = "https://tokencard-site.vercel.app";

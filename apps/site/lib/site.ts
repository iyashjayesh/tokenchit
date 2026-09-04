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

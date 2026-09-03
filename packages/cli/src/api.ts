/**
 * Where the CLI talks to, unless told otherwise.
 *
 * Points at the Vercel URL rather than tokenstats.dev because the domain is not attached yet
 * and a default that does not resolve makes `publish` fail for everyone who does not pass
 * `--api`. Swap this the day the domain is live; the site's own copy already says
 * tokenstats.dev, and this is the one place that has to be true rather than aspirational.
 *
 * Defined once because it was previously duplicated across login and publish, which is how
 * two defaults end up disagreeing.
 */
export const DEFAULT_API = "https://tokenstats-site.vercel.app";

/** Resolve the API base: explicit flag, then environment, then the default. */
export const resolveApi = (flagValue: string | undefined): string =>
  (flagValue ?? process.env["TOKENSTATS_API"] ?? DEFAULT_API).replace(/\/$/, "");

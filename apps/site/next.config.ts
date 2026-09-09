import type { NextConfig } from "next";

/**
 * Response headers for every HTML route.
 *
 * The live site already sends `strict-transport-security` — Vercel sets that itself, so it is
 * deliberately not repeated here — but nothing set the other four, and the two API routes that
 * do set their own headers (the card and the avatar) were the only places on the site where
 * any of this was considered.
 *
 * `frame-ancestors` rather than `X-Frame-Options`: the CSP directive supersedes it, and the
 * card endpoint is *meant* to be embedded as an image from anywhere, which is a different
 * thing from this page being framed.
 */
const SECURITY_HEADERS = [
  /* Stops a response whose body is JSON or SVG being sniffed into something executable. The
     card endpoint sets this for itself; nothing else did. */
  { key: "X-Content-Type-Options", value: "nosniff" },

  /* The default already keeps the path off cross-origin requests, but saying so means the
     one page whose URL is a capability — /login/<session id> — does not depend on the
     browser's default being the modern one. */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  /* Nothing here uses a camera, a microphone or a location. */
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/*
 * Content-Security-Policy, kept deliberately narrow.
 *
 * `'unsafe-inline'` is present for styles because CSS Modules and Next's own inlined critical
 * CSS both need it, and for scripts because Next's bootstrap and RSC payload are inline; a
 * nonce-based policy is the better answer and is a bigger change than adding a header. What
 * this does buy immediately: no plugins, no base-tag hijack, no framing, no form posts to
 * another origin, and images and connections confined to this site.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // avatars are proxied through /api/avatar rather than hot-linked, so 'self' covers them
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/*
 * Umami is proxied through this origin rather than loaded from the analytics host.
 *
 * The CSP above is `script-src 'self'` and `connect-src 'self'`, so a tracker loaded from
 * another domain would be blocked outright - which is what was happening to the Firebase
 * beacons this replaces. Rewriting the script and the collect endpoint onto this origin
 * satisfies the policy without widening it, and has the side benefit that ad blockers
 * filtering on Umami's default `script.js` and `/api/send` paths do not match either.
 *
 * Skipped entirely when UMAMI_HOST is unset, so a local or unconfigured build is a no-op
 * rather than a rewrite pointing at nothing.
 */
const UMAMI_HOST = process.env.UMAMI_HOST?.replace(/\/$/, "");

/*
 * The one image on the site with no caching at all.
 *
 * `/u/<handle>/opengraph-image` composes a 1200x630 PNG from a database read and a font load
 * on every single request: it answered `max-age=0, must-revalidate` and was a Vercel cache
 * MISS every time, measured at 4.5s from London against 0.35s for the root image, which is
 * prerendered. The board's revalidates hourly. This one never did.
 *
 * That is a correctness problem before it is a cost one. It is the image every link preview of
 * every profile depends on, and a crawler that gives up waiting for og:image renders the card
 * without one — which is the difference between a shared profile showing its own figures and
 * showing the generic site card.
 *
 * Set here rather than as `export const revalidate` in the route, which was tried first and
 * changes nothing: the emitted header is byte-identical with and without it, checked over
 * three consecutive `next start` requests. This is the layer that actually decides.
 *
 * `s-maxage` matches the page's own `revalidate`, so the image and the figures printed beside
 * it can never disagree by more than the page already can. The long `stale-while-revalidate`
 * is the part that matters for crawlers: after the first render a fetch is served from the
 * edge immediately and the refresh happens behind it, so nothing waits on a cold compose
 * twice. A week is chosen to outlast the interval at which LinkedIn and Slack re-check a link.
 */
const PROFILE_IMAGE_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async rewrites() {
    if (!UMAMI_HOST) return [];
    return [
      { source: "/stats.js", destination: `${UMAMI_HOST}/script.js` },
      { source: "/api/send", destination: `${UMAMI_HOST}/api/send` },
    ];
  },
  async headers() {
    return [
      {
        // Everything except the embed endpoints, which set their own and are meant to be
        // loaded cross-origin.
        source: "/((?!api/card|api/avatar).*)",
        headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: CSP }],
      },
      {
        // Additive: the rule above still matches this path and still applies the CSP to it.
        source: "/u/:handle/opengraph-image",
        headers: [{ key: "Cache-Control", value: PROFILE_IMAGE_CACHE }],
      },
    ];
  },
};

export default nextConfig;

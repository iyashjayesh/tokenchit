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
    ];
  },
};

export default nextConfig;

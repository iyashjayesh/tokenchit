import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { formatTokens, formatUsd, sanitizeHandle } from "@tokenchit/core";

import { readProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "tokenchit profile";

/**
 * The link preview for a shared profile.
 *
 * A PNG rather than the SVG card, because Twitter, Slack and Facebook do not render SVG
 * previews — pointing `og:image` at the card endpoint would produce a link with no image at
 * all, which for a page whose purpose is being shared is the whole feature missing.
 *
 * Satori supports a flexbox subset: every element with more than one child needs an explicit
 * `display: flex`, there is no grid, and CSS custom properties do not resolve. The palette is
 * therefore written out in hex rather than referencing the design tokens.
 */
const INK = "#101010";
const PAPER = "#FFFDF9";
const LIME = "#C6FF3D";
const DIM = "#8A8A82";

const SEGMENT_COLOURS = [LIME, INK, "#8A8A82", "#D8D6CE"];

/**
 * The brand face, bundled rather than fetched.
 *
 * ImageResponse ships a usable default, but the share card is the first thing anyone sees of
 * this product and it should be set in the same type as the card it describes. Bundled so
 * rendering never depends on a font CDN being reachable — a preview that silently falls back
 * mid-incident is worse than one that never changed. JetBrains Mono is OFL; the licence sits
 * beside the file.
 */
const font = readFile(join(process.cwd(), "assets", "jetbrains-mono-700.ttf"));

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const handle = sanitizeHandle(decodeURIComponent((await params).handle));
  const profile = await readProfile(handle).catch(() => null);

  /*
   * A held row's figures do not travel, here either.
   *
   * `api/card/[handle]/route.ts` blanks the card for a submission held for review, on the
   * grounds that the point of holding is that nothing about the row circulates until somebody
   * has looked at it. This file rendered the same three numbers unconditionally — and this is
   * the image that unfurls in Slack, on X and on LinkedIn, so it circulates further than the
   * card does. The gate was half a gate.
   *
   * Held reads as absent rather than as flagged: the same em dashes a handle with nothing
   * published gets. The board does not announce who is under review, and neither does an image
   * somebody may be about to post.
   */
  const held = profile?.underReview === true;
  const shown = held ? null : profile;

  const tokens = shown ? formatTokens(shown.tokens) : "—";
  const cost = shown && shown.equivCostUsd > 0 ? formatUsd(shown.equivCostUsd) : "—";
  const streak = shown ? `${shown.streakDays}d` : "—";
  // Tier is an identity fact rather than a figure, so it survives the hold, as it does on the
  // card: what is withheld is the unexamined numbers, not who the person is.
  const verified = profile?.tier === "verified";

  const mix = Object.entries(shown?.mix ?? {}).sort((a, b) => b[1] - a[1]);
  const mixTotal = mix.reduce((a, [, n]) => a + n, 0) || 1;

  const stats: [string, string][] = [
    ["TOKENS", tokens],
    ["EQUIV. COST", cost],
    ["STREAK", streak],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: PAPER,
          fontFamily: "JetBrains Mono",
          padding: 64,
          border: `16px solid ${INK}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, color: INK, letterSpacing: -2 }}>
            {`@${handle}`}
          </div>
          {verified && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: LIME,
                border: `4px solid ${INK}`,
                padding: "6px 14px",
                fontSize: 20,
                fontWeight: 700,
                color: INK,
              }}
            >
              GITHUB VERIFIED
            </div>
          )}
        </div>

        <div style={{ display: "flex", height: 4, background: INK, marginTop: 28 }} />

        <div style={{ display: "flex", gap: 72, marginTop: 52 }}>
          {stats.map(([label, value]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 22, color: DIM, letterSpacing: 3 }}>{label}</div>
              <div style={{ fontSize: 84, fontWeight: 800, color: INK, letterSpacing: -3 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {mix.length > 0 && (
          <div style={{ display: "flex", height: 20, marginTop: 56, width: "100%" }}>
            {mix.map(([agent, n], i) => (
              <div
                key={agent}
                style={{
                  display: "flex",
                  width: `${Math.max((n / mixTotal) * 100, 0.5)}%`,
                  background: SEGMENT_COLOURS[Math.min(i, SEGMENT_COLOURS.length - 1)],
                }}
              />
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexGrow: 1 }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 26, color: INK, fontWeight: 700 }}>
            tokenchit
          </div>
          <div style={{ display: "flex", fontSize: 22, color: DIM }}>
            {profile
              ? `${profile.activeDays} active days${profile.rank ? ` · rank ${profile.rank}` : ""}`
              : "no data published"}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "JetBrains Mono", data: await font, style: "normal", weight: 700 }],

      /*
       * The only layer that actually decides this route's caching.
       *
       * This image was the one thing on the site with no caching at all: it answered
       * `max-age=0, must-revalidate` and was a Vercel MISS on every request, 4.5s from London,
       * against 0.35s for the prerendered root image. It is what every link preview of every
       * profile depends on, and a crawler that gives up waiting renders the card without one —
       * which is a shared profile showing the generic site card instead of its own figures.
       *
       * Two earlier attempts did nothing, and the order matters because each looked like it
       * had worked. `export const revalidate` leaves the emitted header byte-identical. A
       * `Cache-Control` rule in next.config's `headers()` does apply under `next start` — which
       * is how it passed review — but not on Vercel, where a route's own header wins: the CSP,
       * Referrer-Policy, Permissions-Policy and X-Content-Type-Options from that same config
       * block all reach this response, and only Cache-Control is overridden. Setting it here,
       * on the response itself, is the version there is nothing left to override.
       *
       * `s-maxage` matches the page's own `revalidate`, so the image and the figures printed
       * beside it cannot drift further apart than the page already can. The long
       * `stale-while-revalidate` is the part crawlers need: after the first render a fetch is
       * served from the edge immediately and the refresh happens behind it, so nothing waits
       * on a cold compose twice. A week outlasts the interval at which LinkedIn and Slack
       * re-check a link.
       */
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=604800",
      },
    },
  );
}

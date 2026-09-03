import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { formatTokens, formatUsd, sanitizeHandle } from "@tokenstats/core";

import { readProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "tokenstats profile";

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

  const tokens = profile ? formatTokens(profile.tokens) : "—";
  const cost = profile && profile.equivCostUsd > 0 ? formatUsd(profile.equivCostUsd) : "—";
  const streak = profile ? `${profile.streakDays}d` : "—";
  const verified = profile?.tier === "verified";

  const mix = Object.entries(profile?.mix ?? {}).sort((a, b) => b[1] - a[1]);
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
            tokenstats
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
    },
  );
}

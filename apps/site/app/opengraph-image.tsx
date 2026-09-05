import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { PRIMARY_COMMAND } from "@/lib/cli";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "tokenchit — receipts for your AI coding agents";

/**
 * The link preview for tokenchit itself.
 *
 * Until this existed, every paste of the bare domain — into Slack, a DM, a LinkedIn post —
 * unfurled as a bare "Web Link" with no image and no description. The profile pages had a
 * preview and the thing they invite people to try did not, which is backwards: a profile link
 * is a receipt shown to people who already know what this is, and the domain is the invitation.
 *
 * Static. It says the same thing for everyone, so it is generated once at build rather than
 * per request, and nothing here touches the database.
 *
 * Satori supports a flexbox subset: every element with more than one child needs an explicit
 * `display: flex`, there is no grid, and CSS custom properties do not resolve — so the palette
 * is written in hex rather than referencing the design tokens, as the profile image does.
 */
const INK = "#101010";
const PAPER = "#FFFDF9";
const LIME = "#C6FF3D";
const DIM = "#8A8A82";

/** Bundled rather than fetched, so a preview never depends on a font CDN being reachable. */
const font = readFile(join(process.cwd(), "assets", "jetbrains-mono-700.ttf"));

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background: PAPER,
          fontFamily: "JetBrains Mono",
          padding: 64,
          border: `16px solid ${INK}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              background: LIME,
              border: `5px solid ${INK}`,
              padding: "10px 22px",
              fontSize: 52,
              fontWeight: 800,
              color: INK,
              letterSpacing: -1,
            }}
          >
            tokenchit
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 40,
              fontSize: 46,
              fontWeight: 800,
              color: INK,
              letterSpacing: -1.5,
              lineHeight: 1.25,
            }}
          >
            Receipts for your AI coding agents.
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 26,
              color: DIM,
              lineHeight: 1.5,
              maxWidth: 900,
            }}
          >
            Reads Claude Code, Codex and OpenCode logs on your own machine and renders a stat
            card you commit to your repo — a file, not a badge you rent.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", height: 5, background: INK, marginBottom: 28 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "flex",
                background: INK,
                color: LIME,
                padding: "14px 22px",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {PRIMARY_COMMAND}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: DIM }}>tokenchit.app</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "JetBrains Mono", data: await font, weight: 700, style: "normal" }],
    },
  );
}

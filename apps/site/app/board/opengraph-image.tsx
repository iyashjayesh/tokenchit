import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { formatTokens, formatUsd } from "@tokenchit/core";

import { DEFAULT_WINDOW } from "@/lib/board";
import { readBoardTotals } from "@/lib/board-totals";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "The tokenchit board";

/**
 * The link preview for the board.
 *
 * Live figures rather than a static graphic: the board's whole claim is that these are real
 * people's real usage, and a preview showing what it actually holds today says that better
 * than any sentence. It reads the same totals the page does, so the two cannot disagree.
 *
 * Revalidated hourly. The board itself is revalidated far more often, but a link preview is
 * fetched once by each platform and then cached on their side for far longer than an hour, so
 * a tighter window would buy nothing and cost a database read on every crawl.
 */
export const revalidate = 3600;

const INK = "#101010";
const PAPER = "#FFFDF9";
const LIME = "#C6FF3D";
const DIM = "#8A8A82";

const font = readFile(join(process.cwd(), "assets", "jetbrains-mono-700.ttf"));

export default async function Image() {
  // A preview that fails is a link with no image at all, which is worse than one with dashes.
  const totals = await readBoardTotals(DEFAULT_WINDOW).catch(() => null);

  const stats: [string, string][] = [
    ["DEVELOPERS", totals ? String(totals.developers) : "—"],
    ["TOKENS", totals ? formatTokens(totals.tokens) : "—"],
    ["EQUIV. COST", totals ? formatUsd(totals.equivCostUsd) : "—"],
  ];

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
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ fontSize: 68, fontWeight: 800, color: INK, letterSpacing: -2 }}>
              The board
            </div>
            <div
              style={{
                display: "flex",
                background: "#FFD23D",
                border: `4px solid ${INK}`,
                padding: "6px 14px",
                fontSize: 20,
                fontWeight: 700,
                color: INK,
              }}
            >
              OPT-IN
            </div>
          </div>

          <div style={{ display: "flex", height: 5, background: INK, marginTop: 26 }} />

          <div style={{ display: "flex", marginTop: 24, fontSize: 26, color: DIM }}>
            Everyone who ran tokenchit publish. A usage count, not a skill score.
          </div>

          <div style={{ display: "flex", gap: 72, marginTop: 48 }}>
            {stats.map(([label, value]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 22, color: DIM, letterSpacing: 3 }}>{label}</div>
                <div style={{ fontSize: 78, fontWeight: 800, color: INK, letterSpacing: -3 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              background: INK,
              color: LIME,
              padding: "12px 20px",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            tokenchit
          </div>
          <div style={{ display: "flex", fontSize: 24, color: DIM }}>tokenchit.app/board</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "JetBrains Mono", data: await font, weight: 700, style: "normal" }],
    },
  );
}

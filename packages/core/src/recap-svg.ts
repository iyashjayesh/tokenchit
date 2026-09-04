import { handleSize, sanitizeHandle, type Theme } from "./card-svg.js";
import { RAMP, type Recap } from "./recap.js";
import { CARD_HOST, DARK, esc, FONT, LIGHT, render } from "./svg.js";

/**
 * The year-in-review, as one committable SVG.
 *
 * 495 wide so it stacks with the card in a README without either looking orphaned. Height
 * is fixed: a recap that grows with the data would reflow a reader's page every sync.
 */
const W = 495;
const H = 330;
const PAD = 28;
const INNER = W - PAD * 2; // 439, same track the card uses

/** Heatmap geometry. 24 columns of 12px on a 13px pitch leaves a 1px gutter. */
const GRID = {
  x: PAD + 30, // room for MON..SUN
  y: 168,
  cell: 12,
  pitch: 13,
  rowPitch: 15,
  cols: 24,
  rows: 7,
};

const gridRight = GRID.x + GRID.cols * GRID.pitch - 1;

/**
 * The coldest ramp step is a near-white that reads as a solid block on a dark ground, so
 * dark cards swap it for the frame's own colour. The four warm steps carry across unchanged
 * — they are the data, and recolouring them per theme would make two cards incomparable.
 */
const darkRamp = (): readonly string[] => ["#1C1C18", ...RAMP.slice(1)];

export type RecapCardOptions = {
  handle: string;
  recap: Recap;
  theme?: Theme;
};

export function buildRecapSvg(opts: RecapCardOptions): string {
  const theme: Theme = opts.theme ?? "light";
  const auto = theme === "auto";
  const pal = theme === "dark" ? DARK : LIGHT;
  const handle = sanitizeHandle(opts.handle);
  const ramp = theme === "dark" ? darkRamp() : RAMP;
  const r = opts.recap;

  /* Classes exist only for theme=auto, where the media query needs them. Explicit themes
     carry presentation attributes and no <style>, so they survive a sanitiser. */
  const cls = (name: string): Record<string, string> => (auto ? { class: name } : {});

  const parts: string[] = [];

  parts.push(
    render({
      tag: "rect",
      attrs: {
        ...cls("fr"),
        x: 1,
        y: 1,
        width: W - 2,
        height: H - 2,
        fill: pal.frameFill,
        stroke: pal.frameStroke,
        "stroke-width": 2,
      },
    }),
  );

  // title
  parts.push(
    render({
      tag: "text",
      attrs: {
        ...cls("hd"),
        x: PAD,
        y: 44,
        "font-family": FONT,
        "font-size": handleSize(handle, 20, INNER - 60),
        "font-weight": 800,
        fill: pal.text,
      },
      text: `@${handle}`,
    }),
  );
  parts.push(
    render({
      tag: "text",
      attrs: {
        ...cls("lb"),
        x: W - PAD,
        y: 44,
        "text-anchor": "end",
        "font-family": FONT,
        "font-size": 13,
        "font-weight": 700,
        fill: pal.label,
      },
      text: String(r.year),
    }),
  );
  parts.push(
    render({
      tag: "line",
      attrs: { ...cls("hl"), x1: PAD, y1: 62, x2: W - PAD, y2: 62, stroke: pal.hairline, "stroke-width": 1 },
    }),
  );

  // four tiles
  const tiles: Array<[string, string]> = [
    ["TOKENS", r.tiles.totalTokens],
    ["EQUIV. COST", r.tiles.equivCost],
    ["TOP MODEL", r.tiles.topModel],
    ["STREAK", r.tiles.longestStreak],
  ];
  const tileW = INNER / tiles.length;

  tiles.forEach(([label, value], i) => {
    const x = PAD + i * tileW;
    parts.push(
      render({
        tag: "text",
        attrs: { ...cls("lb"), x, y: 88, "font-family": FONT, "font-size": 8, "font-weight": 700, "letter-spacing": 0.8, fill: pal.label },
        text: label,
      }),
    );
    // The model id is the one value that is text rather than a figure, so it gets a size
    // that fits its column instead of the display size the numbers use.
    const isModel = label === "TOP MODEL";
    const size = isModel ? Math.min(11, (tileW - 8) / (value.length * 0.62)) : 19;
    parts.push(
      render({
        tag: "text",
        attrs: { ...cls("vl"), x, y: 114, "font-family": FONT, "font-size": size, "font-weight": 800, fill: pal.text },
        text: value,
      }),
    );
  });

  parts.push(
    render({
      tag: "line",
      attrs: { ...cls("rl"), x1: PAD, y1: 132, x2: W - PAD, y2: 132, stroke: pal.rule, "stroke-width": 1 },
    }),
  );

  // hour ruler, every third hour
  for (let h = 0; h < 24; h += 3) {
    parts.push(
      render({
        tag: "text",
        attrs: {
          ...cls("lb"),
          x: GRID.x + h * GRID.pitch,
          y: 158,
          "font-family": FONT,
          "font-size": 7,
          fill: pal.label,
        },
        text: String(h).padStart(2, "0"),
      }),
    );
  }

  // the peak stretch, drawn behind the grid as one continuous bar
  if (r.peak) {
    const from = GRID.x + r.peak.from * GRID.pitch;
    const width = (r.peak.to - r.peak.from + 1) * GRID.pitch - 1;
    parts.push(
      render({
        tag: "rect",
        attrs: { x: from, y: GRID.y - 6, width, height: 3, fill: "#FF5C3D" },
      }),
    );
  }

  // heatmap
  r.rows.forEach((row, ri) => {
    const y = GRID.y + ri * GRID.rowPitch;

    parts.push(
      render({
        tag: "text",
        attrs: {
          ...cls(row.busiest ? "vl" : "lb"),
          x: PAD,
          y: y + 9,
          "font-family": FONT,
          "font-size": 7.5,
          "font-weight": row.busiest ? 700 : 400,
          fill: row.busiest ? pal.text : pal.label,
        },
        text: row.day,
      }),
    );

    row.levels.forEach((level, hi) => {
      parts.push(
        render({
          tag: "rect",
          attrs: {
            ...cls(`q${level}`),
            x: GRID.x + hi * GRID.pitch,
            y,
            width: GRID.cell,
            height: GRID.cell,
            fill: ramp[level] ?? ramp[0],
          },
        }),
      );
    });

    // share of the busiest day, as a rule running to the right edge
    const barX = gridRight + 10;
    const barMax = W - PAD - barX;
    parts.push(
      render({
        tag: "rect",
        attrs: {
          x: barX,
          y: y + 4,
          width: Math.max(1, Math.round((barMax * row.share) / 100)),
          height: 4,
          fill: row.busiest ? "#FF5C3D" : "#C6FF3D",
        },
      }),
    );
  });

  // legend
  const legendY = GRID.y + GRID.rows * GRID.rowPitch + 12;
  parts.push(
    render({
      tag: "text",
      attrs: { ...cls("lg"), x: PAD, y: legendY + 6, "font-family": FONT, "font-size": 7.5, fill: pal.legend },
      text: "LESS",
    }),
  );
  ramp.forEach((colour, i) => {
    parts.push(
      render({
        tag: "rect",
        attrs: { ...cls(`q${i}`), x: PAD + 30 + i * 11, y: legendY, width: 8, height: 8, fill: colour },
      }),
    );
  });
  parts.push(
    render({
      tag: "text",
      attrs: { ...cls("lg"), x: PAD + 30 + ramp.length * 11 + 4, y: legendY + 6, "font-family": FONT, "font-size": 7.5, fill: pal.legend },
      text: "MORE",
    }),
  );
  parts.push(
    render({
      tag: "text",
      attrs: {
        ...cls("lg"),
        x: W - PAD,
        y: legendY + 6,
        "text-anchor": "end",
        "font-family": FONT,
        "font-size": 7.5,
        fill: pal.legend,
      },
      text: `${r.activeDays} ACTIVE DAYS`,
    }),
  );

  // footer
  parts.push(
    render({
      tag: "text",
      attrs: { ...cls("ft"), x: PAD, y: H - 14, "font-family": FONT, "font-size": 8, "letter-spacing": 1, fill: pal.footer },
      text: CARD_HOST,
    }),
  );
  parts.push(
    render({
      tag: "text",
      attrs: {
        ...cls("ft"),
        x: W - PAD,
        y: H - 14,
        "text-anchor": "end",
        "font-family": FONT,
        "font-size": 8,
        "letter-spacing": 1,
        fill: pal.footer,
      },
      text: r.peak ? `PEAK ${pad(r.peak.from)}-${pad(r.peak.to + 1)}` : "NO ACTIVITY",
    }),
  );

  const style = auto
    ? `<style>@media (prefers-color-scheme:dark){` +
      `.fr{fill:${DARK.frameFill};stroke:${DARK.frameStroke}}` +
      `.hd,.vl{fill:${DARK.text}}` +
      `.hl{stroke:${DARK.hairline}}.rl{stroke:${DARK.rule}}` +
      `.lb{fill:${DARK.label}}.lg{fill:${DARK.legend}}.ft{fill:${DARK.footer}}` +
      // The coldest ramp step is a near-white that vanishes on a dark ground.
      `.q0{fill:#1C1C18}}</style>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `role="img" aria-label="${esc(`${handle} token usage recap for ${r.year}`)}">` +
    style +
    parts.join("") +
    `</svg>`
  );
}

const pad = (h: number) => String(h).padStart(2, "0");

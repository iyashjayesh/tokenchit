/**
 * The stat card, built as an SVG string from one function.
 *
 * Both the marketing page and /api/card/[handle] render through this builder, so the
 * two cannot drift apart. Geometry is lifted from the approved prototype
 * (design_handoff_tokencard_site/Tokencard Site v2.dc.html):
 *   default 495x195 light  lines 123-147
 *   default 495x195 dark   lines 152-176
 *   compact 340x195        lines 183-201
 *
 * Constraints that shaped this file:
 *   - The card ships inside a GitHub README. GitHub strips external font references
 *     from README SVGs, so fonts are plain `font-family` fallbacks and nothing here
 *     depends on a webfont loading.
 *   - Nothing on the card is below 8px; it must stay legible at 100% scale.
 *   - The handle is user-controlled input going into a document served from our
 *     origin, so it is sanitised to [A-Za-z0-9_-]{1,16} and XML-escaped.
 */

import { DARK, esc, FONT, LIGHT, render, type Palette } from "./svg.js";

export type Layout = "default" | "compact";
export type Theme = "light" | "dark" | "auto";
export type HideKey = "spend" | "streak" | "mix";

export type MixEntry = { agent: string; pct: number };

export type CardOptions = {
  handle: string;
  tokens: string;
  spend: string;
  streak: string;
  mix: MixEntry[];
  /** A Date, or a pre-formatted footer string such as "SYNCED 2H AGO". */
  syncedAt: Date | string;
  layout?: Layout;
  theme?: Theme;
  hide?: HideKey[];
};





/* ── helpers ──────────────────────────────────────────────────────────────── */

/**
 * GitHub handles are up to 39 characters, so that is the cap — truncating at 16 would put a
 * name on the card that is not the user's. Long handles are handled by shrinking the type
 * (see `handleSize`), not by cutting the identity short.
 */
export function sanitizeHandle(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 39) || "dev";
}

/**
 * Shrink the handle just enough to fit the card's width. JetBrains Mono advances roughly
 * 0.6em per glyph, so a 39-character handle needs about 18px where the design's 20px suits
 * the common short one. Short handles are untouched.
 */
export function handleSize(handle: string, base: number, available: number): number {
  const chars = handle.length + 1; // the leading "@"
  const fits = available / (chars * 0.6);
  return Math.min(base, Math.floor(fits * 10) / 10);
}

/** "SYNCED 2H AGO" — the card always carries its last sync, because we cache for 4h. */
export function formatSynced(at: Date | string, now: Date = new Date()): string {
  if (typeof at === "string") return at.toUpperCase();
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));
  if (mins < 60) return `SYNCED ${mins}M AGO`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `SYNCED ${hours}H AGO`;
  return `SYNCED ${Math.round(hours / 24)}D AGO`;
}

/**
 * Segment widths across a fixed track. The first n-1 are rounded proportionally and
 * the last takes the remainder, so the bar always sums to exactly the track width
 * rather than leaving a sub-pixel gap at the right edge.
 * Reproduces the design's numbers: 439 -> 255/92/53/39, 292 -> 169/61/35/27.
 */
export function segmentWidths(mix: MixEntry[], track: number): number[] {
  const total = mix.reduce((a, m) => a + m.pct, 0);
  if (total <= 0 || mix.length === 0) return [];
  const out: number[] = [];
  let used = 0;
  for (let i = 0; i < mix.length - 1; i++) {
    const w = Math.round((track * mix[i].pct) / total);
    out.push(w);
    used += w;
  }
  out.push(Math.max(0, track - used));
  return out;
}

/** Keep only allow-listed agents. Percentages stay raw; segmentWidths renormalises. */
export function filterAgents(mix: MixEntry[], allow?: string[] | null): MixEntry[] {
  if (!allow || allow.length === 0) return mix;
  const set = new Set(allow.map((a) => a.trim().toLowerCase()).filter(Boolean));
  if (set.size === 0) return mix;
  const kept = mix.filter((m) => set.has(m.agent.toLowerCase()));
  return kept.length ? kept : mix;
}



/* ── geometry ─────────────────────────────────────────────────────────────── */

const GEO = {
  default: {
    w: 495,
    h: 195,
    frame: { x: 1, y: 1, w: 493, h: 193 },
    handle: { x: 28, y: 44, size: 20 },
    hairline: { x1: 28, y1: 62, x2: 467 },
    /* three stat columns; with a stat hidden the remaining ones keep this rhythm */
    statX: [28, 184, 340],
    labelY: 88,
    valueY: 122,
    valueSize: 30,
    bar: { x: 28, y: 138, track: 439, h: 6 },
    legend: { swatchY: 157, textY: 163, pairs: [[28, 40], [150, 162], [260, 272], [372, 384]] },
    footer: { y: 182, left: 28, right: 467 },
  },
  compact: {
    w: 340,
    h: 195,
    frame: { x: 1, y: 1, w: 338, h: 193 },
    handle: { x: 24, y: 40, size: 18 },
    hairline: { x1: 24, y1: 56, x2: 316 },
    /* three stat ROWS instead of columns, with hairline rules between */
    rowLabelY: [82, 112, 142],
    rowValueY: [83, 113, 143],
    ruleY: [95.5, 125.5],
    labelX: 24,
    valueX: 316,
    valueSize: 19,
    bar: { x: 24, y: 156, track: 292, h: 6 },
    footer: { y: 180, left: 24, right: 316 },
  },
} as const;

/* ── builder ──────────────────────────────────────────────────────────────── */

export function buildCardSvg(opts: CardOptions): string {
  const layout: Layout = opts.layout === "compact" ? "compact" : "default";
  const theme: Theme = opts.theme ?? "light";
  const hide = new Set(opts.hide ?? []);
  const auto = theme === "auto";
  const pal = theme === "dark" ? DARK : LIGHT;

  const handle = sanitizeHandle(opts.handle);
  const synced = formatSynced(opts.syncedAt);

  /* Class attributes only exist for theme=auto, where the media query needs them.
     Explicit light/dark cards carry plain presentation attributes and no <style>,
     so they survive a sanitiser that drops CSS. */
  const cls = (name: string): Record<string, string> => (auto ? { class: name } : {});

  const stats: Array<{ label: string; value: string }> = [
    { label: "TOKENS", value: opts.tokens },
  ];
  // "EQUIV. COST", not "SPEND": these tokens were mostly bought under subscriptions where
  // no per-token charge ever happened, and a card embedded in a README repeats whatever it
  // claims to every visitor. The `spend` key stays as-is — it is the public query-param name.
  if (!hide.has("spend")) stats.push({ label: "EQUIV. COST", value: opts.spend });
  if (!hide.has("streak")) stats.push({ label: "STREAK", value: opts.streak });

  const mix = hide.has("mix") ? [] : opts.mix;
  const parts: string[] = [];

  const g = GEO[layout];

  // frame
  parts.push(
    render({
      tag: "rect",
      attrs: {
        ...cls("fr"),
        x: g.frame.x,
        y: g.frame.y,
        width: g.frame.w,
        height: g.frame.h,
        fill: pal.frameFill,
        stroke: pal.frameStroke,
        "stroke-width": 2,
      },
    }),
  );

  // handle
  parts.push(
    render({
      tag: "text",
      attrs: {
        ...cls("hd"),
        x: g.handle.x,
        y: g.handle.y,
        "font-family": FONT,
        "font-size": handleSize(handle, g.handle.size, g.bar.track),
        "font-weight": 800,
        fill: pal.text,
      },
      text: `@${handle}`,
    }),
  );

  // hairline under the handle
  parts.push(
    render({
      tag: "line",
      attrs: {
        ...cls("hl"),
        x1: g.hairline.x1,
        y1: g.hairline.y1,
        x2: g.hairline.x2,
        y2: g.hairline.y1,
        stroke: pal.hairline,
        "stroke-width": 1,
      },
    }),
  );

  const labelAttrs = {
    "font-family": FONT,
    "font-size": 8.5,
    "font-weight": 700,
    "letter-spacing": 1.8,
  };

  if (layout === "default") {
    const dg = GEO.default;
    stats.forEach((s, i) => {
      const x = dg.statX[i];
      parts.push(
        render({
          tag: "text",
          attrs: { ...cls("lb"), x, y: dg.labelY, ...labelAttrs, fill: pal.label },
          text: s.label,
        }),
      );
      parts.push(
        render({
          tag: "text",
          attrs: {
            ...cls("vl"),
            x,
            y: dg.valueY,
            "font-family": FONT,
            "font-size": dg.valueSize,
            "font-weight": 800,
            fill: pal.text,
          },
          text: s.value,
        }),
      );
    });
  } else {
    const cg = GEO.compact;
    stats.forEach((s, i) => {
      parts.push(
        render({
          tag: "text",
          attrs: {
            ...cls("lb"),
            x: cg.labelX,
            y: cg.rowLabelY[i],
            ...labelAttrs,
            fill: pal.label,
          },
          text: s.label,
        }),
      );
      parts.push(
        render({
          tag: "text",
          attrs: {
            ...cls("vl"),
            x: cg.valueX,
            y: cg.rowValueY[i],
            "text-anchor": "end",
            "font-family": FONT,
            "font-size": cg.valueSize,
            "font-weight": 800,
            fill: pal.text,
          },
          text: s.value,
        }),
      );
      // rule between consecutive rows only
      if (i < stats.length - 1) {
        parts.push(
          render({
            tag: "line",
            attrs: {
              ...cls("rl"),
              x1: cg.labelX,
              y1: cg.ruleY[i],
              x2: cg.valueX,
              y2: cg.ruleY[i],
              stroke: pal.rule,
              "stroke-width": 1,
            },
          }),
        );
      }
    });
  }

  // mix bar
  const widths = segmentWidths(mix, g.bar.track);
  let cursor = g.bar.x;
  widths.forEach((w, i) => {
    parts.push(
      render({
        tag: "rect",
        attrs: {
          ...cls(`s${i}`),
          x: cursor,
          y: g.bar.y,
          width: w,
          height: g.bar.h,
          fill: pal.segments[Math.min(i, pal.segments.length - 1)],
        },
      }),
    );
    cursor += w;
  });

  // legend — default layout only; on compact the bar carries the split
  if (layout === "default" && mix.length) {
    const dg = GEO.default;
    mix.slice(0, dg.legend.pairs.length).forEach((m, i) => {
      const [sx, tx] = dg.legend.pairs[i];
      parts.push(
        render({
          tag: "rect",
          attrs: {
            ...cls(`s${i}`),
            x: sx,
            y: dg.legend.swatchY,
            width: 6,
            height: 6,
            fill: pal.segments[Math.min(i, pal.segments.length - 1)],
          },
        }),
      );
      parts.push(
        render({
          tag: "text",
          attrs: {
            ...cls("lg"),
            x: tx,
            y: dg.legend.textY,
            "font-family": FONT,
            "font-size": 8.5,
            fill: pal.legend,
          },
          // Rounded here rather than by the caller: the legend sits at 8.5px in a fixed
          // slot, and one unrounded float ("98.677606%") overruns into the next entry.
          text: `${m.agent} ${Math.round(m.pct)}%`,
        }),
      );
    });
  }

  // footer
  const footAttrs = {
    "font-family": FONT,
    "font-size": 8,
    "letter-spacing": 1.4,
    fill: pal.footer,
  };
  parts.push(
    render({
      tag: "text",
      attrs: { ...cls("ft"), x: g.footer.left, y: g.footer.y, ...footAttrs },
      text: "TOKENCHIT.APP",
    }),
  );
  parts.push(
    render({
      tag: "text",
      attrs: {
        ...cls("ft"),
        x: g.footer.right,
        y: g.footer.y,
        "text-anchor": "end",
        ...footAttrs,
      },
      text: synced,
    }),
  );

  const style = auto ? autoThemeStyle(widths.length || mix.length) : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.w} ${g.h}" ` +
    `width="${g.w}" height="${g.h}" role="img" ` +
    `aria-label="tokenchit stats for @${esc(handle)}">` +
    style +
    parts.join("") +
    `</svg>`
  );
}

/**
 * theme=auto. Light values are already on the elements as presentation attributes;
 * CSS outranks those, so this block flips them under a dark colour scheme.
 *
 * The handoff warned that GitHub strips <style> from README SVGs. Measured against a live
 * public repository, it does not: a committed card is served byte-identical from
 * raw.githubusercontent.com, <style> and prefers-color-scheme intact, and the README renders
 * it in dark mode under a dark colour scheme.
 *
 * Attributes-first is kept anyway. It costs nothing, and it is what makes the card degrade to
 * light rather than to nothing anywhere CSS is dropped — an email client, a Markdown viewer,
 * a sanitiser stricter than GitHub's.
 */
function autoThemeStyle(segmentCount: number): string {
  const segRules = Array.from({ length: segmentCount }, (_, i) =>
    i === 0 ? "" : `.s${i}{fill:${DARK.segments[Math.min(i, 3)]}}`,
  ).join("");

  return (
    `<style>@media (prefers-color-scheme:dark){` +
    `.fr{fill:${DARK.frameFill};stroke:${DARK.frameStroke}}` +
    `.hd,.vl{fill:${DARK.text}}` +
    `.hl,.rl{stroke:${DARK.hairline}}` +
    `.lb{fill:${DARK.label}}` +
    `.lg{fill:${DARK.legend}}` +
    `.ft{fill:${DARK.footer}}` +
    segRules +
    `}</style>`
  );
}

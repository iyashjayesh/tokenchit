/**
 * Primitives shared by every SVG this package renders.
 *
 * Extracted from card-svg.ts unchanged when the recap builder arrived — two builders using
 * two copies of a palette is how a card and a recap end up subtly different colours.
 */

export type Palette = {
  frameFill: string;
  frameStroke: string;
  text: string;
  hairline: string;
  rule: string;
  label: string;
  legend: string;
  footer: string;
  segments: [string, string, string, string];
};

export const LIGHT: Palette = {
  frameFill: "#FFFFFF",
  frameStroke: "#101010",
  text: "#101010",
  hairline: "#E4E2D8",
  rule: "#F0EFE9",
  /* The 8.5px labels — TOKENS, EQUIV. COST, STREAK — are the only thing distinguishing three
     adjacent large numbers, and they were the least legible text on the card: #A5A59D is
     2.48:1 on white, and the 8px footer at #C0BEB6 was 1.86:1. AA wants 4.5:1 at this size;
     the large-text exemption starts at 18.66px bold and 8.5px is nowhere near it. */
  label: "#6F6F68", /* 5.1:1 */
  legend: "#55554E", /* 7.5:1 */
  footer: "#767670", /* 4.6:1 */
  segments: ["#C6FF3D", "#101010", "#8A8A82", "#D8D6CE"],
};

export const DARK: Palette = {
  frameFill: "#101010",
  frameStroke: "#2E2E28",
  text: "#FFFFFF",
  hairline: "#2E2E28",
  rule: "#2E2E28",
  /* Same problem inverted: #6E6E66 on #101010 is 3.70:1 and the footer was 2.53:1. */
  label: "#9A9A92", /* 6.7:1 */
  legend: "#B4B4AC", /* 9.3:1 */
  footer: "#8F8F86", /* 5.8:1 */
  segments: ["#C6FF3D", "#FFFFFF", "#6E6E66", "#3A3A34"],
};

/**
 * The host stamped on every card and recap.
 *
 * It read TOKENCHIT.APP for a while before that domain existed — a watermark on a file people
 * commit into their repositories, pointing at nothing. It briefly named the vercel.app
 * deployment instead, and now names the domain for real.
 *
 * One constant, shared by the card and the recap, so the two cannot disagree about where a
 * reader should go.
 */
export const CARD_HOST = "TOKENCHIT.APP";

export const FONT = "'JetBrains Mono', ui-monospace, monospace";

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** One SVG element: a tag, its attributes, and optional text content. */
export type El = { tag: string; attrs: Record<string, string | number>; text?: string };

/** Serialise an element, escaping both attribute values and text. */
export const render = (el: El) => {
  const attrs = Object.entries(el.attrs)
    .map(([k, v]) => `${k}="${typeof v === "string" ? esc(v) : v}"`)
    .join(" ");
  return el.text !== undefined
    ? `<${el.tag} ${attrs}>${esc(el.text)}</${el.tag}>`
    : `<${el.tag} ${attrs}/>`;
};

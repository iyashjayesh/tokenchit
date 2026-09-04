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
  label: "#A5A59D",
  legend: "#55554E",
  footer: "#C0BEB6",
  segments: ["#C6FF3D", "#101010", "#8A8A82", "#D8D6CE"],
};

export const DARK: Palette = {
  frameFill: "#101010",
  frameStroke: "#2E2E28",
  text: "#FFFFFF",
  hairline: "#2E2E28",
  rule: "#2E2E28",
  label: "#6E6E66",
  legend: "#9A9A92",
  footer: "#55554E",
  segments: ["#C6FF3D", "#FFFFFF", "#6E6E66", "#3A3A34"],
};

/**
 * The host stamped on every card and recap.
 *
 * It said TOKENCHIT.APP, which does not resolve — a watermark on a file people commit into
 * their repositories, pointing at nothing. This is the host that actually serves the site;
 * when the .app domain is bought, this is the one string to change.
 */
export const CARD_HOST = "TOKENCHIT.VERCEL.APP";

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

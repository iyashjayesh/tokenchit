/**
 * The wordmark, big, for the top of a screen someone is actually watching.
 *
 * A 5-row block font carrying only the eight letters "tokenchit" needs. A general figlet
 * font would be a dependency and a megabyte to render nine characters that never change.
 *
 * Two things were prototyped and rejected. The site's hard drop-shadow fills the letter
 * counters at this resolution and turns the word to mush — it needs pixels, not cells. A
 * knockout plate (lime block, letters punched out) loses its inter-letter gaps into the
 * counters and stops being readable at all.
 */
import { grey, lime, width as visibleWidth } from "./ui.js";

const GLYPHS: Record<string, readonly string[]> = {
  t: ["####", " ## ", " ## ", " ## ", " ## "],
  o: ["####", "#  #", "#  #", "#  #", "####"],
  k: ["#  #", "# # ", "##  ", "# # ", "#  #"],
  e: ["####", "#   ", "### ", "#   ", "####"],
  n: ["#  #", "## #", "# ##", "#  #", "#  #"],
  c: ["####", "#   ", "#   ", "#   ", "####"],
  h: ["#  #", "#  #", "####", "#  #", "#  #"],
  i: ["####", " ## ", " ## ", " ## ", "####"],
};

const WORD = "tokenchit";
const ROWS = 5;

/** 52 columns at a two-space gap. Below this the banner is dropped rather than wrapped. */
const MIN_COLUMNS = 66;

function lines(): string[] {
  const out: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [...WORD].map((ch) => GLYPHS[ch]![r]!).join("  ");
    out.push(row.replaceAll("#", "█"));
  }
  return out;
}

/**
 * The banner, or nothing.
 *
 * Nothing when there is no TTY — a wall of block letters in a CI log or a piped file is
 * noise, and the caller falls back to the inline wordmark. Nothing in a narrow terminal
 * either: a wrapped banner is worse than no banner.
 */
export function banner(tagline: string, version: string): string[] {
  const columns = process.stdout.columns ?? 0;
  if (!process.stdout.isTTY || columns < MIN_COLUMNS) return [];

  const art = lines();
  const w = visibleWidth(art[0]!);
  const foot = `${tagline}${" ".repeat(Math.max(2, w - visibleWidth(tagline) - version.length - 1))}${version}`;

  return ["", ...art.map((l) => `  ${lime(l)}`), "", `  ${grey(foot)}`];
}

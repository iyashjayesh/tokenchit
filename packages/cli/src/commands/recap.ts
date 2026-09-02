import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  aggregate,
  buildRecap,
  buildRecapSvg,
  sanitizeHandle,
  type Theme,
} from "@tokencard/core";
import { readAll } from "@tokencard/core/adapters";

import { flag, has, oneOf } from "../args.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig } from "../config.js";
import { bold, dim, green, say, warn } from "../ui.js";

const THEMES = ["auto", "light", "dark"] as const satisfies readonly Theme[];

/** The ramp as blocks, so the terminal shows the same shape the SVG does. */
const BLOCKS = [" ", "░", "▒", "▓", "█"] as const;

export async function recap(argv: string[]): Promise<number> {
  const config = (await readConfig()) ?? DEFAULT_CONFIG;

  const rawHandle = flag(argv, "--handle") ?? config.handle;
  const handle = sanitizeHandle(rawHandle);
  const theme = oneOf(flag(argv, "--theme"), THEMES, "theme") ?? config.theme;
  const out = flag(argv, "--out") ?? "tokencard-recap.svg";
  const json = has(argv, "--json");
  const dryRun = has(argv, "--dry-run");
  const yearFlag = flag(argv, "--year");
  const year = yearFlag ? Number(yearFlag) : undefined;

  if (yearFlag && !Number.isInteger(year)) {
    throw new Error(`--year must be a whole number (got "${yearFlag}")`);
  }

  const stats = await aggregate(readAll(config.agents));
  if (stats.tokens === 0) {
    warn("No usage found. Run `tokencard init` to see which agents were detected.");
    return 1;
  }

  const r = buildRecap(stats, year !== undefined ? { year } : {});

  if (json) {
    say(JSON.stringify(r, null, 2));
    return 0;
  }

  say();
  say(`  ${bold(`@${handle}`)} ${dim("·")} ${bold(String(r.year))}`);
  say();
  say(
    `  ${bold(r.tiles.totalTokens)} tokens  ${dim("·")}  ` +
      `${bold(r.tiles.equivCost)} equiv. API cost  ${dim("·")}  ` +
      `${bold(r.tiles.topModel)}  ${dim("·")}  ` +
      `${bold(r.tiles.longestStreak)} streak`,
  );
  say();

  // Hour ruler. Each label is written into the column it marks rather than joined, so a
  // two-character label occupies its own column and the next one instead of shunting the
  // rest of the ruler out of step with the grid.
  const ruler = Array(24).fill(" ");
  for (let h = 0; h < 24; h += 6) {
    const label = String(h).padStart(2, "0");
    ruler[h] = label[0] as string;
    if (h + 1 < 24) ruler[h + 1] = label[1] as string;
  }
  say(`  ${dim(`     ${ruler.join("")}`)}`);

  for (const row of r.rows) {
    const grid = row.levels.map((l) => BLOCKS[l]).join("");
    const label = row.busiest ? bold(row.day) : dim(row.day);
    const share = `${String(row.share).padStart(3)}%`;
    say(`  ${label}  ${grid}  ${dim(share)}`);
  }

  if (r.peak) {
    say();
    say(dim(`  peak ${pad(r.peak.from)}:00-${pad(r.peak.to + 1)}:00  ·  ${r.activeDays} active days`));
  }

  say();
  for (const m of r.models) {
    say(
      `  ${m.model.padEnd(22)} ${m.tokens.padStart(8)} ${m.cost.padStart(12)}` +
        (m.priced ? "" : dim("  no public price")),
    );
  }
  say();

  if (!rawHandle) {
    warn(`No handle set — the recap says "${handle}". Add one to ${CONFIG_FILE}.`);
  }

  const svg = buildRecapSvg({ handle, recap: r, theme });
  const target = resolve(process.cwd(), out);
  const rel = relative(process.cwd(), target);

  if (dryRun) {
    say(dim(`  would write ${rel} (${svg.length} bytes)`));
    return 0;
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, svg, "utf8");
  say(`${green("✓")} wrote ${bold(rel)} ${dim(`(${svg.length} bytes)`)}`);
  say();
  say(`  ![tokencard recap](./${rel})`);
  say();

  return 0;
}

const pad = (h: number) => String(h).padStart(2, "0");

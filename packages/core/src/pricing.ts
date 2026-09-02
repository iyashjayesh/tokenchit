import table from "./prices.json" with { type: "json" };

import type { UsageEvent } from "./types.js";

export type Price = {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

const PRICES = table.prices as Record<string, Price>;

/** The day the vendored table was generated, for `tokenstats sync --json` and the docs. */
export const PRICES_GENERATED: string = table.$generated;

/**
 * Look up a model, tolerating the decorations providers add around a base id.
 *
 * Agents log whatever the provider returned, which may carry a routing prefix
 * (`anthropic/`), a region prefix (`us.`), a deployment suffix (`-v1:0`) or a snapshot date
 * (`-20260514`). Returns null for anything still unrecognised — including OpenCode's
 * bundled aliases like `big-pickle`, which have no public price at all.
 */
export function priceOf(model: string): Price | null {
  const candidates = [model];

  const bare = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  candidates.push(bare);
  candidates.push(bare.replace(/^(us|eu|apac|global)\./, ""));

  const last = candidates[candidates.length - 1] as string;
  candidates.push(last.replace(/-v\d+:\d+$/, ""));
  candidates.push(last.replace(/-\d{8}$/, "").replace(/-v\d+:\d+$/, ""));
  candidates.push(last.replace(/@\d{8}$/, ""));

  for (const key of candidates) {
    const hit = PRICES[key];
    if (hit) return hit;
  }
  return null;
}

/**
 * What one exchange would have cost at list API rates.
 *
 * Deliberately *not* called "spend". Most tokens read by this tool were spent under a
 * subscription where no per-token charge ever occurred, so presenting this as money paid
 * would be a lie the card repeats every time someone loads a README. Null means the model
 * has no public price, and the caller must exclude it from the dollar figure rather than
 * treat it as free.
 */
export function costOf(event: UsageEvent): number | null {
  const p = priceOf(event.model);
  if (!p) return null;

  return (
    (event.input * p.input +
      event.output * p.output +
      event.cacheWrite * p.cacheWrite +
      event.cacheRead * p.cacheRead) /
    1_000_000
  );
}

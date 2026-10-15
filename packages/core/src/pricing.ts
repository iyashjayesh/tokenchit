import table from "./prices.json" with { type: "json" };

import { precisionOf, type UsageEvent } from "./types.js";

export type Rates = {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

/**
 * Rates that replace the base ones for a request whose prompt is longer than `above` tokens.
 *
 * The prompt is every input token the request sent — uncached, cache reads and cache writes
 * alike — and a request over the line pays the higher rates on all of it, output included.
 * Claude Haiku 5.5 is $0.10/$0.50 up to 100,000 prompt tokens and $0.50/$2.50 above, so a
 * 100,001-token request costs five times what a 100,000-token one does per token.
 */
export type Tier = Rates & { above: number };

export type Price = Rates & {
  /** Ascending by `above`. Absent for the many models priced the same at any length. */
  tiers?: Tier[];
};

const PRICES = table.prices as Record<string, Price>;

/** The day the vendored table was generated, for `tokenchit sync --json` and the docs. */
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
 * The rates one request pays, given how long its prompt was.
 *
 * Only an event that *is* one request can choose a tier. Codex reports a whole rollout as one
 * event and a ledger replay reports a whole day, and their prompt sums say nothing about any
 * single request in them — a day of 50,000-token prompts would add up to millions and be
 * priced as if every one had crossed the line. Those pay the base rates, which can understate
 * a long-prompt day but never invent one.
 */
export function ratesFor(price: Price, event: UsageEvent): Rates {
  if (!price.tiers || precisionOf(event) !== "exact") return price;

  const prompt = event.input + event.cacheRead + event.cacheWrite;
  let rates: Rates = price;
  for (const tier of price.tiers) if (prompt > tier.above) rates = tier;
  return rates;
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
  const price = priceOf(event.model);
  if (!price) return null;

  const p = ratesFor(price, event);
  return (
    (event.input * p.input +
      event.output * p.output +
      event.cacheWrite * p.cacheWrite +
      event.cacheRead * p.cacheRead) /
    1_000_000
  );
}

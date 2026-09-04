import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { localDay } from "./aggregate.js";
import type { AgentId, UsageEvent } from "./types.js";

/**
 * A local, append-only record of usage this machine has already seen.
 *
 * The tool reads agent logs, and agent logs are deleted. Claude Code's `cleanupPeriodDays`
 * defaults to 30, so a card built only from what is on disk does not report "tokens burned
 * this year" — it reports "tokens burned since the last cleanup", and that boundary moves
 * every night. Measured on one machine: the stats cache remembered 82 active days while the
 * transcripts held 42, so over half the history had already gone, and `windows.year` and
 * `windows.all` were the same number because nothing survived long enough to differ.
 *
 * The ledger is the answer. Every run banks what it saw, keyed by day, agent and model; later
 * runs merge their reading with the bank and keep whichever is fuller. Once a day is
 * recorded, retention can delete the transcripts and the figure survives.
 *
 * What it cannot do is recover history from before it existed. `since` is therefore a real
 * date and not a promise: days before it are only as complete as the logs were on the day it
 * was first written.
 */
export type Ledger = {
  version: 1;
  /** When this file was first written, which is what "since installation" means. */
  since: string;
  updatedAt: string;
  /** `day -> agent -> model -> the fullest daily total ever seen`. */
  days: Record<string, Record<string, Record<string, Bucket>>>;
};

/** The four token buckets, kept as a tuple so a day costs a handful of bytes, not a hundred. */
export type Bucket = [input: number, output: number, cacheWrite: number, cacheRead: number];

/** What the bank recovered on one run: days the logs no longer covered in full. */
export type Recovered = { days: number; tokens: number };

const sum = (b: Bucket): number => b[0] + b[1] + b[2] + b[3];

// NUL-separated. A model id carries routing prefixes, region prefixes, deployment suffixes
// and snapshot dates, so a space is not safe to split on; a null byte cannot occur in one.
const SEP = "\u0000";
const key = (day: string, agent: string, model: string): string =>
  `${day}${SEP}${agent}${SEP}${model}`;

/**
 * Where the bank lives.
 *
 * Beside `auth.json` in the user's config directory rather than in the repo: it is machine
 * state, it is not meant to be committed, and a `git add -A` must not be able to reach it.
 */
export const ledgerPath = (): string =>
  join(
    process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"),
    "tokenchit",
    "ledger.json",
  );

export const emptyLedger = (now = new Date()): Ledger => ({
  version: 1,
  since: localDay(now),
  updatedAt: now.toISOString(),
  days: {},
});

/**
 * Read the bank, or an empty one.
 *
 * A missing, unreadable or unrecognised file is an empty ledger, never an error. Losing
 * history is bad; failing someone's `sync` because a JSON file got truncated is worse, and
 * the next write repairs it from whatever logs are still on disk.
 */
export async function readLedger(path = ledgerPath()): Promise<Ledger> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Ledger;
    if (parsed?.version !== 1 || !parsed.days || typeof parsed.days !== "object") {
      return emptyLedger();
    }
    return { ...emptyLedger(), ...parsed, days: parsed.days };
  } catch {
    return emptyLedger();
  }
}

/**
 * Write the bank.
 *
 * Through a temporary file and a rename, because this is the only copy of the history the
 * logs no longer hold. A process killed mid-write must not be able to truncate it.
 */
export async function writeLedger(ledger: Ledger, path = ledgerPath()): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const body = JSON.stringify({ ...ledger, updatedAt: new Date().toISOString() });
  await writeFile(tmp, `${body}\n`, "utf8");
  await rename(tmp, path);
  return path;
}

/**
 * Merge a day's total into the bank, keeping whichever reading is fuller.
 *
 * Max-wins per `(day, agent, model)`, on the whole four-tuple rather than field by field:
 * mixing fields from two readings would bank a combination that never happened. It is the
 * same rule the Claude Code adapter uses to choose between streaming rewrites, and it is
 * right for the same reason — a day whose transcripts are half-rotated reads *smaller* than
 * the same day did last week, and the fuller reading is the true one.
 *
 * Note this takes a day's total for a model, never a single event. Banking events one at a
 * time with max-wins would keep the largest single call and throw away the rest of the day.
 *
 * The consequence to be honest about: a reading that was wrong high is cemented. That is what
 * `tokenchit ledger --rebuild` is for.
 */
export function bank(ledger: Ledger, day: string, agent: string, model: string, b: Bucket): void {
  const agents = (ledger.days[day] ??= {});
  const models = (agents[agent] ??= {});
  const seen = models[model];
  if (!seen || sum(b) > sum(seen)) models[model] = b;
}

/**
 * Pass every event through, then top up whatever the bank remembers more of.
 *
 * Live events are yielded untouched and first, so a day the logs still cover keeps its real
 * timestamps and its per-call detail. Their daily totals are accumulated as they go, and only
 * once the stream is exhausted can those be compared against the bank.
 *
 * The comparison is a *top-up*, not a choice between sources. An earlier version replayed
 * only days the live read had not mentioned at all, which silently regressed the case this
 * whole file exists for: retention eats a day gradually, so a half-rotated day is present,
 * smaller than it was, and would have been taken at its diminished value. Emitting the
 * shortfall instead means a day is worth the most anyone ever saw it be worth, whether it is
 * wholly gone or merely thinning.
 *
 * A top-up carries local noon, because the bank stores a day and not a clock. That is a real
 * loss: recovered tokens land in one cell of the hour histogram and the heatmap, exactly as a
 * Codex rollout already does. Totals, windows, streaks and the sparkline — the figures the
 * card actually reports — are unaffected, and a wrong hour is a much smaller lie than a
 * missing fortnight.
 *
 * `only` scopes both halves. A run reading just Codex must not have Claude Code days topped
 * up into it, or the card would disagree with the agents the config asked for.
 */
export async function* recordAndReplay(
  events: AsyncIterable<UsageEvent>,
  ledger: Ledger,
  only?: readonly AgentId[],
  out?: Recovered,
): AsyncIterable<UsageEvent> {
  const scoped = (agent: string): boolean => !only?.length || only.includes(agent as AgentId);
  const live = new Map<string, Bucket>();

  for await (const event of events) {
    yield event;
    if (!scoped(event.agent)) continue;

    const k = key(localDay(event.ts), event.agent, event.model);
    const acc = live.get(k);
    if (acc) {
      acc[0] += event.input;
      acc[1] += event.output;
      acc[2] += event.cacheWrite;
      acc[3] += event.cacheRead;
    } else {
      live.set(k, [event.input, event.output, event.cacheWrite, event.cacheRead]);
    }
  }

  const recoveredDays = new Set<string>();
  let recoveredTokens = 0;

  for (const [day, agents] of Object.entries(ledger.days)) {
    const ts = noon(day);
    if (!ts) continue;

    for (const [agent, models] of Object.entries(agents)) {
      if (!scoped(agent)) continue;

      for (const [model, banked] of Object.entries(models)) {
        const now = live.get(key(day, agent, model)) ?? [0, 0, 0, 0];
        const short = sum(banked) - sum(now);
        if (short <= 0) continue;

        const top: Bucket = [
          Math.max(0, banked[0] - now[0]),
          Math.max(0, banked[1] - now[1]),
          Math.max(0, banked[2] - now[2]),
          Math.max(0, banked[3] - now[3]),
        ];
        if (sum(top) <= 0) continue;

        recoveredDays.add(day);
        recoveredTokens += sum(top);
        yield { agent: agent as AgentId, ts, model, input: top[0], output: top[1], cacheWrite: top[2], cacheRead: top[3] };
      }
    }
  }

  // Banked after the comparison, so the shortfall above is measured against the previous
  // state rather than against a bank this same run has already raised.
  for (const [k, b] of live) {
    const [day, agent, model] = k.split(SEP) as [string, string, string];
    bank(ledger, day, agent, model, b);
  }

  if (out) {
    out.days = recoveredDays.size;
    out.tokens = recoveredTokens;
  }
}

/** Local noon on a `YYYY-MM-DD`, so `localDay` gives the same day back in any timezone. */
function noon(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** What the bank holds, for `tokenchit ledger` and the line `sync` prints. */
export function ledgerSummary(ledger: Ledger): {
  days: number;
  tokens: number;
  agents: string[];
  first: string | null;
  last: string | null;
} {
  const days = Object.keys(ledger.days).sort();
  const agents = new Set<string>();
  let tokens = 0;

  for (const byAgent of Object.values(ledger.days)) {
    for (const [agent, models] of Object.entries(byAgent)) {
      agents.add(agent);
      for (const b of Object.values(models)) tokens += sum(b);
    }
  }

  return { days: days.length, tokens, agents: [...agents].sort(), first: days[0] ?? null, last: days.at(-1) ?? null };
}

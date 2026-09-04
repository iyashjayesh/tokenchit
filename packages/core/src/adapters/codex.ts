import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import type { Adapter, Detection, UsageEvent } from "../types.js";
import { walkFiles } from "./walk.js";

const defaultRoot = () => join(homedir(), ".codex", "sessions");

type TokenUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
};

type CodexLine = {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    model?: string;
    info?: { total_token_usage?: TokenUsage } | null;
  };
};

/**
 * Codex stores rollout files under `sessions/YYYY/MM/DD/`, and reports usage as a running
 * total that grows with every turn — verified on a real session as 132 monotonically
 * increasing `token_count` events from 29,781 up to 12,302,532. Summing those events would
 * overcount by orders of magnitude, so each file contributes one event carrying the growth
 * across that file: its final total less the value it started from.
 *
 * The consequence is a known coarseness we do not paper over: a Codex session that spans
 * midnight lands entirely on the date of its last turn, because a cumulative counter cannot
 * be split back into days. Sessions are short enough that this moves a day boundary, never
 * a total.
 */
export function createCodex(root = defaultRoot()): Adapter {
  return {
    id: "codex",
    name: "Codex",
    source: "~/.codex/sessions/**/rollout-*.jsonl",

    async detect(): Promise<Detection> {
      const dir = await stat(root).catch(() => null);
      if (!dir?.isDirectory()) return "absent";

      for await (const file of walkFiles(root, ".jsonl")) {
        if (await lastTotal(file)) return "ready";
      }
      return "installed-no-data";
    },

    async *read(): AsyncIterable<UsageEvent> {
      for await (const file of walkFiles(root, ".jsonl")) {
        const last = await lastTotal(file);
        if (last) yield last;
      }
    },
  };
}

export const codex: Adapter = createCodex();

/** Read one rollout file and return an event for its final cumulative total, if any. */
async function lastTotal(file: string): Promise<UsageEvent | null> {
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let usage: TokenUsage | null = null;
  /*
   * The counter's value before this session did any work.
   *
   * A fresh rollout's first token_count already reflects its first turn — around 20-30k on
   * real sessions — so subtracting it costs one turn, measured at 0.42% across a real corpus.
   * A resumed rollout starts at whatever the previous session reached, and taking the final
   * total would then count all of that again. Every resume compounds, which is what a chain
   * of 42M, 2.8B, 24.6B, 42.4B codex days looks like from the outside.
   *
   * Subtracting the baseline is right in both cases and cheap in the harmless one.
   */
  let baseline: TokenUsage | null = null;
  let at: string | undefined;
  // Codex names the model per turn, not per session, so the last turn wins — which is also
  // the turn the final cumulative total belongs to.
  let model = "unknown";

  for await (const line of lines) {
    if (!line.includes('"token_count"') && !line.includes('"model"')) continue;

    let row: CodexLine;
    try {
      row = JSON.parse(line) as CodexLine;
    } catch {
      continue;
    }

    if (row.type === "turn_context" && row.payload?.model) {
      model = row.payload.model;
      continue;
    }

    if (row.type !== "event_msg" || row.payload?.type !== "token_count") continue;

    // `info` is null on rate-limit-only heartbeats, which are common and carry no usage.
    const total = row.payload.info?.total_token_usage;
    if (!total) continue;

    baseline ??= total;
    usage = total;
    at = row.timestamp;
  }

  if (!usage) return null;

  const ts = at ? new Date(at) : null;
  if (!ts || Number.isNaN(ts.getTime())) return null;

  /*
   * The growth across this file, not its final reading. Clamped at zero because a counter is
   * only assumed to rise, and a file that contradicts that should contribute nothing rather
   * than a negative.
   */
  const grew = (field: keyof TokenUsage) =>
    Math.max(0, (usage![field] ?? 0) - (baseline === usage ? 0 : (baseline?.[field] ?? 0)));

  // Codex reports cached input inside `input_tokens`, not beside it, so subtracting keeps
  // the four buckets disjoint and the sum equal to the total it reports.
  const cacheRead = grew("cached_input_tokens");
  const input = Math.max(0, grew("input_tokens") - cacheRead);

  return {
      agent: "codex",
      ts,
      model,
      input,
      output: grew("output_tokens"),
      cacheWrite: 0,
      cacheRead,
  };
}

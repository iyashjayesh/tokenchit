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
 * overcount by orders of magnitude, so each file contributes exactly one event carrying its
 * final total.
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

    usage = total;
    at = row.timestamp;
  }

  if (!usage) return null;

  const ts = at ? new Date(at) : null;
  if (!ts || Number.isNaN(ts.getTime())) return null;

  // Codex reports cached input inside `input_tokens`, not beside it, so subtracting keeps
  // the four buckets disjoint and the sum equal to the total it reports.
  const cacheRead = usage.cached_input_tokens ?? 0;
  const input = Math.max(0, (usage.input_tokens ?? 0) - cacheRead);

  return {
      agent: "codex",
      ts,
      model,
      input,
      output: usage.output_tokens ?? 0,
      cacheWrite: 0,
      cacheRead,
  };
}

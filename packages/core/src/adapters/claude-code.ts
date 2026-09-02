import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import type { Adapter, Detection, UsageEvent } from "../types.js";
import { walkFiles } from "./walk.js";

const defaultRoot = () => join(homedir(), ".claude", "projects");

/**
 * Models that appear in the logs but never correspond to a billable request. `<synthetic>`
 * is Claude Code's marker for locally generated messages; `default` shows up before a model
 * has been resolved. Both carry zero usage, so they only matter because leaving them in
 * would pollute the model breakdown with rows that can never be priced.
 */
const NON_MODELS = new Set(["<synthetic>", "default", "unknown"]);

type ClaudeLine = {
  timestamp?: string;
  requestId?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
};

/**
 * Claude Code writes one JSONL file per session under a per-project directory, and the same
 * assistant message can be written more than once — a resumed session replays earlier turns
 * into the new file, and sidechain (subagent) transcripts repeat their parent's entries.
 * Measured on a real 298 MB corpus, 11,499 usage rows collapse to 6,185 distinct messages,
 * so skipping the dedup would very nearly double every figure on the card.
 *
 * Sidechain entries are *kept*. Subagent tokens are tokens the user really spent; the
 * `(message.id, requestId)` key already removes the duplication that sidechains introduce.
 */
export function createClaudeCode(root = defaultRoot()): Adapter {
  return {
    id: "claude-code",
    name: "Claude Code",
    source: "~/.claude/projects/**/*.jsonl",

    async detect(): Promise<Detection> {
      const dir = await stat(root).catch(() => null);
      if (!dir?.isDirectory()) return "absent";
      for await (const _ of walkFiles(root, ".jsonl")) return "ready";
      return "installed-no-data";
    },

    async *read(): AsyncIterable<UsageEvent> {
      const seen = new Set<string>();

      for await (const file of walkFiles(root, ".jsonl")) {
        const lines = createInterface({
          input: createReadStream(file, { encoding: "utf8" }),
          crlfDelay: Infinity,
        });

        for await (const line of lines) {
          // Cheap prefilter. Most lines in a transcript are prompts, tool calls and tool
          // results; only assistant replies carry usage, and parsing the rest of a 298 MB
          // corpus to discover that costs seconds.
          if (!line.includes('"usage"')) continue;

          let row: ClaudeLine;
          try {
            row = JSON.parse(line) as ClaudeLine;
          } catch {
            continue; // A partially flushed final line is normal in a live session.
          }

          const msg = row.message;
          const usage = msg?.usage;
          if (!usage || msg?.role !== "assistant") continue;

          const key = `${msg.id ?? ""}:${row.requestId ?? ""}`;
          if (key === ":" || seen.has(key)) continue;
          seen.add(key);

          const model = msg.model ?? "unknown";
          if (NON_MODELS.has(model)) continue;

          const ts = row.timestamp ? new Date(row.timestamp) : null;
          if (!ts || Number.isNaN(ts.getTime())) continue;

          yield {
            agent: "claude-code",
            ts,
            model,
            input: usage.input_tokens ?? 0,
            output: usage.output_tokens ?? 0,
            cacheWrite: usage.cache_creation_input_tokens ?? 0,
            cacheRead: usage.cache_read_input_tokens ?? 0,
          };
        }
      }
    },
  };
}

export const claudeCode: Adapter = createClaudeCode();

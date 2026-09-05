import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import type { Adapter, Detection, UsageEvent } from "../types.js";
import { walkFiles } from "./walk.js";

/**
 * Every Claude Code configuration directory on this machine.
 *
 * Reading only `~/.claude` was wrong: anyone with more than one account has several. On the
 * machine this was fixed on there were four — `.claude`, `.claude-personal`, `.claude-spark`
 * and `.claude-work` — and three of them were invisible to the card, which is most of why the
 * reported total looked nothing like the figure Claude Code shows.
 *
 * `CLAUDE_CONFIG_DIR` is added to the scan rather than replacing it. It names the directory
 * the *current* session uses, which is not the same question as "where is all my usage" —
 * on a machine with several accounts the other three still hold real tokens, and a card
 * claiming to total your usage should not omit them because of one environment variable.
 */
export async function claudeRoots(): Promise<string[]> {
  const roots = new Set<string>();

  const configured = process.env["CLAUDE_CONFIG_DIR"];
  if (configured) roots.add(join(configured, "projects"));

  const home = homedir();
  let entries: string[];
  try {
    entries = await readdir(home);
  } catch {
    roots.add(join(home, ".claude", "projects"));
    return [...roots];
  }

  for (const name of entries.sort()) {
    // `.claude` and `.claude-<profile>`, but never `.claude.json` or a `.bak` beside it.
    if (name !== ".claude" && !name.startsWith(".claude-")) continue;
    roots.add(join(home, name, "projects"));
  }

  const usable: string[] = [];
  for (const root of roots) {
    if ((await stat(root).catch(() => null))?.isDirectory()) usable.push(root);
  }
  return usable;
}

/**
 * Models that appear in the logs but never correspond to a billable request. `<synthetic>`
 * is Claude Code's marker for locally generated messages; `default` shows up before a model
 * has been resolved. Both carry zero usage, so they only matter because leaving them in
 * would pollute the model breakdown with rows that can never be priced.
 */
const NON_MODELS = new Set(["<synthetic>", "default", "unknown"]);

const total = (e: UsageEvent): number => e.input + e.output + e.cacheWrite + e.cacheRead;

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
export function createClaudeCode(roots?: string[] | string): Adapter {
  const resolve = async (): Promise<string[]> =>
    roots === undefined ? claudeRoots() : Array.isArray(roots) ? roots : [roots];

  return {
    id: "claude-code",
    name: "Claude Code",
    source: "~/.claude*/projects/**/*.jsonl",

    async detect(): Promise<Detection> {
      const found = await resolve();
      if (found.length === 0) return "absent";

      let anyDir = false;
      for (const root of found) {
        if (!(await stat(root).catch(() => null))?.isDirectory()) continue;
        anyDir = true;
        for await (const _ of walkFiles(root, ".jsonl")) return "ready";
      }
      return anyDir ? "installed-no-data" : "absent";
    },

    async *read(): AsyncIterable<UsageEvent> {
      // Keyed rather than a Set, because a duplicate is not always a replay. Claude Code
      // writes an assistant message repeatedly as it streams, with output_tokens growing
      // each time and the other three buckets already final:
      //
      //   2/1/13364/4780   then   2/305/13364/4780
      //
      // Keeping the first occurrence therefore kept a partial output count and discarded the
      // finished one — 2,826 messages were undercounted this way in a single directory. The
      // largest total per key is the completed write.
      const best = new Map<string, UsageEvent>();

      for (const root of await resolve()) {
        for await (const file of walkFiles(root, ".jsonl")) {
          /*
           * One unreadable file is not a failed sync.
           *
           * A corrupt *line* was already tolerated — the JSON.parse below skips it — but an
           * unreadable *file* threw out of the generator and aborted the whole scan, so every
           * other transcript and every other agent went with it and the user got nothing. A
           * root-owned transcript left by a `sudo` run is enough to trigger it: EACCES, and no
           * card. The stats-cache reader beside this one already takes the other view, that a
           * file we cannot read is an absent answer rather than an error, and it is the right
           * one here too.
           *
           * The stream is opened inside the try because that is where the error surfaces —
           * createReadStream defers the open, so the throw arrives on first read.
           */
          let lines;
          try {
            lines = createInterface({
              input: createReadStream(file, { encoding: "utf8" }),
              crlfDelay: Infinity,
            });
          } catch {
            continue;
          }

          try {
          for await (const line of lines) {
            // Cheap prefilter. Most lines in a transcript are prompts, tool calls and tool
            // results; only assistant replies carry usage, and parsing the rest of a corpus
            // this size to discover that costs seconds.
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
            if (key === ":") continue;

            const model = msg.model ?? "unknown";
            if (NON_MODELS.has(model)) continue;

            const ts = row.timestamp ? new Date(row.timestamp) : null;
            if (!ts || Number.isNaN(ts.getTime())) continue;

            const event: UsageEvent = {
              agent: "claude-code",
              ts,
              model,
              input: usage.input_tokens ?? 0,
              output: usage.output_tokens ?? 0,
              cacheWrite: usage.cache_creation_input_tokens ?? 0,
              cacheRead: usage.cache_read_input_tokens ?? 0,
            };

            const previous = best.get(key);
            if (!previous || total(event) > total(previous)) best.set(key, event);
          }
          } catch {
            /* Unreadable partway through — keep whatever this file already yielded and move on
               rather than discarding every other file's work. */
            continue;
          }
        }
      }

      yield* best.values();
    },
  };
}

export const claudeCode: Adapter = createClaudeCode();

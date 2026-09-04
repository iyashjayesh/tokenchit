import type { Adapter, AgentId, UsageEvent } from "../types.js";
import { claudeCode } from "./claude-code.js";
import { codex } from "./codex.js";
import { opencode } from "./opencode.js";

export { claudeCode, createClaudeCode } from "./claude-code.js";
export { codex, createCodex } from "./codex.js";
export { opencode, createOpenCode } from "./opencode.js";
export { unsupported, type UnsupportedProbe } from "./unsupported.js";

export const adapters: Adapter[] = [claudeCode, codex, opencode];

export const adapterById = (id: AgentId): Adapter | undefined =>
  adapters.find((a) => a.id === id);

/** Where a scan has got to, for a caller that wants to say so. */
export type ScanProgress = { agent: AgentId; events: number };

/** Often enough to look alive, rarely enough that redrawing is not the expensive part. */
const PROGRESS_EVERY = 250;

/**
 * Read every requested adapter in turn. Sequential rather than interleaved: the work is
 * disk-bound on one machine, and reading a 298 MB transcript tree alongside two SQLite
 * queries gains nothing but makes a failure much harder to attribute.
 *
 * `onProgress` exists because a scan that reports nothing is indistinguishable from a hang.
 * On a large corpus this walks thousands of files, and a caller that can name the agent and
 * the count turns "it is stuck" into "it is on opencode, and the number is still moving" —
 * which is the difference between a bug report and a wait.
 */
export async function* readAll(
  only?: AgentId[],
  onProgress?: (p: ScanProgress) => void,
): AsyncIterable<UsageEvent> {
  const wanted = only?.length ? adapters.filter((a) => only.includes(a.id)) : adapters;

  for (const adapter of wanted) {
    if ((await adapter.detect()) !== "ready") continue;

    // Reported before the first event, so an adapter that is slow to yield anything at all
    // still shows which one is being waited on.
    onProgress?.({ agent: adapter.id, events: 0 });

    let events = 0;
    for await (const event of adapter.read()) {
      if (++events % PROGRESS_EVERY === 0) onProgress?.({ agent: adapter.id, events });
      yield event;
    }
    onProgress?.({ agent: adapter.id, events });
  }
}

export { claudeRoots } from "./claude-code.js";
export * from "./claude-stats.js";

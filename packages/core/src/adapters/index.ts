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

/**
 * Read every requested adapter in turn. Sequential rather than interleaved: the work is
 * disk-bound on one machine, and reading a 298 MB transcript tree alongside two SQLite
 * queries gains nothing but makes a failure much harder to attribute.
 */
export async function* readAll(only?: AgentId[]): AsyncIterable<UsageEvent> {
  const wanted = only?.length ? adapters.filter((a) => only.includes(a.id)) : adapters;

  for (const adapter of wanted) {
    if ((await adapter.detect()) !== "ready") continue;
    yield* adapter.read();
  }
}

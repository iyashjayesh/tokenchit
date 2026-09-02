import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Agents we can detect but cannot total.
 *
 * These are reported by `tokenstats init` rather than quietly omitted. A user with Copilot
 * CLI installed will otherwise assume detection is broken, and the honest answer — the data
 * simply is not written to disk — is more useful than silence. If either tool starts
 * recording cumulative usage, these become real adapters.
 */
export type UnsupportedProbe = {
  name: string;
  source: string;
  /** Why it cannot be counted, phrased for a user reading terminal output. */
  reason: string;
  installed(): Promise<boolean>;
};

const exists = (path: string) => stat(path).then(Boolean).catch(() => false);

export const unsupported: UnsupportedProbe[] = [
  {
    name: "Copilot CLI",
    source: "~/.copilot/data.db",
    reason:
      "records only a live context-window gauge (session_context_usage), never a cumulative total",
    installed: () => exists(join(homedir(), ".copilot", "data.db")),
  },
  {
    name: "Gemini CLI",
    source: "~/.gemini/tmp/*/chats/*.jsonl",
    reason: "writes chat transcripts with no token counts in them at all",
    installed: () => exists(join(homedir(), ".gemini")),
  },
];

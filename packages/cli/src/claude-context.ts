import {
  claudeReadings,
  claudeRoots,
  readClaudeStatsPanels,
} from "@tokenchit/core/adapters";
import type { AgentId, Stats } from "@tokenchit/core";

/**
 * The three readings of this machine's Claude Code usage, or null when there is nothing to
 * compare against — no claude-code in the config, no cache on disk, or a machine where the
 * transcripts are complete and all three numbers are the same one.
 */
export async function claudeContext(stats: Stats, agents: readonly AgentId[]) {
  /*
   * An empty list means every agent, not no agent.
   *
   * That is `readAll`'s convention — `only?.length ? filter : adapters` — and it is what
   * `DEFAULT_CONFIG` ships, so it is the case on every machine that has not hand-listed its
   * agents. Reading it the other way made the estimate silently unreachable for exactly the
   * users who never edited their config, which is most of them: the card said 10.8B where it
   * meant ~15.9B, with no way to tell the difference from the outside.
   */
  if (agents.length > 0 && !agents.includes("claude-code")) return null;

  const verified = stats.byAgent.get("claude-code") ?? 0;
  if (verified <= 0) return null;

  const ourDaily = new Map<string, number>();
  for (const [day, byAgent] of stats.dayAgent) {
    const cell = byAgent.get("claude-code");
    if (cell) ourDaily.set(day, cell.tokens);
  }

  const panels = await readClaudeStatsPanels(await claudeRoots()).catch(() => []);
  return claudeReadings(panels, ourDaily, verified);
}

/**
 * The headline figure: every agent's tokens, plus the Claude Code days that are gone.
 *
 * `ClaudeReadings.estimated` is deliberately Claude-only — it answers "what has this agent
 * really used", which is the question the readings block asks. Printing it as the headline
 * answered a different question, because the headline is labelled TOKENS and covers every
 * agent: a machine with 55.8M of Codex and OpenCode usage had all of it silently dropped the
 * moment an estimate existed, and a Codex-heavy machine would lose most of its total.
 *
 * So the estimate contributes only its *unseen* part, added to the real total rather than
 * replacing it. Null when there is nothing to estimate, so callers can print a plain figure
 * without a tilde.
 */
export function estimatedTotal(
  stats: Stats,
  claude: Awaited<ReturnType<typeof claudeContext>>,
): number | null {
  if (claude?.estimated == null) return null;
  const unseen = claude.estimated - claude.verified;
  return unseen > 0 ? stats.tokens + unseen : null;
}

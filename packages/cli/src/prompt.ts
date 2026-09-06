import { createInterface } from "node:readline/promises";

/**
 * Ask one question, but only when there is someone there to answer it.
 *
 * The CLI had no interactive input at all, which made the flagship path end badly: `generate`
 * in a directory with no git remote detected the agents, warned that no handle was set, and
 * then wrote a real committable card reading `@dev`. Refusing to ask the single question it
 * needs is a strange thing for a command aimed at someone who has read one line on a website —
 * `npm init`, `gh repo create` and `vercel` all prompt at a terminal.
 *
 * Everything about this is conditional on a TTY. In CI, a cron job, or a pipe there is nobody
 * to type, and a prompt there is a hang rather than a question, so callers keep whatever
 * non-interactive behaviour they had.
 */
export const interactive = (): boolean =>
  Boolean(process.stdin.isTTY) && Boolean(process.stderr.isTTY) && !process.env["CI"];

/**
 * The answer, the default when the reader just presses return, or null if they declined.
 *
 * Asked on stderr, like every other thing a person rather than a pipe is meant to read, so
 * `--json` stays parseable even if a prompt somehow escapes into a redirected run.
 */
export async function ask(question: string, fallback = ""): Promise<string | null> {
  if (!interactive()) return null;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const shown = fallback ? `${question} (${fallback}): ` : `${question}: `;
    const answer = (await rl.question(`  ${shown}`)).trim();
    return answer || fallback || null;
  } catch {
    // Ctrl-C, a closed stdin, a terminal that went away mid-question. None of those are
    // reasons to crash a command that has a perfectly good non-interactive path.
    return null;
  } finally {
    rl.close();
  }
}

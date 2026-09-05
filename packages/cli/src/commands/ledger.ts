import { rm } from "node:fs/promises";

import { formatTokens, localDay } from "@tokenchit/core";
import { ledgerPath, ledgerSummary, readLedger } from "@tokenchit/core/adapters";

import { has } from "../args.js";
import { DEFAULT_CONFIG, readConfig } from "../config.js";
import { scan } from "../scan.js";
import { bold, dim, fail, green, grey, say, spin, warn } from "../ui.js";

/**
 * Show, or rebuild, the local history bank.
 *
 * The ledger is the one piece of state this tool keeps that cannot be re-derived — that is
 * the entire point of it — so it needs a way to be looked at. Someone whose total moves has a
 * right to see what is behind it without reading JSON.
 */
export async function ledger(argv: string[]): Promise<number> {
  if (has(argv, "--rebuild")) return rebuild(argv);

  const path = ledgerPath();
  const current = await readLedger();
  const s = ledgerSummary(current);

  if (s.days === 0) {
    say();
    say(`  ${bold("Nothing banked yet.")} ${grey("Run")} ${bold("tokenchit sync")} ${grey("to start.")}`);
    say(dim(`  It would live at ${path}`));
    say();
    return 0;
  }

  say();
  say(`  ${bold(formatTokens(s.tokens))} ${grey("banked across")} ${bold(String(s.days))} ${grey("days")}`);
  say(`  ${grey(`${s.first} → ${s.last} · ${s.agents.join(", ")}`)}`);
  say();
  // Both as local days. `since` is written by localDay while updatedAt is an ISO instant, so
  // slicing the latter showed yesterday's date to anyone east of UTC after midnight.
  say(dim(`  since ${current.since} · updated ${localDay(new Date(current.updatedAt))}`));
  say(dim(`  ${path}`));
  say();
  say(`  ${grey("This is history your agent logs may no longer hold. It is never uploaded")}`);
  say(`  ${grey("on its own — it only makes the totals you publish complete.")}`);
  say();
  say(dim("  --rebuild   discard it and re-derive from the logs still on disk"));
  say();
  return 0;
}

/**
 * Throw the bank away and start again from what is on disk.
 *
 * The escape hatch for the one real hazard of a max-wins bank: a reading that was wrong high
 * is otherwise kept forever. It is genuinely destructive — days the logs no longer cover are
 * gone for good, which is exactly the history the ledger existed to protect — so it states
 * what will be lost and requires `--yes` rather than a prompt, because a prompt is not
 * available in the cron job where this is most likely to be typed by mistake.
 */
async function rebuild(argv: string[]): Promise<number> {
  const path = ledgerPath();

  /* Read the config before the warning, not after. The rebuild only re-derives the agents this
     repo's config names, so those are the only agents it may clear — and the warning has to
     quote that same scope or it describes a different operation than the one about to run. */
  const config = (await readConfig()) ?? DEFAULT_CONFIG;
  const ledger = await readLedger();
  const before = ledgerSummary(ledger, config.agents);
  const whole = ledgerSummary(ledger);

  if (!has(argv, "--yes")) {
    const scoped = config.agents.length > 0 && before.agents.length < whole.agents.length;
    say();
    warn(
      scoped
        ? `This discards ${formatTokens(before.tokens)} across ${before.days} banked days for ${before.agents.join(", ")}.`
        : `This discards ${formatTokens(before.tokens)} across ${before.days} banked days.`,
    );
    say(dim(`  Days your logs no longer cover cannot be recovered afterwards.`));
    if (scoped) {
      // Naming what survives is as important as naming what goes: the bank is global to the
      // machine while this config is not, and that mismatch is the whole hazard here.
      const safe = whole.agents.filter((a) => !before.agents.includes(a));
      say(dim(`  ${safe.join(", ")} ${safe.length === 1 ? "is" : "are"} not in this repo's config and will be left alone.`));
    }
    say();
    say(`  ${grey("If that is what you want:")} ${bold("tokenchit ledger --rebuild --yes")}`);
    say();
    return 1;
  }

  const reading = spin("re-reading local agent logs…");
  const { stats } = await scan(config.agents, {
    fresh: true,
    onProgress: ({ agent, events }) =>
      reading.update(events === 0 ? `reading ${agent}…` : `reading ${agent}… ${events.toLocaleString()} events`),
  });
  reading.stop();

  if (stats.tokens === 0) {
    /*
     * Nothing was read, so nothing was banked. Leaving a stale file would be worse than an
     * empty one, but so would silently reporting success.
     *
     * Only remove the file when the bank is empty for every agent. A scoped rebuild that reads
     * nothing must not delete the days it deliberately preserved for the agents it never
     * touched — that would undo the scoping this command now does and lose exactly the history
     * the warning above promised to leave alone.
     */
    const remaining = ledgerSummary(await readLedger());
    if (remaining.tokens === 0) {
      await rm(path, { force: true }).catch(() => {});
      fail("No usage found — the ledger is now empty.");
    } else {
      fail(
        `No usage found for ${config.agents.length ? config.agents.join(", ") : "any configured agent"} — ` +
          `${formatTokens(remaining.tokens)} banked for ${remaining.agents.join(", ")} is untouched.`,
      );
    }
    return 1;
  }

  const after = ledgerSummary(await readLedger(), config.agents);
  say();
  say(`${green("✓")} rebuilt from the logs on disk`);
  say(
    dim(
      `  ${before.days} days (${formatTokens(before.tokens)})  →  ` +
        `${after.days} days (${formatTokens(after.tokens)})`,
    ),
  );
  say();
  return 0;
}

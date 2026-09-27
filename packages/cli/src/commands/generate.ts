import { flag, has } from "../args.js";
import { resolveApi } from "../api.js";
import { ask, interactive } from "../prompt.js";
import { CONFIG_FILE, readConfig } from "../config.js";
import { banner } from "../banner.js";
import { bold, chip, dim, grey, rule, say, step, under, wordmark } from "../ui.js";
import { init } from "./init.js";
import { publish } from "./publish.js";
import { sync } from "./sync.js";

/**
 * The whole flow, in one command.
 *
 * Three commands in the right order is not hard, but it is three things to know before
 * anything happens, and the middle one is easy to skip. `generate` is what someone runs
 * having read one line on a website: it finds the agents, writes the card, and puts the row
 * on the board, narrating each step so nothing happens that was not announced.
 *
 * It is a composition, not a fourth implementation — each step is the command it is named
 * after. Anyone who wants a step on its own can still run it on its own, and `generate`
 * cannot drift away from what those commands do because it *is* them.
 */
export async function generate(argv: string[], version: string): Promise<number> {
  const skipPublish = has(argv, "--no-publish");
  const total = skipPublish ? 2 : 3;

  /* The banner when there is a person and a wide enough window to show it to, and the
     inline wordmark otherwise — a wall of block letters in a CI log is noise. */
  const art = banner("receipts for your robots", `v${version}`);
  if (art.length > 0) {
    for (const line of art) say(line);
  } else {
    say();
    say(`  ${wordmark()}  ${dim(`v${version}`)}`);
  }

  say();
  say(
    `  ${chip("parsed locally", "lime")} ${chip("no prompts sent", "yellow")} ` +
      `${chip("card is a file you commit")}`,
  );
  say(rule());

  /*
   * init only runs when there is nothing to read. Re-running it on an existing repo would
   * overwrite a committed file that somebody may have edited by hand — a command that
   * "just does everything" has to be more careful about what it overwrites, not less.
   */
  const existing = await readConfig();

  say();
  say(
    existing
      ? `${step(1, total, "config")}  ${grey(`${CONFIG_FILE} already here`)}`
      : step(1, total, "detect agents"),
  );

  if (!existing) {
    const code = await init(argv, true);
    if (code !== 0) return code;
  } else {
    say(under(grey(existing.agents.join(", "))));
  }

  say(rule());
  say();
  say(step(2, total, "your stats, and the card"));

  const synced = await sync(argv, true);
  if (synced !== 0) return synced;

  if (skipPublish) {
    say(rule());
    say();
    say(`  ${grey("stopped before publishing")} ${dim("— drop --no-publish to join the board")}`);
    say();
    return 0;
  }

  say(rule());
  say();
  say(step(3, total, "the board"));

  /*
   * Asked before the only step that leaves the machine.
   *
   * `generate` is what someone runs having read one line on a website, and until now that one
   * line ended with their usage history on a public board. At a terminal `publish` does prompt
   * for a sign-in, but a sign-in prompt reads as "prove who you are", not as "this is about to
   * be published" — and declining it is an error path rather than an answer.
   *
   * Gated on `interactive()` — a TTY, on both stdin and stderr, and not CI — so a pipe, a cron
   * entry or a runner keeps exactly the behaviour it had. A prompt there is a hang, not a
   * question. Anyone automating this already chose `generate` over `sync` deliberately.
   */
  if (interactive()) {
    /* No fallback string: `ask` renders one as "(N)" beside the question, which next to an
       explicit [y/N] reads as two different defaults. Empty input returns null and declines. */
    const answer = await ask(`Publish to the public board at ${resolveApi(flag(argv, "--api"))}? [y/N]`);
    if (!/^y(es)?$/i.test(answer ?? "N")) {
      say();
      say(`  ${bold("Kept local.")} ${grey("The card is written and nothing was uploaded.")}`);
      say(`  ${grey("Change your mind with")} ${bold("tokenchit publish")}${grey(".")}`);
      say();
      return 0;
    }
  }

  const published = await publish(argv, version);
  if (published !== 0) {
    // A card on disk is most of the value, and it is already written. Saying so stops a
    // failed upload reading as a failed run.
    say();
    say(`  ${bold("The card was written.")} ${grey("Only publishing failed — retry with")}`);
    say(`  ${bold("tokenchit publish")}${grey(".")}`);
    say();
    return published;
  }

  return 0;
}

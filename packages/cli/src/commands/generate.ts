import { has } from "../args.js";
import { CONFIG_FILE, readConfig } from "../config.js";
import { bold, dim, grey, rule, say, step, wordmark } from "../ui.js";
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

  say();
  say(`  ${wordmark()}  ${dim(`v${version}`)}`);
  say();
  say(`  ${grey("reads your local agent logs, writes a card, puts you on the board")}`);
  say(rule());

  /*
   * init only runs when there is nothing to read. Re-running it on an existing repo would
   * overwrite a committed file that somebody may have edited by hand — a command that
   * "just does everything" has to be more careful about what it overwrites, not less.
   */
  const existing = await readConfig();

  say();
  say(step(1, total, existing ? `config ${grey(`(${CONFIG_FILE} already here)`)}` : "detect agents"));

  if (!existing) {
    const code = await init(argv);
    if (code !== 0) return code;
  } else {
    say(`  ${grey(`  ${existing.agents.join(", ")}`)}`);
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

import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";

import {
  buildPayload,
  formatTokens,
  sanitizeHandle,
  serializePayload,
  validatePayload,
} from "@tokenchit/core";

import { resolveApi } from "../api.js";
import { flag, has } from "../args.js";
import { claudeContext, estimatedTotal } from "../claude-context.js";
import { scan } from "../scan.js";
import { readAuth } from "../auth.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig } from "../config.js";
import { asUrlPath, bold, dim, fail, green, grey, link, say, spin, warn, yellow } from "../ui.js";
import { canOpenBrowser, openBrowser } from "../desktop.js";
import { post } from "../net.js";
import { signIn, signInOptions } from "./login.js";

/**
 * The only command that sends anything anywhere.
 *
 * Kept separate from `sync` on purpose, and with no config switch to make `sync` do it:
 * `.tokenchit.json` is a committed file, and a committed file must never be able to cause a
 * network call on somebody else's machine.
 */
export async function publish(argv: string[], version: string): Promise<number> {
  const config = (await readConfig()) ?? DEFAULT_CONFIG;

  const api = resolveApi(flag(argv, "--api"));
  const dryRun = has(argv, "--dry-run");
  const anonymous = has(argv, "--anonymous");

  let auth = await readAuth();

  /*
   * Signing in is part of publishing, not an errand to be sent away on: an unverified row is
   * something almost nobody wants, and telling someone to go and run another command first is
   * how they end up with one.
   *
   * Gated on a TTY. Without one — CI, a cron entry, a pipe — there is nobody to read a device
   * code, so the old behaviour stands and the row publishes unverified. `--anonymous` is the
   * same choice made deliberately at a terminal.
   */
  if (!auth && !dryRun && !anonymous && process.stdout.isTTY) {
    say();
    say(`  ${bold("Sign in to publish a verified row.")}`);
    say(grey("  Skip with --anonymous; the row is then marked unverified."));
    const result = await signIn(api, signInOptions(argv));
    if (!result.ok) return 1;
    auth = await readAuth();
  }

  // Signing in settles the handle: publishing under a different name would be rejected by
  // the server anyway, so the local default follows the account.
  const rawHandle = flag(argv, "--handle") ?? auth?.handle ?? config.handle;
  const handle = sanitizeHandle(rawHandle);

  if (!rawHandle) {
    fail(`No handle set. Add one to ${CONFIG_FILE}, or pass --handle <you>.`);
    return 1;
  }

  /* An error here rather than the warning `sync` gives, because this one is a public claim.
     `my.name` sanitises to `myname`, which may be somebody else's real account, and a row
     submitted under a name the user never typed is not something to fix up silently. */
  if (handle !== rawHandle) {
    fail(`"${rawHandle}" is not a valid GitHub handle. Did you mean --handle ${handle}?`);
    return 1;
  }

  const reading = spin("reading local agent logs…");
  /* Named and counted, because a scan that reports nothing looks the same as one that has
     hung. On a large corpus this walks thousands of files over several seconds. */
  const { stats } = await scan(config.agents, {
    // A dry run prints the exact bytes and sends nothing; it must not bank anything either.
    write: !dryRun,
    onProgress: ({ agent, events }) =>
      reading.update(
        events === 0
          ? `reading ${agent}…`
          : `reading ${agent}… ${events.toLocaleString()} events`,
      ),
  });
  reading.stop();

  if (stats.tokens === 0) {
    warn("No usage found. Run `tokenchit init` to see which agents were detected.");
    return 1;
  }

  /* The same estimate the card carries, so a profile shows the headline its card shows.
     Ranked on `tokens` regardless — see the note on the field. */
  const claude = await claudeContext(stats, config.agents);
  const payload = buildPayload(stats, { handle, clientVersion: version });
  const estimated = estimatedTotal(stats, claude);
  if (estimated != null) payload.estimatedTokens = estimated;
  const body = serializePayload(payload);

  // Validated here as well as on the server so that a rejection is explained on the machine
  // that can do something about it, before anything is sent.
  const errors = validatePayload(payload);
  if (errors.length > 0) {
    fail("This submission would be rejected:");
    for (const e of errors) say(`  ${yellow("·")} ${e}`);
    return 1;
  }

  if (dryRun) {
    // Exactly the bytes that would be POSTed — same string, not a re-rendering of it. Nothing
    // decorative may join it on stdout, which is what the dryrun.exact test pins down.
    process.stdout.write(`${body}\n`);
    say();
    say(dim(`  ${body.length} bytes would be sent to ${api}/api/submissions`));
    say(dim("  nothing was sent"));
    return 0;
  }

  const sending = spin(
    `publishing ${payload.days.length} days · ${formatTokens(stats.tokens)} tokens…`,
  );
  const res = await post(`${api}/api/submissions`, body, auth?.token);
  sending.stop();

  if (res.status === 429) {
    // The server names the wait; repeating it beats a bare "rejected (429)".
    fail(res.reasons?.[0] ?? "rate limited — try again shortly");
    return 1;
  }

  if (!res.ok) {
    fail(`rejected by ${api} (${res.status})`);
    for (const reason of res.reasons ?? []) say(`  ${yellow("·")} ${reason}`);
    if (!res.reasons && res.text) say(dim(`  ${res.text.slice(0, 300)}`));
    return 1;
  }

  const tier = res.body?.tier ?? "cli";

  say();
  say(
    `${green("✓")} published as ${bold(`@${payload.handle}`)} ` +
      `${dim(`· ${payload.days.length} days · ${formatTokens(stats.tokens)} tokens · tier: ${tier}`)}`,
  );
  say();

  /* A row held for review still has a profile, so the links below stand — but saying nothing
     would leave someone refreshing a board they are never going to appear on. */
  const review = res.body?.review;
  if (typeof review === "string" && review) {
    warn("This submission is held for review and will not appear on the board yet.");
    say(dim(`  ${review}`));
    say(dim("  Nothing was rejected — open an issue if this looks wrong."));
    say();
  }

  // The point of publishing. Printed last, because this is what someone actually wants out
  // of the command, and printed as full URLs so they survive a copy out of scrollback.
  const profile = `${api}/u/${payload.handle}`;
  say(`  ${grey("your profile")}   ${link(profile)}`);
  say(`  ${grey("leaderboard")}    ${link(`${api}/board`)}`);
  say();

  /*
   * The embed line, repeated here.
   *
   * `sync` prints it, and `generate` therefore shows it once on the way past — but `publish`
   * run on its own never mentioned the card at all, and `publish` is the command someone
   * re-runs. So the whole flow ended on two links to someone else's website, for a tool whose
   * entire argument is that the card belongs in your repo.
   *
   * Measured rather than assumed: of the 34 rows on the board at the time of writing, two
   * carried a card in the author's profile README. Twelve more had a profile README and no
   * card — people who had published a row and never took the last step, because the command
   * that put them on the board did not ask them to.
   */
  const target = resolve(config.output);
  const card = relative(process.cwd(), target);

  /* Only offered when the card is actually on disk. `publish` does not write one, so someone
     who ran `init` then `publish` has no file — and `git add <card>` would fail with "did not
     match any files", which is a worse first experience than not being told. */
  if (existsSync(target)) {
    say(`  ${grey("embed")}     ![tokenchit — @${payload.handle} AI coding agent usage](./${asUrlPath(card)})`);
    say(`  ${grey("commit")}    git add ${card} && git commit -m "chore: update tokenchit"`);
  } else {
    say(`  ${grey("the card")}   ${bold("tokenchit sync")} ${dim(`— writes ${card}, which is the point of the row above`)}`);
  }
  say();

  /*
   * Open the profile, once, on the run that created it.
   *
   * The command has just spent a page of terminal output describing a thing whose whole point
   * is being looked at and shared, and then left the person to select a URL out of scrollback.
   * Every comparable tool — `vercel`, `gh repo create`, `create-next-app` — hands over to the
   * browser at exactly this moment.
   *
   * `?published=1` is what tells the page this is the arrival rather than a visit, so it can
   * show the card and the share actions. The page strips it immediately, because a URL copied
   * out of the address bar and sent to somebody else must not greet them as though they had
   * just published.
   *
   * Everything about it is best-effort and silent. `canOpenBrowser` refuses in CI, over SSH,
   * without a TTY and on a Linux session with no display; `--no-browser` refuses on request;
   * and a launcher that fails says nothing, because the URL two lines above is the real
   * answer and it is already on screen.
   */
  if (!has(argv, "--no-browser") && canOpenBrowser()) {
    await openBrowser(`${profile}?published=1`);
  }

  if (tier === "cli" && !auth) {
    say(dim("  This row is marked unverified — nothing has proved the handle is yours."));
    say(dim("  Run `tokenchit login` to upgrade it."));
    say();
  }

  return 0;
}

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
import { bold, dim, fail, green, grey, link, say, spin, warn, yellow } from "../ui.js";
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
  say(`  ${grey("your profile")}   ${link(`${api}/u/${payload.handle}`)}`);
  say(`  ${grey("leaderboard")}    ${link(`${api}/board`)}`);
  say();

  if (tier === "cli" && !auth) {
    say(dim("  This row is marked unverified — nothing has proved the handle is yours."));
    say(dim("  Run `tokenchit login` to upgrade it."));
    say();
  }

  return 0;
}

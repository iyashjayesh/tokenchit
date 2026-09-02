import {
  aggregate,
  buildPayload,
  sanitizeHandle,
  serializePayload,
  validatePayload,
} from "@tokenstats/core";
import { readAll } from "@tokenstats/core/adapters";

import { resolveApi } from "../api.js";
import { flag, has } from "../args.js";
import { readAuth } from "../auth.js";
import { CONFIG_FILE, DEFAULT_CONFIG, readConfig } from "../config.js";
import { bold, dim, fail, green, say, warn, yellow } from "../ui.js";
import { post } from "../net.js";


/**
 * The only command that sends anything anywhere.
 *
 * Kept separate from `sync` on purpose, and with no config switch to make `sync` do it:
 * `.tokenstats.json` is a committed file, and a committed file must never be able to cause a
 * network call on somebody else's machine.
 */
export async function publish(argv: string[], version: string): Promise<number> {
  const config = (await readConfig()) ?? DEFAULT_CONFIG;

  // Signing in settles the handle: publishing under a different name would be rejected by
  // the server anyway, so the local default follows the account.
  const auth = await readAuth();
  const rawHandle = flag(argv, "--handle") ?? auth?.handle ?? config.handle;
  const handle = sanitizeHandle(rawHandle);
  const api = resolveApi(flag(argv, "--api"));
  const dryRun = has(argv, "--dry-run");

  if (!rawHandle) {
    fail(`No handle set. Add one to ${CONFIG_FILE}, or pass --handle <you>.`);
    return 1;
  }

  const stats = await aggregate(readAll(config.agents));
  if (stats.tokens === 0) {
    warn("No usage found. Run `tokenstats init` to see which agents were detected.");
    return 1;
  }

  const payload = buildPayload(stats, { handle, clientVersion: version });
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
    // Exactly the bytes that would be POSTed — same string, not a re-rendering of it.
    process.stdout.write(`${body}\n`);
    say();
    say(dim(`  ${body.length} bytes would be sent to ${api}/api/submissions`));
    say(dim("  nothing was sent"));
    return 0;
  }

  say();
  say(dim(`  publishing ${payload.days.length} days to ${api}`));

  const res = await post(`${api}/api/submissions`, body, auth?.token);

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

  say(`${green("✓")} published as ${bold(`@${payload.handle}`)} ${dim(`(tier: ${res.body?.tier ?? "cli"})`)}`);

  if ((res.body?.tier ?? "cli") === "cli" && !auth) {
    say();
    say(dim("  This row is marked unverified on the board — nothing has proved the handle"));
    say(dim("  is yours. Run `tokenstats login` to upgrade it."));
  }
  say();

  return 0;
}

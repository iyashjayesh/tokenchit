import { writeFile } from "node:fs/promises";

import { resolveApi } from "../api.js";
import { flag, has } from "../args.js";
import { clearAuth, readAuth } from "../auth.js";
import { authed } from "../net.js";
import { ask } from "../prompt.js";
import { bold, dim, fail, green, say, warn } from "../ui.js";

/**
 * Take the row off the board, and take the copy off this machine.
 *
 * There was no way to undo publishing from either side. `logout` cleared the local key and
 * left the public row standing, and the server had no delete at all — so somebody who
 * published once and regretted it had nothing to do but open an issue about it. For a tool
 * whose pitch is that you decide what leaves your machine, "you can put data on a public page
 * but not take it off" is the hole a careful reader finds first.
 *
 * Deliberately one command covering both halves, because "delete everything tokenchit knows
 * about me" is one intention, and making it two commands means someone does one of them.
 */
export async function unpublish(argv: string[]): Promise<number> {
  const auth = await readAuth().catch(() => null);
  const api = resolveApi(flag(argv, "--api")) || auth?.api;

  if (!auth) {
    fail("Not signed in, so there is no row to remove.");
    say(dim("  A row published with --anonymous cannot be withdrawn from here: nothing on"));
    say(dim("  this machine proves it was yours. Open an issue and we will remove it."));
    return 1;
  }

  /* Saved before the delete, not after: once the account is gone the export is gone with it,
     and "I did not realise that was the only copy" is not a thing to learn afterwards. */
  const keep = flag(argv, "--export");
  if (keep) {
    const res = await authed(`${api}/api/me`, auth.token);
    if (!res.ok) {
      fail(`could not export your data (${res.status || "no response"}) — nothing was deleted`);
      return 1;
    }
    await writeFile(keep, `${JSON.stringify(res.body, null, 2)}\n`, "utf8");
    say(`${green("✓")} wrote ${bold(keep)}`);
  }

  // Typed out rather than a y/n: this deletes a history that cannot be rebuilt from logs that
  // retention has already taken, and the ceremony is proportional to that.
  if (!has(argv, "--yes")) {
    say();
    warn(`This removes @${auth.handle} from the board and deletes every submission.`);
    say(dim("  The card in your repo is a file and stays where it is."));
    say(dim("  It cannot be undone — history the logs no longer hold is gone for good."));
    say();

    const typed = await ask(`Type ${auth.handle} to confirm`);
    if (typed === null) {
      fail("Needs --yes when there is nobody to ask.");
      return 1;
    }
    if (typed.toLowerCase() !== auth.handle.toLowerCase()) {
      say("Nothing was deleted.");
      return 1;
    }
  }

  const res = await authed(`${api}/api/me?confirm=delete`, auth.token, "DELETE");
  if (!res.ok) {
    fail(`could not remove your row (${res.status || "no response"}) — nothing was deleted`);
    return 1;
  }

  // The key is dead now anyway — the account it belonged to is gone — so leaving the file
  // behind would only make the next command fail confusingly.
  await clearAuth();

  say();
  say(`${green("✓")} @${auth.handle} removed from the board`);
  say(dim("  Signed out on this machine too; the key went with the account."));
  say(dim("  The local ledger is untouched — delete it yourself if you want that gone:"));
  say(dim("    tokenchit ledger --rebuild --yes   (or remove ~/.config/tokenchit/)"));
  say();
  return 0;
}

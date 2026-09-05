/**
 * Talking to the desktop: the clipboard, and the browser.
 *
 * Both are conveniences layered over output that already stands on its own. The device code
 * and the URL are printed before either is attempted, so a machine with no clipboard tool, no
 * browser, or no graphical session at all loses nothing — which is the common case over SSH
 * and inside containers, exactly where a coding agent tends to run.
 *
 * Nothing here throws. A failed convenience must not fail a sign-in.
 */
import { spawn } from "node:child_process";

/** Candidate commands per platform, tried in order until one exits cleanly. */
const CLIPBOARD: Record<string, string[][]> = {
  darwin: [["pbcopy"]],
  win32: [["clip"]],
  // wl-copy first: a Wayland session usually has no working xclip, and trying it first
  // means the common modern case succeeds on the first attempt rather than the third.
  linux: [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]],
};

const BROWSER: Record<string, string[]> = {
  darwin: ["open"],
  win32: ["cmd", "/c", "start", ""],
  linux: ["xdg-open"],
};

function run(cmd: string[], input?: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd[0]!, cmd.slice(1), { stdio: input === undefined ? "ignore" : ["pipe", "ignore", "ignore"] });
    } catch {
      resolve(false);
      return;
    }

    // ENOENT for a tool that is not installed arrives as an event, not a throw.
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));

    if (input !== undefined && child.stdin) {
      child.stdin.on("error", () => resolve(false));
      child.stdin.end(input);
    }
  });
}

/** Put text on the clipboard. Returns whether it worked, and never throws. */
export async function copyToClipboard(text: string): Promise<boolean> {
  for (const cmd of CLIPBOARD[process.platform] ?? []) {
    if (await run(cmd, text)) return true;
  }
  return false;
}

/**
 * Open a URL in the user's own browser.
 *
 * RFC 8252 requires a native app to hand authorization to an external user-agent rather than
 * an embedded one, and RFC 8628 §3.3.1 explicitly permits "any method that results in the
 * browser being opened with the URI". This is that method.
 *
 * Success here means the launcher exited cleanly, not that anyone saw a window — over SSH,
 * xdg-open can succeed against a display nobody is looking at. That is why the URL is
 * printed either way.
 */
export async function openBrowser(url: string): Promise<boolean> {
  const cmd = BROWSER[process.platform];
  if (!cmd) return false;
  return run([...cmd, url]);
}

/**
 * GitHub's device response carries no `verification_uri_complete` — RFC 8628 §3.2 makes that
 * field optional and GitHub omits it, so there is no protocol-blessed pre-filled URL to use.
 *
 * The verification page takes a `user_code` query parameter, and github.com ignores it. This
 * was believed to fill the box; it does not — tested against a real sign-in, the parameter
 * reaches the address bar and the form stays empty. It is kept because it costs nothing and an
 * enterprise host may honour it, but nothing downstream may claim the code is already entered.
 *
 * `skip_account_picker=true` is deliberately absent. It works, and it removes the click that
 * /login/device/select_account costs anyone with a GitHub session — and it also decides *which*
 * account authorises, silently, by taking whichever one the browser happens to hold. This
 * command exists to establish that a handle belongs to the person claiming it, and a board row
 * published under the wrong one of somebody's two accounts is not obviously wrong until long
 * afterwards. The picker is the one screen in the sequence that asks the question the command
 * is for, so it stays.
 */
export function prefilled(verificationUri: string, userCode: string): string {
  try {
    const url = new URL(verificationUri);
    url.searchParams.set("user_code", userCode);
    return url.toString();
  } catch {
    return verificationUri;
  }
}

import { resolveApi } from "../api.js";
import { flag } from "../args.js";
import { readAuth, writeAuth, clearAuth, authFile } from "../auth.js";
import { copyToClipboard, openBrowser, prefilled } from "../desktop.js";
import { post, postForm } from "../net.js";
import { bold, cyan, dim, fail, green, grey, say, spin, warn } from "../ui.js";

/**
 * Public by design. Device flow uses no client secret — that is the whole reason it is safe
 * to ship an OAuth client inside a CLI that anybody can read. Overridable so the flow can be
 * pointed at a throwaway app during development.
 */
const CLIENT_ID = process.env["TOKENCHIT_CLIENT_ID"] ?? "Ov23liSMxVycJS63ZqN5";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

export type SignInResult = { ok: boolean; handle?: string };

export type SignInOptions = {
  /** Put the device code on the clipboard. On by default; --no-clipboard opts out. */
  clipboard?: boolean;
  /** Open the verification page. On by default at a TTY; --no-browser opts out. */
  browser?: boolean;
};

/**
 * Prove a GitHub handle is yours, using GitHub's device flow.
 *
 * No redirect, no callback server, no token pasted into a terminal. That matters more than it
 * sounds: the usual OAuth-in-a-CLI approach spins up a localhost listener, which fails over
 * SSH, inside containers, and on remote dev boxes — exactly where someone running a coding
 * agent often is.
 *
 * No scopes are requested. GitHub answers `GET /user` for an unscoped token, and the login
 * and numeric id are all we need. Asking for more would show a scarier consent screen in
 * exchange for access we would then have to be trusted not to use.
 *
 * Split out from the `login` command so `publish` can call it mid-flow: signing in is a step
 * on the way to publishing, not a separate errand to be sent away on.
 */
export async function signIn(api: string, opts: SignInOptions = {}): Promise<SignInResult> {
  const start = await postForm(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: "" });
  if (!start.ok) {
    fail(`GitHub refused the device request: ${String(start.body["error"] ?? start.status)}`);
    if (start.body["error"] === "device_flow_disabled") {
      say(dim("  The OAuth App does not have Device Flow enabled."));
    }
    return { ok: false };
  }

  const deviceCode = String(start.body["device_code"] ?? "");
  const userCode = String(start.body["user_code"] ?? "");
  const verifyUrl = String(start.body["verification_uri"] ?? "https://github.com/login/device");
  const expiresIn = Number(start.body["expires_in"] ?? 900);
  let interval = Number(start.body["interval"] ?? 5);

  /*
   * Printed before anything is attempted, and printed whatever happens afterwards.
   *
   * The clipboard and the browser are conveniences over an instruction that has to stand on
   * its own: over SSH, in a container, or on a machine with no graphical session, both will
   * quietly do nothing, and the person is left with exactly what they had before — a URL and
   * a code. RFC 8628 requires the code be shown in any case, as a phishing mitigation: the
   * point is to confirm the device asking is the one in front of you.
   */
  say();
  say(`  Open  ${bold(verifyUrl)}`);
  say(`  Code  ${bold(cyan(userCode))}`);

  const copied = opts.clipboard === false ? false : await copyToClipboard(userCode);

  // Only at a terminal. Launching a browser from a cron entry or a CI job is at best useless
  // and at worst a window opening on somebody's unattended desktop.
  const opened =
    opts.browser === false || !process.stdout.isTTY
      ? false
      : await openBrowser(prefilled(verifyUrl, userCode));

  if (copied || opened) {
    const did = [opened && "opened your browser", copied && "copied the code"].filter(Boolean);
    say(grey(`  ${did.join(", ")}${opened ? " — the code should already be filled in" : ""}`));
  }
  say();

  const spinner = spin(
    `waiting for authorisation… ${grey(`expires in ${Math.round(expiresIn / 60)}m, Ctrl-C to stop`)}`,
  );

  const deadline = Date.now() + expiresIn * 1000;
  let githubToken = "";

  try {
    while (Date.now() < deadline) {
      await sleep(interval * 1000);

      const poll = await postForm(TOKEN_URL, {
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });

      const error = poll.body["error"];
      if (!error) {
        githubToken = String(poll.body["access_token"] ?? "");
        break;
      }
      // Documented, expected states rather than failures: the user simply has not finished yet.
      if (error === "authorization_pending") continue;
      if (error === "slow_down") {
        interval = Number(poll.body["interval"] ?? interval + 5);
        continue;
      }
      if (error === "expired_token") {
        fail("The code expired. Run `tokenchit login` again.");
        return { ok: false };
      }
      if (error === "access_denied") {
        fail("Authorisation was declined.");
        return { ok: false };
      }
      fail(`GitHub returned: ${String(error)}`);
      return { ok: false };
    }
  } finally {
    // Whatever happened — success, refusal, Ctrl-C — the animation must not be left running
    // over the top of the next thing printed.
    spinner.stop();
  }

  if (!githubToken) {
    fail("Timed out waiting for authorisation.");
    return { ok: false };
  }

  // The GitHub token is handed to our server exactly once, so that the server — not the
  // client — is what asks GitHub who this is. A client that simply asserted "I am octocat"
  // would be trivially forgeable. It is never written to disk on this machine.
  const verifying = spin("verifying with GitHub…");
  const res = await post(`${api}/api/auth/github`, JSON.stringify({ githubToken }));
  verifying.stop();

  if (res.status === 429) {
    fail(String(res.body?.["error"] ?? "too many sign-in attempts — try again shortly"));
    return { ok: false };
  }

  if (!res.ok) {
    fail(`${api} rejected the sign-in (${res.status})`);
    if (res.body?.["error"]) say(dim(`  ${String(res.body["error"])}`));
    return { ok: false };
  }

  const handle = String(res.body?.["handle"] ?? "");
  const token = String(res.body?.["token"] ?? "");
  if (!handle || !token) {
    fail("The server did not return a usable session.");
    return { ok: false };
  }

  /* Kept only if it is what it claims to be. It goes straight into an SVG the user commits,
     and the one shape that cannot reach out of that document is an inline image. */
  const returned = res.body?.["avatar"];
  const avatar =
    typeof returned === "string" && /^data:image\/(png|jpeg|gif|webp);base64,/.test(returned)
      ? returned
      : undefined;

  const path = await writeAuth({
    token,
    handle,
    api,
    createdAt: new Date().toISOString(),
    ...(avatar ? { avatar } : {}),
  });

  say(`${green("✓")} signed in as ${bold(`@${handle}`)}`);
  say(dim(`  key stored in ${path} (0600)`));
  say(dim("  the GitHub token was used once to identify you and never written to disk"));

  if (res.body?.["takenOver"]) {
    warn(`@${handle} had an unverified row; it now belongs to this account.`);
  }

  return { ok: true, handle };
}

export async function login(argv: string[]): Promise<number> {
  const api = resolveApi(flag(argv, "--api"));
  const opts = signInOptions(argv);

  const existing = await readAuth();
  if (existing && !argv.includes("--force")) {
    say();
    say(`Already signed in as ${bold(`@${existing.handle}`)} ${dim(`(${existing.api})`)}`);
    say(dim("  tokenchit login --force   sign in again"));
    say(dim("  tokenchit logout          forget this machine"));
    say();
    return 0;
  }

  const result = await signIn(api, opts);
  if (!result.ok) return 1;

  say();
  say(`  Next: ${bold("tokenchit publish")} ${dim("— your rows will be marked verified")}`);
  say();
  return 0;
}

export async function logout(): Promise<number> {
  const had = await clearAuth();
  say(had ? `${green("✓")} signed out (${authFile()} removed)` : "Not signed in.");
  return 0;
}

export async function whoami(): Promise<number> {
  const auth = await readAuth();
  if (!auth) {
    say("Not signed in. Run `tokenchit login`.");
    return 1;
  }
  say(`@${auth.handle} ${dim(`· ${auth.api} · since ${auth.createdAt.slice(0, 10)}`)}`);
  return 0;
}

/** Reads the two opt-outs. Both default on, so absence means enabled. */
export const signInOptions = (argv: string[]): SignInOptions => ({
  clipboard: !argv.includes("--no-clipboard"),
  browser: !argv.includes("--no-browser"),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

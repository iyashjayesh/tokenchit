import { flag } from "../args.js";
import { readAuth, writeAuth, clearAuth, authFile } from "../auth.js";
import { post, postForm } from "../net.js";
import { bold, dim, fail, green, say, warn } from "../ui.js";

/**
 * Public by design. Device flow uses no client secret — that is the whole reason it is safe
 * to ship an OAuth client inside a CLI that anybody can read. Overridable so the flow can be
 * pointed at a throwaway app during development.
 */
const CLIENT_ID = process.env["TOKENCARD_CLIENT_ID"] ?? "Ov23liSMxVycJS63ZqN5";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEFAULT_API = "https://tokencard.dev";

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
 */
export async function login(argv: string[]): Promise<number> {
  const api = (flag(argv, "--api") ?? process.env["TOKENCARD_API"] ?? DEFAULT_API).replace(/\/$/, "");

  const existing = await readAuth();
  if (existing && !argv.includes("--force")) {
    say();
    say(`Already signed in as ${bold(`@${existing.handle}`)} ${dim(`(${existing.api})`)}`);
    say(dim("  tokencard login --force   sign in again"));
    say(dim("  tokencard logout          forget this machine"));
    say();
    return 0;
  }

  const start = await postForm(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: "" });
  if (!start.ok) {
    fail(`GitHub refused the device request: ${String(start.body["error"] ?? start.status)}`);
    if (start.body["error"] === "device_flow_disabled") {
      say(dim("  The OAuth App does not have Device Flow enabled."));
    }
    return 1;
  }

  const deviceCode = String(start.body["device_code"] ?? "");
  const userCode = String(start.body["user_code"] ?? "");
  const verifyUrl = String(start.body["verification_uri"] ?? "https://github.com/login/device");
  const expiresIn = Number(start.body["expires_in"] ?? 900);
  let interval = Number(start.body["interval"] ?? 5);

  say();
  say(`  Open ${bold(verifyUrl)}`);
  say(`  and enter  ${bold(userCode)}`);
  say();
  say(dim(`  waiting… (expires in ${Math.round(expiresIn / 60)} minutes, Ctrl-C to stop)`));

  const deadline = Date.now() + expiresIn * 1000;
  let githubToken = "";

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
      fail("The code expired. Run `tokencard login` again.");
      return 1;
    }
    if (error === "access_denied") {
      fail("Authorisation was declined.");
      return 1;
    }
    fail(`GitHub returned: ${String(error)}`);
    return 1;
  }

  if (!githubToken) {
    fail("Timed out waiting for authorisation.");
    return 1;
  }

  // The GitHub token is handed to our server exactly once, so that the server — not the
  // client — is what asks GitHub who this is. A client that simply asserted "I am octocat"
  // would be trivially forgeable. It is never written to disk on this machine.
  const res = await post(`${api}/api/auth/github`, JSON.stringify({ githubToken }));

  if (!res.ok) {
    fail(`${api} rejected the sign-in (${res.status})`);
    if (res.body?.["error"]) say(dim(`  ${String(res.body["error"])}`));
    return 1;
  }

  const handle = String(res.body?.["handle"] ?? "");
  const token = String(res.body?.["token"] ?? "");
  if (!handle || !token) {
    fail("The server did not return a usable session.");
    return 1;
  }

  const path = await writeAuth({
    token,
    handle,
    api,
    createdAt: new Date().toISOString(),
  });

  say();
  say(`${green("✓")} signed in as ${bold(`@${handle}`)}`);
  say(dim(`  key stored in ${path} (0600)`));
  say(dim("  the GitHub token was used once to identify you and never written to disk"));

  const takenOver = res.body?.["takenOver"];
  if (takenOver) {
    warn(`@${handle} had an unverified row; it now belongs to this account.`);
  }

  say();
  say(`  Next: ${bold("tokencard publish")} ${dim("— your rows will be marked verified")}`);
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
    say("Not signed in. Run `tokencard login`.");
    return 1;
  }
  say(`@${auth.handle} ${dim(`· ${auth.api} · since ${auth.createdAt.slice(0, 10)}`)}`);
  return 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

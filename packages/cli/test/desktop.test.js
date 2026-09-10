import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/* `.build` is the tsc output, which keeps one file per module; `dist` is a single esbuild
   bundle with nothing importable inside it. Same convention as auth.test.js. */
const { canOpenBrowser } = await import(join(HERE, "..", ".build", "desktop.js"));

/**
 * `publish` opens the profile page when it finishes, and the whole safety of that is this
 * predicate. It is the difference between a convenience and a process spawned on every CI
 * run, so each refusal gets a test rather than a comment.
 *
 * The environment is restored around every case: these are process-global reads, and a test
 * that leaks CI=1 into the next file would be a confusing failure a long way from here.
 */
const withEnv = (env, tty, fn) => {
  const savedEnv = { ...process.env };
  const savedTty = process.stdout.isTTY;
  for (const key of ["CI", "SSH_TTY", "SSH_CONNECTION", "DISPLAY", "WAYLAND_DISPLAY", "TOKENCHIT_NO_BROWSER"]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  Object.defineProperty(process.stdout, "isTTY", { value: tty, configurable: true });
  try {
    return fn();
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    Object.defineProperty(process.stdout, "isTTY", { value: savedTty, configurable: true });
  }
};

/* Linux needs a display for the answer to be yes at all, so the "allowed" baseline supplies
   one. On macOS and Windows the variable is ignored. */
const DISPLAY_IF_NEEDED = process.platform === "linux" ? { DISPLAY: ":0" } : {};

test("opens at an interactive terminal", () => {
  assert.equal(withEnv({ ...DISPLAY_IF_NEEDED }, true, canOpenBrowser), true);
});

test("refuses without a TTY, which is a pipe or a redirect", () => {
  assert.equal(withEnv({ ...DISPLAY_IF_NEEDED }, false, canOpenBrowser), false);
});

test("refuses in CI, where nobody is watching", () => {
  assert.equal(withEnv({ ...DISPLAY_IF_NEEDED, CI: "true" }, true, canOpenBrowser), false);
});

test("refuses over SSH, where the browser would open on the wrong machine", () => {
  assert.equal(withEnv({ ...DISPLAY_IF_NEEDED, SSH_TTY: "/dev/pts/0" }, true, canOpenBrowser), false);
  assert.equal(
    withEnv({ ...DISPLAY_IF_NEEDED, SSH_CONNECTION: "10.0.0.1 22 10.0.0.2 22" }, true, canOpenBrowser),
    false,
  );
});

test("TOKENCHIT_NO_BROWSER opts out without a flag", () => {
  assert.equal(withEnv({ ...DISPLAY_IF_NEEDED, TOKENCHIT_NO_BROWSER: "1" }, true, canOpenBrowser), false);
});

test("on Linux, refuses a session with no display", { skip: process.platform !== "linux" }, () => {
  assert.equal(withEnv({}, true, canOpenBrowser), false);
  assert.equal(withEnv({ WAYLAND_DISPLAY: "wayland-0" }, true, canOpenBrowser), true);
});

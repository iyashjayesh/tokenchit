/**
 * Terminal output helpers.
 *
 * Colour is dropped whenever stdout is not a TTY or `NO_COLOR` is set, because `sync` is
 * meant to run in CI as readily as in a shell, and escape codes in an Actions log help
 * nobody.
 */
const enabled = Boolean(process.stdout.isTTY) && !process.env["NO_COLOR"];

const wrap = (code: string) => (s: string) => (enabled ? `\u001b[${code}m${s}\u001b[0m` : s);

export const bold = wrap("1");
export const dim = wrap("2");
export const green = wrap("32");
export const yellow = wrap("33");
export const red = wrap("31");

export const say = (s = "") => process.stdout.write(`${s}\n`);
export const warn = (s: string) => process.stderr.write(`${yellow("!")} ${s}\n`);
export const fail = (s: string) => process.stderr.write(`${red("✗")} ${s}\n`);

/**
 * Node 22 prints an ExperimentalWarning the first time `node:sqlite` loads. It is true but
 * not actionable by the person running `tokenstats sync`, and it lands in the middle of the
 * output. Every other warning is re-emitted so nothing real is swallowed.
 */
export function muteSqliteWarning(): void {
  const listeners = process.listeners("warning");
  for (const l of listeners) process.removeListener("warning", l);

  process.on("warning", (w) => {
    if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
    for (const l of listeners) l(w);
    if (listeners.length === 0) process.stderr.write(`${w.name}: ${w.message}\n`);
  });
}

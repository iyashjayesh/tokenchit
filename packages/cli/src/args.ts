/**
 * A deliberately small flag reader.
 *
 * The CLI takes two commands and a handful of options, so a parser dependency would be more
 * code to audit than it saves — and "reads your logs, depends on nothing" is a claim worth
 * keeping literally true.
 */
/**
 * Every caller of this reads a flag that takes a value, so a flag present with no value is a
 * mistake rather than an absence — and it used to be silently indistinguishable from one.
 *
 * `publish --api` with a truncated value resolved to `undefined`, fell through `resolveApi`
 * to TOKENCHIT_API and then to the production default, so a rehearsal aimed at a local server
 * put a real row on the public board. That is the accident the unknown-flag guard exists to
 * prevent, arriving through the other door. `--out`, `--theme`, `--layout` and `--handle`
 * failed the same way, more quietly.
 *
 * Throwing is enough plumbing: main() catches and prints, exactly as `oneOf` already relies on.
 */
export function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i !== -1) {
    const next = argv[i + 1];
    // A value may legitimately begin with a dash, but a *flag* following this one means the
    // value was left out; guessing which is impossible, and guessing wrong publishes.
    if (next === undefined || next.startsWith("-")) throw new Error(`${name} needs a value`);
    return next;
  }

  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline === undefined) return undefined;

  const value = inline.slice(name.length + 1);
  if (value === "") throw new Error(`${name} needs a value`);
  return value;
}

export const has = (argv: string[], name: string): boolean => argv.includes(name);

/**
 * The flags a command does not recognise, so a typo fails as loudly as a bad value does.
 *
 * `oneOf` already refuses an unknown flag *value* on the grounds that a typo should not pass
 * silently, but nothing checked the flag *name* — an unrecognised flag was simply never read.
 * For most commands that is a harmless no-op; for `publish` it is not. `tokenchit publish
 * --dry-runn` ignored the misspelling and published for real, exit 0, a live public row where
 * the user had asked for a rehearsal. Verified against a running board before this existed.
 *
 * Values are skipped by position: an argument following a flag that takes one is a value, not
 * a flag, and a value may legitimately begin with a dash (`--api -weird-host`).
 */
export function unknownFlags(
  argv: string[],
  allowed: readonly string[],
  valued: readonly string[] = [],
): string[] {
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("-")) continue;

    // `--name=value` carries its own value; `--name value` consumes the next argument.
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (!allowed.includes(name)) unknown.push(name);
    else if (!arg.includes("=") && valued.includes(name)) i++;
  }

  return unknown;
}

/** Accept a flag value only if it is one of `allowed`, so a typo fails loudly. */
export function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (value === undefined) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`--${name} must be one of: ${allowed.join(", ")} (got "${value}")`);
}

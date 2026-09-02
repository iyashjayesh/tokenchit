/**
 * A deliberately small flag reader.
 *
 * The CLI takes two commands and a handful of options, so a parser dependency would be more
 * code to audit than it saves — and "reads your logs, depends on nothing" is a claim worth
 * keeping literally true.
 */
export function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  const next = argv[i + 1];
  if (i !== -1 && next !== undefined && !next.startsWith("-")) return next;

  const inline = argv.find((a) => a.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

export const has = (argv: string[], name: string): boolean => argv.includes(name);

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

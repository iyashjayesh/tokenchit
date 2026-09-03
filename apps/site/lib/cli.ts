/*
 * Everything the site says about the CLI, taken from the package it describes.
 *
 * The header once read "v0.4.1 · MIT" from a hand-written string while the CLI was at 0.1.1 —
 * a version that had never been published, on the page telling people what to install. The
 * package name and command name were literals in nine more places, so the rename from
 * tokenstats reached them only because a search-and-replace happened to catch them.
 *
 * These are build-time imports: the bundler inlines the values, nothing reads a file at
 * runtime, and Vercel rebuilds on every push, so a bump or a rename reaches the site with the
 * deploy that carries it.
 */
import cli from "../../../packages/cli/package.json";

export const CLI_VERSION: string = cli.version;

/** The npm package: what `npx` and an install line name. */
export const CLI_PACKAGE: string = cli.name;

/** The installed command: what a user types once it is on their PATH. */
export const CLI_BIN: string = Object.keys(cli.bin)[0]!;

/** "v0.1.1 · MIT" — the badge in the header. */
export const VERSION_LABEL = `v${CLI_VERSION} · ${cli.license}`;

export const NPM_URL = `https://npmjs.com/package/${CLI_PACKAGE}`;

/**
 * `npx @tokenchit/cli@latest generate` — the one command the site leads with.
 *
 * Pinned to @latest deliberately: npx will reuse a cached copy indefinitely, and someone
 * following a page that describes three steps should not be handed the build that did one.
 *
 * Defined once because it appears in the hero, the header button, the board, the leaderboard
 * and the 404 — five places that were five separate string literals until the rename proved
 * how well that goes.
 */
export const PRIMARY_COMMAND = `npx ${CLI_PACKAGE}@latest generate`;

/** `tokenchit sync` — the form for someone who has. */
export const cmd = (...args: string[]) => `${CLI_BIN} ${args.join(" ")}`;

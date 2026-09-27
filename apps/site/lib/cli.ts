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
/* The `with` attribute is required by Node's ESM loader, and harmless to the bundler. Without
   it this module is importable only through Next, which puts every value below out of reach
   of the test suite — the values being the version, the package name and the one command the
   whole site tells people to run. */
import cli from "../../../packages/cli/package.json" with { type: "json" };

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
 * `-y` because npx otherwise stops on "Ok to proceed?" before the first run — a confirmation
 * for a package the reader has just been told to run, in the one moment they are least sure
 * anything is working.
 *
 * Defined once because it appears in the hero, the header button, the board, the leaderboard
 * and the 404 — five places that were five separate string literals until the rename proved
 * how well that goes.
 */
export const PRIMARY_COMMAND = `npx -y ${CLI_PACKAGE}@latest generate --no-publish`;

/**
 * The command that joins the board, for the places that genuinely mean publishing.
 *
 * Kept apart from `PRIMARY_COMMAND` on purpose. The site used to tell a first-time visitor to
 * run `generate`, which publishes by default, two screens below a promise that publishing was
 * "a separate step you have to ask for". The first command anyone is told to run is now the
 * one that cannot upload; this is the one they run when they have decided to.
 */
export const PUBLISH_COMMAND = `npx -y ${CLI_PACKAGE}@latest publish`;

/** `tokenchit sync` — the form for someone who has. */
export const cmd = (...args: string[]) => `${CLI_BIN} ${args.join(" ")}`;

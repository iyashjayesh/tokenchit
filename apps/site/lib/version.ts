/*
 * The site's version badge, taken from the package it describes rather than typed out again.
 *
 * It read "v0.4.1" from a hand-written string while the CLI was at 0.1.1 — a number that had
 * never been published, advertised on the page telling people what to install. A literal here
 * is only ever correct until the next release, so there is no literal.
 *
 * This is a build-time import: the bundler inlines the value, nothing reads a file at runtime,
 * and Vercel rebuilds on every push, so a version bump reaches the site with the deploy that
 * carries it.
 */
import cli from "../../../packages/cli/package.json";

export const CLI_VERSION: string = cli.version;

/** "v0.1.1 · MIT" — the badge in the header. */
export const VERSION_LABEL = `v${CLI_VERSION} · ${cli.license}`;

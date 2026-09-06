import { join } from "node:path";

import { flag, has, oneOf } from "../args.js";
import { configDir } from "../auth.js";
import { bold, dim, grey, say } from "../ui.js";

const EVERY = ["daily", "hourly"] as const;
type Every = (typeof EVERY)[number];

/*
 * Where a scheduled run leaves its output.
 *
 * The entry used to end in `>/dev/null 2>&1`, which is the wrong default for a job whose
 * whole point is running unattended for months: when it starts failing — a revoked key, a
 * moved repo, no network — there was nothing on disk to look at and nothing that would tell
 * anyone their row had gone stale.
 */
const LOG = join(configDir(), "publish.log");

/** Double-quote for `cmd`, which has no escape for a quote inside a quoted string. */
const winQuote = (value: string): string => `"${value.replaceAll('"', "")}"`;

/**
 * Single-quote for `sh`, closing and reopening around any embedded quote.
 *
 * Left alone when there is nothing to quote: a line someone is about to paste into their
 * crontab should be readable, and quoting `publish` achieves nothing but noise.
 */
const shellQuote = (value: string): string =>
  /^[A-Za-z0-9_@%+=:,.\/-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

/** Escape the five characters that cannot appear raw in XML character data. */
const xml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/**
 * Print a scheduler entry. Install nothing.
 *
 * Two constraints shape this command. The first is that keeping a row current has to run on
 * this machine: the logs are local and exist nowhere else, so a GitHub Action has nothing to
 * read and cannot do it for you — which is the first thing people ask.
 *
 * The second is that editing how someone's machine is configured is theirs to do. A CLI that
 * quietly writes a LaunchAgent has installed a background job that survives reboots and keeps
 * sending data, which is not a thing to do on someone's behalf because they typed a word that
 * sounded convenient. So this prints, explains, and stops.
 */
export async function schedule(argv: string[]): Promise<number> {
  const every: Every = oneOf(flag(argv, "--every"), EVERY, "every") ?? "daily";
  const windows = process.platform === "win32" && !has(argv, "--cron");
  const cron = has(argv, "--cron") || (process.platform !== "darwin" && !windows);

  /*
   * A scheduled job has to survive longer than the process writing it.
   *
   * Using this process's own path is right for an installed copy and wrong under npx, where
   * argv[1] points into ~/.npm/_npx/<hash>/ — a cache keyed to the exact version, pruned by
   * npm, and never updated. A LaunchAgent pointing there runs today, pins itself to whichever
   * version happened to be current, and one `npm cache clean` later fails every morning
   * without saying so.
   *
   * So an npx run emits the durable npx command instead, and says the quieter thing is a
   * global install.
   */
  const entry = process.argv[1];
  const viaNpx = !entry || /[\\/]_npx[\\/]/.test(entry);

  /*
   * Kept as an argument vector rather than a string, because the plist needs the parts and a
   * joined string cannot be split back apart safely: `command.split(" ")` broke every node
   * path or checkout containing a space, which on macOS includes any home directory named
   * after someone with two names.
   */
  const args = viaNpx
    ? ["npx", "-y", "@tokenchit/cli@latest", "publish"]
    : [process.execPath, entry!, "publish"];
  const command = args.map(shellQuote).join(" ");
  const cwd = process.cwd();

  say();
  say(`  ${bold("Publishing is not automatic.")} ${grey("Your logs are local, so the schedule")}`);
  say(`  ${grey("has to be local too — CI has nothing to read.")}`);
  say();

  if (viaNpx) {
    // Said before the entry rather than after it, because it changes what someone should copy.
    say(`  ${grey("Running under npx, so this uses")} ${bold("npx -y @tokenchit/cli@latest")}${grey(",")}`);
    say(`  ${grey("which re-checks the registry on every run. For a job that fires daily:")}`);
    say(`    ${bold("npm i -g @tokenchit/cli")}`);
    say(`  ${grey("then re-run")} ${bold("tokenchit schedule")} ${grey("for an entry that starts faster.")}`);
    say();
  }

  if (windows) {
    /*
     * Every non-darwin platform used to fall through to the crontab branch, which told a
     * Windows user to run `crontab -e` — a command that does not exist there. The CLI makes a
     * real effort on Windows elsewhere (`clip` for the clipboard, `cmd /c start` for the
     * browser), so printing an instruction nobody can follow was an oversight, not a scope
     * limit.
     */
    const when = every === "hourly" ? "/sc hourly" : "/sc daily /st 09:00";
    say(`  ${grey(`Task Scheduler, in a terminal — runs ${every}:`)}`);
    say();
    const winCommand = args.map(winQuote).join(" ");
    say(`  schtasks /create /tn tokenchit /tr "cmd /c cd /d ${winQuote(cwd)} && ${winCommand} >> ${winQuote(LOG)} 2>&1" ${when}`);
    say();
    say(dim("  Nothing was installed. Copy the line above if you want it."));
    say(dim(`  Output goes to ${LOG}.`));
    say();
    return 0;
  }

  if (cron) {
    const when = every === "hourly" ? "0 * * * *" : "0 9 * * *";
    say(`  ${grey(`crontab -e, then add — runs ${every}:`)}`);
    say();
    say(`  ${when} cd ${shellQuote(cwd)} && ${command} >> ${shellQuote(LOG)} 2>&1`);
    say();
    say(dim("  Nothing was installed. Copy the line above if you want it."));
    say(dim(`  Output goes to ${LOG}, so a job that stops working leaves a trace.`));
    say();
    return 0;
  }

  const label = "app.tokenchit.publish";
  const plist = `~/Library/LaunchAgents/${label}.plist`;
  const interval =
    every === "hourly"
      ? "  <key>StartInterval</key>\n  <integer>3600</integer>"
      : "  <key>StartCalendarInterval</key>\n  <dict>\n    <key>Hour</key><integer>9</integer>\n    <key>Minute</key><integer>0</integer>\n  </dict>";

  say(`  ${grey(`Save as ${plist} — runs ${every}:`)}`);
  say();
  say(`<?xml version="1.0" encoding="UTF-8"?>`);
  say(`<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"`);
  say(`  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`);
  say(`<plist version="1.0">`);
  say(`<dict>`);
  say(`  <key>Label</key>`);
  say(`  <string>${label}</string>`);
  say(`  <key>ProgramArguments</key>`);
  say(`  <array>`);
  for (const part of args) say(`    <string>${xml(part)}</string>`);
  say(`  </array>`);
  say(`  <key>WorkingDirectory</key>`);
  say(`  <string>${xml(cwd)}</string>`);
  // launchd's own log is the only other trace, and it is not somewhere anyone thinks to look.
  say(`  <key>StandardOutPath</key>`);
  say(`  <string>${xml(LOG)}</string>`);
  say(`  <key>StandardErrorPath</key>`);
  say(`  <string>${xml(LOG)}</string>`);
  say(interval);
  say(`</dict>`);
  say(`</plist>`);
  say();
  say(`  ${grey("then:")} launchctl load ${plist}`);
  say();
  say(dim("  Nothing was installed. Copy the file above if you want it."));
  say(dim("  --cron prints a crontab line instead."));
  say();
  return 0;
}

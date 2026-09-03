import { flag, has, oneOf } from "../args.js";
import { bold, dim, grey, say } from "../ui.js";

const EVERY = ["daily", "hourly"] as const;
type Every = (typeof EVERY)[number];

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
  const cron = has(argv, "--cron") || process.platform !== "darwin";

  // The path this process was started from, so the entry runs the same install the person is
  // already using rather than whatever a future PATH happens to resolve.
  const entry = process.argv[1];
  const command = entry
    ? `${process.execPath} ${entry} publish`
    : "npx @tokenchit/cli publish";
  const cwd = process.cwd();

  say();
  say(`  ${bold("Publishing is not automatic.")} ${grey("Your logs are local, so the schedule")}`);
  say(`  ${grey("has to be local too — CI has nothing to read.")}`);
  say();

  if (cron) {
    const when = every === "hourly" ? "0 * * * *" : "0 9 * * *";
    say(`  ${grey(`crontab -e, then add — runs ${every}:`)}`);
    say();
    say(`  ${when} cd ${cwd} && ${command} >/dev/null 2>&1`);
    say();
    say(dim("  Nothing was installed. Copy the line above if you want it."));
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
  for (const part of command.split(" ")) say(`    <string>${part}</string>`);
  say(`  </array>`);
  say(`  <key>WorkingDirectory</key>`);
  say(`  <string>${cwd}</string>`);
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

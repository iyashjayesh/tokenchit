import {
  adapters,
  ledgerPath,
  ledgerSummary,
  readLedger,
  unsupported,
} from "@tokenchit/core/adapters";
import { formatTokens } from "@tokenchit/core";

import { has } from "../args.js";
import { DEFAULT_CONFIG, readConfig } from "../config.js";
import { scan } from "../scan.js";
import { bold, dim, green, say, spin, yellow } from "../ui.js";

/**
 * One place that answers "why does this number look wrong".
 *
 * The explanations already existed — `sync` warns about recovered days and price coverage,
 * `init` lists detected and unsupported agents, `ledger` shows the bank. They were scattered
 * across three commands, so nobody saw the whole picture at once, and the discrepancies that
 * prompt a bug report are exactly the ones that need every piece together.
 *
 * Read-only, and that is a contract rather than an intention. It does not persist a scan,
 * rewrite or migrate the ledger, create sidecar files, refresh credentials, install hooks or
 * repair config. Remedies are printed as suggestions; nothing is applied.
 */

/** What can be said about one source. */
export type SourceState = "absent" | "installed-no-data" | "unsupported" | "ready";

export type AgentReport = {
  agent: string;
  name: string;
  source: string;
  state: SourceState;
  /** Present only for sources that cannot be counted, phrased for a person. */
  reason?: string;
  /** Tokens this agent contributed to the scan, when it was readable. */
  tokens?: number;
  configured: boolean;
};

export type DoctorReport = {
  /** Schema version for this payload, so a consumer can detect a change. */
  version: 1;
  agents: AgentReport[];
  observed: {
    firstDay: string | null;
    lastDay: string | null;
    activeDays: number;
    /**
     * Deliberately absent from this object: a completeness percentage.
     *
     * Observed bounds do not prove every day between them is complete. Retention deletes
     * days, and a silent day is indistinguishable from a day whose transcripts were removed.
     * Inventing "94% complete" would be the most confident lie this tool could tell, so the
     * bounds are reported and the gap is named instead.
     */
    note: string;
  };
  history: {
    path: string;
    exists: boolean;
    since: string | null;
    days: number;
    tokens: number;
    recoveredThisRun: { days: number; tokens: number };
  };
  estimate: {
    /** Share of tokens, 0-1, whose model has a public price. */
    pricedShare: number;
    unpricedModels: string[];
    note: string;
  };
  limitations: string[];
};

export async function doctor(argv: string[]): Promise<number> {
  const json = has(argv, "--json");
  const config = (await readConfig()) ?? DEFAULT_CONFIG;

  const reading = json ? null : spin("inspecting local sources…");

  /*
   * `write: false` is the whole read-only guarantee, and it is real rather than nominal:
   * `scan` calls `writeLedger` only when write is not false, and the OpenCode adapter opens
   * its SQLite database with `readOnly: true`, so no `-wal` or `-shm` sidecar appears either.
   */
  const { stats, recovered } = await scan(config.agents, {
    write: false,
    onProgress: ({ agent, events }) =>
      reading?.update(
        events === 0 ? `reading ${agent}…` : `reading ${agent}… ${events.toLocaleString()} events`,
      ),
  });
  reading?.stop();

  const agentReports: AgentReport[] = [];
  for (const adapter of adapters) {
    const state = await adapter.detect();
    const tokens = stats.byAgent.get(adapter.id) ?? 0;
    agentReports.push({
      agent: adapter.id,
      name: adapter.name,
      source: adapter.source,
      state,
      ...(tokens > 0 ? { tokens } : {}),
      configured: config.agents.length === 0 || config.agents.includes(adapter.id),
    });
  }

  for (const probe of unsupported) {
    agentReports.push({
      agent: probe.name.toLowerCase().replace(/\s+/g, "-"),
      name: probe.name,
      source: probe.source,
      state: (await probe.installed()) ? "unsupported" : "absent",
      reason: probe.reason,
      configured: false,
    });
  }

  const path = ledgerPath();
  const ledger = await readLedger(path);
  const bank = ledgerSummary(ledger, config.agents);
  // An absent ledger reads back as an empty one with today's `since`, which would otherwise
  // be reported as a real start date for history that does not exist.
  const exists = Object.keys(ledger.days).length > 0;

  const report: DoctorReport = {
    version: 1,
    agents: agentReports,
    observed: {
      firstDay: stats.firstDay,
      lastDay: stats.lastDay,
      activeDays: stats.activeDays,
      note:
        "Bounds are the first and last day with recorded usage. They do not imply every day " +
        "between them is complete: a silent day and a day whose transcripts were deleted look " +
        "identical from here.",
    },
    history: {
      path,
      exists,
      since: exists ? ledger.since : null,
      days: bank.days,
      tokens: bank.tokens,
      recoveredThisRun: { days: recovered.days, tokens: recovered.tokens },
    },
    estimate: {
      pricedShare: stats.pricedShare,
      unpricedModels: stats.models.filter((m) => !m.priced).map((m) => m.model),
      note:
        "Equivalent cost is what these tokens would cost at list API rates. It is not money " +
        "paid: most agent usage runs under a subscription with no per-token charge. Models " +
        "with no public price contribute tokens and no cost.",
    },
    limitations: limitationsFor(stats, agentReports),
  };

  if (json) {
    say(JSON.stringify(report, null, 2));
    return 0;
  }

  return render(report, stats.tokens);
}

/**
 * Limitations that actually apply to this machine.
 *
 * Filtered rather than printed as a static list: a wall of caveats including three the reader
 * does not have teaches them to skip the section, and the one explaining their problem goes
 * with it.
 */
function limitationsFor(
  stats: { clockTokens: number; tokens: number },
  agents: AgentReport[],
): string[] {
  const out: string[] = [];
  const ready = (id: string) => agents.some((a) => a.agent === id && a.state === "ready");

  if (ready("claude-code")) {
    out.push(
      "Claude Code's own Stats panel reads higher than this: it counts an API call once per " +
        "streaming rewrite. These figures deduplicate by message id.",
    );
  }

  if (ready("codex")) {
    out.push(
      "Codex reports a running counter per session, so a rollout contributes one event dated " +
        "at its last turn. Daily totals are right; its hour-of-day placement is approximate.",
    );
  }

  if (stats.tokens > 0 && stats.clockTokens < stats.tokens) {
    const share = Math.round((1 - stats.clockTokens / stats.tokens) * 100);
    out.push(
      `${share}% of tokens came back from the ledger, which records a date and not a clock. ` +
        "Those count in totals and in the heatmap, but not in peak hours or time-of-day badges.",
    );
  }

  return out;
}

function render(r: DoctorReport, totalTokens: number): number {
  const mark = (s: SourceState): string =>
    s === "ready" ? green("●") : s === "absent" ? dim("○") : yellow("○");

  say();
  say(`  ${bold("sources")}`);
  for (const a of r.agents) {
    const detail =
      a.state === "ready"
        ? dim(`${a.source}${a.tokens ? `  ·  ${formatTokens(a.tokens)}` : ""}`)
        : a.state === "absent"
          ? dim("not installed")
          : dim(a.reason ?? "installed, nothing countable");
    say(`  ${mark(a.state)} ${a.name.padEnd(14)} ${detail}`);
    /* A source the machine has but the config excludes is a common and confusing cause of
       "my numbers are too low", so it is called out rather than left to be inferred. */
    if (a.state === "ready" && !a.configured) {
      say(`    ${yellow("!")} ${dim("present but not in .tokenchit.json — its usage is excluded")}`);
    }
  }

  say();
  say(`  ${bold("observed")}`);
  if (r.observed.firstDay) {
    say(`    ${dim("range")}      ${r.observed.firstDay} → ${r.observed.lastDay}`);
    say(`    ${dim("active")}     ${r.observed.activeDays} days  ·  ${formatTokens(totalTokens)} tokens`);
  } else {
    say(`    ${dim("nothing recorded")}`);
  }
  say(`    ${dim(wrap(r.observed.note))}`);

  say();
  say(`  ${bold("retained history")}`);
  if (r.history.exists) {
    say(`    ${dim("since")}      ${r.history.since}`);
    say(`    ${dim("banked")}     ${r.history.days} days  ·  ${formatTokens(r.history.tokens)}`);
    if (r.history.recoveredThisRun.days > 0) {
      say(
        `    ${dim("restored")}   ${r.history.recoveredThisRun.days} days the logs no longer hold ` +
          `(${formatTokens(r.history.recoveredThisRun.tokens)})`,
      );
    }
  } else {
    say(`    ${dim("no ledger yet — it is written on the first sync or publish")}`);
  }
  say(`    ${dim(r.history.path)}`);

  say();
  say(`  ${bold("estimate")}`);
  say(`    ${dim("priced")}     ${Math.round(r.estimate.pricedShare * 100)}% of tokens have a public price`);
  if (r.estimate.unpricedModels.length > 0) {
    say(`    ${dim("unpriced")}   ${r.estimate.unpricedModels.slice(0, 6).join(", ")}`);
    if (r.estimate.unpricedModels.length > 6) {
      say(`    ${dim(`           and ${r.estimate.unpricedModels.length - 6} more`)}`);
    }
  }
  say(`    ${dim(wrap(r.estimate.note))}`);

  if (r.limitations.length > 0) {
    say();
    say(`  ${bold("known limitations")}`);
    for (const l of r.limitations) say(`    ${dim("·")} ${dim(wrap(l, 6))}`);
  }

  say();
  // Suggestions only. Nothing above this line changed anything, and nothing below it runs.
  if (!r.history.exists) {
    say(`  ${dim("suggested:")} ${bold("tokenchit sync")} ${dim("— starts banking history")}`);
  }
  if (r.agents.some((a) => a.state === "ready" && !a.configured)) {
    say(`  ${dim("suggested:")} ${bold("tokenchit init")} ${dim("— re-detect agents into .tokenchit.json")}`);
  }
  say();

  // Zero is not a failure: a fresh install with no usage is a correct, reportable state.
  return 0;
}

/** Soft-wrap prose to a terminal-friendly width, indenting continuation lines. */
function wrap(text: string, indent = 4): string {
  const width = 76 - indent;
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (line.length + w.length + 1 > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.join(`\n${" ".repeat(indent)}`);
}

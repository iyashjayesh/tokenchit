import { buildRecap, formatTokens, localDay, type AgentId, type Stats } from "@tokenchit/core";

import { ALL_AGENTS, detect, read } from "./stats.js";

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<unknown>;
};

/** The `agents` argument, shared by every tool that takes one. */
const AGENTS_ARG = {
  type: "array",
  items: { type: "string", enum: [...ALL_AGENTS] },
  description: "Restrict the read to these agents. Omit for all of them.",
} as const;

/**
 * Every number a caller might quote comes back with the caveat attached.
 *
 * A model asked "how much have I spent on Claude Code" will otherwise read `equivCostUsd`
 * and answer in dollars, which is wrong in a way the user cannot detect: most agent usage
 * runs under a subscription where no per-token charge ever happens. Returning the caveat as
 * a sibling field of the figure is the only version of this that survives summarisation.
 */
const COST_CAVEAT =
  "Not money anyone paid. This is what these tokens would cost at list API rates; " +
  "most agent usage runs under a subscription with no per-token charge. Models with no " +
  "public price are counted in tokens and omitted here.";

const PANEL_CAVEAT =
  "This will not match Claude Code's own Stats panel, which counts each API call once per " +
  "streaming rewrite and so reads high. These figures are deduplicated by message id.";

const asAgents = (raw: unknown): AgentId[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.filter((a): a is AgentId => ALL_AGENTS.includes(a as AgentId));
  return valid.length ? valid : undefined;
};

const clampDays = (raw: unknown, fallback: number): number => {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3650, Math.max(1, Math.trunc(n)));
};

/**
 * A year the logs could plausibly cover, or undefined.
 *
 * The JSON schema states the bounds but nothing enforces them at runtime — a client that
 * ignores the schema could ask for 2030 and get all-time data stamped 2030. Out-of-range is
 * treated as "not asked" rather than as an error, because the current year is the useful
 * answer to a malformed year and a rejection is not.
 */
const asYear = (raw: unknown, now: Date): number | undefined => {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const year = Math.trunc(raw);
  return year >= 2020 && year <= now.getFullYear() ? year : undefined;
};

/** Local `YYYY-MM-DD` for each of the last `days` calendar days, oldest first. */
function calendarRange(days: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(localDay(d));
  }
  return out;
}

const windowOf = (w: Stats["windows"][keyof Stats["windows"]]) => ({
  tokens: w.tokens,
  tokensHuman: formatTokens(w.tokens),
  equivCostUsd: Number(w.equivCostUsd.toFixed(2)),
  apiCalls: w.events,
});

export const tools: Tool[] = [
  {
    name: "get_usage",
    description:
      "Total local AI coding agent usage: tokens, equivalent cost, streak, active days, " +
      "per-agent mix and per-model breakdown. Windows are all time, the current calendar " +
      "year so far, the last 30 days and the last 7 days. Reads logs on this machine; " +
      "makes no network request.",
    inputSchema: {
      type: "object",
      properties: { agents: AGENTS_ARG },
      additionalProperties: false,
    },
    async run(args) {
      const { stats, recovered } = await read(asAgents(args.agents));
      return {
        tokens: stats.tokens,
        tokensHuman: formatTokens(stats.tokens),
        equivCostUsd: Number(stats.equivCostUsd.toFixed(2)),
        equivCostNote: COST_CAVEAT,
        // A caller quoting the cost needs to know how much of the total it covers. At 0.6
        // the figure is missing 40% of the usage and saying "$X" unqualified is misleading.
        pricedShareOfTokens: Number(stats.pricedShare.toFixed(4)),
        streakDays: stats.streakDays,
        activeDays: stats.activeDays,
        firstDay: stats.firstDay,
        lastDay: stats.lastDay,
        byAgent: Object.fromEntries(stats.byAgent),
        mix: stats.mix,
        windows: {
          all: windowOf(stats.windows.all),
          /* Named for what it is. As `year`, sitting beside `last30Days` and `last7Days`, it
             read as a trailing twelve months — so asked in mid-January a model would report
             two weeks of usage as someone's year. */
          yearToDate: windowOf(stats.windows.year),
          last30Days: windowOf(stats.windows.d30),
          last7Days: windowOf(stats.windows.d7),
        },
        topModels: stats.models.slice(0, 10),
        recoveredFromLedger: recovered,
        accuracyNote: PANEL_CAVEAT,
      };
    },
  },

  {
    name: "get_daily_usage",
    description:
      "Tokens per local calendar day, most recent last. Use this for questions about a " +
      "specific stretch of time rather than a lifetime total.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 3650,
          default: 30,
          description: "How many calendar days back to return, ending today. Idle days are included as zero.",
        },
        agents: AGENTS_ARG,
      },
      additionalProperties: false,
    },
    async run(args) {
      const { stats } = await read(asAgents(args.agents));
      const days = clampDays(args.days, 30);

      /*
       * Built from a calendar range rather than by slicing the map.
       *
       * `stats.byDay` only carries days that had events, so `.slice(-days)` returned the last
       * `days` *active* days — on a sparse corpus that was two entries a month apart returned
       * as "the last 3 days", with a total a model would quote as a three-day figure. It also
       * disagreed with `get_usage`'s last7Days/last30Days for the same machine, which is the
       * kind of inconsistency that makes every number here suspect.
       */
      const series = calendarRange(days, new Date()).map((day) => ({
        day,
        tokens: stats.byDay.get(day) ?? 0,
      }));

      return {
        days: series,
        requestedDays: days,
        returnedDays: series.length,
        totalInRange: series.reduce((a, d) => a + d.tokens, 0),
        /* Lifetime, not windowed — these come from the whole corpus and are here for shape
           questions ("when do I work"), not for the range above. */
        lifetimeByWeekdayMondayFirst: stats.byWeekday,
        lifetimeByHourLocal: stats.byHour,
        firstDayWithData: stats.firstDay,
        accuracyNote: PANEL_CAVEAT,
      };
    },
  },

  {
    name: "get_recap",
    description:
      "Year in review for one calendar year: headline tiles, per-agent and per-model " +
      "breakdown, the busiest hour range, and activity aggregated by weekday and hour (not " +
      "by date). The same figures `tokenchit recap` renders.",
    inputSchema: {
      type: "object",
      properties: {
        year: {
          type: "integer",
          minimum: 2020,
          maximum: 2100,
          description: "Calendar year. Omit for the current one.",
        },
        agents: AGENTS_ARG,
      },
      additionalProperties: false,
    },
    async run(args) {
      const now = new Date();
      const year = asYear(args.year, now);
      const { stats } = await read(asAgents(args.agents), year);
      const recap = buildRecap(stats, year === undefined ? {} : { year });

      return {
        year: recap.year,
        tiles: recap.tiles,
        agents: recap.agents,
        models: recap.models,
        peakHours: recap.peak,
        activeDays: recap.activeDays,
        tokens: recap.tokens,
        /*
         * Weekday buckets, named as such.
         *
         * `recap.rows` is `WEEKDAYS.map(...)`, so `day` is "MON".."SUN" — this was returned
         * as `activityByDay`, which a model asked "which days was I busiest" would read as
         * dates. The hour dimension was also being dropped: `levels` is the 0-4 ramp per
         * hour and is the only part of the grid worth handing over, the colours being for
         * the SVG.
         */
        activityByWeekday: recap.rows.map((r) => ({
          weekday: r.day,
          tokens: r.tokens,
          busiest: r.busiest,
          byHourLevel: r.levels,
        })),
        equivCostNote: COST_CAVEAT,
        accuracyNote: PANEL_CAVEAT,
      };
    },
  },

  {
    name: "detect_agents",
    description:
      "Which coding agents are installed on this machine, where each one's logs live, and " +
      "whether they hold readable usage. Call this first when a usage read comes back empty.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const found = await detect();
      return {
        agents: found,
        supported: found.filter((a) => a.state === "ready").map((a) => a.agent),
        // Named rather than omitted: "Copilot is missing" and "Copilot cannot be supported"
        // are different answers, and only one of them is a bug report.
        unsupported: [
          { agent: "copilot-cli", reason: "records only a live context gauge, not token totals" },
          { agent: "gemini-cli", reason: "transcripts carry no token counts" },
        ],
      };
    },
  },
];

export const byName = new Map(tools.map((t) => [t.name, t]));

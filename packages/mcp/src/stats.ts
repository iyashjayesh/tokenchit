import {
  adapters,
  readAll,
  readLedger,
  recordAndReplay,
  type Recovered,
} from "@tokenchit/core/adapters";
import { aggregate, type AgentId, type Detection, type Stats } from "@tokenchit/core";

export type Read = { stats: Stats; recovered: Recovered };

export const ALL_AGENTS: readonly AgentId[] = adapters.map((a) => a.id);

/**
 * Read the logs and aggregate them, the same way the CLI's `scan` does — with one deliberate
 * difference: the ledger is read and never written.
 *
 * The CLI banks what it saw because someone running `sync` wants rotated days preserved for
 * next time. An MCP tool call is a question, and a question that quietly mutates state on
 * disk is a surprise the caller cannot see or undo. Reading the bank still hands the caller
 * its recovered days; not writing it means asking twice changes nothing.
 */
export async function read(
  agents?: readonly AgentId[],
  /**
   * Report on one calendar year only.
   *
   * Threaded into `aggregate` rather than only into `buildRecap`, because `buildRecap` uses
   * it for the streak tile and nothing else — every other figure it returns comes from the
   * stats it is handed. `aggregate` is what filters the events, and skipping it is how
   * `get_recap({ year: 2021 })` came to return this year's totals under a 2021 heading.
   * `packages/core/src/aggregate.ts` carries a comment about this exact bug being fixed once
   * already for `recap --year`; this is the second time.
   */
  year?: number,
): Promise<Read> {
  const only = agents?.length ? agents : ALL_AGENTS;
  const ledger = await readLedger();
  const recovered: Recovered = { days: 0, tokens: 0 };

  /* The year filter belongs to the aggregation and not the read: the ledger must still bank
     every day it sees, or asking for one year would prune the bank to that year. Same
     reasoning as the CLI's `scan`. */
  const stats = await aggregate(
    recordAndReplay(readAll([...only]), ledger, only, recovered),
    year === undefined ? {} : { year },
  );

  return { stats, recovered };
}

export type Detected = {
  agent: AgentId;
  name: string;
  state: Detection;
  source: string;
};

/** Which agents this machine has, and whether they carry data worth reading. */
export function detect(): Promise<Detected[]> {
  return Promise.all(
    adapters.map(async (a) => ({
      agent: a.id,
      name: a.name,
      state: await a.detect(),
      source: a.source,
    })),
  );
}

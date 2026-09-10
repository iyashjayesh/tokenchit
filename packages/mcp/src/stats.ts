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
export async function read(agents?: readonly AgentId[]): Promise<Read> {
  const only = agents?.length ? agents : ALL_AGENTS;
  const ledger = await readLedger();
  const recovered: Recovered = { days: 0, tokens: 0 };

  const stats = await aggregate(
    recordAndReplay(readAll([...only]), ledger, only, recovered),
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

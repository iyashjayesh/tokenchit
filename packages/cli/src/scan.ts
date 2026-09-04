import {
  readAll,
  readLedger,
  recordAndReplay,
  writeLedger,
  type Ledger,
  type Recovered,
} from "@tokenchit/core/adapters";
import { aggregate, type AgentId, type Stats } from "@tokenchit/core";

export type Scan = {
  stats: Stats;
  /** Days the logs no longer covered in full, and what the bank put back. */
  recovered: Recovered;
  ledger: Ledger;
};

export type ScanOptions = {
  /**
   * Bank what this run saw. Off for `--dry-run`, which promises to write nothing — and the
   * ledger lives on disk like anything else, so writing it would break that promise. It also
   * keeps the privacy tests from depositing a ledger inside their fixture HOME.
   */
  write?: boolean;
  onProgress?: (p: { agent: string; events: number }) => void;
  /** Start from an empty bank. `ledger --rebuild` is the only caller. */
  fresh?: boolean;
};

/**
 * Read the logs, merge them with the ledger, and aggregate the result.
 *
 * The single place that turns "what is on this machine" into a Stats, so `sync`, `publish`
 * and `recap` cannot end up reporting different totals — which is the bug this project has
 * already fixed twice, and which a second call to `aggregate(readAll(...))` would reintroduce
 * the moment one of them forgot the ledger.
 *
 * Reading is unconditional and writing is not: a run always benefits from banked history,
 * but only a run that is allowed to touch the disk adds to it.
 */
export async function scan(agents: AgentId[], opts: ScanOptions = {}): Promise<Scan> {
  const ledger = opts.fresh ? { ...(await readLedger()), days: {} } : await readLedger();
  const recovered: Recovered = { days: 0, tokens: 0 };

  const stats = await aggregate(
    recordAndReplay(readAll(agents, opts.onProgress), ledger, agents, recovered),
  );

  if (opts.write !== false) await writeLedger(ledger);
  return { stats, recovered, ledger };
}

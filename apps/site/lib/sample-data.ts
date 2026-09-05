/**
 * Fallback sample data, originally ported from the design prototype.
 *
 * Only reached when the board is empty and there is no real member to feature. Every figure
 * is plausible individual-developer usage rather than anybody's actual totals — which is why
 * it must never be shown under a real handle, and why readFeatured prefers a published
 * profile over any of this.
 */

export const DEFAULT_HANDLE = "iyashjayesh";

/** Heatmap ramp, low to high. */
export const RAMP = ["#F5F4EE", "#E7F5BE", "#C6FF3D", "#FFD23D", "#FF5C3D"] as const;

/** Rank 1–3 medal fills. */
export const QUERY_OPTIONS = [
  { key: "layout", def: "default", note: "default (495px) or compact (340px)" },
  { key: "theme",  def: "auto",    note: "auto follows GitHub dark mode; force light or dark" },
  { key: "agents", def: "all",     note: "comma-separated allowlist, e.g. claude-code,codex" },
  { key: "hide",   def: "—",       note: "drop any of spend, streak, mix from the card" },
  { key: "cache",  def: "4h",      note: "clamped 4h–24h, same as the rest of the genre" },
];

/**
 * The real tests in packages/cli/test/privacy.test.js, by their real names. The section that
 * renders this claims to be `npm test` output, so it has to stay in step with the suite —
 * if a test is renamed there, rename it here. Durations are a representative run, not a
 * live feed — the section says "run on every push", which is what CI does, and does not
 * claim these numbers were measured just now.
 */
export const PRIVACY_TESTS = [
  { name: "payload.noContent", desc: "no prompt, reply, branch or file content survives into an uploaded payload",   ms: "44ms" },
  { name: "paths.absent",      desc: "no filesystem path is collected at all — not hashed, not truncated, absent",   ms: "35ms" },
  { name: "dryrun.exact",      desc: "--dry-run prints the byte-identical body that a real publish puts on the wire", ms: "90ms" },
  { name: "net.isolated",      desc: "no source file outside src/net.ts can open a socket",                          ms: "7ms" },
  { name: "payload.noContent.everyAdapter", desc: "the same guarantee proved for Codex and OpenCode, not Claude Code alone", ms: "51ms" },
];

export const AGENT_BREAKDOWN = [
  { name: "claude-code", pct: "58%", w: "58%", color: "#C6FF3D", tokens: "2.46B", cost: "$742.10" },
  { name: "codex",       pct: "21%", w: "21%", color: "#FF5C3D", tokens: "890M",  cost: "$268.40" },
  { name: "opencode",    pct: "21%", w: "21%", color: "#8A8A82", tokens: "902M",  cost: "—" },
];

/**
 * Illustrative card figures.
 *
 * Used only when the default handle has no published profile to read — a fresh database, or
 * before anyone has run `publish`. When a real profile exists the hero shows that instead,
 * because a made-up total under a real person's handle reads as their card and is wrong.
 */
export const OWN_STATS = {
  tokens: "4.24B",
  spend: "$1,284",
  streak: "63d",
  syncedAt: "SYNCED 2H AGO",
  mix: [
    { agent: "claude-code", pct: 58 },
    { agent: "codex",       pct: 21 },
    { agent: "opencode",    pct: 21 },
  ],
};

export type HeatRow = {
  day: string;
  cells: string[];
  share: string;
  total: string;
  barColor: string;
  labelColor: string;
};

/**
 * Seeded LCG — deterministic, so the server and client renders are byte-identical
 * and no hydration mismatch is possible. Ported unchanged from the prototype.
 *
 * Day totals are derived from the UNROUNDED score, not from the quantised colour
 * level: quantising first collapses several days onto identical figures, which
 * reads as a rendering bug.
 */
function buildHeatmap(): HeatRow[] {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  let s = 20260901;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;

  const rows = days.map((day, di) => {
    const weekend = di > 4 ? 0.35 : 1;
    const cells: string[] = [];
    let score = 0;
    for (let h = 0; h < 24; h++) {
      const peak =
        Math.exp(-Math.pow(h - 16, 2) / 26) +
        0.45 * Math.exp(-Math.pow(h - 10.5, 2) / 12);
      const v = peak * weekend * (0.6 + rnd() * 0.8);
      score += v;
      cells.push(RAMP[Math.min(4, Math.max(0, Math.round(v * 4.2)))]);
    }
    return { day, cells, score };
  });

  const max = Math.max(...rows.map((r) => r.score));
  const sum = rows.reduce((a, r) => a + r.score, 0);

  return rows.map((r) => {
    const tk = 4.24 * (r.score / sum);
    return {
      day: r.day,
      cells: r.cells,
      share: Math.round((r.score / max) * 100) + "%",
      total: tk >= 1 ? tk.toFixed(2) + "B" : Math.round(tk * 1000) + "M",
      barColor: r.score === max ? "#FF5C3D" : "#C6FF3D",
      labelColor: r.score === max ? "#101010" : "#8A8A82",
    };
  });
}

/** Evaluated once at module scope — pure and deterministic. */
export const HEATMAP: HeatRow[] = buildHeatmap();

/** Hour labels every third hour, aligned to their columns. */
export const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i % 3 === 0 ? String(i).padStart(2, "0") : "",
);

/** Continuous coral peak bar spanning hour columns 14–19. */
export const PEAK_MASK = Array.from({ length: 24 }, (_, i) =>
  i >= 14 && i <= 19 ? "#FF5C3D" : "transparent",
);

/** Re-exported so components have one import for placeholder data and handle rules alike. */
export { sanitizeHandle } from "@tokenchit/core";

/**
 * Year-in-review tiles. Kept separate from OWN_STATS because the recap page has no
 * card constraints and shows unabbreviated figures — the recap cost is "$1,284.60"
 * where the card rounds it to "$1,284".
 */
export const RECAP_TILES = {
  totalTokens: "4.24B",
  totalSpend: "$1,284.60",
  topModel: "claude-sonnet-4-5",
  longestStreak: "63d",
};

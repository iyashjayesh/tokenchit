"use client";

import { OWN_STATS } from "@/lib/sample-data";
import { useSiteState } from "./site-state";
import styles from "./stat-card.module.css";

/**
 * The hero's live preview card. Deliberately HTML/CSS rather than SVG: the handle is
 * live-bound to the input below it, and text injected into an <svg><text> node does
 * not lay out. The static cards in section 01 stay SVG (see lib/card-svg.ts).
 *
 * Geometry mirrors the SVG card exactly. Note the streak is not coloured here.
 */
const MIX_FILLS = ["var(--lime)", "var(--ink)", "var(--seg-2)", "var(--seg-3)"];

export function StatCard() {
  const { handle } = useSiteState();

  return (
    <div className={styles.card}>
      <div className={styles.handle}>@{handle}</div>
      <div className={styles.rule} />

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>TOKENS</div>
          <div className={styles.statValue}>{OWN_STATS.tokens}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>EQUIV. COST</div>
          <div className={styles.statValue}>{OWN_STATS.spend}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>STREAK</div>
          <div className={styles.statValue}>{OWN_STATS.streak}</div>
        </div>
      </div>

      <div className={styles.mix}>
        {OWN_STATS.mix.map((m, i) => (
          <span key={m.agent} style={{ flex: m.pct, background: MIX_FILLS[i] }} />
        ))}
      </div>

      <div className={styles.legend}>
        {OWN_STATS.mix.map((m, i) => (
          <span key={m.agent} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: MIX_FILLS[i] }} />
            {m.agent} {m.pct}%
          </span>
        ))}
      </div>

      <div className={styles.footer}>
        <span>TOKENSTATS.APP</span>
        <span>{OWN_STATS.syncedAt}</span>
      </div>
    </div>
  );
}

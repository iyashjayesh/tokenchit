"use client";

import { agentMark, ICON_VIEWBOX } from "@tokenchit/core";

import { OWN_STATS } from "@/lib/sample-data";
import { useSiteState } from "./site-state";
import styles from "./stat-card.module.css";

/**
 * The hero's live preview card. Deliberately HTML/CSS rather than SVG: the handle is
 * live-bound to the input below it, and text injected into an <svg><text> node does
 * not lay out. The static cards in section 01 stay SVG (see lib/card-svg.ts).
 *
 * Geometry mirrors the SVG card exactly. Note the streak is not coloured here.
 *
 * The agent marks come from the same table the SVG card uses, so the preview cannot show a
 * different legend from the thing it is previewing — which it did, silently, when the marks
 * were added to the builder and this hand-written copy was missed.
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
        {OWN_STATS.mix.map((m) => (
          <span key={m.agent} className={styles.legendItem}>
            <svg
              className={styles.mark}
              viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
              aria-hidden="true"
            >
              {/* The card sits on a light ground, so the light colour is always the right one. */}
              <path d={agentMark(m.agent).path} fill={agentMark(m.agent).light} />
            </svg>
            {m.agent} {m.pct}%
          </span>
        ))}
      </div>

      <div className={styles.footer}>
        <span>TOKENCHIT.APP</span>
        <span>{OWN_STATS.syncedAt}</span>
      </div>
    </div>
  );
}

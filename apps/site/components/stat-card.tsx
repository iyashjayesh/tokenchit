import { agentColour, agentMark, CARD_HOST, formatShare, ICON_VIEWBOX } from "@tokenchit/core";

import type { Featured } from "@/lib/featured";
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

/*
 * A server component again.
 *
 * The handle came from a context whose setter nothing ever called — there used to be a live
 * input in the hero and it is gone — so `handle` could only ever be `preview.handle`, and the
 * `borrowed` guard that existed to catch the mismatch was unreachable. Reading the prop
 * directly says the same thing with nothing left to drift.
 */
export function StatCard({ preview }: { preview: Featured }) {
  const handle = preview.handle;

  return (
    <div className={styles.card}>
      <div className={styles.handle}>@{handle}</div>
      <div className={styles.rule} />

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>TOKENS</div>
          <div className={styles.statValue}>{preview.tokens}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>EQUIV. COST</div>
          <div className={styles.statValue}>{preview.spend}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>STREAK</div>
          <div className={styles.statValue}>{preview.streak}</div>
        </div>
      </div>

      {/* The fourth palette for this one fact, now the same as the other three. */}
      <div
        className={styles.mix}
        role="img"
        aria-label={`Agent mix: ${preview.mix
          .map((m) => `${m.agent} ${formatShare(m.pct)}`)
          .join(", ")}`}
      >
        {preview.mix.map((m) => (
          <span key={m.agent} style={{ flex: m.pct, background: agentColour(m.agent) }} />
        ))}
      </div>

      <div className={styles.legend}>
        {preview.mix.map((m) => (
          <span key={m.agent} className={styles.legendItem}>
            <svg
              className={styles.mark}
              viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
              aria-hidden="true"
            >
              {/* The card sits on a light ground, so the light colour is always the right one. */}
              <path d={agentMark(m.agent).path} fill={agentMark(m.agent).light} />
            </svg>
            {m.agent} {formatShare(m.pct)}
          </span>
        ))}
      </div>

      <div className={styles.footer}>
        <span>{CARD_HOST}</span>
        <span>{preview.syncedAt}</span>
      </div>
    </div>
  );
}

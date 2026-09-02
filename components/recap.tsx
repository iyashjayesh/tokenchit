import { SectionHeading } from "@/components/section-heading";
import {
  AGENT_BREAKDOWN,
  DEFAULT_HANDLE,
  HEATMAP,
  HOUR_LABELS,
  PEAK_MASK,
  RAMP,
  RECAP_TILES,
} from "@/lib/sample-data";
import styles from "./recap.module.css";

/**
 * Section 05 — the standalone recap page preview. Server component: every figure
 * is precomputed in @/lib/sample-data, so this section ships no JavaScript.
 *
 * The only inline styles are per-item data values — bar widths, ramp colours and
 * the busiest-day highlight — which cannot live in a static stylesheet.
 */
export function Recap() {
  return (
    <section id="recap" className={styles.section}>
      <SectionHeading n={5} title="Year in review" tone="coral" />
      <p className={styles.intro}>
        A static recap page at tokencard.dev/u/{DEFAULT_HANDLE}/2026. Same
        data, no card constraints.
      </p>

      <div className={styles.tiles}>
        <div className={`${styles.tile} ${styles.tileLime}`}>
          <div className={styles.tileLabel}>total tokens</div>
          <div className={styles.figure}>{RECAP_TILES.totalTokens}</div>
        </div>
        <div className={`${styles.tile} ${styles.tileWhite}`}>
          <div className={styles.tileLabel}>total spend</div>
          <div className={styles.figure}>{RECAP_TILES.totalSpend}</div>
        </div>
        <div className={`${styles.tile} ${styles.tileWhite}`}>
          <div className={styles.tileLabel}>top model</div>
          {/* The one figure that stays mono — a model id reads as a token, not a number. */}
          <div className={styles.figureModel}>{RECAP_TILES.topModel}</div>
        </div>
        <div className={`${styles.tile} ${styles.tileCoral}`}>
          <div className={styles.tileLabel}>longest streak</div>
          <div className={styles.figure}>{RECAP_TILES.longestStreak}</div>
        </div>
      </div>

      <div className={styles.agentPanel}>
        <div className={styles.panelTitle}>per-agent breakdown</div>
        <div className={styles.scroll}>
          <table className={styles.agentTable}>
            <thead>
              <tr>
                <th className={`${styles.th} ${styles.colAgent}`}>agent</th>
                <th className={styles.th}>share</th>
                <th className={`${styles.th} ${styles.colNum}`}>tokens</th>
                <th className={`${styles.th} ${styles.colLast}`}>cost</th>
              </tr>
            </thead>
            <tbody>
              {AGENT_BREAKDOWN.map((a) => (
                <tr key={a.name} className={styles.agentRow}>
                  <td className={`${styles.td} ${styles.tdName}`}>{a.name}</td>
                  <td className={styles.td}>
                    <div className={styles.shareCell}>
                      <div className={styles.shareTrack}>
                        <span
                          className={styles.shareFill}
                          style={{ width: a.w, background: a.color }}
                        />
                      </div>
                      <span className={styles.sharePct}>{a.pct}</span>
                    </div>
                  </td>
                  <td className={`${styles.td} ${styles.tdTokens}`}>{a.tokens}</td>
                  <td className={`${styles.td} ${styles.tdCost}`}>{a.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.heatPanel}>
        <div className={styles.heatHead}>
          <span className={styles.panelTitle}>activity by day and hour</span>
          <span className={styles.legend}>
            less
            {RAMP.map((c) => (
              <span key={c} className={styles.swatch} style={{ background: c }} />
            ))}
            more
          </span>
        </div>

        <div className={styles.scroll}>
          <div className={styles.grid}>
            {HEATMAP.map((row) => (
              <div key={row.day} className={styles.heatRow}>
                <span
                  className={styles.dayLabel}
                  style={{ color: row.labelColor }}
                >
                  {row.day}
                </span>
                {/* The ink tray and its 2px gaps are the grid rules; cells carry no border. */}
                <div className={styles.tray}>
                  {row.cells.map((c, h) => (
                    <span
                      key={`${row.day}-${h}`}
                      className={styles.cell}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <span className={styles.rowRight}>
                  <span className={styles.miniBar}>
                    <span
                      className={styles.miniFill}
                      style={{ width: row.share, background: row.barColor }}
                    />
                  </span>
                  <span className={styles.rowTotal}>{row.total}</span>
                </span>
              </div>
            ))}

            <div className={styles.axis}>
              <span className={styles.axisSpacer} />
              <div className={styles.axisMid}>
                <div className={styles.peakBar}>
                  {PEAK_MASK.map((p, i) => (
                    <span
                      key={`peak-${i}`}
                      className={styles.peakCell}
                      style={{ background: p }}
                    />
                  ))}
                </div>
                <div className={styles.hourRow}>
                  {HOUR_LABELS.map((h, i) => (
                    <span key={`hour-${i}`} className={styles.hour}>
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <span className={styles.axisTotal}>day total</span>
            </div>
          </div>
        </div>

        <p className={styles.caption}>
          <span className={styles.captionSwatch} />
          Peak block: Tue–Thu, 14:00–19:00 local. Derived from log timestamps
          only.
        </p>
      </div>
    </section>
  );
}

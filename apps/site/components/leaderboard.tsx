"use client";

import { useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { useSiteState } from "@/components/site-state";
import { BOARD_ROWS, MEDALS, WINDOWS, type Window } from "@/lib/sample-data";
import styles from "./leaderboard.module.css";

/**
 * Section 02 — the public opt-in board.
 *
 * The window filter is cosmetic: it selects a label, not a query. It stays local
 * state because nothing outside this section reads it; the signed-in handle, which
 * decides which row is tinted, comes from site state so the hero input drives it live.
 */
export function Leaderboard() {
  const { handle } = useSiteState();
  const [activeWindow, setActiveWindow] = useState<Window>("this year");

  return (
    <section id="board" className={styles.section}>
      <SectionHeading n={2} title="The board" tone="coral">
        <span className={styles.sticker}>opt-in</span>
      </SectionHeading>

      <p className={styles.intro}>
        Public ranking of signed-in developers who chose to publish. Sign in with GitHub,
        flip one switch, and you are on it. Leave and your row disappears within the hour.
      </p>

      <div className={styles.filters}>
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setActiveWindow(w)}
            className={w === activeWindow ? styles.filterActive : styles.filter}
          >
            {w}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.head}>
              <th className={styles.wRank}>rank</th>
              <th>developer</th>
              <th className={styles.wMix}>agent mix</th>
              <th className={`${styles.wTokens} ${styles.num}`}>tokens</th>
              <th className={`${styles.wSpend} ${styles.num}`}>spend</th>
              <th className={`${styles.wStreak} ${styles.num}`}>streak</th>
            </tr>
          </thead>
          <tbody>
            {BOARD_ROWS.map((r, i) => {
              const own = r.user === handle;
              // Medals outrank the own-row lime; both outrank the default white fill.
              const medalBg = i < 3 ? MEDALS[i] : own ? "var(--lime)" : "var(--surface)";
              return (
                <tr key={r.user} className={own ? styles.rowOwn : styles.row}>
                  <td>
                    <span className={styles.rank} style={{ background: medalBg }}>
                      {i + 1}
                    </span>
                  </td>
                  <td>
                    <div className={styles.dev}>
                      <span className={styles.handle}>@{r.user}</span>
                      <span className={styles.verified} title="GitHub identity verified">
                        ✓
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.bar}>
                      <span className={styles.seg0} style={{ flex: r.mix[0] }} />
                      <span className={styles.seg1} style={{ flex: r.mix[1] }} />
                      <span className={styles.seg2} style={{ flex: r.mix[2] }} />
                    </div>
                  </td>
                  <td className={`${styles.num} ${styles.tokens}`}>{r.tokens}</td>
                  <td className={styles.num}>{r.spend}</td>
                  <td className={`${styles.num} ${styles.streak}`}>{r.streak}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={styles.foot}>
        Rank is total tokens over the selected window. It is a usage count, not a skill
        score. Every listed developer has a verified GitHub identity.
      </p>
    </section>
  );
}

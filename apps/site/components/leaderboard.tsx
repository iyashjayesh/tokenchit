"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SectionHeading } from "@/components/section-heading";
import { useSiteState } from "@/components/site-state";
import { formatTokens, formatUsd } from "@tokenchit/core";
import type { BoardRow } from "@/lib/board";
import { WINDOWS, type BoardWindow } from "@/lib/board";
import styles from "./leaderboard.module.css";

/** Gold, silver, bronze. Only the top three; everyone else takes the default fill. */
const MEDALS = ["#FFD23D", "#E4E2D8", "#F0B37E"] as const;

/** The three segment classes, in the order the mix is drawn. */
const SEGMENTS = [styles.seg0, styles.seg1, styles.seg2] as const;

/**
 * Section 02 — the public opt-in board, on real data.
 *
 * The window buttons are a real query now, not a label. Every column in a row is summed over
 * the same window, which is why `user_days` carries an agent and a cost: a row whose tokens
 * covered a week while its cost covered a year reads as one figure and gets quoted as one.
 *
 * Rows are handed in from the server so the table is populated on first paint; changing the
 * window refetches on the client and keeps the old rows on screen while it does, because a
 * table that empties and refills makes the whole page jump.
 */
export function Leaderboard({ initialRows, initialWindow }: {
  initialRows: BoardRow[];
  initialWindow: BoardWindow;
}) {
  const { handle } = useSiteState();
  const [activeWindow, setActiveWindow] = useState<BoardWindow>(initialWindow);
  const [rows, setRows] = useState<BoardRow[]>(initialRows);
  // Which window the rows on screen actually belong to. `stale` is derived from it rather
  // than kept as its own state: setting state synchronously inside an effect triggers a
  // second render pass before the browser paints.
  const [loadedWindow, setLoadedWindow] = useState<BoardWindow>(initialWindow);
  const stale = loadedWindow !== activeWindow;

  useEffect(() => {
    if (activeWindow === loadedWindow) return;

    let cancelled = false;

    fetch(`/api/submissions?window=${activeWindow}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { rows: BoardRow[] }) => {
        if (cancelled) return;
        setRows(data.rows);
        setLoadedWindow(activeWindow);
      })
      // A board that fails to load should leave the previous window on screen rather than
      // replace real figures with an error. Marking it loaded stops the dimming, so it stops
      // looking pending.
      .catch(() => {
        if (!cancelled) setLoadedWindow(activeWindow);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWindow, loadedWindow]);

  return (
    <section id="board" className={styles.section}>
      <SectionHeading n={2} title="The board" tone="coral">
        <span className={styles.sticker}>opt-in</span>
      </SectionHeading>

      <p className={styles.intro}>
        Public ranking of developers who chose to publish. Run{" "}
        <span className={styles.strong}>tokenchit publish</span> and you are on it. Stop
        publishing and your row goes stale, then falls out of the window on its own.
      </p>

      <div className={styles.filters}>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setActiveWindow(w.key)}
            className={w.key === activeWindow ? styles.filterActive : styles.filter}
          >
            {w.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>
          Nobody has published in this window yet.{" "}
          <span className={styles.strong}>npx @tokenchit/cli publish</span> and the board is
          yours.
        </p>
      ) : (
        <div className={styles.tableWrap} style={stale ? { opacity: 0.55 } : undefined}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.head}>
                <th className={styles.wRank}>rank</th>
                <th>developer</th>
                <th className={styles.wMix}>agent mix</th>
                <th className={`${styles.wTokens} ${styles.num}`}>tokens</th>
                <th className={`${styles.wSpend} ${styles.num}`}>equiv. cost</th>
                <th className={`${styles.wStreak} ${styles.num}`}>streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const own = r.handle.toLowerCase() === handle.toLowerCase();
                // Medals outrank the own-row lime; both outrank the default white fill.
                const medalBg = i < 3 ? MEDALS[i] : own ? "var(--lime)" : "var(--surface)";
                // Largest agent first, so the bar reads consistently row to row.
                const mix = Object.entries(r.mix).sort((a, b) => b[1] - a[1]);

                return (
                  <tr key={r.handle} className={own ? styles.rowOwn : styles.row}>
                    <td>
                      <span className={styles.rank} style={{ background: medalBg }}>
                        {r.rank}
                      </span>
                    </td>
                    <td>
                      <Link href={`/u/${r.handle}`} className={styles.dev}>
                        <span className={styles.handle}>@{r.handle}</span>
                        {/* Tier-driven. Marking an unverified row with the same tick as a
                            verified one is the single thing this board must never do. */}
                        {r.tier === "verified" ? (
                          <span className={styles.verified} title="GitHub identity verified">
                            ✓
                          </span>
                        ) : (
                          <span className={styles.unverified} title="Self-reported; the handle is unproven">
                            cli
                          </span>
                        )}
                      </Link>
                    </td>
                    <td>
                      <div className={styles.bar}>
                        {mix.map(([agent, tokens], si) => (
                          <span
                            key={agent}
                            className={SEGMENTS[Math.min(si, SEGMENTS.length - 1)]}
                            style={{ flex: tokens }}
                            title={`${agent} · ${formatTokens(tokens)}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className={`${styles.num} ${styles.tokens}`}>
                      {formatTokens(r.tokens)}
                    </td>
                    <td className={styles.num}>{formatUsd(r.equivCostUsd)}</td>
                    <td className={`${styles.num} ${styles.streak}`}>{r.streakDays}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.foot}>
        <Link href="/board" className={styles.moreLink}>
          See the full board →
        </Link>{" "}
        Rank is total tokens over the selected window; cost and agent mix cover the same
        window. Streak is the current run of active days, which is not a windowed figure. A{" "}
        <span className={styles.strong}>cli</span> badge means the numbers were self-reported
        without a GitHub sign-in.
      </p>
    </section>
  );
}

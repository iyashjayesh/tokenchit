"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SectionHeading } from "@/components/section-heading";
import { agentColour, formatTokens, formatUsd } from "@tokenchit/core";
import type { BoardRow } from "@/lib/board";
import { LANDING_ROWS, staleLabel, WINDOWS, type BoardWindow } from "@/lib/board";
import styles from "./leaderboard.module.css";
import { cmd, PRIMARY_COMMAND } from "@/lib/cli";

/** Gold, silver, bronze. Only the top three; everyone else takes the default fill. */
const MEDALS = ["#FFD23D", "#E4E2D8", "#F0B37E"] as const;

/** The three segment classes, in the order the mix is drawn. */

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
export function Leaderboard({ initialRows, initialWindow, featuredHandle }: {
  initialRows: BoardRow[];
  initialWindow: BoardWindow;
  /*
   * Whose card is shown in the hero, so their row can be pointed at.
   *
   * This came from a context and was styled `rowOwn`, which read as "your row" — but nothing
   * ever set that state to the reader's handle, so the highlight always landed on the
   * featured stranger. Naming it for what it is keeps the useful bit (the row belongs to the
   * card above) without the claim that it is yours.
   */
  featuredHandle: string;
}) {
  const [activeWindow, setActiveWindow] = useState<BoardWindow>(initialWindow);
  const [rows, setRows] = useState<BoardRow[]>(initialRows);
  // Which window the rows on screen actually belong to. `stale` is derived from it rather
  // than kept as its own state: setting state synchronously inside an effect triggers a
  // second render pass before the browser paints.
  const [loadedWindow, setLoadedWindow] = useState<BoardWindow>(initialWindow);
  /** Set when a window switch could not be loaded, cleared by the next one that can. */
  const [failed, setFailed] = useState(false);
  const stale = loadedWindow !== activeWindow;

  useEffect(() => {
    if (activeWindow === loadedWindow) return;

    let cancelled = false;

    fetch(`/api/submissions?window=${activeWindow}&limit=${LANDING_ROWS}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { rows: BoardRow[] }) => {
        if (cancelled) return;
        setRows(data.rows);
        setLoadedWindow(activeWindow);
        setFailed(false);
      })
      /*
       * A failed switch keeps the rows AND the label they belong to.
       *
       * Leaving the previous window's figures on screen is right; marking them as belonging
       * to the requested window was not. The filter would highlight "30 days" above a year of
       * data with nothing to say otherwise, which is a quieter lie than an error would have
       * been. Reverting the selection puts the label back on the data it describes.
       */
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setActiveWindow(loadedWindow);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWindow, loadedWindow]);

  return (
    <section id="board" className={styles.section}>
      <SectionHeading n={1} title="The board" tone="coral">
        <span className={styles.sticker}>opt-in</span>
      </SectionHeading>

      <p className={styles.intro}>
        Public ranking of developers who chose to publish. Run{" "}
        <span className={styles.strong}>{cmd("publish")}</span> and you are on it. Stop
        publishing and your row goes stale, then falls out of the window on its own.
      </p>

      <div className={styles.filters}>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setActiveWindow(w.key)}
            className={w.key === activeWindow ? styles.filterActive : styles.filter}
            /* Buttons, not links, so `aria-pressed` is the right state here — but the same
               problem: the selection was carried by background colour alone. */
            aria-pressed={w.key === activeWindow}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Said out loud, politely: the reader asked for something and did not get it, and the
          rows below are the previous answer rather than the one they clicked for. */}
      {failed && (
        <p className={styles.loadFailed} role="status">
          Could not load that window — still showing {loadedWindow === "all" ? "all time" : loadedWindow}.
        </p>
      )}

      {rows.length === 0 ? (
        <p className={styles.empty}>
          Nobody has published in this window yet.{" "}
          <span className={styles.strong}>{PRIMARY_COMMAND}</span> and the board is
          yours.
        </p>
      ) : (
        <div className={styles.tableWrap} style={stale ? { opacity: 0.55 } : undefined}>
          <table className={styles.table}>
            {/* Named for screen readers, which announce a table by its caption; visually
                hidden because the heading above already says this to everyone else. */}
            <caption className={styles.srOnly}>Top developers by tokens</caption>
            <thead>
              <tr className={styles.head}>
                <th scope="col" className={styles.wRank}>rank</th>
                <th scope="col">developer</th>
                <th scope="col" className={styles.wMix}>agent mix</th>
                <th scope="col" className={`${styles.wTokens} ${styles.num}`}>tokens</th>
                <th scope="col" className={`${styles.wSpend} ${styles.num}`}>equiv. cost</th>
                <th scope="col" className={`${styles.wStreak} ${styles.num}`}>streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const stale = staleLabel(r.lastPublished);
                const featured = r.handle.toLowerCase() === featuredHandle.toLowerCase();
                // Medals outrank the featured lime; both outrank the default white fill.
                const medalBg = i < 3 ? MEDALS[i] : featured ? "var(--lime)" : "var(--surface)";
                // Largest agent first, so the bar reads consistently row to row.
                const mix = Object.entries(r.mix).sort((a, b) => b[1] - a[1]);

                return (
                  <tr key={r.handle} className={featured ? styles.rowOwn : styles.row}>
                    <td>
                      <span className={styles.rank} style={{ background: medalBg }}>
                        {r.rank}
                      </span>
                    </td>
                    <td>
                      <Link href={`/u/${r.handle}`} className={styles.dev}>
                        {/* Same rule as the full board: the avatar comes from the GitHub id,
                            which only exists once somebody proved the handle, so an
                            unverified row has nothing to render a face from. */}
                        {r.githubId ? (
                          <img
                            className={styles.avatar}
                            src={`/api/avatar/${r.githubId}`}
                            width={22}
                            height={22}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className={styles.avatarBlank} aria-hidden="true" />
                        )}
                        <span className={styles.handle}>@{r.handle}</span>
                        {stale && (
                          <span className={styles.stale} title={`Last published ${r.lastPublished?.slice(0, 10)}`}>
                            {stale}
                          </span>
                        )}
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
                      {/* Per agent, not per position — see agentColour in core. */}
                      <div
                        className={styles.bar}
                        role="img"
                        aria-label={`Agent mix: ${mix
                          .map(([a, t]) => `${a} ${formatTokens(t)}`)
                          .join(", ")}`}
                      >
                        {mix.map(([agent, tokens]) => (
                          <span
                            key={agent}
                            className={styles.seg}
                            style={{ flex: tokens, background: agentColour(agent) }}
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

      {/* A link inside the footnote was there all along and nobody found it — the paragraph
          reads as small print, so the one thing in it that goes somewhere looked like small
          print too. Same destination, given the weight of the window buttons above. */}
      <div className={styles.moreRow}>
        <Link href="/board" className={styles.moreButton}>
          See the full board →
        </Link>
      </div>

      <p className={styles.foot}>
        Rank is total tokens over the selected window; cost and agent mix cover the same
        window. Streak is the current run of active days, which is not a windowed figure. A{" "}
        <span className={styles.strong}>cli</span> badge means the numbers were self-reported
        without a GitHub sign-in.
      </p>
    </section>
  );
}

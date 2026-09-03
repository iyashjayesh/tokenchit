import type { Metadata } from "next";
import Link from "next/link";

import { formatTokens, formatUsd } from "@tokenchit/core";

import { PageShell } from "@/components/page-shell";
import { isWindow, WINDOWS, type BoardWindow } from "@/lib/board";
import { readBoard } from "@/lib/board-query";
import { readBoardTotals } from "@/lib/board-totals";

import styles from "./board.module.css";
import { cmd, npx } from "@/lib/cli";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "The board · tokenchit",
  description: "Public ranking of developers who chose to publish their AI coding agent usage.",
};

/** Gold, silver, bronze. Only the top three; everyone else takes the default fill. */
const MEDALS = ["#FFD23D", "#E4E2D8", "#F0B37E"] as const;
const SEGMENTS = [styles.seg0, styles.seg1, styles.seg2] as const;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const requested = (await searchParams).window ?? null;
  const window: BoardWindow = isWindow(requested) ? requested : "year";

  const [rows, totals] = await Promise.all([
    readBoard(window, 100).catch(() => []),
    readBoardTotals(window).catch(() => null),
  ]);

  const summary: [string, string][] = totals
    ? [
        ["developers", String(totals.developers)],
        ["tokens", formatTokens(totals.tokens)],
        ["equiv. cost", formatUsd(totals.equivCostUsd)],
        ["verified", `${totals.verified} of ${totals.developers}`],
      ]
    : [];

  return (
    <PageShell crumbs={[{ href: "/board", label: "board" }]}>
      <header className={styles.head}>
        <h1 className={styles.h1}>The board</h1>
        <span className={styles.sticker}>opt-in</span>
      </header>

      <p className={styles.intro}>
        Everyone who ran <span className={styles.strong}>{cmd("publish")}</span>. Rank is
        total tokens over the selected window, and every column — cost, agent mix — covers
        that same window. It is a usage count, not a skill score.
      </p>

      <nav className={styles.windows} aria-label="Time window">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/board${w.key === "year" ? "" : `?window=${w.key}`}`}
            className={w.key === window ? styles.windowActive : styles.window}
          >
            {w.label}
          </Link>
        ))}
      </nav>

      {summary.length > 0 && (
        <div className={styles.summary}>
          {summary.map(([label, value]) => (
            <div key={label} className={styles.stat}>
              <div className={styles.statLabel}>{label}</div>
              <div className={styles.statValue}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className={styles.empty}>
          Nobody has published in this window yet.{" "}
          <span className={styles.strong}>{npx("publish")}</span> and the board is
          yours.
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.headRow}>
                <th className={styles.wRank}>rank</th>
                <th>developer</th>
                <th className={styles.wMix}>agent mix</th>
                <th className={`${styles.wNum} ${styles.num}`}>tokens</th>
                <th className={`${styles.wNum} ${styles.num}`}>equiv. cost</th>
                <th className={`${styles.wStreak} ${styles.num}`}>streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const mix = Object.entries(r.mix).sort((a, b) => b[1] - a[1]);
                const mixTotal = mix.reduce((a, [, n]) => a + n, 0);
                return (
                  <tr key={r.handle} className={styles.row}>
                    <td>
                      <span
                        className={styles.rank}
                        style={{ background: i < 3 ? MEDALS[i] : "var(--surface)" }}
                      >
                        {r.rank}
                      </span>
                    </td>
                    <td>
                      <Link href={`/u/${r.handle}`} className={styles.dev}>
                        <span className={styles.handle}>@{r.handle}</span>
                        {r.tier === "verified" ? (
                          <span className={styles.verified} title="GitHub identity verified">
                            ✓
                          </span>
                        ) : (
                          <span
                            className={styles.unverified}
                            title="Self-reported; the handle is unproven"
                          >
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
                            title={`${agent} · ${((tokens / mixTotal) * 100).toFixed(1)}%`}
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
        A <span className={styles.strong}>cli</span> badge means the numbers were self-reported
        without a GitHub sign-in; those rows stay on the board rather than being hidden, because
        a visible unverified row is more honest than a quietly filtered one. Streak is the
        current run of active days, which is not a windowed figure. Figures are self-reported
        and bounded for plausibility, not audited.
      </p>
    </PageShell>
  );
}

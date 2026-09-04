import type { Metadata } from "next";
import Link from "next/link";

import { formatTokens, formatUsd } from "@tokenchit/core";

import { PageShell } from "@/components/page-shell";
import { isWindow, WINDOWS, type BoardWindow } from "@/lib/board";
import { readBoard } from "@/lib/board-query";
import { readBoardTotals } from "@/lib/board-totals";

import styles from "./board.module.css";
import { cmd, PRIMARY_COMMAND } from "@/lib/cli";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "The board · tokenchit",
  description: "Public ranking of developers who chose to publish their AI coding agent usage.",
};

/** Gold, silver, bronze. Only the top three; everyone else takes the default fill. */
const MEDALS = ["#FFD23D", "#E4E2D8", "#F0B37E"] as const;
const SEGMENTS = [styles.seg0, styles.seg1, styles.seg2] as const;

/** A page that fits on a screen rather than becoming a scroll. */
const PER_PAGE = 25;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; page?: string }>;
}) {
  const params = await searchParams;
  const requested = params.window ?? null;
  const window: BoardWindow = isWindow(requested) ? requested : "year";

  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const offset = (page - 1) * PER_PAGE;

  const [rows, totals] = await Promise.all([
    readBoard(window, PER_PAGE, offset).catch(() => []),
    readBoardTotals(window).catch(() => null),
  ]);

  const total = totals?.developers ?? rows.length;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + rows.length;
  const href = (p: number) => `/board?window=${window}${p > 1 ? `&page=${p}` : ""}`;

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

      {/* One line, because someone arriving here came to read a ranking. The rules that
          govern it are worth stating and are stated — underneath the table, where they answer
          a question the reader has by then actually formed. */}
      <p className={styles.intro}>
        Everyone who ran <span className={styles.strong}>{cmd("publish")}</span>. A usage
        count over the selected window, not a skill score.
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
          <span className={styles.strong}>{PRIMARY_COMMAND}</span> and the board is
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

      {rows.length > 0 && (
        /* Shown even on a single page, because "1–2 of 2" answers "is this everyone?" — which
           is the first thing a ranking makes someone wonder, and a bare table never says. */
        <nav className={styles.pager} aria-label="Board pages">
          <span className={styles.range}>
            {from}–{to} of {total}
          </span>

          <span className={styles.pageLinks}>
            {page > 1 ? (
              <Link href={href(page - 1)} rel="prev">
                ← prev
              </Link>
            ) : (
              <span className={styles.disabled}>← prev</span>
            )}
            <span className={styles.pageOf}>
              page {page} of {lastPage}
            </span>
            {page < lastPage ? (
              <Link href={href(page + 1)} rel="next">
                next →
              </Link>
            ) : (
              <span className={styles.disabled}>next →</span>
            )}
          </span>
        </nav>
      )}

      {/* The rules live here rather than above the table. A reader arriving at a leaderboard
          wants the leaderboard; the question "why is that one first?" only forms once they
          have seen it, and this is where they are when they ask. */}
      <section className={styles.notes}>
        <h2 className={styles.notesHead}>How this is ranked</h2>
        <p className={styles.foot}>
          Verified rows first, then tokens over the selected window. Signing in is the only
          thing that ties a row to a GitHub account, so it is the only thing that can carry a
          position — an unverified row still appears with its figures, it just cannot outrank a
          verified one. Every column covers the same window as the rank.
        </p>
        <p className={styles.foot}>
          A <span className={styles.strong}>cli</span> badge means the numbers were
          self-reported without a GitHub sign-in; those rows stay on the board rather than being
          hidden, because a visible unverified row is more honest than a quietly filtered one.
          Streak is the current run of active days, which is not a windowed figure. Submissions
          far outside the range of real usage are held for review and do not appear until a
          person has looked. Figures are self-reported and bounded for plausibility, not
          audited.
        </p>
      </section>
    </PageShell>
  );
}

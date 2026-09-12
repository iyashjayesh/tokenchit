import type { Metadata } from "next";
import Link from "next/link";

import { agentColour, formatTokens, formatUsd } from "@tokenchit/core";

import { PageShell } from "@/components/page-shell";
import {
  BOARD_AGENTS,
  isBoardAgent,
  isWindow,
  staleLabel,
  WINDOWS,
  type BoardAgent,
  type BoardRow,
  type BoardWindow,
} from "@/lib/board";
import { readBoard } from "@/lib/board-query";
import { openGraphFor } from "@/lib/site";
import { findOnBoard } from "@/lib/board-search";
import { SearchResult } from "@/components/search-result";
import { Podium } from "@/components/podium";
import { readBoardTotals } from "@/lib/board-totals";

import styles from "./board.module.css";
import { cmd, PRIMARY_COMMAND } from "@/lib/cli";

export const revalidate = 300;

const BOARD_TITLE = "The board · tokenchit";
const BOARD_DESCRIPTION =
  "Public ranking of developers who chose to publish their AI coding agent usage.";

export const metadata: Metadata = {
  title: BOARD_TITLE,
  description: BOARD_DESCRIPTION,
  /* Without this the page inherited the root layout's openGraph unchanged, so a shared link
     to the board unfurled with the home page's title and description above the board's own
     image. Setting `title` at the top level does not reach og:title on its own. */
  openGraph: openGraphFor({
    title: BOARD_TITLE,
    description: BOARD_DESCRIPTION,
    path: "/board",
  }),
  /* The window and agent filters are query parameters on this same path, so without a
     canonical every combination is a separate URL advertising the same page. */
  alternates: { canonical: "/board" },
};

/** Gold, silver, bronze. Only the top three; everyone else takes the default fill. */
const MEDALS = ["#FFD23D", "#E4E2D8", "#F0B37E"] as const;

/**
 * How a row has moved since a week ago.
 *
 * `previousRank` is null for someone who was not ranked then — a new entrant, not a row that
 * held position zero, and the difference matters because "NEW" is the more interesting fact.
 *
 * A row can fall without doing anything wrong: if two people pass it, it drops two places on
 * unchanged usage. That is what a ranking means, and showing it is more honest than showing
 * only the rises.
 */
function movement(r: BoardRow) {
  if (r.previousRank === null) {
    return <span className={`${styles.move} ${styles.moveNew}`}>new</span>;
  }
  const delta = r.previousRank - r.rank;
  if (delta === 0) {
    return (
      <span className={`${styles.move} ${styles.moveFlat}`} title="unchanged since last week">
        –
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`${styles.move} ${up ? styles.moveUp : styles.moveDown}`}
      title={`${up ? "up" : "down"} ${Math.abs(delta)} since last week`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

/**
 * Thirty days of daily tokens as a bar chart, scaled to the row's own peak.
 *
 * Per-row rather than shared: the point is the shape of one person's month, and scaling every
 * row to the board's busiest day would flatten everyone below the leader into a straight line.
 * The comparison between people is the tokens column, which is already there.
 */
function Spark({ days }: { days: number[] }) {
  const peak = Math.max(...days, 0);
  if (peak <= 0) return <span className={styles.sparkEmpty}>—</span>;

  const w = 3;
  const gap = 1;
  const h = 18;

  return (
    <svg
      className={styles.spark}
      width={days.length * (w + gap)}
      height={h}
      viewBox={`0 0 ${days.length * (w + gap)} ${h}`}
      role="img"
      aria-label={`Daily tokens over the last ${days.length} days`}
    >
      {days.map((v, i) => {
        // A day with activity is never invisible: a real but tiny value still gets a pixel,
        // because "nothing happened" and "barely anything happened" are different facts.
        const bar = v <= 0 ? 0 : Math.max(1.5, (v / peak) * h);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - bar}
            width={w}
            height={bar}
            className={v > 0 ? styles.sparkBar : styles.sparkGap}
          />
        );
      })}
    </svg>
  );
}

/** A page that fits on a screen rather than becoming a scroll. */
const PER_PAGE = 25;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; page?: string; q?: string; agent?: string }>;
}) {
  const params = await searchParams;
  const requested = params.window ?? null;
  const window: BoardWindow = isWindow(requested) ? requested : "year";

  /* Validated against the fixed list rather than trusted, so an arbitrary `?agent=` never
     reaches the query — and an unrecognised one falls back to the combined board instead of
     silently returning nothing. */
  const agentParam = params.agent ?? null;
  const agent = isBoardAgent(agentParam) ? agentParam : null;

  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const offset = (page - 1) * PER_PAGE;

  const query = (params.q ?? "").trim();

  const [rows, totals, found] = await Promise.all([
    readBoard(window, PER_PAGE, offset, agent).catch(() => []),
    readBoardTotals(window, agent).catch(() => null),
    query ? findOnBoard(query, window, PER_PAGE).catch(() => null) : Promise.resolve(null),
  ]);

  /* Highlight the searched row when this page happens to contain it, so a hit reads as a
     position in the ranking rather than as a card floating above an unrelated table. */
  const hit = found?.state === "ranked" ? found.handle.toLowerCase() : null;

  const total = totals?.developers ?? rows.length;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + rows.length;
  /** Every internal link carries the whole filter state; dropping one silently resets it. */
  const boardHref = (over: { window?: BoardWindow; agent?: BoardAgent | null; page?: number } = {}) => {
    const w = over.window ?? window;
    const a = over.agent === undefined ? agent : over.agent;
    const p = over.page ?? 1;
    const qs = new URLSearchParams();
    if (w !== "year") qs.set("window", w);
    if (a) qs.set("agent", a);
    if (p > 1) qs.set("page", String(p));
    if (query) qs.set("q", query);
    const s = qs.toString();
    return s ? `/board?${s}` : "/board";
  };
  const href = (p: number) => boardHref({ page: p });

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

      {/* Filters and search travel together and pin on scroll: on a long board the controls
          were a screen and a half behind the rows they govern. Sticky rather than a sidebar,
          because the table needs 720px of width more than the page needs a second column.

          One row per axis, each named. Both sets of chips share a style, so putting eight of
          them in a single run read as one group of eight rather than four-and-four — and with
          an active chip in each half, two black chips in one line implied one choice had been
          made twice. The label also stops the second row being a guess. */}
      <div className={styles.controls}>
      <div className={styles.controlsRow}>
      <span className={styles.filterLabel} id="filter-window">
        window
      </span>
      <nav className={styles.windows} aria-labelledby="filter-window">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={boardHref({ window: w.key, page: 1 })}
            className={w.key === window ? styles.windowActive : styles.window}
            /* The active window differed only by background colour, so which one was
               selected was invisible to assistive tech on all three surfaces. */
            aria-current={w.key === window ? "true" : undefined}
          >
            {w.label}
          </Link>
        ))}
      </nav>

      {/* A GET form, so a search is a URL: shareable, reloadable, and back-button-able, and it
          keeps this page free of client JavaScript. Both filters ride along in hidden fields so
          searching does not silently reset the reader to "this year, all agents". */}
      <form className={styles.search} action="/board" method="get" role="search">
        <input type="hidden" name="window" value={window} />
        {agent && <input type="hidden" name="agent" value={agent} />}
        <input
          className={styles.searchInput}
          type="search"
          name="q"
          defaultValue={query}
          placeholder="find a developer by handle…"
          aria-label="Find a developer by handle"
          spellCheck={false}
          autoComplete="off"
          maxLength={39}
        />
        <button className={styles.searchGo} type="submit">
          search
        </button>
        {query && (
          <Link className={styles.searchClear} href={boardHref({ page: 1 })}>
            clear
          </Link>
        )}
      </form>
      </div>

      {/* The second axis. `user_days` has carried the agent since the first migration and every
          board query already grouped by it, so this is a WHERE clause rather than new data —
          and at this size "the top Codex user" is a title someone can still win. */}
      <div className={styles.controlsRow}>
      <span className={styles.filterLabel} id="filter-agent">
        agent
      </span>
      <nav className={styles.windows} aria-labelledby="filter-agent">
        <Link
          href={boardHref({ agent: null, page: 1 })}
          className={agent === null ? styles.windowActive : styles.window}
          aria-current={agent === null ? "true" : undefined}
        >
          all agents
        </Link>
        {BOARD_AGENTS.map((a) => (
          <Link
            key={a.key}
            href={boardHref({ agent: a.key, page: 1 })}
            className={a.key === agent ? styles.windowActive : styles.window}
            aria-current={a.key === agent ? "true" : undefined}
          >
            <span
              className={styles.agentDot}
              style={{ background: agentColour(a.key) }}
              aria-hidden="true"
            />
            {a.label}
          </Link>
        ))}
      </nav>
      </div>
      </div>

      {found && <SearchResult found={found} window={window} query={query} />}

      {/* Above the totals, not below them: the question a reader arrives with is who is winning,
          and the four aggregate figures are context for that rather than the other way round.
          The same three carry a medal edge in the table — see the row classes. */}
      {!query && page === 1 && <Podium rows={rows} />}

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
            {/* Named for screen readers, which announce a table by its caption; visually
                hidden because the heading above already says this to everyone else. */}
            <caption className={styles.srOnly}>Developers on the board, ranked by tokens</caption>
            <thead>
              <tr className={styles.headRow}>
                <th scope="col" className={styles.wRank}>rank</th>
                <th scope="col">developer</th>
                <th scope="col" className={styles.wMix}>agent mix</th>
                <th scope="col" className={styles.wSpark}>last 30d</th>
                <th scope="col" className={`${styles.wNum} ${styles.num}`}>tokens</th>
                <th scope="col" className={`${styles.wNum} ${styles.num}`}>equiv. cost</th>
                <th scope="col" className={`${styles.wStreak} ${styles.num}`}>streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                /* Only past the threshold — see staleLabel. A fresh row shows nothing, which
                   is what makes the marker mean something on the row that has one. */
                const stale = staleLabel(r.lastPublished);
                const mix = Object.entries(r.mix).sort((a, b) => b[1] - a[1]);
                const mixTotal = mix.reduce((a, [, n]) => a + n, 0);
                return (
                  <tr
                    key={r.handle}
                    id={`u-${r.handle}`}
                    /* The top three are marked in the table rather than lifted out above it.
                       A separate podium showed the same three people twice — once as a card and
                       again three rows later — and spent a chunk of the first screen doing it.
                       Here the ranking is its own stage. Only on an unsearched first page: on
                       page four these are not the top three of anything the reader can see. */
                    className={[
                      styles.row,
                      !query && page === 1 && r.rank <= 3 ? styles.rowTop : "",
                      !query && page === 1 && r.rank === 1 ? styles.rowFirst : "",
                      hit === r.handle.toLowerCase() ? styles.rowHit : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      !query && page === 1 && r.rank <= 3
                        ? ({ ["--medal" as string]: MEDALS[r.rank - 1] } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <td>
                      <span
                        className={styles.rank}
                        style={{ background: r.rank <= 3 ? MEDALS[r.rank - 1] : "var(--surface)" }}
                      >
                        {r.rank}
                      </span>
                      {movement(r)}
                    </td>
                    <td>
                      <Link href={`/u/${r.handle}`} className={styles.dev}>
                        {/* Only a proved handle has an id, so an unverified row simply has no
                            avatar to draw — the safeguard is the absence of data rather than a
                            condition somebody has to remember. Width and height are set because
                            twenty-five images arriving late would reflow the whole table. */}
                        {r.githubId ? (
                          <img
                            className={styles.avatar}
                            src={`/api/avatar/${r.githubId}`}
                            width={24}
                            height={24}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className={styles.avatarBlank} aria-hidden="true" />
                        )}
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
                        {stale && (
                          <span
                            className={styles.stale}
                            title={`Last published ${r.lastPublished?.slice(0, 10)} — agent mix and models are from that submission; tokens and streak are computed from the daily series`}
                          >
                            {stale}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td>
                      {/* Coloured per agent, not per position: `SEGMENTS[si]` made the colour
                          mean "biggest in this row", so the same agent changed colour down the
                          column. An accessible name too — the bar carried its meaning only in
                          `title`, which never reaches a screen reader or a touch device. */}
                      <div
                        className={styles.bar}
                        role="img"
                        aria-label={`Agent mix: ${mix
                          .map(([a, t]) => `${a} ${((t / mixTotal) * 100).toFixed(0)}%`)
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
                    <td className={styles.sparkCell}>
                      <Spark days={r.spark} />
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

      {/* Worth having only now that the colours mean something. While they were assigned by
          position a legend would have been a lie with a swatch next to it. Built from the
          agents actually present on this page rather than a fixed list. */}
      {rows.length > 0 && (
        <ul className={styles.legend}>
          {[...new Set(rows.flatMap((r) => Object.keys(r.mix)))].sort().map((agent) => (
            <li key={agent} className={styles.legendItem}>
              <span
                className={styles.legendSwatch}
                style={{ background: agentColour(agent) }}
                aria-hidden="true"
              />
              {agent}
            </li>
          ))}
        </ul>
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

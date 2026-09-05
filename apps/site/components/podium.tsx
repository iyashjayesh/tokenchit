import Link from "next/link";

import { formatTokens, formatUsd } from "@tokenchit/core";
import type { BoardRow } from "@/lib/board";
import styles from "./podium.module.css";

/** Gold, silver, bronze — the same three the table's rank chips use, so the two agree. */
const MEDALS = ["#FFD23D", "#E4E2D8", "#F0B37E"] as const;

/**
 * The top three, as a podium above the ranking they come from.
 *
 * A real staircase — first place centre and raised — because that shape is what says "won"
 * without needing a caption. The first version of this was the same idea at about 280px, which
 * put the ranking it introduces below the fold on a laptop; this is the silhouette at roughly
 * half the height, from smaller faces and tighter type rather than from flattening it.
 *
 * These three also carry a medal edge down in the table. That is deliberate duplication: the
 * podium answers "who is winning" at a glance and the row answers "where do they sit", and a
 * reader who scrolls past the first should still find the second marked.
 *
 * Rendered in rank order — 1, 2, 3 — with `order` doing the visual rearranging, so a screen
 * reader hears the ranking and the stacked layout on a narrow screen needs no special case.
 *
 * Shown only on the first page of an unsearched board: on page four it would be quoting three
 * people the reader is not looking at, and beside a search result it competes with the answer.
 */
export function Podium({ rows }: { rows: BoardRow[] }) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <ol className={styles.stage} aria-label="Top three">
      {top.map((r, i) => (
        <li
          key={r.handle}
          className={`${styles.slot} ${styles[`place${i + 1}`]}`}
          style={{ ["--medal" as string]: MEDALS[i] }}
        >
          <Link href={`/u/${r.handle}`} className={styles.card}>
            <span className={styles.rank}>{r.rank}</span>

            {/* Same gate as everywhere else: the id exists only for a proved handle. */}
            {r.githubId ? (
              <img
                className={styles.avatar}
                src={`/api/avatar/${r.githubId}`}
                width={i === 0 ? 44 : 34}
                height={i === 0 ? 44 : 34}
                alt=""
                decoding="async"
              />
            ) : (
              <span className={styles.avatarBlank} aria-hidden="true" />
            )}

            <span className={styles.handle}>@{r.handle}</span>
            <span className={styles.tokens}>{formatTokens(r.tokens)}</span>
            <span className={styles.cost}>{formatUsd(r.equivCostUsd)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

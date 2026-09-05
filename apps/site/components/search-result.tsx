import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import type { BoardSearch } from "@/lib/board-search";
import { WINDOWS, type BoardWindow } from "@/lib/board";
import { PRIMARY_COMMAND } from "@/lib/cli";
import styles from "./search-result.module.css";

const SITE = "https://tokenchit.app";

/**
 * What one handle search found, in the three shapes it can take.
 *
 * The invitation only appears for a handle no user holds. A board narrowed to seven days
 * hides most of its own members, so offering to invite anyone merely absent from the current
 * table would mostly be offering to invite existing users — which is how a prompt teaches
 * people to skip it.
 *
 * Nothing here claims the handle is a real GitHub account. Nobody has checked, and a panel
 * that reads "invite @asdfgh" about a string somebody just typed is inventing a person. It
 * says what is true — this handle is not on the board — and hands the reader something to
 * send, leaving who receives it to them.
 */
export function SearchResult({
  found,
  window,
  query,
}: {
  found: BoardSearch;
  window: BoardWindow;
  query: string;
}) {
  if (found.state === "ranked") {
    return (
      <div className={`${styles.panel} ${styles.hit}`}>
        <p className={styles.line}>
          <span className={styles.handle}>@{found.handle}</span> is{" "}
          <span className={styles.rank}>#{found.rank}</span> in this window.
        </p>
        <Link
          className={styles.action}
          href={`/board?window=${window}&page=${found.page}&q=${encodeURIComponent(query)}#u-${found.handle}`}
        >
          go to the row →
        </Link>
        <Link className={styles.secondary} href={`/u/${found.handle}`}>
          open profile
        </Link>
      </div>
    );
  }

  if (found.state === "off-window") {
    const label = WINDOWS.find((w) => w.key === window)?.label ?? window;
    return (
      <div className={`${styles.panel} ${styles.warm}`}>
        <p className={styles.line}>
          <span className={styles.handle}>@{found.handle}</span> has published, but has nothing
          in <span className={styles.strong}>{label}</span>.
        </p>
        {/* "All time" is the window that cannot be empty for someone who has ever published,
            so it is the useful next click rather than a list of four to try. */}
        <Link
          className={styles.action}
          href={`/board?window=all&q=${encodeURIComponent(query)}`}
        >
          look in all time →
        </Link>
        <Link className={styles.secondary} href={`/u/${found.handle}`}>
          open profile
        </Link>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.cold}`}>
      <p className={styles.line}>
        Nobody has published as <span className={styles.handle}>@{found.handle}</span>.
      </p>
      {/* Two readings of the same miss — looking for yourself, or for someone else — and the
          page cannot tell which, so it answers both rather than guessing. */}
      <p className={styles.sub}>
        If that is you, one command puts you on the board. If it is someone else, send them
        this.
      </p>
      <div className={styles.actions}>
        <CopyButton
          value={PRIMARY_COMMAND}
          variant="ink"
          idleLabel={PRIMARY_COMMAND}
          copiedLabel="copied"
          event="board-search-command"
        />
        <CopyButton
          value={`Turn your AI coding agent logs into a stat card you commit to your README — ${SITE}`}
          variant="lime"
          idleLabel="copy invite"
          copiedLabel="copied"
          event="board-search-invite"
        />
      </div>
    </div>
  );
}

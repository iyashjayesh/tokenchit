"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatTokens } from "@tokenchit/core";
import type { BoardRow } from "@/lib/board";

import styles from "./leaderboard-modal.module.css";

/** Gold, silver, bronze, matching the landing board and /board. */
const MEDALS = ["#FFD23D", "#E4E2D8", "#F0B37E"] as const;

/** Eight is what fits both columns on a laptop without the panel needing to scroll. */
const MODAL_ROWS = 8;

/**
 * Two windows, side by side.
 *
 * The board's own page shows one window at a time behind a filter, which answers "who is top
 * right now" or "who is top overall" but never both — and the interesting thing about a
 * ranking this small is the disagreement between them: somebody who has been publishing for
 * a year outranks somebody who had a huge fortnight, and the reverse. Putting the two next to
 * each other is the whole reason this is a panel rather than a link.
 */
const PANELS = [
  { key: "30d", title: "Last 30 days", live: true },
  { key: "all", title: "All time", live: false },
] as const;

/**
 * "Press L to see the Leaderboards" — a pinned pill, and the board in a modal.
 *
 * Mounted once in the root layout rather than per page, because a keyboard shortcut that only
 * works on the landing page is a shortcut nobody learns. It is deliberately absent from
 * /board: opening a ten-row summary on top of the full, filterable, searchable board is
 * offering somebody a worse version of the page they are already reading.
 *
 * Nothing is fetched until it is opened, so the cost to every other page is one small client
 * component and a keydown listener.
 */
export function LeaderboardModal() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  /** One array per entry in PANELS, or null until the first open has loaded. */
  const [rows, setRows] = useState<BoardRow[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const suppressed = pathname === "/board";

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const loaded = await Promise.all(
        PANELS.map((p) =>
          fetch(`/api/submissions?window=${p.key}&limit=${MODAL_ROWS}`).then((res) =>
            res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
          ),
        ),
      );
      setRows(loaded.map((d: { rows: BoardRow[] }) => d.rows));
    } catch {
      /* Both windows or neither: a panel showing one column of real rows beside one column of
         nothing reads as "nobody has ever published", which is a worse lie than an error. */
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setIsOpen(true);
    // The panel, not the close button. showModal() would otherwise focus the first control in
    // the dialog, and a screen reader would announce "close" before it announced what this is.
    panelRef.current?.focus();

    /* Loaded here rather than from an effect watching `isOpen`, which is the same fetch one
       render later and is a setState inside an effect. Rows already in hand are kept:
       reopening the panel should not spend two more requests against the read bucket to show
       the same eight rows. A previous failure does retry, because a deliberate reopen is a
       reasonable thing to read as "try again". */
    if (rows === null && !loading) void load();
  }, [rows, loading, load]);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  /* The shortcut itself. */
  useEffect(() => {
    if (suppressed) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "l" && event.key !== "L") return;
      /* Cmd+L and Ctrl+L focus the address bar, and Alt+L is somebody's compose key. A bare L
         is the only one this owns. */
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      // The board's search box is one L away from being unusable otherwise.
      if (target?.isContentEditable) return;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      event.preventDefault();
      if (dialogRef.current?.open) close();
      else open();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suppressed, open, close]);

  /* showModal() makes the page inert but not unscrollable, so a trackpad still moves the
     document behind the panel. */
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  /* Every link inside the panel navigates, and a modal left standing over the destination is
     the classic way to lose a reader. Closing on the path change covers all of them at once,
     including the browser's own back button. */
  useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [pathname]);

  if (suppressed) return null;

  return (
    <>
      <button
        type="button"
        className={styles.pill}
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        // Hidden rather than left underneath: it is the thing that opened the panel and it has
        // nothing to say while the panel is open.
        hidden={isOpen}
      >
        <span className={styles.press}>Press</span>
        <kbd className={styles.key}>L</kbd>
        <span className={styles.long}>to see the Leaderboards</span>
        <span className={styles.short}>Leaderboards</span>
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="leaderboard-modal-title"
        /* Fires for Escape and for close() alike, so this is the one place the open state is
           brought back down — tracking it at the call sites would drift the first time the
           browser closed the dialog for us. */
        onClose={() => setIsOpen(false)}
        /* The dialog element is only a positioning box; anything that lands on it rather than
           on the panel inside is the backdrop. */
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        <div className={styles.panel} ref={panelRef} tabIndex={-1}>
          <div className={styles.head}>
            <h2 className={styles.title} id="leaderboard-modal-title">
              Who is burning the most?
            </h2>
            <p className={styles.blurb}>
              Ranked by tokens, from developers who chose to publish. The two windows disagree
              on purpose — one rewards the last month, the other the whole history.
            </p>
            <button type="button" className={styles.close} onClick={close} aria-label="Close">
              ✕
            </button>
          </div>

          {failed && (
            <p className={styles.failed} role="status">
              Could not read the board just now.
              <button type="button" className={styles.retry} onClick={() => void load()}>
                Try again
              </button>
            </p>
          )}

          {/* One announcement for both columns. The skeletons themselves are aria-hidden,
              so without this a screen reader hears nothing at all while the panel loads. */}
          <p className={styles.srOnly} role="status">
            {loading ? "Loading the board" : ""}
          </p>

          <div className={styles.body}>
            <div className={styles.columns}>
              {PANELS.map((panel, i) => (
                <section key={panel.key} className={styles.column}>
                  <div className={styles.columnHead}>
                    <h3 className={styles.columnTitle}>{panel.title}</h3>
                    {panel.live && <span className={styles.live} aria-hidden="true" />}
                  </div>
                  <Column rows={rows?.[i] ?? null} failed={failed} />
                </section>
              ))}
            </div>
          </div>

          <div className={styles.foot}>
            <p className={styles.footNote}>
              Top {MODAL_ROWS} of each. A <span className={styles.strong}>✓</span> means the
              GitHub identity was proved; everything else is self-reported.
            </p>
            <Link href="/board" className={styles.footLink} onClick={close}>
              See the full board →
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** One window's rows, or the state that stands in for them. */
function Column({
  rows,
  failed,
}: {
  rows: BoardRow[] | null;
  failed: boolean;
}) {
  if (rows === null) {
    if (failed) return <p className={styles.note}>—</p>;
    return (
      <div className={styles.skeleton} aria-hidden="true">
        {Array.from({ length: MODAL_ROWS }, (_, i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className={styles.note}>Nobody has published in this window yet.</p>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col" className={styles.wRank}>
            rank
          </th>
          <th scope="col">developer</th>
          <th scope="col" className={styles.num}>
            tokens
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.handle}>
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
                {/* Sourced from the GitHub id, never the handle: an unverified row is a name
                    anybody can claim, and github.com/<handle>.png would put a real person's
                    face beside figures they never submitted. */}
                {r.githubId ? (
                  <img
                    className={styles.avatar}
                    src={`/api/avatar/${r.githubId}`}
                    width={20}
                    height={20}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className={styles.avatarBlank} aria-hidden="true" />
                )}
                <span className={styles.handle}>@{r.handle}</span>
                {r.tier === "verified" && (
                  <span className={styles.verified} title="GitHub identity verified">
                    ✓
                  </span>
                )}
              </Link>
            </td>
            <td className={`${styles.num} ${styles.tokens}`}>{formatTokens(r.tokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

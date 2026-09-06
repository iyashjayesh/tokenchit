"use client";

import Link from "next/link";

import styles from "./error.module.css";

/**
 * What the reader sees when a query fails.
 *
 * Before this existed, every failure was disguised as an absence: a database blip made the
 * board render "Nobody has published in this window yet", and a profile whose row could not be
 * read served the 404 page saying "they may not have published yet". Both are confident, both
 * are wrong, and the profile one is the URL people share.
 *
 * Saying "this is us, not you" is the whole job. It must be a client component — that is the
 * contract for an error boundary — and it deliberately offers a retry, because the failures it
 * exists for are usually transient.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.wrap}>
      <p className={styles.code}>500</p>
      <h1 className={styles.title}>Something went wrong at our end</h1>
      <p className={styles.body}>
        This is not a page that does not exist — it is one we could not load. The database may
        be briefly unreachable. Nothing you did caused it and nothing was lost.
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={reset} className={styles.retry}>
          try again
        </button>
        <Link href="/board" className={styles.link}>
          go to the board
        </Link>
      </div>
    </main>
  );
}

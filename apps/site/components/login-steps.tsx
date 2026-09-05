"use client";

import { useEffect, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import styles from "./login-steps.module.css";

/** How often to ask whether the CLI has finished. Slow enough to be free, fast enough to feel live. */
const POLL_MS = 2500;

/**
 * The two steps, and the wait.
 *
 * Client-side for two reasons and no others: the code needs a copy button, and the page has to
 * notice when the terminal finishes so the reader is told they are done rather than left
 * looking at instructions they have already followed.
 *
 * Polling rather than a socket. The whole exchange is over inside a minute, a socket for that
 * is a connection to hold open and a server to hold it, and a request every two and a half
 * seconds against a route that reads one row by primary key is cheaper than either.
 */
export function LoginSteps({
  id,
  userCode,
  verifyUrl,
  expiresAt,
  handle,
  expired,
}: {
  id: string;
  userCode: string;
  verifyUrl: string;
  expiresAt: string;
  handle: string | null;
  expired: boolean;
}) {
  const [signedIn, setSignedIn] = useState<string | null>(handle);
  const [isExpired, setIsExpired] = useState(expired);

  useEffect(() => {
    if (signedIn || isExpired) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/login/session/${id}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { handle: string | null; expired: boolean };
        if (cancelled) return;
        if (data.handle) setSignedIn(data.handle);
        else if (data.expired) setIsExpired(true);
      } catch {
        // A failed poll is not a failed sign-in — that is happening in the terminal either
        // way. Stay quiet and try again.
      }
    };

    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, signedIn, isExpired]);

  /*
   * Expiry is the device code's, from the server, so a tab left open overnight says so rather
   * than offering a code GitHub stopped accepting fourteen minutes in.
   *
   * Always a timer, never a straight setState: calling it in the effect body is a synchronous
   * state write during commit, which is a second render pass before paint and what
   * react-hooks/set-state-in-effect exists to catch. A deadline already past schedules a zero
   * delay instead, which lands on the next tick and reaches the same place.
   */
  useEffect(() => {
    if (signedIn || isExpired) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    const timer = setTimeout(() => setIsExpired(true), Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [expiresAt, signedIn, isExpired]);

  if (signedIn) {
    return (
      <div className={`${styles.panel} ${styles.done}`}>
        <p className={styles.doneTitle}>Signed in as @{signedIn}</p>
        <p className={styles.doneBody}>
          Your terminal has the key. Close this tab and the GitHub one — whatever GitHub is
          showing, it is finished — then run{" "}
          <span className={styles.code}>tokenchit publish</span>.
        </p>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className={`${styles.panel} ${styles.stale}`}>
        <p className={styles.doneTitle}>This code has expired</p>
        <p className={styles.doneBody}>
          GitHub only holds one for a few minutes. Run{" "}
          <span className={styles.code}>tokenchit login</span> again for a fresh one.
        </p>
      </div>
    );
  }

  return (
    <>
      <ol className={styles.steps}>
        <li className={styles.step}>
          <span className={styles.num}>1</span>
          <div className={styles.body}>
            <p className={styles.title}>Copy your code</p>
            <p className={styles.hint}>
              GitHub asks for this on the next page. It authorises the machine that asked for
              it — your terminal — and nothing else.
            </p>
            <div className={styles.codeRow}>
              <span className={styles.userCode}>{userCode}</span>
              <CopyButton value={userCode} variant="ink" idleLabel="copy code" copiedLabel="copied" />
            </div>
          </div>
        </li>

        <li className={styles.step}>
          <span className={styles.num}>2</span>
          <div className={styles.body}>
            <p className={styles.title}>Authorise on GitHub</p>
            <p className={styles.hint}>
              Opens in a new tab. <strong>Check which account it offers</strong> — whichever
              you authorise is the handle your card and board row will carry.
            </p>
            {/* noreferrer as well as noopener: the code is in this page's URL, and a referer
                header would hand it to GitHub for no reason. */}
            <a className={styles.go} href={verifyUrl} target="_blank" rel="noopener noreferrer">
              continue to github →
            </a>
          </div>
        </li>
      </ol>

      <p className={styles.waiting}>
        <span className={styles.pulse} aria-hidden="true" />
        waiting for you to authorise — this page updates on its own
      </p>

      {/* A footnote, not a step. GitHub's tab can land on a 404 when the CLI's poll collects
          the token before GitHub finishes its own redirect; the sign-in has already worked,
          and somebody staring at a 404 needs to be told that once, quietly, not warned about
          it before it has happened. */}
      <p className={styles.footnote}>
        If GitHub&rsquo;s tab shows a 404 afterwards, ignore it — your terminal already has the
        token. This page is what confirms it.
      </p>
    </>
  );
}

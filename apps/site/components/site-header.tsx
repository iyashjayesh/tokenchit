"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { GithubMark } from "./github-mark";
import styles from "./site-header.module.css";
import { PRIMARY_COMMAND, VERSION_LABEL } from "@/lib/cli";

const LOGIN = PRIMARY_COMMAND;

/*
 * One destination.
 *
 * This was five links, then two. "Card" pointed at a section of the homepage, which is not
 * somewhere anyone navigates to — it is somewhere you arrive by reading. The leaderboard is
 * the only page on this site that is not the homepage, so it is the only thing a nav has to
 * do, and it says what it is rather than making the reader guess what "board" means.
 *
 * The sections all still exist and still have their ids. The wordmark is the way home.
 */
const NAV = [{ href: "/board", label: "leader board" }];

const REPO = "https://github.com/iyashjayesh/tokenchit";

/**
 * One pass of the ticker, rendered twice so the loop has no seam.
 *
 * The animation translates the track by half its width, which only reads as continuous if the
 * second half is identical to the first. The copy is duplicated in the markup rather than in
 * CSS because the links have to be real links in both halves — a reader whose eye lands on the
 * second copy should be able to click it.
 */
function TickerRun() {
  return (
    <span className={styles.run}>
      <span className={styles.item}>open source · MIT</span>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <a className={styles.link} href={REPO} target="_blank" rel="noreferrer">
        ★ star it on GitHub
      </a>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <span className={styles.item}>found a bug, or want an agent supported?</span>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <a className={styles.link} href={`${REPO}/issues`} target="_blank" rel="noreferrer">
        open an issue
      </a>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <span className={styles.item}>built in the open, receipts included</span>
      <span className={styles.dot} aria-hidden="true">◆</span>
    </span>
  );
}

/**
 * The header's one action.
 *
 * This was a "sign in with GitHub" button that called `setSignedIn(true)` and did nothing
 * else — it put a ✓ and a handle in the header for an account nobody had proved. On a site
 * whose whole argument is that a tick should mean something, that was the wrong thing to
 * ship, so it now hands over the command that actually establishes identity.
 *
 * There is deliberately no browser session. Nothing on this site is per-user: no settings, no
 * upload form, no private page. Identity exists to stamp a row on the board, and only the CLI
 * can produce a row.
 */
export function SiteHeader() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = () => {
    void navigator.clipboard?.writeText(LOGIN).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    // 1400ms, the same swap the copy buttons in the card section use.
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <>
      {/*
       * A ticker rather than a dismissible bar, because there is nothing here to dismiss: it
       * asks for a star and offers somewhere to report a bug, and both stay true. It pauses on
       * hover and on keyboard focus, which is the only thing that makes a moving link
       * clickable, and stops entirely for a reader who asked for less motion.
       */}
      <div className={styles.ticker}>
        <div className={styles.track}>
          <TickerRun />
          {/* The seam-hiding copy. Hidden from assistive tech so the message is announced once
              rather than twice, and its links are not a second set of tab stops. */}
          <span aria-hidden="true">
            <TickerRun />
          </span>
        </div>
      </div>

    <header className={styles.header}>
      <div className={styles.brand}>
        {/* The wordmark is the way home, which is what every reader already assumes. It was
            inert on /board and /u/<handle> — the two pages where someone most needs it. */}
        <Link href="/" className={styles.home} aria-label="tokenchit home">
          <span className={styles.wordmark}>tokenchit</span>
        </Link>
        <span className={styles.version}>{VERSION_LABEL}</span>
      </div>

      <div className={styles.right}>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <button
          type="button"
          onClick={copy}
          className={styles.signIn}
          title={`Copy "${LOGIN}" — verification happens in your terminal`}
        >
          <GithubMark size={15} />
          {copied ? "copied · run it in your terminal" : "verify with the cli"}
        </button>
      </div>
    </header>
    </>
  );
}

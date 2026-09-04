"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { GithubMark } from "./github-mark";
import styles from "./site-header.module.css";
import { PRIMARY_COMMAND, VERSION_LABEL } from "@/lib/cli";

const LOGIN = PRIMARY_COMMAND;

/*
 * Two destinations, not five.
 *
 * Verify, privacy and recap were anchors into the homepage — three links that scroll you
 * somewhere on a page you may not be on, competing for attention with the two things anyone
 * actually navigates to. The sections still exist and still have their ids; they are reached
 * by reading the page, which is what a one-page site is for.
 *
 * Root-relative rather than bare fragments: these render on /u/<handle> and /board too, where
 * "#card" would point at an anchor that does not exist on the page.
 */
const NAV = [
  { href: "/#card", label: "card" },
  { href: "/board", label: "board" },
];

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
  );
}

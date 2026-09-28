import Link from "next/link";

import { GithubMark } from "./github-mark";
import styles from "./site-header.module.css";
import { VERSION_LABEL } from "@/lib/cli";

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

/**
 * The header's one action.
 *
 * This was a "sign in with GitHub" button that called `setSignedIn(true)` and did nothing
 * else — it put a ✓ and a handle in the header for an account nobody had proved. It then
 * became a button that copied a command, labelled "verify with the cli", which was wrong in
 * both halves: the command it copied verifies nothing, and a clipboard write is not what
 * somebody reaching for the one button in the header is asking for.
 *
 * It is a link now, to the section that explains the choice. That also retires this file's
 * hand-rolled copy handler, which reported success unconditionally — `navigator.clipboard`
 * is undefined outside a secure context, and `?.` made that look like a copy that worked.
 * The section it points at uses `CopyButton`, which reports what actually happened.
 *
 * There is deliberately no browser session. Nothing on this site is per-user: no settings, no
 * upload form, no private page. Identity exists to stamp a row on the board, and only the CLI
 * can produce a row.
 */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      {/*
       * The first tab stop on every page, and invisible until it is one.
       *
       * Before the table on /board a keyboard user passed two ticker links, the wordmark, the
       * nav link, this button, two breadcrumbs, four window links and the search field — about
       * fourteen stops, repeated on every page load, and every one of the 25 rows below is
       * itself a link, so paging meant traversing the whole preamble again.
       */}
      <a href="#content" className={styles.skip}>
        skip to content
      </a>
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

        {/* Absolute rather than a bare hash: on /board and /u/<handle> a "#start" would
            scroll to nothing. */}
        <Link href="/#start" className={styles.signIn}>
          <GithubMark size={15} />
          Get your card
        </Link>
      </div>
    </header>
  );
}

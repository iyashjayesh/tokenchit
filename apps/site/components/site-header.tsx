"use client";

import { GithubMark } from "./github-mark";
import { useSiteState } from "./site-state";
import styles from "./site-header.module.css";

const NAV = [
  { href: "#card", label: "card" },
  { href: "#board", label: "board" },
  { href: "#verification", label: "verify" },
  { href: "#privacy", label: "privacy" },
  { href: "#recap", label: "recap" },
];

export function SiteHeader() {
  const { handle, signedIn, signIn, signOut } = useSiteState();

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.wordmark}>tokencard</span>
        <span className={styles.version}>v0.4.1 · MIT</span>
      </div>

      <div className={styles.right}>
        <nav className={styles.nav}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        {signedIn ? (
          <div className={styles.pill}>
            <span className={styles.who}>
              <span className={styles.check}>✓</span>@{handle}
            </span>
            <button type="button" onClick={signOut} className={styles.out}>
              out
            </button>
          </div>
        ) : (
          <button type="button" onClick={signIn} className={styles.signIn}>
            <GithubMark size={15} />
            sign in with github
          </button>
        )}
      </div>
    </header>
  );
}

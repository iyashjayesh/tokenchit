import Link from "next/link";

import { PageShell } from "@/components/page-shell";

import styles from "./not-found.module.css";
import { cmd, npx } from "@/lib/cli";

/**
 * Profile URLs get shared, mistyped and outlive the handle they name, so this page is
 * reached by people who were sent somewhere rather than people who wandered. It says the
 * two things that actually help: the handle may simply not have published, and here is how
 * to publish.
 */
export default function NotFound() {
  return (
    <PageShell>
      <div className={styles.wrap}>
        <p className={styles.code}>404</p>
        <h1 className={styles.h1}>Nothing here.</h1>
        <p className={styles.body}>
          If you were looking for someone&apos;s stats, they may not have published yet — a
          profile only exists once <span className={styles.strong}>{cmd("publish")}</span>{" "}
          has run at least once. Handles are case-insensitive, so that is not it.
        </p>

        <div className={styles.actions}>
          <Link href="/board" className={styles.primary}>
            see the board
          </Link>
          <Link href="/" className={styles.secondary}>
            what is tokenchit?
          </Link>
        </div>

        <code className={styles.install}>{npx("init")}</code>
      </div>
    </PageShell>
  );
}

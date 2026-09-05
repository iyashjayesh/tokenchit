import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { LoginSteps } from "@/components/login-steps";
import { readLoginSession } from "@/lib/login-session";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · tokenchit",
  // A capability URL: anyone with it sees a code. Keeping it out of search results is the
  // least this page can do, and costs nothing.
  robots: { index: false, follow: false },
};

/**
 * The browser half of a device-flow sign-in.
 *
 * The CLI parks the code it was given and opens this page, so the person reads it here rather
 * than switching back to a terminal to copy it. The terminal still prints everything — this
 * page is a convenience over an instruction that has to stand on its own, since the CLI has to
 * work over SSH, in a container, and when this site is down.
 *
 * What it cannot do is finish the sign-in. GitHub returns the token to whoever polls with the
 * `device_code`, and that is the CLI; this page never sees it. It shows, links, and waits.
 */
export default async function LoginPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readLoginSession(id).catch(() => null);

  if (!session) {
    return (
      <PageShell crumbs={[{ href: "/board", label: "sign in" }]}>
        <h1 className={styles.h1}>That sign-in is not here</h1>
        <p className={styles.intro}>
          The link has expired, or it was never one of ours. Run{" "}
          <span className={styles.code}>tokenchit login</span> again and follow the new link —
          the code in your terminal always works on its own.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell crumbs={[{ href: "/board", label: "sign in" }]}>
      <header className={styles.head}>
        <h1 className={styles.h1}>Sign in</h1>
        <span className={styles.sticker}>github</span>
      </header>

      <p className={styles.intro}>
        Your terminal is waiting. Two steps, then it finishes on its own — you do not need to
        go back to it.
      </p>

      <LoginSteps
        id={id}
        userCode={session.userCode}
        verifyUrl={session.verifyUrl}
        expiresAt={session.expiresAt}
        handle={session.handle}
        expired={session.expired}
      />
    </PageShell>
  );
}

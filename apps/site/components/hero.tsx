"use client";

import { CopyButton } from "./copy-button";
import { StatCard, type PreviewFigures } from "./stat-card";
import { useSiteState } from "./site-state";
import styles from "./hero.module.css";
import { PRIMARY_COMMAND } from "@/lib/cli";

// Scoped, because the bare `tokenchit` name on npm is a 2018 tombstone: it was published
// and unpublished within a fortnight, and npm never lets an unpublished name be reused.
const INSTALL = PRIMARY_COMMAND;

export function Hero({ preview }: { preview: PreviewFigures }) {
  const { handle, setHandle } = useSiteState();

  return (
    <section className={styles.hero}>
      <div className={styles.left}>
        <div className={styles.chips}>
          <span className={styles.chipInk}>no hosted endpoint</span>
          <span className={styles.chipYellow}>parsed locally</span>
          <span className={styles.chipWhite}>no prompts sent</span>
        </div>

        <h1 className={styles.h1}>
          Receipts for
          <br />
          your <span className={styles.robots}>robots.</span>
        </h1>

        <p className={styles.lede}>
          tokenchit reads your local Claude Code, Codex and OpenCode logs and renders one
          embeddable card straight into your repo. The card is a file you commit, not a URL
          you depend on — nothing to rate-limit, nothing to go down, and it keeps working if
          this site does not.
        </p>

        <div className={styles.install}>
          <code className={styles.command}>
            <span className={styles.prompt}>$ </span>
            <span className={styles.typed}>{INSTALL}</span>
            <span className={styles.cursor} aria-hidden="true" />
          </code>
          <CopyButton
            value={INSTALL}
            event="install"
            variant="ink"
            idleLabel="copy"
            copiedLabel="copied"
          />
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.previewRow}>
          <span className={styles.label}>live preview</span>
        </div>

        <StatCard preview={preview} />

        <div className={styles.handleRow}>
          <span className={styles.label}>handle</span>
          <input
            className={styles.input}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>
    </section>
  );
}

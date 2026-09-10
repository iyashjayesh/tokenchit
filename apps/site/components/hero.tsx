import Link from "next/link";

import { formatTokens } from "@tokenchit/core";

import { CopyButton } from "./copy-button";
import type { BoardTotals } from "@/lib/board-totals";
import type { Featured } from "@/lib/featured";
import { StatCard } from "./stat-card";
import styles from "./hero.module.css";
import { PRIMARY_COMMAND } from "@/lib/cli";

// Scoped, because the bare `tokenchit` name on npm is a 2018 tombstone: it was published
// and unpublished within a fortnight, and npm never lets an unpublished name be reused.
const INSTALL = PRIMARY_COMMAND;

export function Hero({ preview, totals }: { preview: Featured; totals: BoardTotals | null }) {
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

        {/* Free is stated here because the page never said it anywhere. "MIT" sits in the
            header and the footer, but that is a licence, not a price, and a reader scanning
            for the catch did not find the answer — which reads as "pricing later" rather
            than "there is none". */}
        <p className={styles.free}>
          Free, MIT, and no account needed to read your own numbers.
        </p>

        {/* Proof that the board is a place rather than a demo. The figures already existed
            and only /board showed them, so the page invited people to join something whose
            size it never mentioned. Absent rather than zeroed when the query fails — "0
            developers" is a worse claim than no claim.

            Equivalent cost is deliberately not here. It was the largest number on the page
            and the one the page spends three paragraphs explaining is not real money, so a
            cold reader met the claim well before the caveat. It still leads the board and
            section 02, where the explanation is next to it. */}
        {totals && totals.developers > 0 && (
          <p className={styles.proof}>
            <Link href="/board" className={styles.proofLink}>
              {totals.developers} {totals.developers === 1 ? "developer" : "developers"}
            </Link>{" "}
            on the board · {formatTokens(totals.tokens)} tokens
          </p>
        )}
      </div>

      <div className={styles.right}>
        <div className={styles.previewRow}>
          <span className={styles.label}>live preview</span>
        </div>

        <StatCard preview={preview} />
      </div>
    </section>
  );
}

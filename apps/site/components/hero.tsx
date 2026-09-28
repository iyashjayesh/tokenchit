import Link from "next/link";

import { formatTokens } from "@tokenchit/core";

import { CopyButton } from "./copy-button";
import type { BoardTotals } from "@/lib/board-totals";
import type { Featured } from "@/lib/featured";
import { StatCard } from "./stat-card";
import styles from "./hero.module.css";
import { PRIMARY_COMMAND } from "@/lib/cli";
import { FREE_LINE, NETWORK_LINE } from "@/lib/setup";

// Scoped, because the bare `tokenchit` name on npm is a 2018 tombstone: it was published
// and unpublished within a fortnight, and npm never lets an unpublished name be reused.
const INSTALL = PRIMARY_COMMAND;

export function Hero({ preview, totals }: { preview: Featured; totals: BoardTotals | null }) {
  return (
    <section className={styles.hero}>
      <div className={styles.left}>
        {/* "no hosted endpoint" was wrong, not merely loose: this site serves
            /api/card/<handle>.svg, and the GitHub Action depends on it. The honest version
            names the path this page actually recommends. */}
        <div className={styles.chips}>
          <span className={styles.chipInk}>commit your svg</span>
          <span className={styles.chipYellow}>parsed locally</span>
          <span className={styles.chipWhite}>no prompts sent</span>
        </div>

        {/* Kept as an eyebrow rather than deleted. It is the line people quote, but it says
            nothing about what the tool does, and it was the only headline a first-time
            visitor got. */}
        <p className={styles.eyebrow}>Receipts for your robots.</p>

        <h1 className={styles.h1}>
          Your AI coding usage, in a card you <span className={styles.robots}>own.</span>
        </h1>

        <p className={styles.lede}>
          See token usage from Claude Code, Codex, Gemini CLI and OpenCode on your machine.
          Save an SVG in your repo, or choose to publish a hosted card and join the board.
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
        <p className={styles.free}>{FREE_LINE}</p>

        {/* The network boundary, stated where the command is rather than ten screens down.
            Derived from what the code actually does: init and sync import no networking
            module at all, and the payload's field list is pinned by a test. */}
        <p className={styles.disclosure}>{NETWORK_LINE}</p>

        {/* Proof that the board is a place rather than a demo. The figures already existed
            and only /board showed them, so the page invited people to join something whose
            size it never mentioned. Absent rather than zeroed when the query fails — "0
            developers" is a worse claim than no claim.

            Equivalent cost is deliberately not here. It was the largest number on the page
            and the one the page spends three paragraphs explaining is not real money, so a
            cold reader met the claim well before the caveat. It still leads the board and
            section 03, where the explanation is next to it. */}
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

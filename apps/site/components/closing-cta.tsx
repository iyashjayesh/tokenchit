import Link from "next/link";

import { agentColour } from "@tokenchit/core";

import { CopyButton } from "@/components/copy-button";
import { AGENT_PAGES } from "@/lib/agents";
import { cmd, PRIMARY_COMMAND } from "@/lib/cli";

import styles from "./closing-cta.module.css";

const REPO = "https://github.com/iyashjayesh/tokenchit";

/**
 * The last block on the landing page.
 *
 * The install command appeared exactly once, in the hero. After five sections of detail the
 * page ended on the recap heatmap and a three-link footer, so a reader convinced by section
 * 04 had to scroll back past everything to act on it.
 *
 * It also carries the two things the page had no place for: a way to say what is wrong with
 * it, and a reason to come back. Every section above explains the tool; none of them asked
 * for anything.
 */
export function ClosingCta() {
  const syncCommand = cmd("sync");

  return (
    <section className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.h2}>Read your own numbers.</h2>
          <p className={styles.lede}>
            One command. It finds your agents, prints your stats and writes the card. Free,
            MIT, and no account — publishing to the board is a separate step you have to ask
            for.
          </p>
        </div>

        <div className={styles.cmdRow}>
          <code className={styles.cmd}>
            <span className={styles.prompt}>$</span> {PRIMARY_COMMAND}
          </code>
          <CopyButton
            value={PRIMARY_COMMAND}
            variant="lime"
            event="closing-install"
            idleLabel="copy"
            copiedLabel="copied"
          />
        </div>

        <p className={styles.note}>
          Or <code>{syncCommand}</code> to see the figures without writing anything. It makes
          no network request.
        </p>

        <div className={styles.asks}>
          {/* The site had no channel of any kind. A tool whose whole argument is "check this
              rather than take our word" needs somewhere for the reader who checked and
              disagrees. */}
          <a className={styles.ask} href={`${REPO}/issues/new`}>
            <span className={styles.askLabel}>Something wrong?</span>
            <span className={styles.askValue}>Open an issue →</span>
          </a>
          <a className={styles.ask} href={REPO}>
            <span className={styles.askLabel}>Want to follow along?</span>
            <span className={styles.askValue}>Star the repo →</span>
          </a>
        </div>
      </div>

      <nav className={styles.agents} aria-label="Per-agent pages">
        <span className={styles.agentsLabel}>Per agent</span>
        <ul className={styles.agentList}>
          {AGENT_PAGES.map((a) => (
            <li key={a.key}>
              <Link href={`/tool/${a.key}`} className={styles.agentLink}>
                <span
                  className={styles.dot}
                  style={{ background: agentColour(a.key) }}
                  aria-hidden="true"
                />
                {a.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

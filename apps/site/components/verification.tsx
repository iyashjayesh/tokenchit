import { SectionHeading } from "@/components/section-heading";
import styles from "./verification.module.css";

/*
 * The two tiers the database can actually hold.
 *
 * This table used to describe three, in the present tense, with the middle one tinted as the
 * visually recommended option — but the schema permits exactly two:
 * `CHECK (tier IN ('cli','verified'))`. Nothing in the codebase could ever produce a
 * device-attested or api-verified row, and the board renders only `✓` or `cli`, so a reader who
 * studied this table and then scrolled down found none of the three chips it had described.
 *
 * On a page whose whole argument is that it shows you the real thing, a roadmap written as
 * present tense was the worst available error. What was genuinely useful in those two rows —
 * the honest account of what stronger proof would and would not buy — is kept below the table
 * as the "not yet" note, where it makes a claim about the future instead of the present.
 */
const TIERS = [
  {
    chip: "○ cli · self-reported",
    chipClass: styles.chipGrid,
    method: "one-shot upload of a locally parsed summary",
    proves: "The file was produced by the CLI on some machine, at the stated time.",
    doesNotProve:
      "Nothing about the numbers. Logs can be edited before parsing. Treat as a claim.",
    tinted: false,
  },
  {
    chip: "✓ github verified",
    chipClass: styles.chipLime,
    method: "GitHub device flow, then an API key bound to that account",
    proves:
      "The handle on the row belongs to the GitHub account that authorised it. Nobody else can publish under it.",
    doesNotProve:
      "Anything about the figures. It is an identity check, not an audit — the numbers are still self-reported.",
    tinted: true,
  },
];

export function Verification() {
  return (
    <section id="verification" className={styles.section}>
      <SectionHeading n={3} title="Two different marks" />
      <p className={styles.intro}>
        The lime <span className={styles.githubChip}>✓ GITHUB</span> mark means the account is
        real and the handle is theirs. It says nothing about the numbers. That is what the tier
        below is for.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          {/* Named for screen readers, which announce a table by its caption; visually
              hidden because the heading above already says this to everyone else. */}
          <caption className={styles.srOnly}>How a row on the board is verified, and what each mark does and does not prove</caption>
          <thead>
            <tr className={styles.headRow}>
              <th scope="col" className={`${styles.th} ${styles.colTier}`}>tier</th>
              <th scope="col" className={`${styles.th} ${styles.colMethod}`}>method</th>
              <th scope="col" className={styles.th}>proves</th>
              <th scope="col" className={`${styles.th} ${styles.thAlert}`}>does not prove</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((tier, i) => (
              <tr
                key={tier.chip}
                // Only the first two rows carry a divider; the table border closes the last.
                className={`${i < TIERS.length - 1 ? styles.rowDivided : styles.row} ${
                  tier.tinted ? styles.rowTinted : ""
                }`}
              >
                <td className={styles.td}>
                  <span className={`${styles.chip} ${tier.chipClass}`}>{tier.chip}</span>
                </td>
                <td className={`${styles.td} ${styles.method}`}>{tier.method}</td>
                <td className={`${styles.td} ${styles.proves}`}>{tier.proves}</td>
                <td className={`${styles.td} ${styles.doesNotProve}`}>{tier.doesNotProve}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.footnote}>
        <span className={styles.strong}>Not yet:</span> signed daily deltas would prove the
        numbers arrived in order and were never edited after the fact, and a read-only provider
        analytics API would match them against real billing records. Neither is built, so
        neither is claimed — and neither would fix the ceiling below.
      </p>

      <p className={styles.footnote}>
        Ceiling: no tier distinguishes tokens spent on work from tokens spent on nothing. The card
        measures usage, not output.
      </p>
    </section>
  );
}

import { SectionHeading } from "@/components/section-heading";
import styles from "./verification.module.css";

/** Chip background varies per tier; everything else about the row is identical. */
const TIERS = [
  {
    chip: "○ self-reported",
    chipClass: styles.chipGrid,
    method: "one-shot upload of a locally parsed summary",
    proves: "The file was produced by the CLI on some machine, at the stated time.",
    doesNotProve:
      "Nothing about the numbers. Logs can be edited before parsing. Treat as a claim.",
    tinted: false,
  },
  {
    chip: "◈ device-attested",
    chipClass: styles.chipLime,
    method: "continuous signed daily deltas, hash-chained",
    proves:
      "Deltas arrived daily from one keypair, in order, with no gaps or retroactive edits. Tampering breaks the chain and is visible.",
    doesNotProve:
      "That the logs themselves are real. A patched client on a controlled machine can still sign fabricated deltas.",
    tinted: true,
  },
  {
    chip: "◆ api-verified",
    chipClass: styles.chipYellow,
    method: "read-only org analytics API, provider-side",
    proves:
      "Token and spend totals match the provider's own billing records for the connected account.",
    doesNotProve:
      "Coverage. Only agents behind that provider are counted; the per-agent split still comes from local logs.",
    tinted: false,
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
          <thead>
            <tr className={styles.headRow}>
              <th className={`${styles.th} ${styles.colTier}`}>tier</th>
              <th className={`${styles.th} ${styles.colMethod}`}>method</th>
              <th className={styles.th}>proves</th>
              <th className={`${styles.th} ${styles.thAlert}`}>does not prove</th>
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
        Ceiling: no tier distinguishes tokens spent on work from tokens spent on nothing. The card
        measures usage, not output.
      </p>
    </section>
  );
}

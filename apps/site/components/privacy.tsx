import { SectionHeading } from "@/components/section-heading";
import { PRIVACY_TESTS } from "@/lib/sample-data";
import styles from "./privacy.module.css";

/** Sum the per-test durations, so the total cannot drift from the rows above it. */
const totalMs = (tests: typeof PRIVACY_TESTS): number =>
  tests.reduce((sum, t) => sum + Number.parseInt(t.ms, 10), 0);

/** Section 04 — the privacy guarantees rendered as literal `npm test` output. */
export function Privacy() {
  return (
    <section id="privacy" className={styles.section}>
      <SectionHeading n={4} title="Enforced by the test suite" />
      <p className={styles.intro}>
        Not a policy page. These are real tests in{" "}
        <span className={styles.strong}>packages/cli/test/privacy.test.js</span>, run on every
        push. Each one fails if the guarantee it names stops holding.
      </p>

      <div className={styles.panel}>
        <div className={styles.panelHead}>privacy.test.js</div>
        <div className={styles.panelBody}>
          {PRIVACY_TESTS.map((t) => (
            <div key={t.name} className={styles.row}>
              <span className={styles.tick}>✓</span>
              <span className={styles.name}>{t.name}</span>
              <span className={styles.desc}>{t.desc}</span>
              <span className={styles.ms}>{t.ms}</span>
            </div>
          ))}
          {/* Counted from the list rather than typed beside it. This said "4 passing (201ms)"
              under five rendered ticks whose durations sum to 227ms — a visibly wrong total in
              the one section whose entire argument is that it shows real output rather than a
              policy page, and the first thing a sceptical reader counts. */}
          <div className={styles.summary}>
            {PRIVACY_TESTS.length} passing{" "}
            <span className={styles.pass}>({totalMs(PRIVACY_TESTS)}ms)</span> · 0 failing
          </div>
        </div>
      </div>
    </section>
  );
}

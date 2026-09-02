import { SectionHeading } from "@/components/section-heading";
import { PRIVACY_TESTS } from "@/lib/sample-data";
import styles from "./privacy.module.css";

/** Section 04 — the privacy guarantees rendered as literal `npm test` output. */
export function Privacy() {
  return (
    <section id="privacy" className={styles.section}>
      <SectionHeading n={4} title="Enforced by the test suite" />
      <p className={styles.intro}>
        Not a policy page. Output from <span className={styles.strong}>npm test</span> on the
        current commit, run on every push and every release tag.
      </p>

      <div className={styles.panel}>
        <div className={styles.panelHead}>privacy.spec.ts</div>
        <div className={styles.panelBody}>
          {PRIVACY_TESTS.map((t) => (
            <div key={t.name} className={styles.row}>
              <span className={styles.tick}>✓</span>
              <span className={styles.name}>{t.name}</span>
              <span className={styles.desc}>{t.desc}</span>
              <span className={styles.ms}>{t.ms}</span>
            </div>
          ))}
          <div className={styles.summary}>
            4 passing <span className={styles.pass}>(85ms)</span> · 0 failing
          </div>
        </div>
      </div>
    </section>
  );
}

import { NeonLogo } from "@/components/neon-logo";
import styles from "./supporters.module.css";

/**
 * Who pays for the parts of this that cost money.
 *
 * The wording tracks what is true today. It says Neon is the documented default, not that
 * it serves the board — that becomes true at the cutover, and the line gets tightened then
 * rather than being written ahead of itself.
 *
 * Deliberately not a "sponsors" wall, and deliberately last: there is one supporter, the
 * thing they support is named, and the reason they were chosen is a link to the research that
 * chose them — before the sponsorship existed. A credit that cannot say what it bought is an
 * advert; this one can.
 *
 * No section number. The numbered sections are the product; this is the colophon.
 */
export function Supporters() {
  return (
    <section id="supported-by" className={styles.section}>
      <p className={styles.label}>supported by</p>

      <div className={styles.card}>
        <a
          className={styles.logo}
          href="https://neon.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Neon"
        >
          <NeonLogo height={30} />
        </a>

        <p className={styles.blurb}>
          <a className={styles.link} href="https://neon.com" target="_blank" rel="noreferrer">
            Neon
          </a>{" "}
          backs tokenchit through their Open Source programme, and is the Postgres this project
          documents as its default. That choice came first and on its own merits: their idle
          behaviour is scale-to-zero with automatic resume, where the alternative needed a
          human in a dashboard to bring a quiet board back.
        </p>
      </div>
    </section>
  );
}

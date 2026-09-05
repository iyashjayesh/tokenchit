import styles from "./site-ticker.module.css";

const REPO = "https://github.com/iyashjayesh/tokenchit";

/**
 * One pass of the ticker, rendered twice so the loop has no seam.
 *
 * The track translates by half its width, which only reads as continuous if the second half is
 * identical to the first. The copy is duplicated in the markup rather than in CSS because the
 * links have to be real links in both halves — a reader whose eye lands on the second copy
 * should be able to click it.
 */
function Run() {
  return (
    <span className={styles.run}>
      <span className={styles.item}>open source · MIT</span>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <a className={styles.link} href={REPO} target="_blank" rel="noreferrer">
        ★ star it on GitHub
      </a>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <span className={styles.item}>found a bug, or want an agent supported?</span>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <a className={styles.link} href={`${REPO}/issues`} target="_blank" rel="noreferrer">
        open an issue
      </a>
      <span className={styles.dot} aria-hidden="true">◆</span>
      <span className={styles.item}>built in the open, receipts included</span>
      <span className={styles.dot} aria-hidden="true">◆</span>
    </span>
  );
}

/**
 * The open-source strip, edge to edge above everything.
 *
 * Rendered from the layout rather than from the header, and deliberately outside the 1180px
 * container: a full-bleed bar built by pulling a contained element out with `100vw` margins
 * overflows by exactly the scrollbar's width on every desktop browser that reserves one. Being
 * a sibling of the container instead is the version with no arithmetic in it.
 *
 * A ticker rather than a dismissible banner, because there is nothing here to dismiss — it
 * asks for a star and offers somewhere to report a bug, and both stay true on the tenth visit.
 *
 * No client JavaScript: the movement is a CSS animation and the pause is `:hover`.
 */
export function SiteTicker() {
  return (
    <div className={styles.ticker}>
      <div className={styles.track}>
        <Run />
        {/* The seam-hiding copy. Hidden from assistive tech so the message is announced once
            rather than twice, and its links are not a second set of tab stops. */}
        <span aria-hidden="true">
          <Run />
        </span>
      </div>
    </div>
  );
}

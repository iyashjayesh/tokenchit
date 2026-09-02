import styles from "./section-heading.module.css";

/**
 * The heading pattern every numbered section uses: a [ 0N ] chip beside an h2,
 * baseline-aligned.
 *
 * The chip tone is passed in rather than derived from `n`. The prototype's sequence
 * is 01 ink, 02 coral, 03 ink, 04 ink, 05 coral — an odd/even rule reproduces
 * neither 04 nor 05.
 */
export function SectionHeading({
  n,
  title,
  tone = "ink",
  children,
}: {
  n: number;
  title: string;
  tone?: "ink" | "coral";
  /** Optional trailing sticker, e.g. the rotated yellow "opt-in" chip on the board. */
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={tone === "coral" ? styles.chipCoral : styles.chipInk}>
        {`[ ${String(n).padStart(2, "0")} ]`}
      </span>
      <h2 className={styles.h2}>{title}</h2>
      {children}
    </div>
  );
}

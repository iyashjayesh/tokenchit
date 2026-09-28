import styles from "./site-footer.module.css";
import { CLI_PACKAGE, NPM_URL } from "@/lib/cli";

const LINKS = [
  { label: "github.com/iyashjayesh/tokenchit", href: "https://github.com/iyashjayesh/tokenchit" },
  { label: `npm / ${CLI_PACKAGE}`, href: NPM_URL },
  { label: "the board", href: "/board" },
];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.row}>
        <div className={styles.links}>
          {LINKS.map((l) => (
            <a key={l.href} className={styles.chip} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
        {/* Names the shortcut that used to name itself from a pill fixed over the corner of
            every page. The listener lives in LeaderboardModal, mounted in the root layout,
            so this is a label rather than a control — which is why it is not a button. */}
        <div className={styles.legal}>
          <span className={styles.shortcut}>
            press <kbd className={styles.key}>L</kbd> for the leaderboards
          </span>
        </div>
        <div className={styles.legal}>MIT License · © 2026 tokenchit contributors</div>
      </div>
    </footer>
  );
}

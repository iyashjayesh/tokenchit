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
        <div className={styles.legal}>MIT License · © 2026 tokenchit contributors</div>
      </div>
    </footer>
  );
}

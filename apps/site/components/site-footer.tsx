import styles from "./site-footer.module.css";

const LINKS = [
  { label: "github.com/iyashjayesh/tokenstats", href: "https://github.com/iyashjayesh/tokenstats" },
  { label: "npm / @tokenstats/cli", href: "https://npmjs.com/package/@tokenstats/cli" },
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
        <div className={styles.legal}>MIT License · © 2026 tokenstats contributors</div>
      </div>
    </footer>
  );
}

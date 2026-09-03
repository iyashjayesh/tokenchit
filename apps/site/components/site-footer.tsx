import styles from "./site-footer.module.css";

const LINKS = [
  { label: "github.com/iyashjayesh/tokenchit", href: "https://github.com/iyashjayesh/tokenchit" },
  { label: "npm / @tokenchit/cli", href: "https://npmjs.com/package/@tokenchit/cli" },
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

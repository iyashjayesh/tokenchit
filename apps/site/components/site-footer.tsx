import styles from "./site-footer.module.css";

const LINKS = [
  { label: "github.com/tokenstats", href: "https://github.com/tokenstats" },
  { label: "npm / tokenstats", href: "https://npmjs.com/package/tokenstats" },
  { label: "self-host docs", href: "https://github.com/tokenstats#self-hosting" },
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

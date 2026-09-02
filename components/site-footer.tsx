import styles from "./site-footer.module.css";

const LINKS = [
  { label: "github.com/tokencard", href: "https://github.com/tokencard" },
  { label: "npm / tokencard", href: "https://npmjs.com/package/tokencard" },
  { label: "self-host docs", href: "https://github.com/tokencard#self-hosting" },
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
        <div className={styles.legal}>MIT License · © 2026 tokencard contributors</div>
      </div>
    </footer>
  );
}

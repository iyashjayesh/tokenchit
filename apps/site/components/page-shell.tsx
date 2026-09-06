import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import styles from "./page-shell.module.css";

export type Crumb = { href: string; label: string };

/**
 * Header, breadcrumb and footer for every page that is not the landing page.
 *
 * The landing page keeps its own composition — it has a hero and a full-bleed layout this
 * shell would fight — but both are server-rendered and ship no JavaScript beyond the header's
 * copy button and the board's window filter.
 */
export function PageShell({
  crumbs,
  children,
}: {
  crumbs?: Crumb[];
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {crumbs && crumbs.length > 0 && (
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/" className={styles.crumb}>
            home
          </Link>
          {crumbs.map((c) => (
            <span key={c.href} className={styles.crumbGroup}>
              <span className={styles.sep} aria-hidden="true">
                /
              </span>
              <Link href={c.href} className={styles.crumb}>
                {c.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <main id="content" className={styles.main}>{children}</main>
      <SiteFooter />
    </>
  );
}

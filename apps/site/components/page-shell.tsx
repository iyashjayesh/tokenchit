import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import styles from "./page-shell.module.css";

export type Crumb = { href: string; label: string };

/**
 * Header, breadcrumb and footer for every page that is not the landing page.
 *
 * The landing page keeps its own composition because it wraps everything in the client-side
 * SiteStateProvider for the live handle input. Nothing on these pages needs that state, so
 * they stay entirely server-rendered and ship no JavaScript beyond the header's copy button.
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
      <main className={styles.main}>{children}</main>
      <SiteFooter />
    </>
  );
}

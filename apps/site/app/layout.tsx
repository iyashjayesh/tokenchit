import type { Metadata } from "next";
import { Suspense } from "react";

import { Analytics } from "@/components/analytics";

import { SITE_URL } from "@/lib/site";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteTicker } from "@/components/site-ticker";
import styles from "./layout.module.css";

/* Both faces are variable fonts, so no `weight` is passed — the full range
   (600/800 display, 400–800 mono) comes from the variable axis. */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/** One sentence, shared by the page description and both preview cards so they cannot drift. */
const DESCRIPTION =
  "tokenchit reads your local Claude Code, Codex and OpenCode logs and renders one embeddable card straight into your repo. A file you commit, not a URL you depend on.";

export const metadata: Metadata = {
  // Without this, relative metadata URLs resolve against the request origin, so a profile
  // shared from production would advertise a localhost preview image whenever the page was
  // rendered anywhere but the live host.
  metadataBase: new URL(SITE_URL),
  title: "tokenchit — receipts for your robots",
  description: DESCRIPTION,

  /*
   * Without these, a paste of the bare domain into Slack, a DM or a LinkedIn post unfurled as
   * a bare "Web Link" and nothing else: the profile pages carried a preview and the page they
   * invite people to try did not. Every page inherits this and overrides what it needs —
   * `/u/[handle]` sets its own title and description, and the file-based opengraph-image
   * convention supplies each route's image without being named here.
   */
  openGraph: {
    type: "website",
    siteName: "tokenchit",
    title: "tokenchit — receipts for your robots",
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    // The wide format, because the image is a 1200x630 card whose figures are unreadable at
    // the small square size the default `summary` gives it.
    card: "summary_large_image",
    title: "tokenchit — receipts for your robots",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <div className={styles.grid}>
          {/* Outside the container on purpose — see SiteTicker. */}
          <SiteTicker />
          <div className={styles.container}>{children}</div>
        </div>
        {/* useSearchParams needs a boundary or the whole route opts out of static
            rendering. Nothing is rendered here, so the fallback is empty. */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}

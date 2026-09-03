import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
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

export const metadata: Metadata = {
  // Without this, relative metadata URLs resolve against the request origin, so a profile
  // shared from production would advertise a localhost preview image whenever the page was
  // rendered anywhere but the live host.
  metadataBase: new URL(SITE_URL),
  title: "tokenstats — receipts for your robots",
  description:
    "tokenstats reads your local Claude Code, Codex and OpenCode logs and renders one embeddable card straight into your repo.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <div className={styles.grid}>
          <div className={styles.container}>{children}</div>
        </div>
      </body>
    </html>
  );
}

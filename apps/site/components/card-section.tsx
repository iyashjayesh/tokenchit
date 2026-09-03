"use client";

import { CopyButton } from "@/components/copy-button";
import { SectionHeading } from "@/components/section-heading";
import { useSiteState } from "@/components/site-state";
import { buildCardSvg } from "@tokenchit/core";
import { DEFAULT_HANDLE, OWN_STATS, QUERY_OPTIONS } from "@/lib/sample-data";
import { SITE_URL } from "@/lib/site";
import styles from "./card-section.module.css";

/* The three variant cards are fixed artefacts of the sample handle, not the live one —
   they illustrate layout/theme, so they are built once at module scope. */
const SAMPLE = { handle: DEFAULT_HANDLE, ...OWN_STATS };
const LIGHT_SVG = buildCardSvg({ ...SAMPLE, layout: "default", theme: "light" });
const DARK_SVG = buildCardSvg({ ...SAMPLE, layout: "default", theme: "dark" });
const COMPACT_SVG = buildCardSvg({ ...SAMPLE, layout: "compact", theme: "light" });

export function CardSection() {
  const { handle } = useSiteState();

  // Linked to the profile: every embedded card is a door back to the site, which is the
  // whole growth loop. The plain-image form is still what `tokenchit sync` prints, because
  // a committed SVG has no hosted page to guarantee.
  const markdown =
    `[![tokenchit](${SITE_URL}/api/card/${handle}.svg)](${SITE_URL}/u/${handle})`;

  /* The panel shows the origin elided so the two tags fit without scrolling; the
     clipboard gets the full URLs, which is what a README actually needs. */
  const htmlShown =
    `<img height="195" src="…/card/${handle}.svg">\n` +
    `<img height="195" src="…/card/${handle}.svg?layout=compact">`;
  const htmlCopied =
    `<img height="195" src="${SITE_URL}/api/card/${handle}.svg">\n` +
    `<img height="195" src="${SITE_URL}/api/card/${handle}.svg?layout=compact">`;

  return (
    <section id="card" className={styles.section}>
      <SectionHeading n={1} title="The card, up close" />

      <p className={styles.intro}>
        SVG from the embed endpoint, shown at actual size. Default is 495 × 195;{" "}
        <span className={styles.strong}>layout=compact</span> is 340 wide so two cards fit
        on one README line. Theme follows GitHub&apos;s dark mode via a media query. Every
        card carries the timestamp of its last sync, because the endpoint caches for four
        hours.
      </p>

      <div className={styles.rowA}>
        <div className={styles.cardCol}>
          <div className={styles.label}>variant / light</div>
          {/* Builder output, not user content: the handle is sanitised and XML-escaped
              inside buildCardSvg. */}
          <div className={styles.card} dangerouslySetInnerHTML={{ __html: LIGHT_SVG }} />
        </div>
        <div className={styles.cardCol}>
          <div className={styles.label}>variant / dark</div>
          <div className={styles.card} dangerouslySetInnerHTML={{ __html: DARK_SVG }} />
        </div>
      </div>

      <div className={styles.rowB}>
        <div className={styles.compactCol}>
          <div className={styles.label}>layout=compact · 340px</div>
          <div
            className={styles.compactCard}
            dangerouslySetInnerHTML={{ __html: COMPACT_SVG }}
          />
        </div>

        <div className={styles.optionsPanel}>
          <div className={styles.strip}>query options</div>
          <table className={styles.table}>
            <tbody>
              {QUERY_OPTIONS.map((o) => (
                <tr key={o.key}>
                  <td className={styles.key}>{o.key}</td>
                  <td className={styles.def}>{o.def}</td>
                  <td className={styles.note}>{o.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.rowC}>
        <div className={styles.snippet}>
          <div className={styles.snippetStrip}>
            <span>markdown</span>
            <CopyButton
              value={markdown}
              variant="lime"
              idleLabel="copy"
              copiedLabel="copied ✓"
            />
          </div>
          <code className={styles.codeMd}>{markdown}</code>
        </div>

        <div className={styles.snippetYellow}>
          <div className={styles.snippetStrip}>
            <span>html · two cards on one line</span>
            <CopyButton
              value={htmlCopied}
              variant="yellow"
              idleLabel="copy"
              copiedLabel="copied ✓"
            />
          </div>
          <code className={styles.codeHtml}>{htmlShown}</code>
        </div>
      </div>

      <p className={styles.footnote}>
        Markdown will not place two images on one line. The HTML form is the only way to
        sit cards side by side in a README, which is why the compact width exists.
      </p>

      <p className={styles.footnote}>
        <strong>Equiv. cost is not what you paid.</strong> It is what these tokens would
        cost at list API rates. Most agent usage runs under a subscription where no
        per-token charge ever happens, and models with no public price — bundled or
        self-hosted ones — are counted in the token total but left out of the figure.
      </p>
    </section>
  );
}

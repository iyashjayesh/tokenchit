import { CopyButton } from "@/components/copy-button";
import { SectionHeading } from "@/components/section-heading";
import type { Featured } from "@/lib/featured";
import { QUERY_OPTIONS } from "@/lib/sample-data";
import { SITE_URL } from "@/lib/site";
import styles from "./card-section.module.css";

/*
 * A placeholder, because the reader has no handle yet and the alternative was somebody else's.
 *
 * These snippets were built from the featured board member's handle, so the two most
 * prominent copy buttons on the landing page put a stranger's card and profile URL on a
 * first-time visitor's clipboard — ready to paste into their own README. A template that
 * obviously needs editing is the honest thing to hand someone who has not signed up yet.
 */
const PLACEHOLDER = "your-handle";

export function CardSection({ preview }: { preview: Featured }) {
  const handle = PLACEHOLDER;

  /* Built on the server from a real board member, not here from a sample. These illustrated
     the layout with invented figures under whatever handle was set, which was a false claim
     about a real account the moment that handle belonged to one. */
  const { light, dark, compact } = preview.cards;

  // Linked to the profile: every embedded card is a door back to the site, which is the
  // whole growth loop. The plain-image form is still what `tokenchit sync` prints, because
  // a committed SVG has no hosted page to guarantee.
  const markdown =
    `[![tokenchit — @${handle} AI coding agent usage](${SITE_URL}/api/card/${handle}.svg)]` +
    `(${SITE_URL}/u/${handle})`;

  /* The panel shows the origin elided so the two tags fit without scrolling; the
     clipboard gets the full URLs, which is what a README actually needs. */
  const htmlShown =
    `<img height="195" src="…/card/${handle}.svg">\n` +
    `<img height="195" src="…/card/${handle}.svg?layout=compact">`;
  const htmlCopied =
    `<img height="195" alt="tokenchit — @${handle} AI coding agent usage" src="${SITE_URL}/api/card/${handle}.svg">\n` +
    `<img height="195" alt="tokenchit — @${handle}, compact" src="${SITE_URL}/api/card/${handle}.svg?layout=compact">`;

  return (
    <section id="card" className={styles.section}>
      <SectionHeading n={2} title="The card, up close" />

      <p className={styles.intro}>
        SVG from the embed endpoint, shown at actual size. Default is 495 × 195;{" "}
        <span className={styles.strong}>layout=compact</span> is 340 wide so two cards fit
        on one README line. Theme follows GitHub&apos;s dark mode via a media query. Every
        card carries the timestamp of its last sync, because the endpoint caches for four
        hours.
      </p>

      {/* `figure`/`figcaption` rather than a loose div above an image. All three cards come
          from `buildCardSvg`, so all three carry the identical root aria-label — a screen
          reader met the same announcement three times with nothing to tell them apart, while
          the captions that distinguish them were unrelated text floating above. */}
      <div className={styles.rowA}>
        <figure className={styles.cardCol}>
          <figcaption className={styles.label}>variant / light</figcaption>
          {/* Builder output, not user content: the handle is sanitised and XML-escaped
              inside buildCardSvg. */}
          <div className={styles.card} dangerouslySetInnerHTML={{ __html: light }} />
        </figure>
        <figure className={styles.cardCol}>
          <figcaption className={styles.label}>variant / dark</figcaption>
          <div className={styles.card} dangerouslySetInnerHTML={{ __html: dark }} />
        </figure>
      </div>

      <div className={styles.rowB}>
        <figure className={styles.compactCol}>
          <figcaption className={styles.label}>layout=compact · 340px</figcaption>
          <div
            className={styles.compactCard}
            dangerouslySetInnerHTML={{ __html: compact }}
          />
        </figure>

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
              event="embed-markdown"
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
              event="embed-html"
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

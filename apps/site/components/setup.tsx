import { CopyButton } from "@/components/copy-button";
import { SectionHeading } from "@/components/section-heading";
import { EMBED_LOCAL, EMBED_NESTED, PATHS, STEPS } from "@/lib/setup";
import styles from "./setup.module.css";

/**
 * How to actually use the thing — placed above the board, because it is the answer to the
 * question the hero raises.
 *
 * The landing page went hero → board → reference material, so a visitor who had just been
 * told what tokenchit is met a leaderboard of strangers before a single instruction. The
 * board still proves the project is alive; it no longer does so in the slot where someone is
 * looking for what to type.
 *
 * Copy lives in `lib/setup.ts` so the commands and snippets are values a test can check
 * against the CLI, rather than prose nothing verifies.
 */
export function Setup() {
  return (
    <section id="start" className={styles.section}>
      <SectionHeading n={1} title="Two ways to use it" />

      <p className={styles.intro}>
        Everything below the first command is optional. Reading your logs and rendering a card
        happen entirely on your machine; publishing is a different command you run when you
        have decided to, and never a side effect of one you have already run.
      </p>

      <div className={styles.paths}>
        {PATHS.map((path) => (
          <article
            key={path.key}
            className={path.key === "local" ? styles.pathLime : styles.pathYellow}
          >
            <div className={styles.pathStrip}>
              <span className={styles.pathLabel}>{path.label}</span>
              <h3 className={styles.pathTitle}>{path.title}</h3>
            </div>

            <p className={styles.pathSummary}>{path.summary}</p>

            <div className={styles.terminal}>
              <code className={styles.command}>
                <span className={styles.prompt}>$ </span>
                {path.command}
              </code>
              <CopyButton
                value={path.command}
                event={`path-${path.key}`}
                variant="ink"
                idleLabel="copy"
                copiedLabel="copied"
              />
            </div>

            {/* Both lists on both cards, in the same order, so the comparison is readable
                across them rather than only down one. A card that listed benefits alone
                would be an advertisement; the costs are the half that makes it a choice. */}
            <p className={styles.listHead}>what you get</p>
            <ul className={styles.list}>
              {path.gets.map((line) => (
                <li key={line} className={styles.get}>
                  {line}
                </li>
              ))}
            </ul>

            <p className={styles.listHead}>what it costs</p>
            <ul className={styles.list}>
              {path.costs.map((line) => (
                <li key={line} className={styles.cost}>
                  {line}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <h3 className={styles.stepsHead}>Put it on your profile</h3>
      <p className={styles.intro}>
        The local path, end to end. Five steps, none of which need an account.
      </p>

      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.verb} className={styles.step}>
            <div className={styles.stepHead}>
              <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.stepVerb}>{step.verb}</span>
              <h4 className={styles.stepTitle}>{step.title}</h4>
            </div>
            <p className={styles.stepBody}>{step.body}</p>
            {step.command && (
              <div className={styles.stepTerminal}>
                <code className={styles.stepCommand}>
                  <span className={styles.prompt}>$ </span>
                  {step.command}
                </code>
                <CopyButton
                  value={step.command}
                  event={`step-${step.verb}`}
                  variant="lime"
                  idleLabel="copy"
                  copiedLabel="copied"
                />
              </div>
            )}
          </li>
        ))}
      </ol>

      {/* The two forms side by side rather than one form and a caveat. The caveat is the
          thing people get wrong, so it gets equal weight and its own copy button. */}
      <div className={styles.snippets}>
        <div className={styles.snippet}>
          <div className={styles.snippetStrip}>
            <span>readme beside the card</span>
            <CopyButton
              value={EMBED_LOCAL}
              event="embed-local"
              variant="lime"
              idleLabel="copy"
              copiedLabel="copied ✓"
            />
          </div>
          <code className={styles.code}>{EMBED_LOCAL}</code>
        </div>

        <div className={styles.snippet}>
          <div className={styles.snippetStrip}>
            <span>readme one directory down</span>
            <CopyButton
              value={EMBED_NESTED}
              event="embed-nested"
              variant="lime"
              idleLabel="copy"
              copiedLabel="copied ✓"
            />
          </div>
          <code className={styles.code}>{EMBED_NESTED}</code>
        </div>
      </div>

      <p className={styles.footnote}>
        A profile README is its own repository, so the card has to be committed to{" "}
        <span className={styles.strong}>that</span> repo for GitHub to serve it. Pointing at an
        SVG in a different repository renders as a broken image.
      </p>
    </section>
  );
}

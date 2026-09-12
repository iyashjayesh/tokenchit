import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { agentColour, formatTokens, formatUsd } from "@tokenchit/core";

import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { CopyButton } from "@/components/copy-button";
import { AGENT_PAGES, agentPage, codeSpans, UNSUPPORTED } from "@/lib/agents";
import { readBoard } from "@/lib/board-query";
import { cmd, PRIMARY_COMMAND } from "@/lib/cli";
import { openGraphFor } from "@/lib/site";

import styles from "./tool.module.css";

/* Long enough that a crawler and a reader see the same figures, short enough that a new
   publisher shows up the same day. The board itself revalidates at 300s; this page is a
   landing page rather than a live ranking, so it does not need to keep pace with it. */
export const revalidate = 3600;

/** The three routes are known at build time, so all three prerender. */
export function generateStaticParams() {
  return AGENT_PAGES.map((a) => ({ agent: a.key }));
}

/* Anything outside the three is a 404 rather than a rendered-on-demand page: the set is
   closed, and an invented `/tool/anything` would be a crawlable page about a tool that does
   not exist. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agent: string }>;
}): Promise<Metadata> {
  const { agent } = await params;
  const page = agentPage(agent);
  if (!page) return {};

  const title = `${page.name} token usage · tokenchit`;
  const description =
    `Read your local ${page.name} logs and render your token usage as an SVG card you ` +
    `commit to your repo. No account, no upload, and no hosted badge to depend on.`;

  return {
    title,
    description,
    openGraph: openGraphFor({ title, description, path: `/tool/${page.key}` }),
    alternates: { canonical: `/tool/${page.key}` },
  };
}

/** Renders `backticked` spans in the agent content as code. */
function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {codeSpans(text).map((part, i) =>
        part.code ? <code key={i}>{part.value}</code> : <span key={i}>{part.value}</span>,
      )}
    </p>
  );
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent } = await params;
  const page = agentPage(agent);
  if (!page) notFound();

  /* Ranked by this agent's tokens only. `readBoard` applies the filter to every aggregate
     that feeds a row, so the figures below are this agent's usage rather than each
     developer's combined total next to this agent's rank. */
  const rows = await readBoard("year", 10, 0, page.key).catch(() => []);
  const ranked = rows.filter((r) => r.tokens > 0);
  const others = AGENT_PAGES.filter((a) => a.key !== page.key);
  const syncCommand = cmd("sync");

  return (
    <PageShell crumbs={[{ href: `/tool/${page.key}`, label: page.label }]}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Supported agent</p>
        <h1 className={styles.h1}>
          Your <span className={styles.mark}>{page.name}</span> usage, as a file in your repo.
        </h1>
        <p className={styles.lede}>
          tokenchit reads the {page.name} logs already on your machine and renders one
          embeddable card straight into your repository. The card is a file you commit, not a
          URL you depend on — nothing to rate-limit, nothing to go down.
        </p>

        <div className={styles.cmdRow}>
          <code className={styles.cmd}>
            <span className={styles.prompt}>$</span> {PRIMARY_COMMAND}
          </code>
          <CopyButton value={PRIMARY_COMMAND} variant="lime" event="tool-page-command" />
        </div>
        <p className={styles.free}>
          Free and MIT. No account is needed to read your own numbers — publishing to the
          board is a separate, opt-in command.
        </p>
      </header>

      <section className={styles.section}>
        <SectionHeading n={1} title="What it reads" />
        <Prose text={page.what} className={styles.body} />
        <div className={styles.source}>
          <span className={styles.sourceLabel}>Source</span>
          <code className={styles.sourcePath}>{page.source}</code>
        </div>
        <p className={styles.note}>
          Nothing else is read, and nothing is sent. <code>{syncCommand}</code> and{" "}
          <code>{cmd("recap")}</code> make no network request at all; five tests in the repo
          fail on every push if that stops being true.
        </p>
      </section>

      <section className={styles.section}>
        <SectionHeading n={2} title="What it cannot tell you" tone="coral" />
        <div className={styles.caveat}>
          <h3 className={styles.caveatHeading}>{page.caveat.heading}</h3>
          <Prose text={page.caveat.body} className={styles.body} />
        </div>
        <p className={styles.note}>
          Equivalent cost is not what you paid either. It is what these tokens would cost at
          list API rates, and most agent usage runs under a subscription where no per-token
          charge ever happens.
        </p>
      </section>

      {ranked.length > 0 && (
        <section className={styles.section}>
          <SectionHeading n={3} title={`On the board, by ${page.label}`} />
          <p className={styles.body}>
            Developers who chose to publish, ranked by {page.label} tokens over the last year.
            Figures are self-reported and bounded for plausibility, not audited.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Developer</th>
                  <th scope="col" className={styles.num}>
                    {page.label} tokens
                  </th>
                  <th scope="col" className={styles.num}>
                    Equiv. cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.handle}>
                    <td className={styles.rank}>{i + 1}</td>
                    <td>
                      <Link href={`/u/${r.handle}`} className={styles.handle}>
                        <span
                          className={styles.dot}
                          style={{ background: agentColour(page.key) }}
                          aria-hidden="true"
                        />
                        @{r.handle}
                      </Link>
                    </td>
                    <td className={styles.num}>{formatTokens(r.tokens)}</td>
                    <td className={styles.num}>{formatUsd(r.equivCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/board" className={styles.more}>
            See the full board →
          </Link>
        </section>
      )}

      <section className={styles.section}>
        <SectionHeading n={ranked.length > 0 ? 4 : 3} title="The other agents" />
        <p className={styles.body}>
          One command covers all of them at once, and the card shows the mix.
        </p>
        <ul className={styles.others}>
          {others.map((a) => (
            <li key={a.key}>
              <Link href={`/tool/${a.key}`} className={styles.otherLink}>
                <span
                  className={styles.dot}
                  style={{ background: agentColour(a.key) }}
                  aria-hidden="true"
                />
                {a.name}
                <code className={styles.otherPath}>{a.source}</code>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Detected and deliberately unsupported:{" "}
          {UNSUPPORTED.map((u, i) => (
            <span key={u.name}>
              {i > 0 && " "}
              <strong>{u.name}</strong> {u.reason}
            </span>
          ))}
        </p>
      </section>

      <section className={styles.cta}>
        <h2 className={styles.ctaHeading}>Read your own numbers</h2>
        <p className={styles.body}>
          One command. It finds your agents, shows your stats and writes the card. Publishing
          is a separate step you have to ask for.
        </p>
        <div className={styles.cmdRow}>
          <code className={styles.cmd}>
            <span className={styles.prompt}>$</span> {PRIMARY_COMMAND}
          </code>
          <CopyButton value={PRIMARY_COMMAND} variant="lime" event="tool-page-command" />
        </div>
        <p className={styles.note}>
          Or <code>{syncCommand}</code> on its own to see the figures without writing
          anything. Source at{" "}
          <a href="https://github.com/iyashjayesh/tokenchit">github.com/iyashjayesh/tokenchit</a>.
        </p>
      </section>
    </PageShell>
  );
}

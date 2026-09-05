import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buildCardSvg, formatSynced, formatTokens, formatUsd, sanitizeHandle } from "@tokenchit/core";

import { ContributionGraph } from "@/components/contribution-graph";
import { CopyButton } from "@/components/copy-button";
import { PageShell } from "@/components/page-shell";
import { ShareRow } from "@/components/share-row";
import { PRIMARY_COMMAND } from "@/lib/cli";
import { isWindow, WINDOW_DAYS, WINDOWS, type BoardWindow } from "@/lib/board";
import { cardFigures } from "@/lib/card-figures";
import { readProfile } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";

import styles from "./profile.module.css";
import { cmd } from "@/lib/cli";

export const revalidate = 300;

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ window?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = sanitizeHandle(decodeURIComponent((await params).handle));
  const profile = await readProfile(handle).catch(() => null);

  if (!profile) return { title: "Not found · tokenchit" };

  /* The same hold the card and the OG image apply. This string is the unfurl's body text, so
     leaving it unguarded would have put the withheld figures into the Slack preview of a page
     whose image had just been blanked — half a gate again, one line further down. */
  const summary = profile.underReview
    ? "Held for review"
    : `${formatTokens(profile.tokens)} tokens across ${profile.activeDays} active days`;
  return {
    title: `@${profile.handle} · tokenchit`,
    description: summary,
    openGraph: {
      title: `@${profile.handle} · tokenchit`,
      description: summary,
      url: `${SITE_URL}/u/${profile.handle}`,
      // No `images` here on purpose: setting it overrides the file-based opengraph-image
      // convention, and this page would then advertise the SVG card, which Twitter, Slack
      // and Facebook all decline to render. opengraph-image.tsx supplies a PNG instead.
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const raw = decodeURIComponent((await params).handle);
  const handle = sanitizeHandle(raw);
  const requested = (await searchParams).window ?? null;
  const window: BoardWindow = isWindow(requested) ? requested : "year";

  const profile = await readProfile(handle, window).catch(() => null);
  if (!profile) notFound();

  const mix = Object.entries(profile.mix).sort((a, b) => b[1] - a[1]);
  const mixTotal = mix.reduce((a, [, n]) => a + n, 0);

  const card = buildCardSvg({ handle: profile.handle, ...cardFigures(profile), theme: "light" });

  const embed =
    `[![tokenchit](${SITE_URL}/api/card/${profile.handle}.svg)]` +
    `(${SITE_URL}/u/${profile.handle})`;

  const tiles: [string, string][] = [
    ["tokens", formatTokens(profile.tokens)],
    ["equiv. cost", profile.equivCostUsd > 0 ? formatUsd(profile.equivCostUsd) : "—"],
    ["streak", `${profile.streakDays}d`],
    ["active days", String(profile.activeDays)],
  ];

  return (
    <PageShell crumbs={[{ href: "/board", label: "board" }, { href: `/u/${profile.handle}`, label: `@${profile.handle}` }]}>
      <header className={styles.head}>
        <div className={styles.identity}>
          {/* Bigger here than in a table row, because a profile is the one page that is about
              a person rather than about a ranking. Same gate: no proved handle, no face. */}
          {profile.githubId && (
            <img
              className={styles.avatar}
              src={`/api/avatar/${profile.githubId}`}
              width={40}
              height={40}
              alt=""
              decoding="async"
            />
          )}
          <h1 className={styles.handle}>@{profile.handle}</h1>
          {profile.tier === "verified" ? (
            <span className={styles.verified}>✓ github verified</span>
          ) : (
            <span className={styles.unverified}>cli · self-reported</span>
          )}
        </div>

        <div className={styles.meta}>
          {profile.rank !== null && (
            <Link href="/board" className={styles.rank}>
              rank {profile.rank}
              <span className={styles.rankOf}> of {profile.totalRanked}</span>
            </Link>
          )}
        </div>
      </header>

      {/*
        * The post, composed on the server.
        *
        * Server-side so every copy is identical, and so a held row's figures can be left out:
        * the og:image and og:description are already blanked for one, and a share button
        * handing the numbers over in plain text would be the third hole in the same gate.
        *
        * Third person throughout — "Card:", not "Mine:". This page has no session and cannot
        * know whether the reader is the person it describes, so anything possessive is wrong
        * half the time. Naming the handle reads correctly posted by its owner or by anybody
        * else.
        *
        * Two links because they answer different questions: the profile is the receipt, the
        * bare domain is the invitation. Roughly 275 characters as X counts them for a handle
        * of ordinary length, which leaves the common case inside one post.
        */}
      <ShareRow
        handle={profile.handle}
        text={
          profile.underReview
            ? [
                `@${profile.handle} on tokenchit.`,
                ``,
                `tokenchit reads your AI coding agent logs locally and renders a card you commit to your README. Set up in ~10s:`,
                ``,
                PRIMARY_COMMAND,
                ``,
                `Card: ${SITE_URL}/u/${profile.handle}`,
                `Try it: ${SITE_URL}`,
              ].join("\n")
            : [
                `@${profile.handle} · ${formatTokens(profile.tokens)} tokens · ${profile.activeDays} active days · ${profile.streakDays}-day streak`,
                ``,
                `tokenchit reads your AI coding agent logs locally and renders a card you commit to your README. Set up in ~10s:`,
                ``,
                PRIMARY_COMMAND,
                ``,
                `Card: ${SITE_URL}/u/${profile.handle}`,
                `Try it: ${SITE_URL}`,
              ].join("\n")
        }
      />

      <p className={styles.since}>
        {profile.firstDay ? `First activity ${profile.firstDay}.` : "No activity yet."}{" "}
        {profile.lastPublished
          ? `${formatSynced(new Date(profile.lastPublished)).toLowerCase()}.`
          : "Never published."}{" "}
        Figures are self-reported by the tokenchit CLI from local agent logs.
      </p>

      <nav className={styles.windows} aria-label="Time window">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/u/${profile.handle}${w.key === "year" ? "" : `?window=${w.key}`}`}
            className={w.key === window ? styles.windowActive : styles.window}
          >
            {w.label}
          </Link>
        ))}
      </nav>

      <div className={styles.tiles}>
        {tiles.map(([label, value]) => (
          <div key={label} className={styles.tile}>
            <div className={styles.tileLabel}>{label}</div>
            <div className={styles.tileValue}>{value}</div>
          </div>
        ))}
      </div>

      <section className={styles.block}>
        <h2 className={styles.h2}>Activity</h2>
        <ContributionGraph days={profile.days} windowDays={WINDOW_DAYS[window]} />
      </section>

      <div className={styles.split}>
        <section className={styles.block}>
          <h2 className={styles.h2}>Agents</h2>
          {mix.length === 0 ? (
            <p className={styles.empty}>No activity in this window.</p>
          ) : (
            <ul className={styles.agents}>
              {mix.map(([agent, tokens], i) => {
                const pct = mixTotal > 0 ? (tokens / mixTotal) * 100 : 0;
                return (
                  <li key={agent} className={styles.agent}>
                    <div className={styles.agentHead}>
                      <span className={styles.agentName}>{agent}</span>
                      <span className={styles.agentFigures}>
                        {formatTokens(tokens)}
                        <span className={styles.agentPct}>{pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className={styles.agentTrack}>
                      <span
                        className={styles[`agentFill${Math.min(i, 2)}` as keyof typeof styles]}
                        // Percentages this small round to a hairline; a floor keeps a real
                        // agent visible rather than rendering as nothing.
                        style={{ width: `${Math.max(pct, 0.6)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.block}>
          <h2 className={styles.h2}>
            Models <span className={styles.h2Note}>lifetime</span>
          </h2>
          {profile.models.length === 0 ? (
            <p className={styles.empty}>Nothing published yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>model</th>
                    <th className={styles.num}>tokens</th>
                    <th className={styles.num}>equiv. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.models.map((m) => (
                    <tr key={m.model}>
                      <td className={styles.model}>{m.model}</td>
                      <td className={styles.num}>{formatTokens(m.tokens)}</td>
                      <td className={styles.num}>
                        {m.priced ? (
                          formatUsd(m.equivCostUsd, true)
                        ) : (
                          <span className={styles.unpriced} title="No public price for this model">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className={styles.block}>
        <h2 className={styles.h2}>The card</h2>
        <div className={styles.cardRow}>
          {/* Builder output: the handle is sanitised and XML-escaped inside buildCardSvg. */}
          <div className={styles.card} dangerouslySetInnerHTML={{ __html: card }} />
          <div className={styles.embed}>
            <div className={styles.embedStrip}>
              <span>markdown</span>
              <CopyButton value={embed} variant="lime" idleLabel="copy" copiedLabel="copied ✓" />
            </div>
            <code className={styles.embedCode}>{embed}</code>
            <p className={styles.embedNote}>
              This renders live from the endpoint. To commit the file instead — no request to
              us at all — run <span className={styles.strong}>{cmd("sync")}</span> and add the
              SVG to your repo.
            </p>
          </div>
        </div>
      </section>

      <p className={styles.foot}>
        <span className={styles.strong}>Equiv. cost is not what they paid.</span> It is what
        these tokens would cost at list API rates; most agent usage runs under a subscription
        where no per-token charge happens. Models with no public price are counted in the token
        total and left out of the cost.
      </p>
    </PageShell>
  );
}

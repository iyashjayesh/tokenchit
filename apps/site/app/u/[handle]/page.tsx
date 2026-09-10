import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  agentColour,
  buildCardSvg,
  formatSynced,
  formatTokens,
  formatUsd,
  sanitizeHandle,
} from "@tokenchit/core";

import { ContributionGraph } from "@/components/contribution-graph";
import { CopyButton } from "@/components/copy-button";
import { PageShell } from "@/components/page-shell";
import { PublishedModal } from "@/components/published-modal";
import { ShareRow } from "@/components/share-row";
import { PRIMARY_COMMAND } from "@/lib/cli";
import { isWindow, WINDOW_DAYS, WINDOWS, type BoardWindow } from "@/lib/board";
import { cardFigures, EMPTY_FIGURES } from "@/lib/card-figures";
import { readProfile } from "@/lib/profile";
import { openGraphFor, SITE_URL } from "@/lib/site";

import styles from "./profile.module.css";
import { cmd } from "@/lib/cli";

export const revalidate = 300;

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ window?: string; published?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = sanitizeHandle(decodeURIComponent((await params).handle));
  /* Metadata is the one place a throw is worse than a wrong title: it would take down the
     page render too. A null here means "cannot say", which is what the generic title says. */
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
    // No `images` on purpose: setting it overrides the file-based opengraph-image convention,
    // and this page would then advertise the SVG card, which Twitter, Slack and Facebook all
    // decline to render. opengraph-image.tsx supplies a PNG instead.
    openGraph: openGraphFor({
      title: `@${profile.handle} · tokenchit`,
      description: summary,
      path: `/u/${profile.handle}`,
    }),
    twitter: { card: "summary_large_image" },
  };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const raw = decodeURIComponent((await params).handle);
  const handle = sanitizeHandle(raw);
  const query = await searchParams;
  const requested = query.window ?? null;
  const window: BoardWindow = isWindow(requested) ? requested : "year";

  /*
   * Set by `tokenchit publish`, which opens this page when it finishes.
   *
   * Read on the server so an ordinary visit renders nothing at all — the panel pulls the
   * 1200x630 PNG, and no one who merely looked at a profile should pay for that. The client
   * strips the parameter on mount, so a refresh or a URL pasted to somebody else does not
   * replay it.
   */
  const justPublished = query.published === "1";

  /*
   * A failed query is not a missing person.
   *
   * This used to be `.catch(() => null)` followed by `notFound()`, so a transient database
   * error served the 404 page — whose copy reads "they may not have published yet" — for a
   * real, published profile. That URL is the one people share, and it is cached. Letting the
   * error propagate reaches error.tsx instead, which says the true thing and does not cache.
   */
  const profile = await readProfile(handle, window);
  if (!profile) notFound();

  /*
   * The same hold the card, the OG image and the metadata already apply.
   *
   * Three surfaces blanked a flagged row and the page body did not, so `/u/x` rendered four
   * populated tiles, a full contribution graph, the agent mix, the models table and an inline
   * card with real numbers — while `/api/card/x.svg`, the endpoint that page is previewing,
   * served zeroes for the same person. The page contradicted its own preview.
   */
  const held = profile.underReview;

  /*
   * The post, composed once and used by both surfaces.
   *
   * It was inlined in the ShareRow call; the arrival panel needs the same string, and two
   * copies of a paragraph that mentions figures is exactly the kind of thing that drifts and
   * then quietly disagrees with itself on one of the two screens.
   *
   * A held row's figures stay out of it, as they do from the og:description and the card: the
   * point of holding is that nothing about the row circulates until somebody has looked at it,
   * and a share button handing the numbers over in plain text would be another hole in the
   * same gate.
   */
  const shareText = [
    held
      ? `@${profile.handle} on tokenchit.`
      : `@${profile.handle} · ${formatTokens(profile.tokens)} tokens · ${profile.activeDays} active days · ${profile.streakDays}-day streak`,
    ``,
    `tokenchit reads your AI coding agent logs locally and renders a card you commit to your README. Set up in ~10s:`,
    ``,
    PRIMARY_COMMAND,
    ``,
    `Card: ${SITE_URL}/u/${profile.handle}`,
  ].join("\n");

  /*
   * The invitation, which is not the same thing as the post.
   *
   * The post is about this person's figures and carries the card. This is a sentence about
   * what the tool is, aimed at somebody who has never heard of it — so it leads with the
   * command rather than a number, and it survives being read by a stranger in a group chat.
   *
   * Composed without the link. Half the targets that accept it — X, Telegram — take the URL
   * as a separate parameter, and folding it into the text as well prints it twice.
   */
  const inviteBody = [
    `Try tokenchit: it reads your Claude Code, Codex and OpenCode logs locally and renders a usage card you commit to your README.`,
    ``,
    PRIMARY_COMMAND,
  ].join("\n");

  /* Third person, like the post: the panel is shown to whoever the CLI opened it for, but the
     line is also what they will paste, so it must read correctly from anybody. */
  const arrivalHeadline = held
    ? "Held for review — the figures return once someone has looked at it."
    : [
        profile.rank !== null ? `rank ${profile.rank} of ${profile.totalRanked}` : null,
        `${formatTokens(profile.tokens)} tokens`,
        `${profile.streakDays}-day streak`,
      ]
        .filter(Boolean)
        .join(" · ");

  const mix = held ? [] : Object.entries(profile.mix).sort((a, b) => b[1] - a[1]);
  const models = held ? [] : profile.models;

  /*
   * The graph's own span, which is not always the window's.
   *
   * `WINDOW_DAYS.all` is 3650, so "all time" built 522 week-columns — roughly 8,350px of
   * horizontally scrolling squares, nine years of which are guaranteed empty for a project
   * that shipped this year. "last 7d" was as odd in the other direction: a two-column graph.
   * A contribution graph is a year-shaped object; clamping it to something between a quarter
   * and a year keeps it readable at both ends without pretending the window did not change.
   */
  const graphDays = Math.min(365, Math.max(90, WINDOW_DAYS[window]));
  const graphLabel =
    WINDOW_DAYS[window] > 365
      ? "last 12 months"
      : WINDOW_DAYS[window] < 90
        ? "last 90 days"
        : (WINDOWS.find((w) => w.key === window)?.label ?? "this year");
  const mixTotal = mix.reduce((a, [, n]) => a + n, 0);

  const card = buildCardSvg({
    handle: profile.handle,
    ...(held ? EMPTY_FIGURES : cardFigures(profile)),
    theme: "light",
  });

  const embed =
    // Real alt text: this is what a screen reader announces on GitHub, where the card is an
    // <img> through camo and the SVG's own aria-label is unreachable.
    `[![tokenchit — @${profile.handle} AI coding agent usage](${SITE_URL}/api/card/${profile.handle}.svg)]` +
    `(${SITE_URL}/u/${profile.handle})`;

  const tiles: [string, string][] = held
    ? [
        ["tokens", "—"],
        ["equiv. cost", "—"],
        ["streak", "—"],
        ["active days", "—"],
      ]
    : [
        ["tokens", formatTokens(profile.tokens)],
        ["equiv. cost", profile.equivCostUsd > 0 ? formatUsd(profile.equivCostUsd) : "—"],
        ["streak", `${profile.streakDays}d`],
        ["active days", String(profile.activeDays)],
      ];

  return (
    <PageShell crumbs={[{ href: "/board", label: "board" }, { href: `/u/${profile.handle}`, label: `@${profile.handle}` }]}>
      {/* Nothing at all on an ordinary visit — see `justPublished`. */}
      {justPublished && (
        <PublishedModal
          handle={profile.handle}
          headline={arrivalHeadline}
          imagePath={`/u/${profile.handle}/opengraph-image`}
          imageUrl={`${SITE_URL}/u/${profile.handle}/opengraph-image`}
          shareText={shareText}
          command={PRIMARY_COMMAND}
          inviteBody={inviteBody}
          profileUrl={`${SITE_URL}/u/${profile.handle}`}
        />
      )}
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

      {/* Where the rank chip would be. `underReview` exists, by its own comment, so a held
          profile does not look broken to its owner — but nothing in the body said anything,
          so the owner saw four dashes and no reason for them. */}
      {held && (
        <p className={styles.held}>
          <span className={styles.heldMark}>hold</span>
          This submission is held for review, so the figures are not shown. Nothing was
          deleted — they return once someone has looked at it.
        </p>
      )}

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
        * One link, deliberately. There were two — the profile as the receipt, the bare domain
        * as the invitation — and a post with two links hands the platform a choice nobody
        * asked it to make: which one to unfurl. It picked the domain, so a post about a
        * person's own figures previewed as the generic site card. The invitation does not
        * need a URL of its own, because the command above it is the invitation, and the
        * profile page carries the site's own header for anyone who wants the rest of it.
        *
        * Around 240 characters as X counts them for a handle of ordinary length, which leaves
        * the common case inside one post with more room than before.
        */}
      <ShareRow
        handle={profile.handle}
        /* Relative for the preview and the clipboard, so both work on localhost and neither
           makes a cross-origin request the CSP would have to be widened for; absolute for the
           field that exists to be pasted somewhere else. Same image either way — the one the
           og:image tag already points at, so what the panel shows is what a platform that
           does unfurl the link would build. */
        imagePath={`/u/${profile.handle}/opengraph-image`}
        imageUrl={`${SITE_URL}/u/${profile.handle}/opengraph-image`}
        text={shareText}
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
            /* The active window differed only by background colour, so which one was
               selected was invisible to assistive tech on all three surfaces. */
            aria-current={w.key === window ? "true" : undefined}
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

      {/*
        * The card's headline, said out loud where the two would otherwise disagree.
        *
        * `tokens` is what the daily series proves; the committed card shows the estimate,
        * which adds back what Claude Code's transcripts no longer hold. On a machine with real
        * retention the two are ~40% apart, and until now the profile showed one while the card
        * in the same person's README showed the other, with nothing anywhere explaining it.
        *
        * Shown only on the lifetime view, because the estimate is lifetime: putting it beside
        * a seven-day figure would invent a comparison neither number supports.
        */}
      {!held && profile.estimatedTokens !== null && window === "all" && (
        <p className={styles.estimate}>
          The card for this profile reads{" "}
          <span className={styles.strong}>{formatTokens(profile.estimatedTokens)}</span> — the
          verified {formatTokens(profile.tokens)} above, plus what Claude Code&rsquo;s own
          rollup counted after retention deleted the transcripts behind it. Only the verified
          figure is ranked.
        </p>
      )}

      <section className={styles.block}>
        {/* Says which window it follows, because the graph changing shape when the selector
            moves otherwise reads as a bug. */}
        <h2 className={styles.h2}>
          Activity <span className={styles.h2Note}>· {graphLabel}</span>
        </h2>
        <ContributionGraph days={held ? [] : profile.days} windowDays={graphDays} />
      </section>

      <div className={styles.split}>
        <section className={styles.block}>
          <h2 className={styles.h2}>Agents</h2>
          {mix.length === 0 ? (
            <p className={styles.empty}>No activity in this window.</p>
          ) : (
            <ul className={styles.agents}>
              {mix.map(([agent, tokens]) => {
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
                        className={styles.agentFill}
                        style={{
                          // Percentages this small round to a hairline; a floor keeps a real
                          // agent visible rather than rendering as nothing.
                          width: `${Math.max(pct, 0.6)}%`,
                          // Per agent rather than by list position, so this bar is the same
                          // colour as the same agent's segment on the board.
                          background: agentColour(agent),
                        }}
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
          {models.length === 0 ? (
            <p className={styles.empty}>Nothing published yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                {/* Named for screen readers, which announce a table by its caption; visually
                    hidden because the heading above already says this to everyone else. */}
                <caption className={styles.srOnly}>Models used, with tokens and equivalent cost</caption>
                <thead>
                  <tr>
                    <th scope="col">model</th>
                    <th scope="col" className={styles.num}>tokens</th>
                    <th scope="col" className={styles.num}>equiv. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
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

import {
  buildCardSvg,
  filterAgents,
  sanitizeHandle,
  type HideKey,
  type Layout,
  type Theme,
} from "@tokenchit/core";
import { DEFAULT_WINDOW } from "@/lib/board";
import { avatarDataUri } from "@/lib/avatar";
import { cardFigures, EMPTY_FIGURES } from "@/lib/card-figures";
import { readProfile } from "@/lib/profile";

/** Cache window printed on the card. Clamped 4h–24h, same as the rest of the genre. */
const MIN_CACHE = 4 * 3600;
const MAX_CACHE = 24 * 3600;

/* A handle with nothing published is not an error, so the card renders rather than 404s —
   a broken image in someone's README is a worse answer than an honest empty one. It is
   cached briefly instead of the usual four hours so the real card appears soon after a
   first publish, rather than after GitHub's copy of an empty card expires. */
const EMPTY_CACHE = 300;

const HIDEABLE = new Set<HideKey>(["spend", "streak", "mix"]);

/** "4h" | "90m" | "3600" -> seconds, clamped. Anything unparseable falls back to 4h. */
function parseCache(raw: string | null): number {
  if (!raw) return MIN_CACHE;
  const m = /^(\d+(?:\.\d+)?)\s*([hmd]?)$/i.exec(raw.trim());
  if (!m) return MIN_CACHE;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return MIN_CACHE;
  const unit = m[2].toLowerCase();
  const seconds =
    unit === "m" ? n * 60 : unit === "d" ? n * 86400 : unit === "h" ? n * 3600 : n;
  return Math.round(Math.min(MAX_CACHE, Math.max(MIN_CACHE, seconds)));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: raw } = await params;
  const { searchParams } = new URL(request.url);

  // The embed URL is /api/card/<handle>.svg — strip the extension before sanitising.
  const handle = sanitizeHandle(raw.replace(/\.svg$/i, ""));

  const layoutParam = searchParams.get("layout");
  const layout: Layout = layoutParam === "compact" ? "compact" : "default";

  const themeParam = searchParams.get("theme");
  const theme: Theme =
    themeParam === "light" || themeParam === "dark" ? themeParam : "auto";

  const agentsParam = searchParams.get("agents");
  const allow =
    agentsParam && agentsParam.trim() && agentsParam.trim().toLowerCase() !== "all"
      ? agentsParam.split(",")
      : null;

  const hide = (searchParams.get("hide") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is HideKey => HIDEABLE.has(s as HideKey));

  const maxAge = parseCache(searchParams.get("cache"));

  /* null means the handle has never published; undefined means the lookup itself failed.
     They are cached differently below, so the two cases stay distinct here. */
  const profile = await readProfile(handle, DEFAULT_WINDOW).catch(() => undefined);

  /*
   * A submission held back from the board is held back from the card too.
   *
   * The card is the most widely copied surface this project has — it goes in READMEs, where it
   * is seen by people who will never open the board. Serving unexamined figures here while the
   * board hides them defeats the review gate entirely: verified against a live instance, a
   * flagged user whose row was absent from /board still had 9,000 tokens rendered into an
   * embeddable badge.
   *
   * Rendered empty rather than 404'd, for the reason the empty case already gives above: a
   * broken image in someone's README is a worse answer than an honest empty one. It also takes
   * the short cache below, so the real card appears soon after a review clears rather than four
   * hours later.
   */
  const held = profile?.underReview === true;
  const figures = profile && !held ? cardFigures(profile) : EMPTY_FIGURES;

  /* Held rows get no face either: the point of holding is that nothing about the row
     circulates until somebody has looked, and a face is the most circulating part of it. */
  const avatar = profile && !held ? await avatarDataUri(profile.githubId) : undefined;

  const svg = buildCardSvg({
    handle,
    tokens: figures.tokens,
    spend: figures.spend,
    streak: figures.streak,
    mix: filterAgents(figures.mix, allow),
    syncedAt: figures.syncedAt,
    layout,
    theme,
    hide,
    avatar,
  });

  /* A failed lookup must not be cached: the next request should try the database again
     rather than serve an empty card for four hours because of one blip. */
  const cache =
    profile === undefined
      ? "no-store"
      : held
        ? `public, max-age=${EMPTY_CACHE}, s-maxage=${EMPTY_CACHE}`
      : profile === null
        ? `public, max-age=${EMPTY_CACHE}, s-maxage=${EMPTY_CACHE}`
        : `public, max-age=${maxAge}, s-maxage=${maxAge}`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import {
  buildCardSvg,
  filterAgents,
  sanitizeHandle,
  type HideKey,
  type Layout,
  type Theme,
} from "@/lib/card-svg";
import { OWN_STATS } from "@/lib/sample-data";

/** Cache window printed on the card. Clamped 4h–24h, same as the rest of the genre. */
const MIN_CACHE = 4 * 3600;
const MAX_CACHE = 24 * 3600;

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

  const svg = buildCardSvg({
    handle,
    tokens: OWN_STATS.tokens,
    spend: OWN_STATS.spend,
    streak: OWN_STATS.streak,
    mix: filterAgents(OWN_STATS.mix, allow),
    syncedAt: OWN_STATS.syncedAt,
    layout,
    theme,
    hide,
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

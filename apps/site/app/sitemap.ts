import type { MetadataRoute } from "next";

import { readBoard } from "@/lib/board-query";
import { DEFAULT_WINDOW } from "@/lib/board";
import { SITE_URL } from "@/lib/site";

/**
 * The two static pages, plus every profile currently on the board.
 *
 * Built from `readBoard` rather than a `listHandles` helper, because the board query already
 * excludes rows held for review — a flagged profile withholds its figures, and pointing a
 * crawler at it would be the same leak by another route.
 *
 * Revalidated daily: the set changes when somebody new publishes, which is not often enough
 * to rebuild per request and not rare enough to leave to a deploy.
 */
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await readBoard(DEFAULT_WINDOW, 1000).catch(() => []);

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/board`, changeFrequency: "daily", priority: 0.8 },
    ...rows.map((r) => ({
      url: `${SITE_URL}/u/${r.handle}`,
      lastModified: r.lastPublished ? new Date(r.lastPublished) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

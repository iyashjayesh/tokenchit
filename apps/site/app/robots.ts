import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * There was no robots.txt and no sitemap at all.
 *
 * Profile pages are the shareable surface and the thing a search for someone's handle should
 * be able to find, so they are explicitly welcome. The two things that are not: the login
 * hand-off page, whose URL is a capability that should never be indexed or followed, and the
 * API, which serves images and JSON that mean nothing in a result page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/login/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

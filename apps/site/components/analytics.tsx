"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { FIREBASE_CONFIG } from "@/lib/firebase";
import { SITE_URL } from "@/lib/site";

/** The host real visitors use. Previews and localhost are excluded below. */
const CANONICAL_HOST = new URL(SITE_URL).host;

/**
 * Whether this page view should count.
 *
 * Only the canonical host. Otherwise every preview deployment and every `npm run dev` lands
 * in the same property as real traffic, and a number you cannot trust is worse than no
 * number — the first week would be mostly us.
 */
function shouldTrack(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.host === CANONICAL_HOST;
}

/*
 * Started once and shared. initializeApp throws if it runs twice for the same app name, and
 * this component's effect re-runs on every navigation.
 */
let started: Promise<((name: string, params?: Record<string, unknown>) => void) | null> | null =
  null;

async function start() {
  // Imported dynamically so the SDK becomes its own chunk, downloaded only when it is going
  // to run. It is considerably larger than the page it measures, and a visitor on a preview
  // or localhost never fetches it at all.
  const [{ initializeApp, getApps, getApp }, fa] = await Promise.all([
    import("firebase/app"),
    import("firebase/analytics"),
  ]);

  // Safari with storage blocked, private windows, and anything without IndexedDB report
  // unsupported — getAnalytics throws there rather than degrading.
  if (!(await fa.isSupported())) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
  const instance = fa.getAnalytics(app);
  return (name: string, params?: Record<string, unknown>) => fa.logEvent(instance, name, params);
}

/** Record an event, if analytics is running. Safe to call from anywhere; a no-op when not. */
export function track(name: string, params?: Record<string, unknown>): void {
  if (!shouldTrack()) return;
  started ??= start();
  void started.then((log) => log?.(name, params));
}

/**
 * Firebase Analytics for the App Router.
 *
 * page_view is logged by hand on every navigation. The SDK sends one automatically on first
 * load, but client-side routing never reloads the page, so without this a visit that moved
 * between the board and a profile would be recorded as a single view of wherever it started.
 */
export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!shouldTrack()) return;
    started ??= start();

    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;

    /*
     * Where the visit came from, which nothing here has ever recorded.
     *
     * Every argument about where this project should put effort — a README backlink, an
     * og:image, a share button — rests on a guess about how people arrive, and the guess has
     * never been checked. One field turns it into a measurement.
     *
     * The origin only, never the full referring URL: the question is which surface sends
     * people, and the path someone was reading when they clicked is not ours to collect on a
     * site whose first claim is that it collects almost nothing.
     *
     * Empty on a direct visit, and empty on a client-side navigation within the site, where
     * `document.referrer` is the page they came from here. Both are honestly "none".
     */
    let source = "";
    try {
      const ref = document.referrer;
      if (ref) {
        const url = new URL(ref);
        if (url.host !== window.location.host) source = url.host;
      }
    } catch {
      // An unparseable referrer is no referrer.
    }

    void started.then((log) =>
      log?.("page_view", {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
        // "none" rather than absent, so a direct visit is countable instead of missing.
        referrer_host: source || "none",
      }),
    );
  }, [pathname, searchParams]);

  return null;
}

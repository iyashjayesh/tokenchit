"use client";

/**
 * Custom events, sent to the self-hosted Umami instance.
 *
 * There is no page-view code here and no SDK to load. The tracker is a 4.7KB script in the
 * document head (see app/layout.tsx); it records navigations itself, including client-side
 * ones, and it records the referrer natively. Both of those were hand-rolled here when this
 * file wrapped Firebase, because the Firebase SDK only sends a view on first load.
 *
 * The canonical-host guard is gone too: `data-domains` on the script tag does that job, so
 * previews and localhost still never reach the real numbers.
 */

declare global {
  interface Window {
    umami?: {
      track: (name: string, data?: Record<string, unknown>) => void;
    };
  }
}

/**
 * Record an event, if the tracker is running. Safe to call from anywhere; a no-op when it is
 * not - blocked, DNT set, off-domain, or simply not loaded yet.
 */
export function track(name: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.umami?.track(name, data);
}

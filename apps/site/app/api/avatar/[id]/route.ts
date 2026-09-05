/**
 * A GitHub avatar, fetched server-side and served from this origin.
 *
 * The board could point `<img src>` straight at avatars.githubusercontent.com, which is what
 * comparable sites do. It would also mean every visitor's browser announcing itself to GitHub
 * — IP, user agent, and a referer naming the page — twenty-five times per page view, on a
 * project whose first claim is that nothing leaves your machine. That claim is about the CLI
 * and would remain literally true, but a reader who checks the network tab should find it true
 * of the site as well. So the request is made here, once, and cached.
 *
 * Keyed on the numeric GitHub account id, never on a handle. `github.com/<handle>.png`
 * resolves for anybody, so a route that accepted handles would happily render a real person's
 * face for an unverified row claiming their name. An id exists only after that person signed
 * in, which makes "verified only" a property of the data rather than a check to remember.
 */

/** Long, because an avatar changes rarely and a stale one is a smaller cost than a slow board. */
const CACHE = 60 * 60 * 24 * 7;

/** A grey square, so a failed fetch is a neutral placeholder rather than a broken-image icon.
 *  The board ships no client JavaScript, so there is no onerror to fall back through. */
const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#d9d7cd"/></svg>`;

const placeholder = () =>
  new Response(PLACEHOLDER, {
    headers: {
      "content-type": "image/svg+xml",
      // Briefly, so a transient upstream failure does not pin a grey square in front of
      // somebody's face for a week.
      "cache-control": "public, max-age=300",
    },
  });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  /* Digits only. The id is interpolated into an upstream URL, so anything else is a request to
     fetch a location of the caller's choosing from our server. */
  if (!/^\d{1,20}$/.test(id)) return placeholder();

  try {
    const upstream = await fetch(`https://avatars.githubusercontent.com/u/${id}?s=96`, {
      // Nothing about the viewer travels with it: no cookies, no referer, no forwarded headers.
      // GitHub learns that this server asked for an avatar, and nothing about who looked.
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(4000),
      next: { revalidate: CACHE },
    });

    if (!upstream.ok) return placeholder();

    const type = upstream.headers.get("content-type") ?? "";
    // Serve only what an <img> should receive, whatever the upstream decides to send.
    if (!type.startsWith("image/")) return placeholder();

    return new Response(upstream.body, {
      headers: {
        "content-type": type,
        "cache-control": `public, max-age=${CACHE}, s-maxage=${CACHE}, immutable`,
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    // Timeout, DNS, upstream down — a board that renders without faces beats one that hangs.
    return placeholder();
  }
}

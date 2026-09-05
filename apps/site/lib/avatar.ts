import "server-only";

/**
 * An avatar as a `data:` URI, for embedding in an SVG we are about to serve.
 *
 * The card is a file. Someone commits it, GitHub serves it from their repository, and it has
 * to render years later without asking anyone's permission — so the bytes travel inside the
 * document rather than behind a link. `<image href="https://avatars.githubusercontent.com/…">`
 * would make every render depend on a third party being up and would announce each viewer to
 * them, which is the arrangement this project exists to avoid.
 *
 * 48px because it is drawn at 26: enough for a retina screen, and about 1.9KB once base64'd
 * against 3.4KB for the 96px version, on a card that is otherwise under 5KB.
 */
const SIZE = 48;

/** A week. An avatar changes rarely and a stale face costs less than a slow card. */
const CACHE = 60 * 60 * 24 * 7;

export async function avatarDataUri(githubId: string | null): Promise<string | undefined> {
  // No proved account, no face — the same gate the board and the profile use.
  if (!githubId || !/^\d{1,20}$/.test(githubId)) return undefined;

  try {
    const res = await fetch(`https://avatars.githubusercontent.com/u/${githubId}?s=${SIZE}`, {
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(3000),
      next: { revalidate: CACHE },
    });
    if (!res.ok) return undefined;

    const type = res.headers.get("content-type") ?? "";
    // The builder accepts these four and drops anything else; agreeing here means a rejected
    // type is a card without a face rather than a card with a broken one.
    if (!/^image\/(png|jpeg|gif|webp)$/.test(type)) return undefined;

    const bytes = Buffer.from(await res.arrayBuffer());
    // A card is meant to be committed. Something far larger than an avatar is not one.
    if (bytes.byteLength > 64 * 1024) return undefined;

    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    // Timeout, upstream down, DNS — a card without a face beats a card that never renders.
    return undefined;
  }
}

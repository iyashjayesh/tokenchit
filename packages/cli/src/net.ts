/**
 * The only module in the CLI permitted to touch the network.
 *
 * This is not a style preference. The site claims, in print, that the tool parses locally and
 * sends nothing you did not ask it to — and `net.isolated` in the test suite enforces that by
 * scanning the source for network calls outside this file. Keeping the surface to one small
 * module is what makes that claim checkable rather than aspirational.
 *
 * Nothing here is imported unless `tokencard publish` runs.
 */

export type PostResult = {
  ok: boolean;
  status: number;
  body?: { tier?: string; submissionId?: string; [k: string]: unknown };
  reasons?: string[];
  text?: string;
};

/** A submission is small and a leaderboard is not worth hanging a terminal over. */
const TIMEOUT_MS = 15_000;

export async function post(url: string, body: string): Promise<PostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: PostResult["body"];
    try {
      parsed = JSON.parse(text) as PostResult["body"];
    } catch {
      return { ok: res.ok, status: res.status, text };
    }

    return {
      ok: res.ok,
      status: res.status,
      body: parsed,
      reasons: Array.isArray(parsed?.["reasons"]) ? (parsed["reasons"] as string[]) : undefined,
      text,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      text: aborted ? `no response within ${TIMEOUT_MS / 1000}s` : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

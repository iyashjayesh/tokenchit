import { NextResponse } from "next/server";

import { completeLoginSession, readLoginSession } from "@/lib/login-session";
import { clientIp, hit, LIMITS, limitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** What the page polls while it waits for the CLI to finish. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const verdict = await hit(`login-read:ip:${clientIp(req)}`, LIMITS.read);
  if (!verdict.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers: limitHeaders(verdict) });
  }

  const { id } = await params;
  const session = await readLoginSession(id).catch(() => null);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  // No-store: the whole point of this route is that the answer changes.
  return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
}

/**
 * Mark the sign-in finished, so the waiting page can say so.
 *
 * The CLI calls this once GitHub has given it a token. It is a courtesy and nothing depends on
 * it: the sign-in is already complete, the key is already on disk, and a failure here changes
 * nothing except that the browser tab keeps waiting.
 *
 * Holding the id is the authority, which is the same authority that could read the code. It
 * can only ever set a handle, never clear one, so the worst a stranger with the id can do is
 * end a page's polling early with a name of their choosing — visible to the one person who is
 * already looking at their own terminal, where the real handle is printed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const verdict = await hit(`login:ip:${clientIp(req)}`, LIMITS.auth);
  if (!verdict.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers: limitHeaders(verdict) });
  }

  const { id } = await params;

  let handle: unknown;
  try {
    handle = ((await req.json()) as { handle?: unknown }).handle;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof handle !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(handle)) {
    return NextResponse.json({ error: "handle is not a handle" }, { status: 400 });
  }

  await completeLoginSession(id, handle).catch(() => {});
  return NextResponse.json({ ok: true });
}

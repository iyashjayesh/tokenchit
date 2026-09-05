import { NextResponse } from "next/server";

import { createLoginSession } from "@/lib/login-session";
import { clientIp, hit, LIMITS, limitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Park a device-flow sign-in so the browser can display it.
 *
 * Called by the CLI immediately after GitHub hands it a device code, and before it opens a
 * browser. Everything accepted here is already on the person's own screen; the `device_code`
 * that exchanges for a token is not, and must never be sent.
 *
 * Unauthenticated by necessity — this runs *before* anyone is signed in — so it is bounded by
 * IP instead, and a failure is not fatal: the CLI falls back to opening GitHub directly.
 */
export async function POST(req: Request) {
  const verdict = await hit(`login:ip:${clientIp(req)}`, LIMITS.auth);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: limitHeaders(verdict) },
    );
  }

  let body: { id?: unknown; userCode?: unknown; verifyUrl?: unknown; expiresIn?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { id, userCode, verifyUrl, expiresIn } = body;

  // The id is the only thing protecting the row, so a short or non-random one is refused
  // rather than accepted and quietly made guessable.
  if (typeof id !== "string" || !/^[0-9a-f]{64}$/.test(id)) {
    return NextResponse.json({ error: "id must be 64 hex characters" }, { status: 400 });
  }
  if (typeof userCode !== "string" || !/^[A-Za-z0-9-]{1,32}$/.test(userCode)) {
    return NextResponse.json({ error: "userCode is not a device code" }, { status: 400 });
  }

  /* Only GitHub's own verification pages, and only over TLS. The page renders this as a link
     somebody is invited to click during a sign-in, which is exactly the shape of a phishing
     redirect if any URL were accepted. */
  let verify: URL;
  try {
    verify = new URL(String(verifyUrl));
  } catch {
    return NextResponse.json({ error: "verifyUrl is not a URL" }, { status: 400 });
  }
  const host = verify.hostname.toLowerCase();
  const allowed =
    verify.protocol === "https:" && (host === "github.com" || host.endsWith(".github.com"));
  if (!allowed) {
    return NextResponse.json({ error: "verifyUrl must be a github.com URL" }, { status: 400 });
  }

  try {
    await createLoginSession({
      id,
      userCode,
      verifyUrl: verify.toString(),
      expiresInSeconds: Number(expiresIn) || 900,
    });
  } catch {
    return NextResponse.json({ error: "could not park the session" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: limitHeaders(verdict) });
}

import { NextRequest, NextResponse } from "next/server";

// Next 16 deprecates the "middleware" convention in favor of "proxy" (see
// https://nextjs.org/docs/messages/middleware-to-proxy). We intentionally keep
// this as middleware.ts because the proxy file has slightly different semantics
// and the warning is benign for now. When upgrading, rename to proxy.ts and
// export `default` accordingly — no logic change needed.

const guestCookieName = process.env.GUEST_COOKIE_NAME || "openchat_guest";

function makeGuestId() {
  return `gst_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  // Ensure guest cookie exists for unauthenticated flows (projects, docs, chats).
  // Cookie is httpOnly so client JS can't steal it, but path=/ means it scopes
  // to the whole site once set via any /api/* request. We only set here to
  // avoid touching static assets; pages that need a guestId call resolveActor()
  // which will also mint one if missing — this is a best-effort convenience.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const hasGuest = req.cookies.get(guestCookieName)?.value;
    if (!hasGuest) {
      res.cookies.set(guestCookieName, makeGuestId(), {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};

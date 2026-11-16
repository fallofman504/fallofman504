import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PREVIEW_COOKIE, previewPasscode, previewToken } from "@/lib/preview";

// Reachable without the preview passcode: the passcode screen itself, site assets, and the
// machine-to-machine endpoints, which each check their own key (agents) or signature (Stripe).
const OPEN = ["/preview", "/_next/", "/api/agent/", "/api/files/", "/api/stripe/webhook", "/logo-lime.png", "/icon.png", "/apple-icon.png", "/favicon.ico"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Send visitors who type the "www." address to the main one, so logins and checkout stay on a single address.
  const host = request.headers.get("host") ?? "";
  if (host.toLowerCase().startsWith("www.")) {
    const target = host.slice(4);
    const proto = /^(localhost|127\.)/.test(target) ? "http" : "https"; // always https on the real site
    return NextResponse.redirect(`${proto}://${target}${pathname}${search}`, 308);
  }

  // Private preview: everything else waits behind the passcode screen.
  const passcode = previewPasscode();
  if (passcode && !OPEN.some((p) => pathname === p || pathname.startsWith(p))) {
    if (request.cookies.get(PREVIEW_COOKIE)?.value !== previewToken(passcode)) {
      const url = request.nextUrl.clone();
      url.pathname = "/preview";
      url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  const response = NextResponse.next();
  if (passcode) response.headers.set("X-Robots-Tag", "noindex, nofollow"); // keep a private site out of search engines
  return response;
}

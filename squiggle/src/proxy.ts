import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Sends visitors who type the "www." address to the main one, so logins and checkout stay on a single address. */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!host.toLowerCase().startsWith("www.")) return NextResponse.next();
  const proto = request.headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(`${proto}://${host.slice(4)}${pathname}${search}`, 308);
}

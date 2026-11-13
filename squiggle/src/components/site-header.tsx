import Link from "next/link";
import { logout } from "@/app/actions";
import { getUser } from "@/lib/auth";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="34" height="22" viewBox="0 0 34 22" fill="none" aria-hidden>
        <path d="M2 14c3-10 6-10 8 0s5 10 7 0 5-10 7 0 5 6 8-4" stroke="var(--color-coral)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="font-display text-2xl font-extrabold tracking-tight">Squiggle</span>
    </span>
  );
}

export async function SiteHeader() {
  const user = await getUser();
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href="/" aria-label="Squiggle home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2 text-sm font-semibold sm:gap-4">
          {user ? (
            <>
              {user.role === "admin" && (
                <Link href="/admin" className="hover:text-coral-dark">
                  Shop queue
                </Link>
              )}
              <Link href="/dashboard" className="hover:text-coral-dark">
                My projects
              </Link>
              <form action={logout}>
                <button className="cursor-pointer text-muted hover:text-ink">Log out</button>
              </form>
              <Link href="/requests/new" className="btn btn-coral btn-sm">
                New project
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-coral-dark">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-coral btn-sm">
                Start a project
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

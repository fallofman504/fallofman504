import Link from "next/link";
import { logout } from "@/app/actions";
import { getUser } from "@/lib/auth";

export function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="Squiggle" width={520} height={221} className="h-10 w-auto sm:h-14" />;
}

export async function SiteHeader() {
  const user = await getUser();
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
        <Link href="/" aria-label="Squiggle home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-3 text-sm font-semibold whitespace-nowrap sm:gap-4">
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

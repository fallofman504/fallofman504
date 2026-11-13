import Link from "next/link";
import { RequestBadge } from "@/components/status";
import { requireUser } from "@/lib/auth";
import { listRequestsForUser } from "@/lib/data";
import { dateTime } from "@/lib/format";

export const metadata = { title: "My projects" };

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const requests = listRequestsForUser(user.id);
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Hi, {user.name.split(" ")[0]}</p>
          <h1 className="mt-2 text-4xl font-extrabold">My projects</h1>
        </div>
        <Link href="/requests/new" className="btn btn-coral">New project</Link>
      </div>

      {requests.length === 0 ? (
        <div className="card mt-8 text-center">
          <h2 className="text-2xl font-bold">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">Send us a photo, a file, or a description and we&apos;ll come back with a 3D model and a quote in about an hour.</p>
          <Link href="/requests/new" className="btn btn-coral mt-5">Start your first project</Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="card-soft flex flex-wrap items-center justify-between gap-3 transition hover:border-ink">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{r.title}</p>
                  <p className="text-sm text-muted">{r.ref} · sent {dateTime(r.created_at)}</p>
                </div>
                <RequestBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
